export type DocumentErrorCode =
  | 'SOURCE_DOCUMENTS_UNAVAILABLE'
  | 'INVALID_UPLOAD_CAPABILITY'
  | 'UPLOAD_EXPIRED'
  | 'UPLOAD_NOT_FOUND'
  | 'INVALID_PDF_TYPE'
  | 'INVALID_PDF_SIGNATURE'
  | 'PDF_TOO_LARGE'
  | 'PDF_PAGE_LIMIT'
  | 'PDF_EMPTY'
  | 'EXTRACTION_TIMEOUT'
  | 'EXTRACTION_ABORTED'
  | 'EXTRACTION_FAILED'
  | 'RAW_DOCUMENT_DELETE_FAILED';

const SAFE_MESSAGES: Record<DocumentErrorCode, string> = {
  SOURCE_DOCUMENTS_UNAVAILABLE: 'Private source-document storage is not configured',
  INVALID_UPLOAD_CAPABILITY: 'The source-document upload is not valid for this account',
  UPLOAD_EXPIRED: 'The source-document upload has expired',
  UPLOAD_NOT_FOUND: 'The source-document upload was not found',
  INVALID_PDF_TYPE: 'Only PDF documents are supported',
  INVALID_PDF_SIGNATURE: 'The uploaded file is not a valid PDF',
  PDF_TOO_LARGE: 'The PDF exceeds the allowed size',
  PDF_PAGE_LIMIT: 'The PDF exceeds the 200-page limit',
  PDF_EMPTY: 'The PDF did not contain usable text',
  EXTRACTION_TIMEOUT: 'PDF extraction timed out',
  EXTRACTION_ABORTED: 'PDF extraction was cancelled',
  EXTRACTION_FAILED: 'PDF extraction failed',
  RAW_DOCUMENT_DELETE_FAILED: 'The uploaded PDF could not be removed after extraction',
};

const STATUS_BY_CODE: Record<DocumentErrorCode, number> = {
  SOURCE_DOCUMENTS_UNAVAILABLE: 503,
  INVALID_UPLOAD_CAPABILITY: 403,
  UPLOAD_EXPIRED: 410,
  UPLOAD_NOT_FOUND: 404,
  INVALID_PDF_TYPE: 415,
  INVALID_PDF_SIGNATURE: 400,
  PDF_TOO_LARGE: 413,
  PDF_PAGE_LIMIT: 422,
  PDF_EMPTY: 422,
  EXTRACTION_TIMEOUT: 504,
  EXTRACTION_ABORTED: 499,
  EXTRACTION_FAILED: 422,
  RAW_DOCUMENT_DELETE_FAILED: 503,
};

export class DocumentProcessingError extends Error {
  readonly code: DocumentErrorCode;
  readonly status: number;

  constructor(code: DocumentErrorCode) {
    super(SAFE_MESSAGES[code]);
    this.name = 'DocumentProcessingError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

export function toDocumentProcessingError(error: unknown): DocumentProcessingError {
  if (error instanceof DocumentProcessingError) {
    return error;
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new DocumentProcessingError('EXTRACTION_ABORTED');
  }
  return new DocumentProcessingError('EXTRACTION_FAILED');
}
