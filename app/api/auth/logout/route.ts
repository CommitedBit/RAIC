import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { clearClassroomAccessCookie } from '@/lib/auth/classroom-access';
import { CLASSROOM_ACCESS_COOKIE_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { resolveAuthContextFromToken, type AuthContext } from '@/lib/auth/current-user';
import { isSameOriginMutationRequest } from '@/lib/auth/request-origin';
import { clearNonceCookie, clearSessionCookie } from '@/lib/auth/session';
import { revokeSessionsById } from '@/lib/db/repositories/sessions';
import { recordAuditEvent } from '@/lib/server/audit-log';
import { createLogger } from '@/lib/logger';

const log = createLogger('Logout');

function distinctAuthContexts(contexts: Array<AuthContext | null>) {
  return Array.from(
    new Map(
      contexts
        .filter((context): context is AuthContext => context !== null)
        .map((context) => [context.session.id, context]),
    ).values(),
  );
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-vercel-id')?.trim() || randomUUID();
  if (!isSameOriginMutationRequest(request)) {
    log.warn('Logout rejected', { requestId, category: 'cross_origin_request' });
    return NextResponse.json(
      {
        success: false,
        errorCode: 'FORBIDDEN',
        error: 'Logout request origin is not allowed.',
      },
      { status: 403 },
    );
  }

  try {
    const webToken = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
    const classroomToken = request.cookies.get(CLASSROOM_ACCESS_COOKIE_NAME)?.value ?? null;
    const authContexts = distinctAuthContexts(
      await Promise.all([
        resolveAuthContextFromToken(webToken),
        resolveAuthContextFromToken(classroomToken),
      ]),
    );

    await revokeSessionsById(authContexts.map((auth) => auth.session.id));

    for (const auth of authContexts) {
      try {
        await recordAuditEvent({
          organizationId: auth.session.organizationId,
          userId: auth.user.id,
          actorRole: auth.session.role,
          action: 'auth.sign_out',
          resourceType: 'session',
          resourceId: auth.session.id,
          metadata: { sessionKind: auth.session.kind },
        });
      } catch {
        log.warn('Logout audit failed', {
          requestId,
          category: 'audit_write_failed',
          sessionKind: auth.session.kind,
        });
      }
    }
  } catch {
    log.error('Logout failed', { requestId, category: 'session_revocation_failed' });
    return NextResponse.json(
      {
        success: false,
        errorCode: 'LOGOUT_FAILED',
        error: 'Logout could not be completed. Please try again.',
      },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  clearNonceCookie(response);
  clearClassroomAccessCookie(response);
  return response;
}
