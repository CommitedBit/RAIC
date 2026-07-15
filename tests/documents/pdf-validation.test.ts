import { describe, expect, it } from 'vitest';
import { DocumentProcessingError, type DocumentErrorCode } from '@/lib/documents/errors';
import { hasPdfSignature, isPdfMimeType, validatePdfInput } from '@/lib/documents/pdf-validation';

describe('PDF input validation', () => {
  const validPdf = Buffer.from('%PDF-1.7\nfixture', 'ascii');
  const invalidCases: Array<[string, Buffer, DocumentErrorCode]> = [
    ['text/plain', validPdf, 'INVALID_PDF_TYPE'],
    ['application/pdf', Buffer.from('not-pdf'), 'INVALID_PDF_SIGNATURE'],
    ['application/pdf', Buffer.concat([validPdf, Buffer.alloc(100)]), 'PDF_TOO_LARGE'],
  ];

  it('requires the PDF MIME type and header signature', () => {
    expect(isPdfMimeType('application/pdf; charset=binary')).toBe(true);
    expect(isPdfMimeType('text/plain')).toBe(false);
    expect(hasPdfSignature(validPdf)).toBe(true);
    expect(hasPdfSignature(Buffer.from('not-pdf'))).toBe(false);
    expect(() =>
      validatePdfInput({ buffer: validPdf, mimeType: 'application/pdf', maximumSizeInBytes: 100 }),
    ).not.toThrow();
  });

  it.each(invalidCases)(
    'rejects invalid input without echoing source data',
    (mimeType, buffer, code) => {
      let failure: unknown;
      try {
        validatePdfInput({ buffer, mimeType, maximumSizeInBytes: 50 });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(DocumentProcessingError);
      expect(failure).toMatchObject({ code });
    },
  );
});
