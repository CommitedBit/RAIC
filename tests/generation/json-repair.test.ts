import { beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => logger,
}));

import { parseJsonResponse } from '@/lib/generation/json-repair';

describe('parseJsonResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers final JSON after a reasoning block containing parseable draft JSON', () => {
    const raw = `<think>{"draft": true}</think>
{"ok": true}`;

    expect(parseJsonResponse<{ ok: boolean }>(raw)).toEqual({ ok: true });
  });

  it('handles unpaired reasoning close tags and fenced drafts', () => {
    const raw = `reasoning draft
\`\`\`json
{"draft": true}
\`\`\`
</reasoning>
[{"id":"final"}]`;

    expect(parseJsonResponse<Array<{ id: string }>>(raw)).toEqual([{ id: 'final' }]);
  });

  it('preserves literal reasoning tags inside exact valid JSON', () => {
    const raw = '{"text":"literal <think>keep me</think>"}';

    expect(parseJsonResponse<{ text: string }>(raw)).toEqual({
      text: 'literal <think>keep me</think>',
    });
  });

  it('retains markdown extraction fallback', () => {
    expect(parseJsonResponse<{ ok: boolean }>('result:\n```json\n{"ok":true}\n```')).toEqual({
      ok: true,
    });
  });

  it('logs only sanitized metadata when parsing fails', () => {
    const secretSourceText = 'PRIVATE_SOURCE_TEXT student evidence {"broken": [}';

    expect(parseJsonResponse(secretSourceText)).toBeNull();
    expect(logger.error).toHaveBeenCalledWith('Failed to parse generated JSON', {
      failureCategory: 'invalid_json',
      responseLength: secretSourceText.length,
      reasoningPrefixStripped: false,
    });

    const serializedCalls = JSON.stringify(logger.error.mock.calls);
    expect(serializedCalls).not.toContain('PRIVATE_SOURCE_TEXT');
    expect(serializedCalls).not.toContain('student evidence');
    expect(serializedCalls).not.toContain(secretSourceText);
  });
});
