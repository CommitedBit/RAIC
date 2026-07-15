import { type NextRequest, NextResponse } from 'next/server';
import {
  authorizePreviewSmokeRequest,
  cleanupPreviewSmokeSession,
  createPreviewSmokeSession,
  deletePreviewSourceBlob,
  isPreviewSmokeEnabled,
  previewSourceBlobExists,
} from '@/lib/server/preview-smoke-session';
import { createLogger } from '@/lib/logger';

const log = createLogger('PreviewSmokeSession');

type PreviewSmokeAction =
  | 'create'
  | 'cleanup'
  | 'delete-source-blob'
  | 'verify-source-blob-deleted';

interface PreviewSmokeBody {
  action?: PreviewSmokeAction;
  cleanupToken?: unknown;
  pathname?: unknown;
}

function unavailable() {
  return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
}

export async function POST(request: NextRequest) {
  if (!isPreviewSmokeEnabled()) return unavailable();
  if (!authorizePreviewSmokeRequest(request.headers.get('authorization'))) {
    return NextResponse.json(
      { success: false, errorCode: 'UNAUTHORIZED', error: 'Authentication required' },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as PreviewSmokeBody | null;
  try {
    if (body?.action === 'create') {
      const session = await createPreviewSmokeSession();
      return NextResponse.json({ success: true, ...session }, { status: 201 });
    }
    if (body?.action === 'cleanup' && typeof body.cleanupToken === 'string') {
      await cleanupPreviewSmokeSession(body.cleanupToken);
      return NextResponse.json({ success: true, cleaned: true });
    }
    if (body?.action === 'verify-source-blob-deleted' && typeof body.pathname === 'string') {
      const exists = await previewSourceBlobExists(body.pathname);
      return NextResponse.json({ success: true, deleted: !exists });
    }
    if (body?.action === 'delete-source-blob' && typeof body.pathname === 'string') {
      await deletePreviewSourceBlob(body.pathname);
      return NextResponse.json({ success: true, deleted: true });
    }
    return NextResponse.json(
      { success: false, errorCode: 'INVALID_REQUEST', error: 'Invalid smoke request' },
      { status: 400 },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : 'preview_smoke_failed';
    const status =
      code === 'invalid_cleanup_token' || code === 'invalid_source_pathname' ? 400 : 503;
    log.warn('Preview smoke action failed', {
      action: body?.action || 'unknown',
      category: status === 400 ? 'invalid_request' : 'unavailable',
    });
    return NextResponse.json(
      {
        success: false,
        errorCode: status === 400 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR',
        error: status === 400 ? 'Invalid smoke request' : 'Preview smoke is unavailable',
      },
      { status },
    );
  }
}
