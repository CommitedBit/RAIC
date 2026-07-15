import { DocumentProcessingError } from './errors';

const PDF_SIGNATURE = Buffer.from('%PDF-', 'ascii');

export function isPdfMimeType(value: string | null | undefined) {
  return value?.split(';', 1)[0]?.trim().toLowerCase() === 'application/pdf';
}

export function hasPdfSignature(buffer: Uint8Array) {
  if (buffer.byteLength < PDF_SIGNATURE.byteLength) {
    return false;
  }
  return Buffer.from(buffer.subarray(0, PDF_SIGNATURE.byteLength)).equals(PDF_SIGNATURE);
}

export function validatePdfInput(input: {
  buffer: Uint8Array;
  mimeType: string | null | undefined;
  maximumSizeInBytes: number;
}) {
  if (!isPdfMimeType(input.mimeType)) {
    throw new DocumentProcessingError('INVALID_PDF_TYPE');
  }
  if (input.buffer.byteLength > input.maximumSizeInBytes) {
    throw new DocumentProcessingError('PDF_TOO_LARGE');
  }
  if (!hasPdfSignature(input.buffer)) {
    throw new DocumentProcessingError('INVALID_PDF_SIGNATURE');
  }
}
