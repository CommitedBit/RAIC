import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import { type NextRequest, NextResponse } from 'next/server';
import { requireRequestRole } from '@/lib/auth/authorize';
import {
  SOURCE_DOCUMENT_UPLOAD_LIMIT_BYTES,
  SOURCE_DOCUMENT_UPLOAD_TTL_MS,
} from '@/lib/documents/constants';
import { toDocumentProcessingError } from '@/lib/documents/errors';
import {
  requireSourceDocumentBlobToken,
  verifySourceDocumentUploadCapability,
} from '@/lib/server/source-document-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('SourceDocumentUpload');

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body || body.type !== 'blob.generate-client-token') {
    return NextResponse.json(
      { success: false, errorCode: 'INVALID_REQUEST', error: 'Invalid upload request' },
      { status: 400 },
    );
  }

  const auth = await requireRequestRole(request, ['teacher']);
  if ('status' in auth) return auth;

  try {
    const token = requireSourceDocumentBlobToken();
    const response = await handleUpload({
      token,
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        if (!multipart || !clientPayload) {
          throw new Error('invalid_upload_request');
        }
        const claims = verifySourceDocumentUploadCapability({
          capability: clientPayload,
          auth,
          expectedPathname: pathname,
        });
        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: SOURCE_DOCUMENT_UPLOAD_LIMIT_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 60,
          validUntil: Math.min(claims.expiresAt, Date.now() + SOURCE_DOCUMENT_UPLOAD_TTL_MS),
        };
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    const safeError = toDocumentProcessingError(error);
    log.warn('Source-document upload token request rejected', { code: safeError.code });
    return NextResponse.json(
      { success: false, errorCode: safeError.code, error: safeError.message },
      { status: safeError.status },
    );
  }
}
