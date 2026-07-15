import { NextRequest } from 'next/server';
import { parsePDF } from '@/lib/pdf/pdf-providers';
import { getRequestAuth } from '@/lib/auth/current-user';
import type { PDFProviderId } from '@/lib/pdf/types';
import type { ParsedPdfContent } from '@/lib/types/pdf';
import { createLogger } from '@/lib/logger';
import {
  apiErrorWithRequestSession,
  apiSuccessWithRequestSession,
  withRequestWebSession,
} from '@/lib/server/api-response';
import {
  resolveGovernedProviderConfig,
  toGovernedProviderApiErrorResponse,
} from '@/lib/server/ai-governance';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import {
  LEGACY_PDF_IMAGE_BYTES_LIMIT,
  LEGACY_PDF_IMAGE_LIMIT,
  LEGACY_PDF_TOTAL_IMAGE_BYTES_LIMIT,
  LEGACY_PDF_UPLOAD_LIMIT_BYTES,
  SOURCE_DOCUMENT_ARTIFACT_CHARACTER_LIMIT,
  SOURCE_DOCUMENT_PAGE_LIMIT,
} from '@/lib/documents/constants';
import { validatePdfInput } from '@/lib/documents/pdf-validation';
import { toDocumentProcessingError } from '@/lib/documents/errors';
const log = createLogger('Parse PDF');

function boundedLegacyResult(result: ParsedPdfContent): ParsedPdfContent {
  const allowedImages: string[] = [];
  let totalImageBytes = 0;
  const resultImages = Array.isArray(result.images) ? result.images : [];
  for (const image of resultImages.slice(0, LEGACY_PDF_IMAGE_LIMIT)) {
    const imageBytes = Buffer.byteLength(image, 'utf8');
    if (
      imageBytes > LEGACY_PDF_IMAGE_BYTES_LIMIT ||
      totalImageBytes + imageBytes > LEGACY_PDF_TOTAL_IMAGE_BYTES_LIMIT
    ) {
      continue;
    }
    allowedImages.push(image);
    totalImageBytes += imageBytes;
  }
  const allowedImageSet = new Set(allowedImages);
  const pdfImages = result.metadata?.pdfImages
    ?.filter((image) => allowedImageSet.has(image.src))
    .slice(0, LEGACY_PDF_IMAGE_LIMIT);
  const imageMapping = result.metadata?.imageMapping
    ? Object.fromEntries(
        Object.entries(result.metadata.imageMapping).filter(([, image]) =>
          allowedImageSet.has(image),
        ),
      )
    : undefined;

  return {
    ...result,
    text: result.text.slice(0, SOURCE_DOCUMENT_ARTIFACT_CHARACTER_LIMIT),
    images: allowedImages,
    metadata: result.metadata
      ? {
          ...result.metadata,
          ...(pdfImages ? { pdfImages } : {}),
          ...(imageMapping ? { imageMapping } : {}),
        }
      : result.metadata,
  };
}

export async function POST(req: NextRequest) {
  let resolvedProviderId: string | undefined;
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return apiErrorWithRequestSession(
        req,
        'INVALID_REQUEST',
        400,
        `Invalid Content-Type: expected multipart/form-data, got "${contentType}"`,
      );
    }
    const contentLength = Number(req.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > LEGACY_PDF_UPLOAD_LIMIT_BYTES) {
      return apiErrorWithRequestSession(
        req,
        'PAYLOAD_TOO_LARGE',
        413,
        'PDF uploads to this endpoint are limited to 4 MB',
      );
    }

    const formData = await req.formData();
    const pdfFile = formData.get('pdf') as File | null;
    const providerId = formData.get('providerId') as PDFProviderId | null;
    const apiKey = formData.get('apiKey') as string | null;
    const baseUrl = formData.get('baseUrl') as string | null;

    if (!pdfFile) {
      return apiErrorWithRequestSession(req, 'MISSING_REQUIRED_FIELD', 400, 'No PDF file provided');
    }

    // providerId is required from the client — no server-side store to fall back to
    const effectiveProviderId = providerId || ('unpdf' as PDFProviderId);
    resolvedProviderId = effectiveProviderId;

    const clientBaseUrl = baseUrl || undefined;
    if (clientBaseUrl && process.env.NODE_ENV === 'production') {
      const ssrfError = await validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiErrorWithRequestSession(req, 'INVALID_URL', 403, ssrfError);
      }
    }

    const auth = await getRequestAuth(req);
    const resolved = await resolveGovernedProviderConfig({
      auth,
      family: 'pdf',
      providerId: effectiveProviderId,
      requestedSecret: apiKey || undefined,
      requestedBaseUrl: clientBaseUrl,
    });

    const config = {
      providerId: effectiveProviderId,
      apiKey: resolved.apiKey || undefined,
      baseUrl: resolved.baseUrl,
    };

    // Convert PDF to buffer
    const arrayBuffer = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    validatePdfInput({
      buffer,
      mimeType: pdfFile.type,
      maximumSizeInBytes: LEGACY_PDF_UPLOAD_LIMIT_BYTES,
    });

    // Parse PDF using the provider system
    const result = boundedLegacyResult(await parsePDF(config, buffer));
    if ((result.metadata?.pageCount ?? 0) > SOURCE_DOCUMENT_PAGE_LIMIT) {
      return apiErrorWithRequestSession(
        req,
        'PARSE_FAILED',
        422,
        'The PDF exceeds the 200-page limit',
      );
    }

    // Add file metadata
    const resultWithMetadata: ParsedPdfContent = {
      ...result,
      metadata: {
        ...result.metadata,
        pageCount: result.metadata?.pageCount ?? 0, // Ensure pageCount is always a number
        fileName: pdfFile.name,
        fileSize: pdfFile.size,
      },
    };

    return apiSuccessWithRequestSession(req, { data: resultWithMetadata });
  } catch (error) {
    const governanceError = toGovernedProviderApiErrorResponse(error);
    if (governanceError) {
      return withRequestWebSession(req, governanceError);
    }

    const safeError = toDocumentProcessingError(error);
    log.warn('PDF parsing failed', {
      providerId: resolvedProviderId ?? 'unknown',
      code: safeError.code,
    });
    return apiErrorWithRequestSession(
      req,
      safeError.code === 'PDF_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : 'PARSE_FAILED',
      safeError.status,
      safeError.message,
    );
  }
}
