import { describe, expect, it, vi } from 'vitest';
import {
  getGenerationRetryCategory,
  isAbortError,
  isRetryableGenerationError,
  withGenerationRetry,
} from '@/lib/generation/generation-retry';

function httpError(status: number, message = `HTTP ${status}`): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

describe('generation retry', () => {
  it('retries transient failures with deterministic exponential jitter', async () => {
    const operation = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce(httpError(429, 'rate limit'))
      .mockResolvedValue('ok');
    const sleep = vi.fn(async () => {});
    const onRetry = vi.fn();

    const result = await withGenerationRetry(operation, {
      label: 'scene-content',
      maxRetries: 2,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      random: () => 0.5,
      sleep,
      onRetry,
    });

    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(110, undefined);
    expect(onRetry).toHaveBeenCalledWith({
      label: 'scene-content',
      attempt: 1,
      maxAttempts: 3,
      nextDelayMs: 110,
      category: 'http_429',
    });
  });

  it.each([408, 409, 425, 429, 500, 502, 503, 504])('classifies HTTP %i as retryable', (status) => {
    expect(isRetryableGenerationError(httpError(status))).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])('classifies HTTP %i as non-retryable', (status) => {
    expect(isRetryableGenerationError(httpError(status))).toBe(false);
  });

  it('classifies network and timeout failures as retryable', () => {
    const timeout = new Error('operation timed out');
    timeout.name = 'TimeoutError';

    expect(isRetryableGenerationError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableGenerationError(new Error('socket hang up'))).toBe(true);
    expect(isRetryableGenerationError(timeout)).toBe(true);
  });

  it('does not retry auth or validation failures', async () => {
    const operation = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValue(httpError(401));
    const sleep = vi.fn(async () => {});

    await expect(
      withGenerationRetry(operation, {
        label: 'scene-content',
        maxRetries: 2,
        sleep,
      }),
    ).rejects.toMatchObject({ status: 401 });

    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('gives terminal statuses and governance failures precedence over retry hints', () => {
    expect(isRetryableGenerationError({ status: 401, isRetryable: true })).toBe(false);
    expect(isRetryableGenerationError({ status: 503, isRetryable: false })).toBe(true);
    expect(
      isRetryableGenerationError({
        name: 'GovernedProviderResolutionError',
        code: 'PROVIDER_DISABLED',
        status: 500,
        apiErrorCode: 'FORBIDDEN',
        isRetryable: true,
        message: 'network policy unavailable',
      }),
    ).toBe(false);
  });

  it('detects retryable nested provider failures', () => {
    expect(isRetryableGenerationError({ lastError: httpError(503) })).toBe(true);
    expect(isRetryableGenerationError({ cause: new Error('fetch failed') })).toBe(true);
    expect(isRetryableGenerationError({ errors: [httpError(422), httpError(500)] })).toBe(true);
  });

  it('retries empty results when a caller opts in', async () => {
    const operation = vi
      .fn<(attempt: number) => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValue('filled');
    const sleep = vi.fn(async () => {});
    const onRetry = vi.fn();

    const result = await withGenerationRetry(operation, {
      label: 'scene-content',
      maxRetries: 1,
      baseDelayMs: 0,
      random: () => 0,
      sleep,
      onRetry,
      shouldRetryResult: (value) => value === null,
    });

    expect(result).toBe('filled');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'empty_result',
      }),
    );
  });

  it('returns the final empty result after the configured retry budget is exhausted', async () => {
    const operation = vi.fn<(attempt: number) => Promise<null>>().mockResolvedValue(null);
    const sleep = vi.fn(async () => {});
    const onRetry = vi.fn();

    const result = await withGenerationRetry(operation, {
      label: 'scene-content',
      maxRetries: 2,
      baseDelayMs: 0,
      sleep,
      onRetry,
      shouldRetryResult: (value) => value === null,
    });

    expect(result).toBeNull();
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('preserves aborts raised while waiting between attempts', async () => {
    const controller = new AbortController();
    const operation = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValue(httpError(503));
    const sleep = vi.fn(async (_ms: number, signal?: AbortSignal) => {
      controller.abort();
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
    });

    await expect(
      withGenerationRetry(operation, {
        label: 'scene-content',
        maxRetries: 2,
        signal: controller.signal,
        sleep,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('classifies retry telemetry without exposing raw provider messages', async () => {
    const error = Object.assign(new Error('fetch failed for https://user:secret@example.test'), {
      status: 503,
    });
    const onRetry = vi.fn();

    await withGenerationRetry(
      vi
        .fn<(attempt: number) => Promise<string>>()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('ok'),
      {
        label: 'scene-content',
        maxRetries: 1,
        baseDelayMs: 0,
        sleep: async () => {},
        onRetry,
      },
    );

    expect(getGenerationRetryCategory(error)).toBe('http_5xx');
    expect(JSON.stringify(onRetry.mock.calls)).not.toContain('secret');
  });

  it('preserves aborts without retrying', async () => {
    const operation = vi.fn<(attempt: number) => Promise<string>>();
    const controller = new AbortController();
    controller.abort();

    const result = withGenerationRetry(operation, {
      label: 'scene-content',
      signal: controller.signal,
    });

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await result.catch((error) => expect(isAbortError(error)).toBe(true));

    expect(operation).not.toHaveBeenCalled();
  });
});
