export type GenerationRetryCategory =
  | 'empty_result'
  | 'http_408'
  | 'http_409'
  | 'http_425'
  | 'http_429'
  | 'http_5xx'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'explicit_retryable';

export interface GenerationRetryEvent {
  label: string;
  attempt: number;
  maxAttempts: number;
  nextDelayMs: number;
  category: GenerationRetryCategory;
}

export interface GenerationRetryOptions<T> {
  label: string;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  shouldRetryResult?: (result: T) => boolean;
  onRetry?: (event: GenerationRetryEvent) => Promise<void> | void;
}

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 16000;
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404, 422]);

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort, { once: true });
  });

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return true;

  if (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    error.name === 'AbortError'
  ) {
    return true;
  }

  return isRecord(error) && stringField(error, 'name') === 'AbortError';
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function booleanField(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function statusCodeFrom(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;

  for (const key of ['statusCode', 'status', 'status_code']) {
    const raw = value[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return undefined;
}

function messageFrom(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (!isRecord(value)) return String(value);
  const message = stringField(value, 'message') ?? stringField(value, 'statusText');
  return message ?? '';
}

function retryCategoryByMessage(value: unknown): GenerationRetryCategory | null {
  const message = messageFrom(value);
  if (/rate limit|too many requests/i.test(message)) return 'rate_limit';
  if (/timeout|timed out|ETIMEDOUT/i.test(message)) return 'timeout';
  if (
    /fetch failed|network|ECONNRESET|ECONNREFUSED|ECONNABORTED|ENOTFOUND|EPIPE|socket hang up/i.test(
      message,
    )
  ) {
    return 'network';
  }
  return null;
}

function unwrapErrors(value: unknown): unknown[] {
  if (!isRecord(value)) return [];

  const nested: unknown[] = [];
  if ('lastError' in value) nested.push(value.lastError);
  if ('cause' in value) nested.push(value.cause);

  const errors = value.errors;
  if (Array.isArray(errors)) nested.push(...errors);

  return nested;
}

function isGovernanceFailure(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === 'string' &&
    typeof value.status === 'number' &&
    typeof value.apiErrorCode === 'string'
  );
}

export function getGenerationRetryCategory(
  error: unknown,
  seen = new Set<unknown>(),
): GenerationRetryCategory | null {
  if (!error || seen.has(error)) return null;
  seen.add(error);

  if (isAbortError(error) || isGovernanceFailure(error)) return null;

  const statusCode = statusCodeFrom(error);
  if (statusCode !== undefined) {
    if (statusCode === 408) return 'http_408';
    if (statusCode === 409) return 'http_409';
    if (statusCode === 425) return 'http_425';
    if (statusCode === 429) return 'http_429';
    if (statusCode >= 500) return 'http_5xx';
    if (NON_RETRYABLE_STATUS_CODES.has(statusCode) || (statusCode >= 400 && statusCode < 500)) {
      return null;
    }
  }

  if (isRecord(error)) {
    const explicitRetryable = booleanField(error, 'isRetryable');
    if (explicitRetryable === false) return null;
    if (explicitRetryable === true) return 'explicit_retryable';
  }

  const nested = unwrapErrors(error);
  if (nested.length > 0) {
    for (const nestedError of nested) {
      const category = getGenerationRetryCategory(nestedError, seen);
      if (category) return category;
    }
  }

  if (isRecord(error) && stringField(error, 'name') === 'TimeoutError') return 'timeout';
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';

  return retryCategoryByMessage(error);
}

export function isRetryableGenerationError(error: unknown): boolean {
  return getGenerationRetryCategory(error) !== null;
}

function retryDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number,
): number {
  const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(exponentialDelay * Math.max(0, Math.min(random(), 1)) * 0.2);
  return Math.min(maxDelayMs, exponentialDelay + jitter);
}

export async function withGenerationRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: GenerationRetryOptions<T>,
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const maxAttempts = maxRetries + 1;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    throwIfAborted(options.signal);

    try {
      const result = await operation(attempt);
      throwIfAborted(options.signal);

      if (!options.shouldRetryResult?.(result) || attempt >= maxAttempts) {
        return result;
      }

      const nextDelayMs = retryDelayMs(attempt, baseDelayMs, maxDelayMs, random);
      await options.onRetry?.({
        label: options.label,
        attempt,
        maxAttempts,
        nextDelayMs,
        category: 'empty_result',
      });
      throwIfAborted(options.signal);
      await sleep(nextDelayMs, options.signal);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      throwIfAborted(options.signal);

      const category = getGenerationRetryCategory(error);
      if (attempt >= maxAttempts || !category) {
        throw error;
      }

      const nextDelayMs = retryDelayMs(attempt, baseDelayMs, maxDelayMs, random);
      await options.onRetry?.({
        label: options.label,
        attempt,
        maxAttempts,
        nextDelayMs,
        category,
      });
      throwIfAborted(options.signal);
      await sleep(nextDelayMs, options.signal);
    }
  }

  throw new Error(`Generation retry exhausted for ${options.label}`);
}
