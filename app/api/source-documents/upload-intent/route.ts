import { type NextRequest } from 'next/server';
import { requireRequestRole } from '@/lib/auth/authorize';
import { createSourceDocumentUploadIntent } from '@/lib/server/source-document-storage';
import {
  apiErrorWithRequestSession,
  apiSuccessWithRequestSession,
} from '@/lib/server/api-response';
import { toDocumentProcessingError } from '@/lib/documents/errors';

export async function POST(request: NextRequest) {
  const auth = await requireRequestRole(request, ['teacher']);
  if ('status' in auth) return auth;

  try {
    const intent = createSourceDocumentUploadIntent(auth);
    return apiSuccessWithRequestSession(request, { intent });
  } catch (error) {
    const safeError = toDocumentProcessingError(error);
    return apiErrorWithRequestSession(
      request,
      'INTERNAL_ERROR',
      safeError.status,
      safeError.message,
    );
  }
}
