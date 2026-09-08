/**
 * Server-only transport. Native fetch owns Request/body/redirect/abort semantics;
 * the dispatcher checks every destination before connecting. The socket lookup
 * uses the vetted DNS answers, including when tunnelling through an HTTP proxy.
 */
import type { LookupFunction } from 'node:net';
import { Agent, Client, Dispatcher, ProxyAgent } from 'undici';
import { getProxyUrl } from '@/lib/server/proxy-settings';
import {
  localNetworksAllowed,
  resolvePublicAddresses,
  validateUrlForSSRF,
} from '@/lib/server/ssrf-guard';

export interface OutboundFetchPolicy {
  /** Only the effective base URL from server-owned organization/bootstrap config. */
  trustedBaseUrl?: string;
  proxy?: string;
  useEnvProxy?: boolean;
}

const publicLookup: LookupFunction = (hostname, options, callback) => {
  resolvePublicAddresses(hostname).then(
    (answers) => {
      const family = typeof options === 'number' ? options : options.family;
      const candidates = family ? answers.filter((answer) => answer.family === family) : answers;
      if (!candidates.length) {
        callback(new Error('No safe address for the requested address family'), '', 0);
      } else if (typeof options === 'object' && options.all) {
        callback(null, candidates);
      } else {
        callback(null, candidates[0].address, candidates[0].family);
      }
    },
    (error: Error) => callback(error, '', 0),
  );
};

const publicAgent = new Agent({ connect: { lookup: publicLookup } });
const trustedAgent = new Agent();

/** CONNECT must use the vetted IP, rather than asking the proxy to resolve again. */
class PublicProxyClient extends Dispatcher {
  close: Dispatcher['close'];
  destroy: Dispatcher['destroy'];
  constructor(private readonly client: Client) {
    super();
    this.close = client.close.bind(client);
    this.destroy = client.destroy.bind(client);
  }

  dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
    void (async () => {
      if (options.method !== 'CONNECT') throw new Error('Only proxy tunnels are allowed');
      const target = new URL(`http://${options.path}`);
      if (target.username || target.password) throw new Error('URL credentials are not allowed');
      const [address] = await resolvePublicAddresses(target.hostname);
      const host = address.family === 6 ? `[${address.address}]` : address.address;
      this.client.dispatch({ ...options, path: `${host}:${target.port || '80'}` }, handler);
    })().catch((error: Error) => handler.onError?.(error));
    return true;
  }
}

const proxyAgents = new Map<string, ProxyAgent>();
function getAgent(proxy: string | undefined, trusted: boolean): Dispatcher {
  if (!proxy) return trusted ? trustedAgent : publicAgent;
  const proxyUrl = new URL(proxy);
  if (!['http:', 'https:'].includes(proxyUrl.protocol)) {
    throw new Error('Only HTTP(S) outbound proxies are supported');
  }
  const key = `${trusted ? 'trusted' : 'public'}:${proxy}`;
  let agent = proxyAgents.get(key);
  if (!agent) {
    agent = new ProxyAgent({
      uri: proxy,
      proxyTunnel: true,
      ...(!trusted
        ? {
            clientFactory: (origin: URL, options: object) =>
              new PublicProxyClient(new Client(origin, options)),
          }
        : {}),
    });
    proxyAgents.set(key, agent);
    // A changing admin proxy configuration must not grow an unbounded agent cache.
    if (proxyAgents.size > 16) {
      const oldest = proxyAgents.keys().next().value!;
      const evicted = proxyAgents.get(oldest)!;
      proxyAgents.delete(oldest);
      void evicted.close().catch(() => {});
    }
  }
  return agent;
}

const CROSS_ORIGIN_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'user-agent',
  'range',
  'cache-control',
]);

async function validateDestination(
  url: string,
  trustedOrigin: string | undefined,
  signal: AbortSignal | null | undefined,
) {
  signal?.throwIfAborted();
  const validation = validateUrlForSSRF(url, { trustedOrigin });
  if (!signal) return validation;
  // DNS lookup itself cannot be cancelled, but the caller must settle promptly
  // and must never proceed to fetch if it is cancelled while validation runs.
  return new Promise<string | null>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    validation.then(
      (result) => {
        signal.removeEventListener('abort', onAbort);
        resolve(result);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
  });
}

