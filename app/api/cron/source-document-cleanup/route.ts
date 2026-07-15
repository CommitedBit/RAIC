import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { cleanupAbandonedSourceDocumentUploads } from '@/lib/server/source-document-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('SourceDocumentCleanupCron');

function isLocalRequest(request: NextRequest) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(
    request.nextUrl.hostname.toLowerCase(),
  );
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) return request.headers.get('authorization') === `Bearer ${secret}`;
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.CRON_ALLOW_NO_SECRET?.trim() === 'true' &&
    isLocalRequest(request)
  );
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return apiError('FORBIDDEN', 403, 'Forbidden');

  try {
    return apiSuccess(await cleanupAbandonedSourceDocumentUploads());
  } catch {
    log.error('Source-document cleanup failed', { code: 'cleanup_failed' });
    return apiError('INTERNAL_ERROR', 500, 'Source-document cleanup failed');
  }
}
