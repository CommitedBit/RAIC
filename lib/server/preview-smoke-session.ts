import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { del, list } from '@vercel/blob';
import { createWebSession } from '@/lib/auth/session';
import { isPostgresConfigured, runPostgresTransaction } from '@/lib/db/client';
import { ensureMembership } from '@/lib/db/repositories/memberships';
import { findOrCreatePersonalOrganization } from '@/lib/db/repositories/organizations';
import { createClassroomGuestUser } from '@/lib/db/repositories/users';
import { requireSourceDocumentBlobToken } from '@/lib/server/source-document-storage';

const CLEANUP_TOKEN_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const SOURCE_UPLOAD_PREFIX = 'source-documents/uploads/';

interface PreviewSmokeCleanupClaims {
  version: 1;
  userId: string;
  organizationId: string;
  issuedAt: number;
}

function getPreviewSmokeSecret() {
  if (process.env.VERCEL_ENV !== 'preview') return null;
  const secret = process.env.RAIC_PREVIEW_SMOKE_SECRET?.trim() || '';
  return secret.length >= 32 ? secret : null;
}

function signPayload(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(left: string, right: string) {
  const leftDigest = createHmac('sha256', 'preview-smoke-compare').update(left).digest();
  const rightDigest = createHmac('sha256', 'preview-smoke-compare').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function encodeCleanupToken(claims: PreviewSmokeCleanupClaims, secret: string) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${signPayload(payload, secret)}`;
}

function decodeCleanupToken(token: string, secret: string): PreviewSmokeCleanupClaims | null {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !safeEqual(signature, signPayload(payload, secret))) {
    return null;
  }

  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Partial<PreviewSmokeCleanupClaims>;
    if (
      claims.version !== 1 ||
      typeof claims.userId !== 'string' ||
      typeof claims.organizationId !== 'string' ||
      typeof claims.issuedAt !== 'number' ||
      claims.issuedAt > Date.now() + 60_000 ||
      Date.now() - claims.issuedAt > CLEANUP_TOKEN_MAX_AGE_MS
    ) {
      return null;
    }
    return claims as PreviewSmokeCleanupClaims;
  } catch {
    return null;
  }
}

export function isPreviewSmokeEnabled() {
  return getPreviewSmokeSecret() !== null && isPostgresConfigured();
}

export function authorizePreviewSmokeRequest(authorization: string | null) {
  const secret = getPreviewSmokeSecret();
  if (!secret || !authorization?.startsWith('Bearer ')) return false;
  return safeEqual(authorization.slice('Bearer '.length).trim(), secret);
}

export async function createPreviewSmokeSession() {
  const secret = getPreviewSmokeSecret();
  if (!secret || !isPostgresConfigured()) throw new Error('preview_smoke_unavailable');

  let userId: string | null = null;
  let organizationId: string | null = null;
  try {
    const user = await createClassroomGuestUser({
      displayName: 'Preview Smoke Teacher',
      emailHint: 'preview-source-smoke',
    });
    userId = user.id;
    const organization = await findOrCreatePersonalOrganization(user);
    organizationId = organization.id;
    await ensureMembership({ organizationId, userId, role: 'teacher' });
    const session = await createWebSession({
      userId,
      organizationId,
      role: 'teacher',
      userAgent: 'open-raic-preview-smoke',
    });
    const cleanupToken = encodeCleanupToken(
      { version: 1, userId, organizationId, issuedAt: Date.now() },
      secret,
    );
    return { sessionToken: session.token, cleanupToken };
  } catch (error) {
    if (userId) {
      await cleanupPreviewSmokeDataForIds(userId, organizationId).catch(() => undefined);
    }
    throw error;
  }
}

async function cleanupPreviewSmokeDataForIds(userId: string, organizationId: string | null) {
  const cleaned = await runPostgresTransaction(async (executor) => {
    await executor.unsafe('DELETE FROM classrooms WHERE owner_user_id = $1', [userId]);
    await executor.unsafe('DELETE FROM classroom_generation_jobs WHERE owner_user_id = $1', [
      userId,
    ]);
    await executor.unsafe('DELETE FROM classroom_session_contexts WHERE user_id = $1', [userId]);
    await executor.unsafe('DELETE FROM classroom_reflections WHERE user_id = $1', [userId]);
    await executor.unsafe('DELETE FROM benchmark_artifacts WHERE user_id = $1', [userId]);
    await executor.unsafe('DELETE FROM audit_logs WHERE user_id = $1', [userId]);
    await executor.unsafe('DELETE FROM users WHERE id = $1', [userId]);
    if (organizationId) {
      await executor.unsafe('DELETE FROM organizations WHERE id = $1', [organizationId]);
    }
    return true;
  });
  if (!cleaned) throw new Error('preview_smoke_cleanup_unavailable');
}

export async function cleanupPreviewSmokeSession(cleanupToken: string) {
  const secret = getPreviewSmokeSecret();
  if (!secret) throw new Error('preview_smoke_unavailable');
  const claims = decodeCleanupToken(cleanupToken, secret);
  if (!claims) throw new Error('invalid_cleanup_token');
  await cleanupPreviewSmokeDataForIds(claims.userId, claims.organizationId);
}

function validateSourcePathname(pathname: string) {
  if (
    !pathname.startsWith(SOURCE_UPLOAD_PREFIX) ||
    pathname.includes('..') ||
    pathname.length > 256
  ) {
    throw new Error('invalid_source_pathname');
  }
}

export async function previewSourceBlobExists(pathname: string) {
  validateSourcePathname(pathname);
  const token = requireSourceDocumentBlobToken();
  const result = await list({ token, prefix: pathname, limit: 2 });
  return result.blobs.some((blob) => blob.pathname === pathname);
}

export async function deletePreviewSourceBlob(pathname: string) {
  validateSourcePathname(pathname);
  await del(pathname, { token: requireSourceDocumentBlobToken() });
}