function requestHeaders(headers: Dispatcher.DispatchOptions['headers'], crossedOrigin: boolean) {
  const pairs: Array<[string, string | string[] | undefined]> = !headers
    ? []
    : Array.isArray(headers) && (headers.length === 0 || typeof headers[0] === 'string')
      ? Array.from({ length: headers.length / 2 }, (_, index) => [
          headers[index * 2],
          headers[index * 2 + 1],
        ])
      : Symbol.iterator in headers
        ? Array.from(headers as Iterable<[string, string | string[] | undefined]>)
        : Object.entries(headers);
  const result: string[] = [];
  for (const [name, value] of pairs) {
    const key = name.toLowerCase();
    if (key === 'host' || key === 'proxy-authorization') continue;
    if (crossedOrigin && !CROSS_ORIGIN_HEADERS.has(key)) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      if (entry !== undefined) result.push(name, entry);
    }
  }
  return result;
}

class ValidatingDispatcher extends Dispatcher {
  private requests = 0;
  private crossedOrigin = false;
  private previousUrl: URL;

  constructor(
    private readonly initialUrl: URL,
    private readonly trustedOrigin: string | undefined,
    private readonly policy: OutboundFetchPolicy,
    private readonly signal: AbortSignal | null | undefined,
  ) {
    super();
    this.previousUrl = initialUrl;
  }

  dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
    void (async () => {
      if (!options.origin || !options.path.startsWith('/')) {
        throw new Error('Invalid outbound request target');
      }
      // A dispatcher path is already an absolute pathname. Resolving it as a
      // relative URL would reinterpret a leading // as a different authority.
      const url = new URL(`${new URL(options.origin).origin}${options.path}`);
      if (this.requests++ > 5) throw new Error('Too many outbound redirects');
      if (this.previousUrl.protocol === 'https:' && url.protocol !== 'https:') {
        throw new Error('HTTPS downgrade redirects are not allowed');
      }
      if (url.origin !== this.previousUrl.origin) this.crossedOrigin = true;
      if (this.crossedOrigin && (options.body || !['GET', 'HEAD'].includes(options.method))) {
        throw new Error('Cross-origin redirects cannot replay a request body');
      }
      // The first URL was checked before native fetch. Every follow-up is checked here.
      if (this.requests !== 1 || url.href !== this.initialUrl.href) {
        const error = await validateDestination(url.href, this.trustedOrigin, this.signal);
        if (error) throw new Error(error);
      }
      this.signal?.throwIfAborted();
      this.previousUrl = url;
      const trusted = localNetworksAllowed() || url.origin === this.trustedOrigin;
      const proxy = this.policy.proxy || (this.policy.useEnvProxy ? getProxyUrl(url) : undefined);
      getAgent(proxy, trusted).dispatch(
        {
          ...options,
          origin: url.origin,
          path: url.pathname + url.search,
          headers: requestHeaders(options.headers, this.crossedOrigin),
        },
        handler,
      );
    })().catch((error: Error) => handler.onError?.(error));
    return true;
  }
}

export function createValidatedFetch(policy: OutboundFetchPolicy = {}): typeof fetch {
  // Never derive this exception from a request URL or a credential's source label.
  const trustedOrigin = policy.trustedBaseUrl ? new URL(policy.trustedBaseUrl).origin : undefined;
  return async (input, init) => {
    const signal =
      init?.signal === undefined && input instanceof Request ? input.signal : init?.signal;
    signal?.throwIfAborted();
    const url = new URL(input instanceof Request ? input.url : input);
    const error = await validateDestination(url.href, trustedOrigin, signal);
    if (error) throw new Error(error);
    signal?.throwIfAborted();
    const dispatcher = new ValidatingDispatcher(url, trustedOrigin, policy, signal);
    // Node's fetch accepts an Undici dispatcher. Keeping the native Request intact
    // preserves FormData boundaries, streaming bodies, init overrides and redirects.
    return globalThis.fetch(input, { ...init, dispatcher } as RequestInit);
  };
}

export const validatedFetch = createValidatedFetch();
