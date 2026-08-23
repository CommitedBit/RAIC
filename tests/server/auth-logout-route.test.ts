import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  AUTH_NONCE_COOKIE_NAME,
  CLASSROOM_ACCESS_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from '@/lib/auth/constants';

const resolveAuthContextFromTokenMock = vi.fn();
const revokeSessionsByIdMock = vi.fn();
const recordAuditEventMock = vi.fn();
const warnLogMock = vi.fn();
const errorLogMock = vi.fn();

vi.mock('@/lib/auth/current-user', () => ({
  resolveAuthContextFromToken: resolveAuthContextFromTokenMock,
}));

vi.mock('@/lib/db/repositories/sessions', () => ({
  revokeSessionsById: revokeSessionsByIdMock,
}));

vi.mock('@/lib/server/audit-log', () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    warn: warnLogMock,
    error: errorLogMock,
  }),
}));

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    resolveAuthContextFromTokenMock.mockReset();
    revokeSessionsByIdMock.mockReset();
    recordAuditEventMock.mockReset();
    warnLogMock.mockReset();
    errorLogMock.mockReset();
  });

  it('clears web, nonce, and classroom cookies during logout', async () => {
    resolveAuthContextFromTokenMock.mockImplementation(async (token: string | null) => {
      if (token === 'session-token') {
        return {
          session: {
            id: 'session-1',
            organizationId: 'org-1',
            role: 'teacher',
            kind: 'web',
          },
          user: { id: 'user-1' },
        };
      }
      if (token === 'classroom-token') {
        return {
          session: {
            id: 'session-2',
            organizationId: 'org-1',
            role: 'student',
            kind: 'classroom',
          },
          user: { id: 'user-2' },
        };
      }
      return null;
    });

    const { POST } = await import('@/app/api/auth/logout/route');
    const response = await POST(
      new NextRequest('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: {
          origin: 'http://localhost',
          cookie: [
            `${SESSION_COOKIE_NAME}=session-token`,
            `${AUTH_NONCE_COOKIE_NAME}=nonce-token`,
            `${CLASSROOM_ACCESS_COOKIE_NAME}=classroom-token`,
          ].join('; '),
        },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe('');
    expect(response.cookies.get(AUTH_NONCE_COOKIE_NAME)?.value).toBe('');
    expect(response.cookies.get(CLASSROOM_ACCESS_COOKIE_NAME)?.value).toBe('');
    expect(revokeSessionsByIdMock).toHaveBeenCalledWith(['session-1', 'session-2']);
    expect(recordAuditEventMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: 'auth.sign_out',
        resourceId: 'session-1',
      }),
    );
    expect(recordAuditEventMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: 'auth.sign_out',
        resourceId: 'session-2',
      }),
    );
  });

  it('rejects a cross-origin logout before resolving or revoking sessions', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('APP_BASE_URL', 'https://open-raic.com');

    const { POST } = await import('@/app/api/auth/logout/route');
    const response = await POST(
      new NextRequest('https://open-raic.com/api/auth/logout', {
        method: 'POST',
        headers: {
          origin: 'https://attacker.example',
          cookie: `${SESSION_COOKIE_NAME}=session-token`,
        },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.errorCode).toBe('FORBIDDEN');
    expect(resolveAuthContextFromTokenMock).not.toHaveBeenCalled();
    expect(revokeSessionsByIdMock).not.toHaveBeenCalled();
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('accepts a same-origin referer when Origin is absent', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('APP_BASE_URL', 'https://open-raic.com');
    resolveAuthContextFromTokenMock.mockResolvedValue(null);

    const { POST } = await import('@/app/api/auth/logout/route');
    const response = await POST(
      new NextRequest('https://open-raic.com/api/auth/logout', {
        method: 'POST',
        headers: { referer: 'https://open-raic.com/studio?tab=account' },
      }),
    );

    expect(response.status).toBe(200);
    expect(revokeSessionsByIdMock).toHaveBeenCalledWith([]);
  });

  it('rejects production logout when both Origin and Referer are absent', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('APP_BASE_URL', 'https://open-raic.com');

    const { POST } = await import('@/app/api/auth/logout/route');
    const response = await POST(
      new NextRequest('https://open-raic.com/api/auth/logout', { method: 'POST' }),
    );

    expect(response.status).toBe(403);
    expect(revokeSessionsByIdMock).not.toHaveBeenCalled();
  });

  it('keeps cookies when atomic session revocation fails', async () => {
    resolveAuthContextFromTokenMock.mockResolvedValue({
      session: {
        id: 'session-1',
        organizationId: 'org-1',
        role: 'teacher',
        kind: 'web',
      },
      user: { id: 'user-1' },
    });
    revokeSessionsByIdMock.mockRejectedValue(new Error('database connection contains a secret'));

    const { POST } = await import('@/app/api/auth/logout/route');
    const response = await POST(
      new NextRequest('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: {
          origin: 'http://localhost',
          cookie: `${SESSION_COOKIE_NAME}=session-token`,
        },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.errorCode).toBe('LOGOUT_FAILED');
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
    expect(JSON.stringify(errorLogMock.mock.calls)).not.toContain('database connection');
  });
});
