import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifyGoogleIdToken } from '@/lib/auth/google';
import { resolvePostAuthRedirectPath } from '@/lib/auth/authorize';
import { AUTH_NONCE_COOKIE_NAME } from '@/lib/auth/constants';
import {
  attachSessionCookie,
  clearNonceCookie,
  clearSessionCookie,
  createWebSession,
  getRequestIpAddress,
} from '@/lib/auth/session';
import { ensureMembership, listMembershipsForUser } from '@/lib/db/repositories/memberships';
import { findOrCreatePersonalOrganization } from '@/lib/db/repositories/organizations';
import { isGoogleAccountLinkConflictError, upsertGoogleUser } from '@/lib/db/repositories/users';
import { recordAuditEvent } from '@/lib/server/audit-log';
import { createLogger } from '@/lib/logger';

const log = createLogger('GoogleAuth');

function resolveTeacherRole(email: string) {
  const adminEmails =
    process.env.RAIC_ADMIN_EMAILS?.split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean) ?? [];

  return adminEmails.includes(email.trim().toLowerCase()) ? 'org_admin' : 'teacher';
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-vercel-id')?.trim() || randomUUID();
  let failureStage = 'request';

  try {
    const body = (await request.json()) as {
      credential?: string;
      redirectTo?: string;
    };
    const nonce = request.cookies.get(AUTH_NONCE_COOKIE_NAME)?.value;

    if (!body.credential) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'MISSING_CREDENTIAL',
          error: 'Google credential is required',
        },
        { status: 400 },
      );
    }

    if (!nonce) {
      const response = NextResponse.json(
        {
          success: false,
          errorCode: 'MISSING_NONCE',
          error: 'Google sign-in nonce is missing. Start again from the sign-in page.',
        },
        { status: 400 },
      );
      clearNonceCookie(response);
      clearSessionCookie(response);
      return response;
    }

    failureStage = 'credential_verification';
    const identity = await verifyGoogleIdToken({
      idToken: body.credential,
      expectedNonce: nonce,
    });

    failureStage = 'identity_resolution';
    const user = await upsertGoogleUser(identity);
    failureStage = 'membership_resolution';
    const organization = await findOrCreatePersonalOrganization(user);
    const role = resolveTeacherRole(user.email);
    const membership = await ensureMembership({
      organizationId: organization.id,
      userId: user.id,
      role,
    });
    failureStage = 'session_creation';
    const session = await createWebSession({
      userId: user.id,
      organizationId: organization.id,
      role: membership.role,
      userAgent: request.headers.get('user-agent'),
      ipAddress: getRequestIpAddress(request),
    });

    failureStage = 'audit';
    await recordAuditEvent({
      organizationId: organization.id,
      userId: user.id,
      actorRole: membership.role,
      action: 'auth.google.sign_in',
      resourceType: 'session',
      resourceId: session.session.id,
      metadata: {
        email: user.email,
        membershipCount: (await listMembershipsForUser(user.id)).length,
      },
    });

    const response = NextResponse.json({
      success: true,
      redirectTo: resolvePostAuthRedirectPath(
        membership.role as 'teacher' | 'org_admin',
        body.redirectTo,
      ),
      role: membership.role,
    });
    clearNonceCookie(response);
    attachSessionCookie(response, session.token, session.session.absoluteExpiresAt);
    return response;
  } catch (error) {
    const accountLinkConflict = isGoogleAccountLinkConflictError(error);
    log.warn('Google sign-in failed', {
      requestId,
      category: accountLinkConflict ? 'account_link_conflict' : 'google_auth_failed',
      stage: failureStage,
    });

    const response = NextResponse.json(
      {
        success: false,
        errorCode: accountLinkConflict ? 'ACCOUNT_LINK_CONFLICT' : 'GOOGLE_AUTH_FAILED',
        error: accountLinkConflict
          ? 'This email is already linked to another Google account.'
          : 'Google sign-in failed. Please try again.',
      },
      { status: accountLinkConflict ? 409 : 401 },
    );
    clearNonceCookie(response);
    clearSessionCookie(response);
    return response;
  }
}
