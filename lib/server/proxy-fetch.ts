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

import { ProxyAgent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';
import { createLogger } from '@/lib/logger';
import { isLoopbackHostname } from '@/lib/utils/url';

const log = createLogger('ProxyFetch');

function normalizeHostname(value: string): string {
  let normalized = value.trim().toLowerCase();
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.replace(/\.+$/, '');
}

function defaultPortForProtocol(protocol: string): string {
  if (protocol === 'http:') return '80';
  if (protocol === 'https:') return '443';
  return '';
}

function splitNoProxyEntry(entry: string): { hostname: string; port?: string } | null {
  const trimmed = entry.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === '*') return { hostname: '*' };

  if (trimmed.startsWith('[')) {
    const closingBracket = trimmed.indexOf(']');
    if (closingBracket === -1) return { hostname: normalizeHostname(trimmed) };

    const hostname = normalizeHostname(trimmed.slice(0, closingBracket + 1));
    const port = trimmed.slice(closingBracket + 1).match(/^:(\d+)$/)?.[1];
    return { hostname, port };
  }

  const colonCount = (trimmed.match(/:/g) ?? []).length;
  if (colonCount === 1) {
    const [hostname, port] = trimmed.split(':');
    if (hostname && /^\d+$/.test(port)) {
      return { hostname: normalizeHostname(hostname), port };
    }
  }

  return { hostname: normalizeHostname(trimmed) };
}

function hostnameMatchesNoProxy(hostname: string, entryHostname: string): boolean {
  if (entryHostname === '*') return true;
  if (entryHostname.startsWith('.')) {
    const suffix = entryHostname.slice(1);
    return hostname === suffix || hostname.endsWith(entryHostname);
  }
  return hostname === entryHostname || hostname.endsWith(`.${entryHostname}`);
}

function shouldBypassProxy(targetUrl: URL): boolean {
  const hostname = normalizeHostname(targetUrl.hostname);
  if (isLoopbackHostname(hostname)) {
    return true;
  }

  const noProxy = process.env.no_proxy || process.env.NO_PROXY;
  if (!noProxy) {
    return false;
  }

  const targetPort = targetUrl.port || defaultPortForProtocol(targetUrl.protocol);
  return noProxy.split(/[,\s]+/).some((entry) => {
    const parsed = splitNoProxyEntry(entry);
    if (!parsed) return false;
    if (parsed.port && parsed.port !== targetPort) return false;
    return hostnameMatchesNoProxy(hostname, parsed.hostname);
  });
}

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

function getProxyUrl(targetUrl: URL | null): string | undefined {
  if (targetUrl && shouldBypassProxy(targetUrl)) {
    return undefined;
  }

  if (targetUrl?.protocol === 'http:') {
    return process.env.http_proxy || process.env.HTTP_PROXY || undefined;
  }

  if (targetUrl?.protocol === 'https:') {
    return (
      process.env.https_proxy ||
      process.env.HTTPS_PROXY ||
      process.env.http_proxy ||
      process.env.HTTP_PROXY ||
      undefined
    );
  }

  return process.env.https_proxy || process.env.HTTPS_PROXY || undefined;
}

let cachedAgent: ProxyAgent | null = null;
let cachedProxyUrl: string | undefined;

function getProxyAgent(targetUrl: URL | null): ProxyAgent | undefined {
  const proxyUrl = getProxyUrl(targetUrl);
  if (!proxyUrl) return undefined;

  // Reuse agent if proxy URL hasn't changed
  if (cachedAgent && cachedProxyUrl === proxyUrl) {
    return cachedAgent;
  }

  cachedAgent = new ProxyAgent(proxyUrl);
  cachedProxyUrl = proxyUrl;
  return cachedAgent;
}

/**
 * Drop-in replacement for fetch() that respects proxy env vars.
 * Falls back to global fetch when no proxy is configured.
 */
export async function proxyFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const targetUrl = parseFetchUrl(input);
  const agent = getProxyAgent(targetUrl);
  const safeTargetUrl = targetUrlForLog(targetUrl);

  if (!agent) {
    log.info('No proxy configured, using direct fetch for:', safeTargetUrl);
    return fetch(input, init);
  }

  log.info('Using proxy', proxyUrlForLog(cachedProxyUrl), 'for:', safeTargetUrl);
  // Use undici's fetch with the proxy dispatcher
  const res = await undiciFetch(input, {
    ...(init as UndiciRequestInit),
    dispatcher: agent,
  });

  // undici's Response is compatible with the global Response
  return res as unknown as Response;
}
