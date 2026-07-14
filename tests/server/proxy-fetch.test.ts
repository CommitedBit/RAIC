import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerInfoMock, proxyAgentMock, undiciFetchMock } = vi.hoisted(() => ({
  loggerInfoMock: vi.fn(),
  proxyAgentMock: vi.fn(function ProxyAgentMock(this: { proxyUrl?: string }, proxyUrl: string) {
    this.proxyUrl = proxyUrl;
  }),
  undiciFetchMock: vi.fn(),
}));

vi.mock('undici', () => ({
  ProxyAgent: proxyAgentMock,
  fetch: undiciFetchMock,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: loggerInfoMock,
  }),
}));

const PROXY_ENV_KEYS = [
  'http_proxy',
  'HTTP_PROXY',
  'https_proxy',
  'HTTPS_PROXY',
  'no_proxy',
  'NO_PROXY',
];

function clearProxyEnv() {
  for (const key of PROXY_ENV_KEYS) {
    vi.stubEnv(key, '');
  }
}

async function loadProxyFetch() {
  return (await import('@/lib/server/proxy-fetch')).proxyFetch;
}

describe('proxyFetch', () => {
  let globalFetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    clearProxyEnv();
    globalFetchMock = vi.fn(async () => new Response('direct'));
    undiciFetchMock.mockResolvedValue(new Response('proxied'));
    vi.stubGlobal('fetch', globalFetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses direct fetch when no proxy is configured', async () => {
    const proxyFetch = await loadProxyFetch();

    await proxyFetch('https://api.example.test/v1');

    expect(globalFetchMock).toHaveBeenCalledWith('https://api.example.test/v1', undefined);
    expect(proxyAgentMock).not.toHaveBeenCalled();
    expect(undiciFetchMock).not.toHaveBeenCalled();
  });

  it('uses an HTTPS proxy dispatcher for external HTTPS targets', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.example.test:8080');
    const proxyFetch = await loadProxyFetch();

    await proxyFetch('https://api.example.test/v1', { method: 'POST' });

    expect(proxyAgentMock).toHaveBeenCalledWith('http://proxy.example.test:8080');
    expect(undiciFetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1',
      expect.objectContaining({
        method: 'POST',
        dispatcher: expect.any(Object),
      }),
    );
    expect(globalFetchMock).not.toHaveBeenCalled();
  });

  it('uses protocol-specific proxy variables for HTTP and HTTPS targets', async () => {
    vi.stubEnv('HTTP_PROXY', 'http://http-proxy.example.test:8080');
    vi.stubEnv('HTTPS_PROXY', 'http://https-proxy.example.test:8443');
    const proxyFetch = await loadProxyFetch();

    await proxyFetch('http://api.example.test/v1');
    await proxyFetch('https://api.example.test/v1');

    expect(proxyAgentMock).toHaveBeenNthCalledWith(1, 'http://http-proxy.example.test:8080');
    expect(proxyAgentMock).toHaveBeenNthCalledWith(2, 'http://https-proxy.example.test:8443');
  });

  it('redacts credentials, query strings, and fragments from proxy logs', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy-user:proxy-secret@proxy.example.test:8443/tunnel');
    const proxyFetch = await loadProxyFetch();

    await proxyFetch(
      'https://api-user:api-secret@api.example.test/v1/items?api_key=target-secret#details',
    );

    const logOutput = JSON.stringify(loggerInfoMock.mock.calls);
    expect(logOutput).toContain('http://proxy.example.test:8443');
    expect(logOutput).toContain('https://api.example.test/v1/items');
    expect(logOutput).not.toContain('proxy-user');
    expect(logOutput).not.toContain('proxy-secret');
    expect(logOutput).not.toContain('api-user');
    expect(logOutput).not.toContain('api-secret');
    expect(logOutput).not.toContain('target-secret');
    expect(logOutput).not.toContain('#details');
  });

  it.each([
    'http://localhost:11434/v1',
    'http://app.localhost:11434/v1',
    'http://127.0.0.1:11434/v1',
    'http://[::1]:11434/v1',
  ])('bypasses configured proxies for loopback target %s', async (targetUrl) => {
    vi.stubEnv('HTTP_PROXY', 'http://proxy.example.test:8080');
    const proxyFetch = await loadProxyFetch();

    await proxyFetch(targetUrl);

    expect(globalFetchMock).toHaveBeenCalledWith(targetUrl, undefined);
    expect(proxyAgentMock).not.toHaveBeenCalled();
    expect(undiciFetchMock).not.toHaveBeenCalled();
  });

  it('honors exact, suffix, and port-scoped NO_PROXY entries', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.example.test:8080');
    vi.stubEnv('NO_PROXY', 'api.example.test,.internal.test,port.example.test:8443');
    const proxyFetch = await loadProxyFetch();

    await proxyFetch('https://api.example.test/v1');
    await proxyFetch('https://svc.internal.test/v1');
    await proxyFetch('https://port.example.test:8443/v1');
    await proxyFetch('https://port.example.test:9443/v1');

    expect(globalFetchMock).toHaveBeenCalledTimes(3);
    expect(undiciFetchMock).toHaveBeenCalledTimes(1);
    expect(undiciFetchMock).toHaveBeenCalledWith(
      'https://port.example.test:9443/v1',
      expect.objectContaining({
        dispatcher: expect.any(Object),
      }),
    );
  });

  it('honors IPv6 literals and default ports in NO_PROXY entries', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.example.test:8080');
    vi.stubEnv('NO_PROXY', '[2606:4700:4700::1111],port.example.test:443');
    const proxyFetch = await loadProxyFetch();

    await proxyFetch('https://[2606:4700:4700::1111]/dns-query');
    await proxyFetch('https://port.example.test/v1');
    await proxyFetch('https://port.example.test:444/v1');

    expect(globalFetchMock).toHaveBeenCalledWith(
      'https://[2606:4700:4700::1111]/dns-query',
      undefined,
    );
    expect(globalFetchMock).toHaveBeenCalledWith('https://port.example.test/v1', undefined);
    expect(undiciFetchMock).toHaveBeenCalledTimes(1);
    expect(undiciFetchMock).toHaveBeenCalledWith(
      'https://port.example.test:444/v1',
      expect.objectContaining({
        dispatcher: expect.any(Object),
      }),
    );
  });

  it('honors lowercase no_proxy and wildcard entries', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.example.test:8080');
    vi.stubEnv('no_proxy', '*');
    const proxyFetch = await loadProxyFetch();

    await proxyFetch('https://api.example.test/v1');

    expect(globalFetchMock).toHaveBeenCalledWith('https://api.example.test/v1', undefined);
    expect(undiciFetchMock).not.toHaveBeenCalled();
  });
});
