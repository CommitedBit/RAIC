import { describe, expect, it, vi } from 'vitest';

import { probeAuth } from '@/lib/media/probe-auth';

describe('probeAuth', () => {
  it('rejects redirects without reading the response body', async () => {
    const text = vi.fn();

    await expect(
      probeAuth({
        providerName: 'Example',
        request: async () => ({ status: 302, text }) as unknown as Response,
      }),
    ).resolves.toEqual({
      success: false,
      message: 'Example connectivity error: Redirects are not allowed',
    });
    expect(text).not.toHaveBeenCalled();
  });

  it('preserves authentication, non-auth HTTP, and network verdicts', async () => {
    await expect(
      probeAuth({
        providerName: 'Example',
        request: async () => new Response('invalid key', { status: 401 }),
      }),
    ).resolves.toEqual({
      success: false,
      message: 'Example auth failed (401): invalid key',
    });

    await expect(
      probeAuth({
        providerName: 'Example',
        request: async () => new Response('not found', { status: 404 }),
      }),
    ).resolves.toEqual({ success: true, message: 'Connected to Example' });

    await expect(
      probeAuth({
        providerName: 'Example',
        request: async () => {
          throw new Error('offline');
        },
      }),
    ).resolves.toEqual({
      success: false,
      message: 'Example connectivity error: Error: offline',
    });
  });
});
