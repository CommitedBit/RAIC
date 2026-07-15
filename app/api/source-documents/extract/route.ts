import { del, get } from '@vercel/blob';
import { type NextRequest } from 'next/server';
import { requireRequestRole } from '@/lib/auth/authorize';
import {
  SOURCE_DOCUMENT_EXTRACTION_TIMEOUT_MS,
  SOURCE_DOCUMENT_UPLOAD_LIMIT_BYTES,
} from '@/lib/documents/constants';
import { DocumentProcessingError, toDocumentProcessingError } from '@/lib/documents/errors';
import { extractDocumentArtifact } from '@/lib/documents/extractors/registry';
import { validatePdfInput } from '@/lib/documents/pdf-validation';
import {
  apiErrorWithRequestSession,
  apiSuccessWithRequestSession,
} from '@/lib/server/api-response';
import {
  requireSourceDocumentBlobToken,
  verifySourceDocumentUploadCapability,
} from '@/lib/server/source-document-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('SourceDocumentExtraction');

interface ExtractRequestBody {
  pathname?: unknown;
  capability?: unknown;
}

function mapApiErrorCode(error: DocumentProcessingError) {
  if (error.code === 'PDF_TOO_LARGE') return 'PAYLOAD_TOO_LARGE' as const;
  if (error.code === 'EXTRACTION_TIMEOUT') return 'UPSTREAM_TIMEOUT' as const;
  if (error.status >= 500) return 'INTERNAL_ERROR' as const;
  return 'PARSE_FAILED' as const;
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestRole(request, ['teacher']);
  if ('status' in auth) return auth;

  const body = (await request.json().catch(() => null)) as ExtractRequestBody | null;
  const pathname = typeof body?.pathname === 'string' ? body.pathname : '';
  const capability = typeof body?.capability === 'string' ? body.capability : '';
  if (!pathname || !capability) {
    return apiErrorWithRequestSession(
      request,
      'MISSING_REQUIRED_FIELD',
      400,
      'Missing source-document upload reference',
    );
  }

  try {
    verifySourceDocumentUploadCapability({
      capability,
      auth,
      expectedPathname: pathname,
    });
    const token = requireSourceDocumentBlobToken();
    let deletionFailed = false;
    let artifact;
    let extractionError: unknown;

    try {
      const stored = await get(pathname, {
        token,
        access: 'private',
        useCache: false,
        abortSignal: request.signal,
      });
      if (!stored?.stream) throw new DocumentProcessingError('UPLOAD_NOT_FOUND');
      if (
        typeof stored.blob.size === 'number' &&
        stored.blob.size > SOURCE_DOCUMENT_UPLOAD_LIMIT_BYTES
      ) {
        throw new DocumentProcessingError('PDF_TOO_LARGE');
      }
      const buffer = Buffer.from(await new Response(stored.stream).arrayBuffer());
      validatePdfInput({
        buffer,
        mimeType: stored.blob.contentType,
        maximumSizeInBytes: SOURCE_DOCUMENT_UPLOAD_LIMIT_BYTES,
      });
      artifact = await extractDocumentArtifact('application/pdf', buffer, {
        signal: request.signal,
        timeoutMs: SOURCE_DOCUMENT_EXTRACTION_TIMEOUT_MS,
      });
    } catch (error) {
      extractionError = error;
    } finally {
      try {
        await del(pathname, { token });
      } catch {
        deletionFailed = true;
      }
    }

    if (deletionFailed) throw new DocumentProcessingError('RAW_DOCUMENT_DELETE_FAILED');
    if (extractionError) throw extractionError;
    if (!artifact) throw new DocumentProcessingError('EXTRACTION_FAILED');

    log.info('Source document extracted', {
      artifactId: artifact.id,
      pageCount: artifact.pageCount,
      characterCount: artifact.characterCount,
      diagnosticCount: artifact.diagnostics.length,
    });
    return apiSuccessWithRequestSession(request, { artifact });
  } catch (error) {
    const safeError = toDocumentProcessingError(error);
    log.warn('Source-document extraction rejected', { code: safeError.code });
    return apiErrorWithRequestSession(
      request,
      mapApiErrorCode(safeError),
      safeError.status,
      safeError.message,
    );
  }
}
