import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Agent, MockAgent, type Dispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock('node:dns', () => ({ promises: { lookup: lookupMock } }));

import { createValidatedFetch } from '@/lib/server/outbound-fetch';

let mock: MockAgent;
let dispatched: Dispatcher.DispatchOptions[];
beforeEach(() => {
  vi.stubEnv('ALLOW_LOCAL_NETWORKS', '');
  lookupMock.mockReset().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  mock = new MockAgent();
  mock.disableNetConnect();
  dispatched = [];
  vi.spyOn(Agent.prototype, 'dispatch').mockImplementation((options, handler) => {
    void (async () => {
      let body = options.body;
      if (body && typeof body !== 'string' && Symbol.asyncIterator in body) {
        const chunks: Buffer[] = [];
        for await (const chunk of body) chunks.push(Buffer.from(chunk));
        body = Buffer.concat(chunks).toString();
      }
      const sent = { ...options, body };
      dispatched.push(sent);
      mock.get(String(options.origin)).dispatch(sent, handler);
    })().catch((error: Error) => handler.onError?.(error));
    return true;
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await mock.close();
});

function reply(origin: string, path: string, status = 200, headers: Record<string, string> = {}) {
  mock.get(origin).intercept({ path }).reply(status, 'mock content', { headers });
}

describe('server outbound transport using native fetch', () => {
  it('rejects unsafe initial URLs before dispatch', async () => {
    await expect(createValidatedFetch()('http://127.0.0.1/private')).rejects.toThrow(
      'Local/private',
    );
    expect(dispatched).toHaveLength(0);
  });

  it('blocks a relative redirect that changes to an internal destination', async () => {
    reply('https://provider.example', '/start', 302, { location: '//127.0.0.1/private' });
    await expect(createValidatedFetch()('https://provider.example/start')).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringContaining('Local/private') }),
    });
    expect(dispatched).toHaveLength(1);
  });

  it('checks the actual redirect authority when a private URL has a // pathname', async () => {
    vi.restoreAllMocks();
    let received = 0;
    const server = createServer((_req, response) => {
      received++;
      response.setHeader('Connection', 'close');
      response.end('owned fixture');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    reply('http://provider.example', '/start', 302, {
      location: `http://127.0.0.1:${port}//8.8.8.8/private`,
    });
    const realDispatch = Agent.prototype.dispatch;
    vi.spyOn(Agent.prototype, 'dispatch').mockImplementation(function (
      this: Agent,
      options,
      handler,
    ) {
      if (String(options.origin) === 'http://provider.example') {
        return mock.get(String(options.origin)).dispatch(options, handler);
      }
      if (String(options.origin) !== `http://127.0.0.1:${port}`) {
        handler.onError?.(new Error('Unexpected fixture destination'));
        return true;
      }
      return realDispatch.call(this, options, handler);
    });
    try {
      await expect(
        createValidatedFetch()('http://provider.example/start', {
          signal: AbortSignal.timeout(2000),
        }),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ message: expect.stringContaining('Local/private') }),
      });
      expect(received).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('preserves a public // pathname without mistaking it for a credential origin', async () => {
    reply('https://provider.example', '/start', 302, {
      location: 'https://cdn.example//provider.example/asset',
    });
    mock
      .get('https://cdn.example')
      .intercept({ path: /^\/\/provider\.example\/asset$/ })
      .reply(200, 'mock content');
    const result = await createValidatedFetch()('https://provider.example/start', {
      headers: { 'x-api-key': 'synthetic' },
    });
    expect(await result.text()).toBe('mock content');
    expect(dispatched[1].origin).toBe('https://cdn.example');
    expect(dispatched[1].path).toBe('//provider.example/asset');
    expect(JSON.stringify(dispatched[1].headers)).not.toContain('synthetic');
  });

  it('drops all provider credential headers on public cross-origin redirects', async () => {
    reply('https://provider.example', '/start', 302, { location: 'https://cdn.example/asset' });
    reply('https://cdn.example', '/asset');
    const result = await createValidatedFetch()('https://provider.example/start', {
      headers: {
        authorization: 'Bearer synthetic',
        'api-key': 'synthetic',
        'x-api-key': 'synthetic',
        'x-goog-api-key': 'synthetic',
        'ocp-apim-subscription-key': 'synthetic',
        'xi-api-key': 'synthetic',
        'x-api-app-id': 'synthetic',
        'x-api-access-key': 'synthetic',
        cookie: 'synthetic',
        'x-custom-secret': 'synthetic',
        accept: 'audio/mpeg',
      },
    });
    expect(await result.text()).toBe('mock content');
    expect(dispatched).toHaveLength(2);
    expect(JSON.stringify(dispatched[1].headers)).not.toContain('synthetic');
    expect(JSON.stringify(dispatched[1].headers)).toContain('audio/mpeg');
  });

  it.each([301, 302, 303])(
    'preserves Request, init overrides and POST-to-GET semantics for %i',
    async (status) => {
      mock
        .get('https://provider.example')
        .intercept({ path: '/start', method: 'POST', body: 'replacement' })
        .reply(status, '', { headers: { location: '/done' } });
      reply('https://provider.example', '/done');
      const request = new Request('https://provider.example/start', {
        method: 'POST',
        body: 'original',
        headers: { 'x-api-key': 'synthetic' },
      });
      const result = await createValidatedFetch()(request, { body: 'replacement' });
      expect(await result.text()).toBe('mock content');
      expect(dispatched[1].method).toBe('GET');
      expect(JSON.stringify(dispatched[1].headers)).toContain('synthetic');
      mock.assertNoPendingInterceptors();
    },
  );

  it('keeps multipart file bytes and the native FormData boundary', async () => {
    mock
      .get('https://provider.example')
      .intercept({ path: '/upload', method: 'POST' })
      .reply(200, 'uploaded');
    const form = new FormData();
    form.set('description', 'Synthetic fixture');
    form.set('file', new Blob(['synthetic file bytes']), 'fixture.txt');
    const request = new Request('https://provider.example/upload', { method: 'POST', body: form });
    expect((await createValidatedFetch()(request)).ok).toBe(true);
    const headers = dispatched[0].headers as string[];
    const contentType = headers[headers.indexOf('content-type') + 1];
    const uploaded = await new Response(dispatched[0].body as string, {
      headers: { 'content-type': contentType },
    }).formData();
    expect(uploaded.get('description')).toBe('Synthetic fixture');
    expect(await (uploaded.get('file') as File).text()).toBe('synthetic file bytes');
  });

  it('rejects HTTPS downgrade redirects before dispatching the target', async () => {
    reply('https://provider.example', '/start', 302, { location: 'http://cdn.example/asset' });
    await expect(createValidatedFetch()('https://provider.example/start')).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'HTTPS downgrade redirects are not allowed' }),
    });
    expect(dispatched).toHaveLength(1);
  });

  it.each([307, 308])(
    'preserves same-origin %i body replay and rejects cross-origin replay',
    async (status) => {
      mock
        .get('https://provider.example')
        .intercept({ path: '/start', method: 'POST', body: 'payload' })
        .reply(status, '', { headers: { location: '/next' } });
      mock
        .get('https://provider.example')
        .intercept({ path: '/next', method: 'POST', body: 'payload' })
        .reply(status, '', { headers: { location: 'https://cdn.example/next' } });
      await expect(
        createValidatedFetch()('https://provider.example/start', {
          method: 'POST',
          body: 'payload',
        }),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ message: expect.stringContaining('cannot replay') }),
      });
      expect(dispatched).toHaveLength(2);
      mock.assertNoPendingInterceptors();
    },
  );

  it('preserves manual/error redirect modes and non-redirect 304 responses', async () => {
    reply('https://provider.example', '/manual', 302, { location: 'http://127.0.0.1/private' });
    reply('https://provider.example', '/error', 302, { location: '/next' });
    reply('https://provider.example', '/cache', 304);
    expect(
      (await createValidatedFetch()('https://provider.example/manual', { redirect: 'manual' }))
        .status,
    ).toBe(302);
    await expect(
      createValidatedFetch()('https://provider.example/error', { redirect: 'error' }),
    ).rejects.toThrow();
    expect((await createValidatedFetch()('https://provider.example/cache')).status).toBe(304);
    expect(dispatched).toHaveLength(3);
  });

  it('caps redirect chains at five follow-ups', async () => {
    for (let index = 0; index <= 5; index++) {
      reply('https://provider.example', `/${index}`, 302, { location: `/${index + 1}` });
    }
    await expect(createValidatedFetch()('https://provider.example/0')).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'Too many outbound redirects' }),
    });
    expect(dispatched).toHaveLength(6);
  });

  it('limits a server-configured local endpoint exception to its exact origin', async () => {
    reply('http://127.0.0.1:11434', '/v1/models', 302, {
      location: 'http://127.0.0.1:8000/private',
    });
    await expect(
      createValidatedFetch({ trustedBaseUrl: 'http://127.0.0.1:11434/v1' })(
        'http://127.0.0.1:11434/v1/models',
      ),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringContaining('Local/private') }),
    });
    expect(dispatched).toHaveLength(1);
  });

  it('keeps explicit self-hosted local-network opt-in, but still rejects URL credentials', async () => {
    vi.stubEnv('ALLOW_LOCAL_NETWORKS', '1');
    reply('http://127.0.0.1:11434', '/models');
    expect((await createValidatedFetch()('http://127.0.0.1:11434/models')).ok).toBe(true);
    await expect(createValidatedFetch()('http://user:password@localhost/models')).rejects.toThrow(
      'URL credentials',
    );
  });

  it('does not connect after cancellation during URL validation', async () => {
    const controller = new AbortController();
    lookupMock.mockImplementation(async () => {
      controller.abort();
      return [{ address: '8.8.8.8', family: 4 }];
    });
    await expect(
      createValidatedFetch()('https://provider.example', { signal: controller.signal }),
    ).rejects.toThrow();
    expect(dispatched).toHaveLength(0);
  });

  it('settles cancellation while the first DNS lookup remains pending', async () => {
    let release!: (value: Array<{ address: string; family: number }>) => void;
    lookupMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const controller = new AbortController();
    const result = createValidatedFetch()('https://slow-dns.example/', {
      signal: controller.signal,
    }).then(
      () => 'unexpected response',
      (error: Error) => error.name,
    );
    controller.abort();
    const outcome = await Promise.race([
      result,
      new Promise((resolve) => setTimeout(() => resolve('still pending'), 40)),
    ]);
    release([{ address: '8.8.8.8', family: 4 }]);
    await result;
    expect(outcome).toBe('AbortError');
    expect(dispatched).toHaveLength(0);
  });

  it('does not start DNS resolution for an already-cancelled Request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createValidatedFetch()(
        new Request('https://provider.example/', { signal: controller.signal }),
      ),
    ).rejects.toThrow();
    expect(lookupMock).not.toHaveBeenCalled();
    expect(dispatched).toHaveLength(0);
  });

  it('blocks DNS rebinding at the real socket lookup before a local service receives anything', async () => {
    vi.restoreAllMocks();
    let received = 0;
    const server = createServer((_req, res) => {
      received++;
      res.end('owned fixture');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    lookupMock
      .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    try {
      await expect(
        createValidatedFetch()(`http://rebind.example:${port}/`, {
          signal: AbortSignal.timeout(2000),
        }),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ message: expect.stringContaining('Local/private') }),
      });
      expect(received).toBe(0);
      expect(lookupMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('pins public proxy CONNECT to a vetted IP while preserving the target Host header', async () => {
    vi.restoreAllMocks();
    const tunnels: string[] = [];
    let targetRequest = '';
    const server = createServer();
    server.on('connect', (request, socket) => {
      tunnels.push(request.url || '');
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      socket.on('data', (chunk) => {
        targetRequest += chunk.toString();
        if (targetRequest.includes('\r\n\r\n')) {
          socket.end('HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\nproxy');
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const result = await createValidatedFetch({
        proxy: `http://synthetic:proxy-secret@127.0.0.1:${port}`,
      })('http://public-provider.example/v1', { signal: AbortSignal.timeout(2000) });
      expect(await result.text()).toBe('proxy');
      expect(tunnels).toEqual(['8.8.8.8:80']);
      expect(targetRequest).toContain('host: public-provider.example');
      expect(targetRequest.toLowerCase()).not.toContain('proxy-authorization');
      expect(targetRequest).not.toContain('proxy-secret');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rechecks DNS before a public proxy tunnel can connect', async () => {
    vi.restoreAllMocks();
    let tunnels = 0;
    const server = createServer();
    server.on('connect', (_request, socket) => {
      tunnels++;
      socket.destroy();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    lookupMock
      .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    try {
      await expect(
        createValidatedFetch({ proxy: `http://127.0.0.1:${port}` })(
          'http://proxy-rebind.example/v1',
          { signal: AbortSignal.timeout(2000) },
        ),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ message: expect.stringContaining('Local/private') }),
      });
      expect(tunnels).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
