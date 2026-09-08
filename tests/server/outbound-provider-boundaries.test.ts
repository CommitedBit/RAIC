import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateText } from 'ai';
import { createValidatedFetch } from '@/lib/server/outbound-fetch';
import { generateTTS } from '@/lib/audio/tts-providers';
import { silentWav } from '../support/tts-audio';
import { transcribeAudio } from '@/lib/audio/asr-providers';
import { getModel } from '@/lib/ai/providers';
import { generateImage, IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import { generateVideo, VIDEO_PROVIDERS } from '@/lib/media/video-providers';
import { parseWithMinerUCloud } from '@/lib/pdf/mineru-cloud';
import type { ImageProviderId, VideoProviderId } from '@/lib/media/types';

vi.mock('node:dns', () => ({
  promises: { lookup: vi.fn(async () => [{ address: '8.8.8.8', family: 4 }]) },
}));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubEnv('ALLOW_LOCAL_NETWORKS', '');
  fetchMock.mockReset().mockRejectedValue(new Error('Unexpected network request in fixture'));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('server transport reaches provider adapters and SDKs', () => {
  it.each(['openai', 'anthropic', 'google', 'qwen'] as const)(
    'uses the injected transport in the %s language SDK',
    async (providerId) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error('fixture transport blocked'));
      const { model } = getModel({
        providerId,
        modelId: 'fixture-model',
        apiKey: 'synthetic',
        baseUrl: 'https://provider.example/v1',
        fetchImpl,
        ...(providerId === 'google' ? { proxy: 'http://configured-proxy.example:8080' } : {}),
      });
      await expect(
        generateText({ model, prompt: 'Synthetic fixture', maxRetries: 0 }),
      ).rejects.toThrow('fixture transport blocked');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('retains vendor thinking fields when using the injected OpenAI-compatible transport', async () => {
    vi.stubGlobal('__thinkingContext', { getStore: () => ({ enabled: true }) });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('fixture transport blocked'));
    const { model } = getModel({
      providerId: 'qwen',
      modelId: 'qwen3.6-plus',
      apiKey: 'synthetic',
      fetchImpl,
    });
    await expect(
      generateText({ model, prompt: 'Synthetic fixture', maxRetries: 0 }),
    ).rejects.toThrow('fixture transport blocked');
    expect(JSON.parse(fetchImpl.mock.calls[0][1]!.body as string)).toMatchObject({
      enable_thinking: true,
    });
  });

  it.each(Object.keys(IMAGE_PROVIDERS) as ImageProviderId[])(
    'injects the transport into image adapter %s',
    async (providerId) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error('fixture transport blocked'));
      await expect(
        generateImage(
          {
            providerId,
            apiKey: 'synthetic',
            model: IMAGE_PROVIDERS[providerId].models[0].id,
            baseUrl: 'https://provider.example',
            fetchImpl,
          },
          { prompt: 'Synthetic fixture' },
        ),
      ).rejects.toThrow('fixture transport blocked');
      expect(fetchImpl).toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(Object.keys(VIDEO_PROVIDERS) as VideoProviderId[])(
    'injects the transport into video adapter %s',
    async (providerId) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error('fixture transport blocked'));
      await expect(
        generateVideo(
          {
            providerId,
            apiKey: 'synthetic:synthetic',
            model: VIDEO_PROVIDERS[providerId].models[0].id,
            baseUrl: 'https://provider.example',
            fetchImpl,
          },
          { prompt: 'Synthetic fixture' },
        ),
      ).rejects.toThrow('fixture transport blocked');
      expect(fetchImpl).toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('uses the safe transport in Whisper SDK transcription', async () => {
    await expect(
      transcribeAudio(
        {
          providerId: 'openai-whisper',
          modelId: 'gpt-4o-mini-transcribe',
          apiKey: 'synthetic',
          baseUrl: 'http://127.0.0.1:11434/v1',
          fetchImpl: createValidatedFetch(),
        },
        Buffer.from('Synthetic audio fixture'),
      ),
    ).rejects.toThrow('Local/private');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('provider-returned URL boundaries', () => {
  it('blocks an internal audio download returned by Qwen TTS', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ output: { audio: { url: 'http://127.0.0.1/audio.wav' } } }),
    );
    await expect(
      generateTTS(
        {
          providerId: 'qwen-tts',
          apiKey: 'synthetic',
          voice: 'fixture',
          speed: 1,
          baseUrl: 'https://provider.example',
          fetchImpl: createValidatedFetch(),
        },
        'Synthetic fixture',
      ),
    ).rejects.toThrow('Local/private');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a public audio download and does not forward the synthesis credential', async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ output: { audio: { url: 'https://cdn.example/audio.wav' } } }),
      )
      .mockResolvedValueOnce(
        new Response(silentWav().slice().buffer, { headers: { 'content-type': 'audio/wav' } }),
      );
    const result = await generateTTS(
      {
        providerId: 'qwen-tts',
        apiKey: 'synthetic',
        voice: 'fixture',
        speed: 1,
        baseUrl: 'https://provider.example',
        fetchImpl: createValidatedFetch(),
      },
      'Synthetic fixture',
    );
    expect(result.audio).toEqual(silentWav());
    expect(fetchMock.mock.calls[1][1]?.headers).toBeUndefined();
  });

  it('blocks an internal presigned PDF upload URL', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        code: 0,
        data: { batch_id: 'fixture', file_urls: ['http://127.0.0.1/upload'] },
      }),
    );
    await expect(
      parseWithMinerUCloud(
        {
          providerId: 'mineru-cloud',
          apiKey: 'synthetic',
          baseUrl: 'https://provider.example',
          fetchImpl: createValidatedFetch(),
        },
        Buffer.from('%PDF-1.7 synthetic fixture'),
      ),
    ).rejects.toThrow('presigned upload failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('blocks an internal result ZIP after a permitted upload and poll', async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          code: 0,
          data: { batch_id: 'fixture', file_urls: ['https://upload.example/document.pdf'] },
        }),
      )
      .mockResolvedValueOnce(new Response(''))
      .mockResolvedValueOnce(
        Response.json({
          code: 0,
          data: {
            extract_result: [
              {
                file_name: 'document.pdf',
                state: 'done',
                full_zip_url: 'http://127.0.0.1/result.zip',
              },
            ],
          },
        }),
      );
    await expect(
      parseWithMinerUCloud(
        {
          providerId: 'mineru-cloud',
          apiKey: 'synthetic',
          baseUrl: 'https://provider.example',
          fetchImpl: createValidatedFetch(),
        },
        Buffer.from('%PDF-1.7 synthetic fixture'),
      ),
    ).rejects.toThrow('ZIP download failed');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][1]?.headers).toBeUndefined();
  });
});
