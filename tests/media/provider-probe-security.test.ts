import { afterEach, describe, expect, it, vi } from 'vitest';

import { testGrokImageConnectivity } from '@/lib/media/adapters/grok-image-adapter';
import { testGrokVideoConnectivity } from '@/lib/media/adapters/grok-video-adapter';
import { testKlingConnectivity } from '@/lib/media/adapters/kling-adapter';
import { testMiniMaxImageConnectivity } from '@/lib/media/adapters/minimax-image-adapter';
import { testMiniMaxVideoConnectivity } from '@/lib/media/adapters/minimax-video-adapter';
import { testNanoBananaConnectivity } from '@/lib/media/adapters/nano-banana-adapter';
import { testOpenAIImageConnectivity } from '@/lib/media/adapters/openai-image-adapter';
import { testQwenImageConnectivity } from '@/lib/media/adapters/qwen-image-adapter';
import { testSeedanceConnectivity } from '@/lib/media/adapters/seedance-adapter';
import { testSeedreamConnectivity } from '@/lib/media/adapters/seedream-adapter';
import { testSoraConnectivity } from '@/lib/media/adapters/sora-adapter';
import { testVeoConnectivity } from '@/lib/media/adapters/veo-adapter';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

type ConnectivityResult = { success: boolean; message: string };

const authOnlyCases: Array<{
  name: string;
  probe: () => Promise<ConnectivityResult>;
}> = [
  {
    name: 'Seedream',
    probe: () =>
      testSeedreamConnectivity({
        providerId: 'seedream',
        apiKey: 'seedream-key',
        baseUrl: 'https://seedream.example.com',
      }),
  },
  {
    name: 'Qwen Image',
    probe: () =>
      testQwenImageConnectivity({
        providerId: 'qwen-image',
        apiKey: 'qwen-key',
        baseUrl: 'https://qwen.example.com',
      }),
  },
  {
    name: 'Grok Image',
    probe: () =>
      testGrokImageConnectivity({
        providerId: 'grok-image',
        apiKey: 'grok-image-key',
        baseUrl: 'https://grok-image.example.com/v1',
      }),
  },
  {
    name: 'Seedance',
    probe: () =>
      testSeedanceConnectivity({
        providerId: 'seedance',
        apiKey: 'seedance-key',
        baseUrl: 'https://seedance.example.com',
      }),
  },
  {
    name: 'Kling',
    probe: () =>
      testKlingConnectivity({
        providerId: 'kling',
        apiKey: 'access-key:secret-key',
        baseUrl: 'https://kling.example.com',
      }),
  },
  {
    name: 'Grok Video',
    probe: () =>
      testGrokVideoConnectivity({
        providerId: 'grok-video',
        apiKey: 'grok-video-key',
        baseUrl: 'https://grok-video.example.com/v1',
      }),
  },
];

const strictCases: Array<{
  name: string;
  probe: () => Promise<ConnectivityResult>;
}> = [
  {
    name: 'OpenAI Image',
    probe: () =>
      testOpenAIImageConnectivity({
        providerId: 'openai-image',
        apiKey: 'openai-key',
        baseUrl: 'https://openai.example.com/v1',
      }),
  },
  {
    name: 'MiniMax Image',
    probe: () =>
      testMiniMaxImageConnectivity({
        providerId: 'minimax-image',
        apiKey: 'minimax-image-key',
        baseUrl: 'https://minimax-image.example.com',
      }),
  },
  {
    name: 'MiniMax Video',
    probe: () =>
      testMiniMaxVideoConnectivity({
        providerId: 'minimax-video',
        apiKey: 'minimax-video-key',
        baseUrl: 'https://minimax-video.example.com',
      }),
  },
  {
    name: 'Sora',
    probe: () =>
      testSoraConnectivity({
        providerId: 'sora',
        apiKey: 'sora-key',
        baseUrl: 'https://sora.example.com/v1',
      }),
  },
];

afterEach(() => {
  fetchMock.mockReset();
});

describe('credential-bearing provider probes', () => {
  it.each(authOnlyCases)('$name rejects a redirect after one manual request', async ({ probe }) => {
    fetchMock.mockResolvedValueOnce(
      new Response('redirect blocked', {
        status: 302,
        headers: { Location: 'http://127.0.0.1/internal' },
      }),
    );

    const result = await probe();

    expect(result.success).toBe(false);
    expect(result.message).toContain('Redirects are not allowed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ redirect: 'manual' }));
  });

  it.each(strictCases)('$name rejects a redirect after one manual request', async ({ probe }) => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ base_resp: { status_msg: 'redirect blocked' } }), {
        status: 302,
        headers: { Location: 'http://127.0.0.1/internal' },
      }),
    );

    const result = await probe();

    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ redirect: 'manual' }));
  });

  it.each([
    {
      name: 'Nano Banana',
      probe: () =>
        testNanoBananaConnectivity({
          providerId: 'nano-banana' as const,
          apiKey: 'google-key',
          baseUrl: 'https://google.example.com',
        }),
    },
    {
      name: 'Veo',
      probe: () =>
        testVeoConnectivity({
          providerId: 'veo' as const,
          apiKey: 'google-key',
          baseUrl: 'https://google.example.com',
        }),
    },
  ])('$name never follows either authentication redirect', async ({ probe }) => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('query redirect', {
          status: 302,
          headers: { Location: 'http://127.0.0.1/query' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('header redirect', {
          status: 302,
          headers: { Location: 'http://127.0.0.1/header' },
        }),
      );

    const result = await probe();

    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ redirect: 'manual' }));
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ redirect: 'manual' }));
    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).hostname)).toEqual([
      'google.example.com',
      'google.example.com',
    ]);
  });
});
