import { describe, expect, it, vi } from 'vitest';
import { generateTTS, TTSRateLimitError } from '@/lib/audio/tts-providers';
import { readTTSAudioResponse, validateTTSAudioPayload } from '@/lib/audio/tts-response';
import { silentWav } from '../support/tts-audio';

describe('TTS response validation', () => {
  it.each([
    ['text/html', '<html>Provider gateway is misconfigured</html>'],
    ['application/json', '{"error":"Provider configuration missing"}'],
    ['audio/mpeg', ''],
  ])('rejects HTTP 200 %s that is not audio', async (contentType, body) => {
    await expect(
      generateTTS(
        {
          providerId: 'openai-tts',
          voice: 'alloy',
          apiKey: 'synthetic',
          fetchImpl: async () =>
            new Response(body, { status: 200, headers: { 'content-type': contentType } }),
        },
        'Synthetic narration.',
      ),
    ).rejects.toThrow();
  });
  it('preserves a genuine WAV response', async () => {
    const bytes = silentWav();
    const result = await generateTTS(
      {
        providerId: 'openai-tts',
        voice: 'alloy',
        apiKey: 'synthetic',
        fetchImpl: async () =>
          new Response(bytes.slice().buffer, { headers: { 'content-type': 'audio/wav' } }),
      },
      'Synthetic narration.',
    );
    expect(result.format).toBe('wav');
    expect(result.audio).toEqual(bytes);
  });

  it.each(['Audio/WAV; charset=binary', 'application/octet-stream', ''])(
    'identifies WAV bytes with %j metadata',
    async (contentType) => {
      const bytes = silentWav();
      expect(
        await readTTSAudioResponse(
          new Response(bytes.slice().buffer, {
            headers: contentType ? { 'content-type': contentType } : {},
          }),
        ),
      ).toEqual({ audio: bytes, format: 'wav' });
    },
  );

  it.each(['audio/wav', 'application/octet-stream', ''])(
    'rejects a JSON error disguised as %j',
    async (contentType) => {
      const bytes = new TextEncoder().encode('{"error":"not audio"}');
      await expect(
        readTTSAudioResponse(
          new Response(bytes, { headers: contentType ? { 'content-type': contentType } : {} }),
        ),
      ).rejects.toThrow('non-audio');
    },
  );

  it('cancels a non-audio body without returning its contents in the error', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { 'content-type': 'text/html' },
    });
    await expect(readTTSAudioResponse(response)).rejects.toThrow('non-audio response (text/html)');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(['pcm', 'ulaw', 'alaw'])(
    'retains explicitly requested %s samples without pretending to decode them',
    async (format) => {
      const bytes = new Uint8Array([0, 1, 2, 3, 4, 5]);
      expect(
        await readTTSAudioResponse(
          new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }),
          format,
        ),
      ).toEqual({ audio: bytes, format });
      await expect(
        readTTSAudioResponse(
          new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }),
        ),
      ).rejects.toThrow();
      await expect(
        readTTSAudioResponse(
          new Response('{"error":"not audio"}', {
            headers: { 'content-type': 'application/octet-stream' },
          }),
          format,
        ),
      ).rejects.toThrow();
    },
  );

  it('rejects MIME map prototype names and contradictory raw sample metadata', async () => {
    await expect(
      readTTSAudioResponse(
        new Response(silentWav().slice().buffer, { headers: { 'content-type': 'constructor' } }),
      ),
    ).rejects.toThrow();
    await expect(
      readTTSAudioResponse(
        new Response(new Uint8Array([0, 1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } }),
        'pcm',
      ),
    ).rejects.toThrow();
  });

  it.each([
    'openai-tts',
    'custom-tts-fixture',
    'azure-tts',
    'glm-tts',
    'voxcpm-tts',
    'lemonade-tts',
    'elevenlabs-tts',
  ] as const)('%s checks binary responses through its real adapter', async (providerId) => {
    const bytes = silentWav();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(bytes.slice().buffer, { headers: { 'content-type': 'audio/wav' } }),
      );
    const config = {
      providerId,
      voice: 'auto',
      apiKey: 'synthetic',
      baseUrl: 'https://provider.example',
      fetchImpl,
    };
    expect(await generateTTS(config, 'Synthetic narration.')).toEqual({
      audio: bytes,
      format: 'wav',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    fetchImpl.mockResolvedValue(
      new Response('<html>Gateway error</html>', { headers: { 'content-type': 'text/html' } }),
    );
    await expect(generateTTS(config, 'Synthetic narration.')).rejects.toThrow('non-audio');
  });

  it('validates the Qwen download separately from its successful JSON envelope', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ output: { audio: { url: 'https://cdn.example/audio.wav' } } }),
      )
      .mockResolvedValueOnce(
        new Response('<html>Error</html>', { headers: { 'content-type': 'text/html' } }),
      );
    await expect(
      generateTTS(
        { providerId: 'qwen-tts', apiKey: 'synthetic', voice: 'fixture', fetchImpl },
        'Synthetic narration.',
      ),
    ).rejects.toThrow('non-audio');
  });

  it('validates MiniMax decoded bytes and rejects malformed hex', async () => {
    const bytes = silentWav();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: { audio: Buffer.from(bytes).toString('hex') } }));
    const config = {
      providerId: 'minimax-tts' as const,
      apiKey: 'synthetic',
      voice: 'fixture',
      fetchImpl,
    };
    expect(await generateTTS(config, 'Synthetic narration.')).toEqual({
      audio: bytes,
      format: 'wav',
    });
    for (const hex of ['00GG', Buffer.from('<html>Error</html>').toString('hex')]) {
      fetchImpl.mockResolvedValue(Response.json({ data: { audio: hex } }));
      await expect(generateTTS(config, 'Synthetic narration.')).rejects.toThrow();
    }
  });

  it('validates Doubao combined chunks and preserves typed rate-limit errors', async () => {
    const bytes = silentWav();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ code: 0, data: Buffer.from(bytes).toString('base64') }) +
            JSON.stringify({ code: 20000000 }),
        ),
      );
    const config = {
      providerId: 'doubao-tts' as const,
      apiKey: 'synthetic:fixture',
      voice: 'fixture',
      fetchImpl,
    };
    expect(await generateTTS(config, 'Synthetic narration.')).toEqual({
      audio: bytes,
      format: 'wav',
    });
    fetchImpl.mockResolvedValue(
      new Response(
        JSON.stringify({ code: 0, data: Buffer.from('{"error":"not audio"}').toString('base64') }),
      ),
    );
    await expect(generateTTS(config, 'Synthetic narration.')).rejects.toThrow('non-audio');
    fetchImpl.mockResolvedValue(
      new Response(JSON.stringify({ code: 45000000, message: 'synthetic quota' })),
    );
    await expect(generateTTS(config, 'Synthetic narration.')).rejects.toBeInstanceOf(
      TTSRateLimitError,
    );
  });

  it('forwards an explicit OpenAI raw format and returns its bytes unchanged', async () => {
    const bytes = new Uint8Array([0, 1, 2, 3]);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(bytes, { headers: { 'content-type': 'audio/pcm' } }));
    expect(
      await generateTTS(
        { providerId: 'openai-tts', apiKey: 'synthetic', voice: 'alloy', format: 'pcm', fetchImpl },
        'Synthetic narration.',
      ),
    ).toEqual({ audio: bytes, format: 'pcm' });
    expect(JSON.parse(fetchImpl.mock.calls[0][1]!.body as string).response_format).toBe('pcm');
  });

  it('recognizes supported compressed/container signatures without calling them decoded audio', () => {
    const samples: Array<[string, Uint8Array]> = [
      ['mp3', new Uint8Array([0xff, 0xfb, 0x90, 0, 0])],
      ['mp3', new Uint8Array([...new TextEncoder().encode('ID3'), 4, 0, 0, 0, 0, 0, 0, 1])],
      ['aac', new Uint8Array([0xff, 0xf1, 0x50, 0x80, 0, 0x1f, 0xfc])],
      ['flac', new Uint8Array([...new TextEncoder().encode('fLaC'), 0, 0, 0, 1])],
      ['ogg', new Uint8Array([...new TextEncoder().encode('OggS'), ...new Uint8Array(24)])],
      ['webm', new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...new TextEncoder().encode('webm')])],
      ['m4a', new Uint8Array([0, 0, 0, 12, ...new TextEncoder().encode('ftypM4A ')])],
    ];
    for (const [format, bytes] of samples)
      expect(validateTTSAudioPayload(bytes).format).toBe(format);
    expect(validateTTSAudioPayload(samples[4][1], 'opus').format).toBe('opus');
    expect(() => validateTTSAudioPayload(new Uint8Array([0xff, 0xff, 0xff, 0xff]))).toThrow();
  });
});
