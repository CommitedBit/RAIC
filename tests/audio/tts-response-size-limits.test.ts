import { describe, expect, it, vi } from 'vitest';
import { generateTTS } from '@/lib/audio/tts-providers';
import {
  MAX_TTS_AUDIO_BYTES,
  MAX_TTS_ENVELOPE_BYTES,
  MAX_TTS_ERROR_BYTES,
  MAX_TTS_METADATA_BYTES,
  readTTSAudioResponse,
  readTTSResponseBytes,
  readTTSTextResponse,
  validateTTSAudioPayload,
} from '@/lib/audio/tts-response';

function streamResponse(chunks: Uint8Array[], init?: ResponseInit) {
  let index = 0;
  const cancel = vi.fn();
  const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (index < chunks.length) controller.enqueue(chunks[index++]);
    else controller.close();
  });
  const response = new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 }), init);
  return { response, pull, cancel };
}

describe('TTS response byte limits', () => {
  it('accepts bytes exactly at the limit and releases the stream lock', async () => {
    const expected = new Uint8Array(20_000).map((_, index) => index % 256);
    const { response, cancel } = streamResponse([
      expected.slice(0, 12_000),
      new Uint8Array(),
      expected.slice(12_000),
    ]);
    expect(await readTTSResponseBytes(response, expected.length)).toEqual(expected);
    expect(response.body?.locked).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  });

  it.each(['', '1', 'invalid'])(
    'counts streamed bytes with Content-Length %j and cancels before another read',
    async (declaredLength) => {
      const { response, cancel, pull } = streamResponse(
        [new Uint8Array(4), new Uint8Array(5), new Uint8Array(1)],
        { headers: declaredLength ? { 'content-length': declaredLength } : {} },
      );
      await expect(readTTSResponseBytes(response, 8)).rejects.toThrow('8-byte limit');
      expect(cancel).toHaveBeenCalledOnce();
      expect(pull).toHaveBeenCalledTimes(2);
      expect(response.body?.locked).toBe(false);
    },
  );

  it('rejects declared oversized audio without reading its body', async () => {
    const { response, cancel, pull } = streamResponse([new Uint8Array([1])], {
      headers: {
        'content-type': 'audio/wav',
        'content-length': String(MAX_TTS_AUDIO_BYTES + 1),
      },
    });
    await expect(readTTSAudioResponse(response)).rejects.toThrow('byte limit');
    expect(cancel).toHaveBeenCalledOnce();
    expect(pull).not.toHaveBeenCalled();
  });

  it('bounds decoded provider bytes before format recognition or raw-sample acceptance', () => {
    expect(() => validateTTSAudioPayload(new Uint8Array(MAX_TTS_AUDIO_BYTES + 1), 'pcm')).toThrow(
      'byte limit',
    );
  });

  it('preserves UTF-8 split across chunks while counting bytes instead of characters', async () => {
    const expected = 'A漢字';
    const bytes = new TextEncoder().encode(expected);
    const { response } = streamResponse([bytes.slice(0, 2), bytes.slice(2)]);
    expect(await readTTSTextResponse(response, bytes.length)).toBe(expected);
    await expect(readTTSTextResponse(new Response(expected), expected.length)).rejects.toThrow(
      'byte limit',
    );
  });

  it.each([
    ['qwen-tts', MAX_TTS_METADATA_BYTES, 'synthetic'],
    ['minimax-tts', MAX_TTS_ENVELOPE_BYTES, 'synthetic'],
    ['doubao-tts', MAX_TTS_ENVELOPE_BYTES, 'synthetic:fixture'],
  ] as const)('%s bounds its successful response envelope', async (providerId, limit, apiKey) => {
    const { response, pull, cancel } = streamResponse([new Uint8Array([1])], {
      headers: { 'content-type': 'application/json', 'content-length': String(limit + 1) },
    });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(
      generateTTS({ providerId, apiKey, voice: 'fixture', fetchImpl }, 'Synthetic narration.'),
    ).rejects.toThrow('byte limit');
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(pull).not.toHaveBeenCalled();
  });

  it('bounds an HTTP error body before parsing provider details', async () => {
    const { response, cancel, pull } = streamResponse([new Uint8Array([1])], {
      status: 500,
      statusText: 'Synthetic failure',
      headers: { 'content-length': String(MAX_TTS_ERROR_BYTES + 1) },
    });
    await expect(
      generateTTS(
        {
          providerId: 'openai-tts',
          apiKey: 'synthetic',
          voice: 'fixture',
          fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response),
        },
        'Synthetic narration.',
      ),
    ).rejects.toThrow('Synthetic failure');
    expect(cancel).toHaveBeenCalledOnce();
    expect(pull).not.toHaveBeenCalled();
  });

  it('rejects aggregate Doubao audio before allocating a combined oversized buffer', async () => {
    const data = 'A'.repeat(Math.ceil((MAX_TTS_AUDIO_BYTES / 2 + 1) / 3) * 4);
    const body = JSON.stringify({ code: 0, data }) + JSON.stringify({ code: 0, data });
    expect(new TextEncoder().encode(body).length).toBeLessThan(MAX_TTS_ENVELOPE_BYTES);
    await expect(
      generateTTS(
        {
          providerId: 'doubao-tts',
          apiKey: 'synthetic:fixture',
          voice: 'fixture',
          fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response(body)),
        },
        'Synthetic narration.',
      ),
    ).rejects.toThrow('byte limit');
  });
});
