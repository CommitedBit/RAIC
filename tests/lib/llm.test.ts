import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateTextMock = vi.fn();
const streamTextMock = vi.fn();
const warnMock = vi.fn();
const runMock = vi.fn((_thinking: unknown, callback: () => unknown) => callback());

vi.mock('ai', () => ({
  generateText: generateTextMock,
  streamText: streamTextMock,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: warnMock,
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/lib/ai/providers', () => ({
  PROVIDERS: {},
}));

vi.mock('@/lib/ai/thinking-context', () => ({
  thinkingContext: {
    run: runMock,
  },
}));

describe('streamLLM', () => {
  beforeEach(() => {
    vi.resetModules();
    generateTextMock.mockReset();
    streamTextMock.mockReset();
    warnMock.mockReset();
    runMock.mockClear();
    runMock.mockImplementation((_thinking: unknown, callback: () => unknown) => callback());
  });

  it('logs a safe stream error summary and preserves caller hooks', async () => {
    const resultValue = { textStream: [] };
    const callerOnError = vi.fn();
    streamTextMock.mockReturnValue(resultValue);

    const { streamLLM } = await import('@/lib/ai/llm');

    const result = streamLLM(
      {
        model: 'test-model',
        prompt: 'hello',
        onError: callerOnError,
      } as never,
      'scene-outlines-stream',
    );

    expect(result).toBe(resultValue);
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock).toHaveBeenCalledTimes(1);

    const streamParams = streamTextMock.mock.calls[0]?.[0] as {
      onError?: (event: { error: unknown }) => Promise<void>;
    };
    expect(streamParams.onError).toEqual(expect.any(Function));

    const error = Object.assign(new Error('Incorrect API key: sk-or-v1-secret-suffix'), {
      name: 'AI_APICallError',
      code: 'invalid_api_key',
      statusCode: 401,
      isRetryable: false,
      apiKey: 'sk-or-v1-secret-suffix',
      url: 'https://provider.example/v1/chat?token=secret',
      requestBodyValues: { messages: [{ role: 'user', content: 'private prompt' }] },
      responseBody: '{"error":"Incorrect API key: sk-or-v1-secret-suffix"}',
    });

    await streamParams.onError?.({ error });

    expect(warnMock).toHaveBeenCalledWith('[scene-outlines-stream] Stream failed', {
      errorName: 'AI_APICallError',
      errorCode: 'invalid_api_key',
      statusCode: 401,
      retryable: false,
    });
    const serializedLogs = JSON.stringify(warnMock.mock.calls);
    expect(serializedLogs).not.toContain('sk-or-v1-secret-suffix');
    expect(serializedLogs).not.toContain('private prompt');
    expect(serializedLogs).not.toContain('provider.example');
    expect(serializedLogs).not.toContain('responseBody');
    expect(callerOnError).toHaveBeenCalledWith({ error });
  });

  it('logs a safe error summary when a generated call is retried', async () => {
    const error = Object.assign(new Error('Authorization failed for token-secret'), {
      name: 'AI_APICallError',
      status: 503,
      isRetryable: true,
      responseBody: 'token-secret',
    });
    generateTextMock.mockRejectedValueOnce(error).mockResolvedValueOnce({ text: 'recovered' });

    const { callLLM } = await import('@/lib/ai/llm');
    const result = await callLLM(
      { model: 'test-model', prompt: 'hello' } as never,
      'scene-content',
      { retries: 1 },
    );

    expect(result).toEqual({ text: 'recovered' });
    expect(warnMock).toHaveBeenCalledWith(
      '[scene-content] Call failed (attempt 1/2), retrying...',
      {
        errorName: 'AI_APICallError',
        status: 503,
        retryable: true,
      },
    );
    expect(JSON.stringify(warnMock.mock.calls)).not.toContain('token-secret');
  });
});
