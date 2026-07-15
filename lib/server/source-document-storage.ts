import 'server-only';

import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { del, list } from '@vercel/blob';
import type { AuthContext } from '@/lib/auth/current-user';
import {
  SOURCE_DOCUMENT_UPLOAD_PREFIX,
  SOURCE_DOCUMENT_UPLOAD_TTL_MS,
} from '@/lib/documents/constants';
import { DocumentProcessingError } from '@/lib/documents/errors';
import type { SourceDocumentUploadClaims, SourceDocumentUploadIntent } from '@/lib/documents/types';
import { requireEncryptionKey } from '@/lib/server/encrypted-secrets';

const PRIVATE_BLOB_TOKEN_ENV = 'RAIC_SOURCE_BLOB_READ_WRITE_TOKEN';

export function getSourceDocumentBlobToken() {
  return process.env[PRIVATE_BLOB_TOKEN_ENV]?.trim() || null;
}

export function getSourceDocumentsV2Readiness() {
  const privateBlobConfigured = Boolean(getSourceDocumentBlobToken());
  const signingConfigured = Boolean(process.env.RAIC_SECRET_ENCRYPTION_KEY?.trim());
  return {
    ready: privateBlobConfigured && signingConfigured,
    privateBlobConfigured,
    signingConfigured,
    reason:
      privateBlobConfigured && signingConfigured
        ? null
        : 'Private source-document storage or upload signing is not configured',
  };
}

export function requireSourceDocumentBlobToken() {
  const token = getSourceDocumentBlobToken();
  if (!token) throw new DocumentProcessingError('SOURCE_DOCUMENTS_UNAVAILABLE');
  return token;
}

function signPayload(encodedPayload: string) {
  return createHmac('sha256', requireEncryptionKey()).update(encodedPayload).digest('base64url');
}

function parseClaims(encodedPayload: string): SourceDocumentUploadClaims | null {
  try {
    const value = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as Partial<SourceDocumentUploadClaims>;
    if (
      value.version !== 1 ||
      typeof value.uploadId !== 'string' ||
      typeof value.pathname !== 'string' ||
      typeof value.userId !== 'string' ||
      (value.organizationId !== null && typeof value.organizationId !== 'string') ||
      typeof value.issuedAt !== 'number' ||
      typeof value.expiresAt !== 'number'
    ) {
      return null;
    }
    return value as SourceDocumentUploadClaims;
  } catch {
    return null;
  }
}

function ownerMatches(claims: SourceDocumentUploadClaims, auth: AuthContext) {
  return (
    claims.userId === auth.user.id && claims.organizationId === (auth.organization?.id ?? null)
  );
}

export function createSourceDocumentUploadIntent(
  auth: AuthContext,
  now = Date.now(),
): SourceDocumentUploadIntent {
  requireSourceDocumentBlobToken();
  const uploadId = randomUUID();
  const pathname = `${SOURCE_DOCUMENT_UPLOAD_PREFIX}${uploadId}.pdf`;
  const expiresAt = now + SOURCE_DOCUMENT_UPLOAD_TTL_MS;
  const claims: SourceDocumentUploadClaims = {
    version: 1,
    uploadId,
    pathname,
    userId: auth.user.id,
    organizationId: auth.organization?.id ?? null,
    issuedAt: now,
    expiresAt,
  };
  const encodedPayload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return {
    uploadId,
    pathname,
    capability: `${encodedPayload}.${signPayload(encodedPayload)}`,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function verifySourceDocumentUploadCapability(input: {
  capability: string;
  auth: AuthContext;
  expectedPathname: string;
  now?: number;
}) {
  const [encodedPayload, providedSignature, ...extra] = input.capability.split('.');
  if (!encodedPayload || !providedSignature || extra.length > 0) {
    throw new DocumentProcessingError('INVALID_UPLOAD_CAPABILITY');
  }
  const expectedSignature = signPayload(encodedPayload);
  const provided = Buffer.from(providedSignature, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new DocumentProcessingError('INVALID_UPLOAD_CAPABILITY');
  }
  const claims = parseClaims(encodedPayload);
  if (!claims || !ownerMatches(claims, input.auth)) {
    throw new DocumentProcessingError('INVALID_UPLOAD_CAPABILITY');
  }
  if (claims.expiresAt <= (input.now ?? Date.now())) {
    throw new DocumentProcessingError('UPLOAD_EXPIRED');
  }
  if (
    claims.pathname !== input.expectedPathname ||
    !claims.pathname.startsWith(SOURCE_DOCUMENT_UPLOAD_PREFIX) ||
    claims.pathname !== `${SOURCE_DOCUMENT_UPLOAD_PREFIX}${claims.uploadId}.pdf`
  ) {
    throw new DocumentProcessingError('INVALID_UPLOAD_CAPABILITY');
  }
  return claims;
}

export async function cleanupAbandonedSourceDocumentUploads(now = Date.now()) {
  const token = requireSourceDocumentBlobToken();
  const staleBefore = now - SOURCE_DOCUMENT_UPLOAD_TTL_MS;
  let cursor: string | undefined;
  let scanned = 0;
  let deleted = 0;

  do {
    const result = await list({
      token,
      prefix: SOURCE_DOCUMENT_UPLOAD_PREFIX,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    const stale = result.blobs.filter((blob) => blob.uploadedAt.getTime() < staleBefore);
    scanned += result.blobs.length;
    if (stale.length > 0) {
      await del(
        stale.map((blob) => blob.pathname),
        { token },
      );
      deleted += stale.length;
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);

  return { scanned, deleted };
}
