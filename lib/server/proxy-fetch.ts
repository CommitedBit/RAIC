/**
 * Proxy-aware fetch for server-side use.
 *
 * Automatically routes requests through HTTP/HTTPS proxy when
 * the standard environment variables are set:
 *   - https_proxy / HTTPS_PROXY
 *   - http_proxy / HTTP_PROXY
 *   - no_proxy / NO_PROXY
 *
 * Node.js's built-in fetch does NOT respect these env vars,
 * so we use undici's ProxyAgent when a proxy is configured.
 *
 * Usage: import { proxyFetch } from '@/lib/server/proxy-fetch';
 *        const res = await proxyFetch('https://api.openai.com/v1/...', { ... });
 */

import { createValidatedFetch } from '@/lib/server/outbound-fetch';
import { getProxyUrl } from '@/lib/server/proxy-settings';
import { createLogger } from '@/lib/logger';

const log = createLogger('ProxyFetch');

function parseFetchUrl(input: string | URL): URL | null {
  try {
    return input instanceof URL ? input : new URL(input);
  } catch {
    return null;
  }
}

function targetUrlForLog(targetUrl: URL | null): string {
  if (!targetUrl) return '[invalid-url]';
  const pathname = targetUrl.pathname === '/' ? '' : targetUrl.pathname;
  return `${targetUrl.protocol}//${targetUrl.host}${pathname}`.slice(0, 160);
}

function proxyUrlForLog(proxyUrl: string | undefined): string {
  if (!proxyUrl) return '[not-configured]';
  try {
    const parsed = new URL(proxyUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '[configured-invalid-url]';
  }
}

const fetchThroughProxy = createValidatedFetch({ useEnvProxy: true });

/** Server fetch with environment proxy routing and per-hop network validation. */
export async function proxyFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const targetUrl = parseFetchUrl(input);
  const proxyUrl = getProxyUrl(targetUrl);
  log.info(
    proxyUrl ? 'Using proxy' : 'Using direct fetch',
    proxyUrlForLog(proxyUrl),
    'for:',
    targetUrlForLog(targetUrl),
  );
  return fetchThroughProxy(input, init);
}
