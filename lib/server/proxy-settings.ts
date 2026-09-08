import { isLoopbackHostname } from '@/lib/utils/url';

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

export function getProxyUrl(targetUrl: URL | null): string | undefined {
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
