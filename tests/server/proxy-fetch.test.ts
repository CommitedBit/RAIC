import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProxyUrl } from '@/lib/server/proxy-settings';

const { loggerInfoMock } = vi.hoisted(() => ({ loggerInfoMock: vi.fn() }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ info: loggerInfoMock }) }));
vi.mock('@/lib/server/ssrf-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/ssrf-guard')>()),
  validateUrlForSSRF: vi.fn(async () => null),
}));

beforeEach(() => {
  for (const key of [
    'http_proxy',
    'HTTP_PROXY',
    'https_proxy',
    'HTTPS_PROXY',
    'no_proxy',
    'NO_PROXY',
  ]) {
    vi.stubEnv(key, '');
  }
  loggerInfoMock.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const route = (url: string) => getProxyUrl(new URL(url));

describe('outbound environment proxy routing', () => {
  it('uses a direct connection when no proxy is configured', () => {
    expect(route('https://api.example.test/v1')).toBeUndefined();
  });
  it('chooses the protocol-specific proxy and HTTPS fallback', () => {
    vi.stubEnv('HTTP_PROXY', 'http://http-proxy.example:8080');
    expect(route('https://api.example/v1')).toBe('http://http-proxy.example:8080');
    vi.stubEnv('HTTPS_PROXY', 'http://https-proxy.example:8443');
    expect(route('http://api.example/v1')).toBe('http://http-proxy.example:8080');
    expect(route('https://api.example/v1')).toBe('http://https-proxy.example:8443');
  });
  it('prefers lowercase proxy settings', () => {
    vi.stubEnv('HTTPS_PROXY', 'http://upper.example:8080');
    vi.stubEnv('https_proxy', 'http://lower.example:8080');
    expect(route('https://api.example')).toBe('http://lower.example:8080');
  });
  it.each([
    'http://localhost:11434/v1',
    'http://app.localhost:11434/v1',
    'http://127.0.0.1:11434/v1',
    'http://[::1]:11434/v1',
  ])('routes loopback endpoint %s directly; network authorization is separate', (url) => {
    vi.stubEnv('HTTP_PROXY', 'http://proxy.example:8080');
    expect(route(url)).toBeUndefined();
  });
  it('honors exact, suffix and port-scoped NO_PROXY without matching lookalikes', () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.example:8080');
    vi.stubEnv('NO_PROXY', 'api.example,.internal.example,port.example:8443');
    for (const url of [
      'https://api.example/v1',
      'https://svc.internal.example/v1',
      'https://port.example:8443/v1',
    ]) {
      expect(route(url)).toBeUndefined();
    }
    for (const url of ['https://api.example.attacker.test/v1', 'https://port.example:9443/v1']) {
      expect(route(url)).toBe('http://proxy.example:8080');
    }
  });
  it('honors IPv6 literals and default ports in NO_PROXY', () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.example:8080');
    vi.stubEnv('NO_PROXY', '[2606:4700:4700::1111],port.example:443');
    expect(route('https://[2606:4700:4700::1111]/dns-query')).toBeUndefined();
    expect(route('https://port.example/v1')).toBeUndefined();
    expect(route('https://port.example:444/v1')).toBe('http://proxy.example:8080');
  });
  it('honors lowercase no_proxy and wildcard settings', () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.example:8080');
    vi.stubEnv('no_proxy', '*');
    expect(route('https://api.example/v1')).toBeUndefined();
  });
  it('redacts target and proxy credentials, query strings and fragments from logs', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy-user:proxy-secret@proxy.example:8443/tunnel');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('mock')),
    );
    const { proxyFetch } = await import('@/lib/server/proxy-fetch');
    await proxyFetch(
      'https://api-user:api-secret@api.example/v1/items?api_key=target-secret#details',
    );
    const logs = JSON.stringify(loggerInfoMock.mock.calls);
    expect(logs).toContain('http://proxy.example:8443');
    expect(logs).toContain('https://api.example/v1/items');
    for (const sensitive of [
      'proxy-user',
      'proxy-secret',
      'api-user',
      'api-secret',
      'target-secret',
      '#details',
    ]) {
      expect(logs).not.toContain(sensitive);
    }
  });
});
