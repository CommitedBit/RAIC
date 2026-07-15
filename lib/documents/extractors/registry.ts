import 'server-only';

import { createHash } from 'crypto';
import { extractText, getDocumentProxy } from 'unpdf';
import {
  SOURCE_DOCUMENT_ARTIFACT_CHARACTER_LIMIT,
  SOURCE_DOCUMENT_CONTEXT_CHARACTER_LIMIT,
  SOURCE_DOCUMENT_EXTRACTION_TIMEOUT_MS,
  SOURCE_DOCUMENT_PAGE_LIMIT,
} from '@/lib/documents/constants';
import { DocumentProcessingError } from '@/lib/documents/errors';
import type {
  DocumentArtifact,
  DocumentBlock,
  DocumentCitation,
  DocumentDiagnostic,
} from '@/lib/documents/types';

export interface DocumentExtractionOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

function normalizePageText(value: string) {
  return value
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function appendWithinLimit(current: string, addition: string, limit: number) {
  const available = Math.max(0, limit - current.length);
  if (available === 0) return current;
  return current + addition.slice(0, available);
}

async function extractPdfArtifact(pdfBuffer: Buffer): Promise<DocumentArtifact> {
  const proxy = await getDocumentProxy(new Uint8Array(pdfBuffer));
  if (proxy.numPages > SOURCE_DOCUMENT_PAGE_LIMIT) {
    throw new DocumentProcessingError('PDF_PAGE_LIMIT');
  }

  const { text: pageTexts } = await extractText(proxy, { mergePages: false });
  const artifactId = `doc_${createHash('sha256').update(pdfBuffer).digest('hex').slice(0, 20)}`;
  const blocks: DocumentBlock[] = [];
  const citations: DocumentCitation[] = [];
  const diagnostics: DocumentDiagnostic[] = [];
  let artifactTextLength = 0;
  let artifactTruncated = false;

  for (let index = 0; index < pageTexts.length; index += 1) {
    const pageNumber = index + 1;
    const normalized = normalizePageText(pageTexts[index] ?? '');
    if (!normalized) {
      diagnostics.push({
        code: 'empty_page',
        severity: 'info',
        message: `Page ${pageNumber} did not contain extractable text`,
        pageNumber,
      });
      continue;
    }

    const available = SOURCE_DOCUMENT_ARTIFACT_CHARACTER_LIMIT - artifactTextLength;
    if (available <= 0) {
      artifactTruncated = true;
      break;
    }
    const text = normalized.slice(0, available);
    if (text.length < normalized.length) artifactTruncated = true;
    const blockId = `${artifactId}:b${pageNumber}`;
    const citationId = `${artifactId}:p${pageNumber}`;
    blocks.push({ id: blockId, kind: 'paragraph', pageNumber, text });
    citations.push({
      id: citationId,
      pageNumber,
      blockIds: [blockId],
      label: `Page ${pageNumber}`,
    });
    artifactTextLength += text.length;
    if (artifactTruncated) break;
  }

  if (blocks.length === 0 || artifactTextLength === 0) {
    throw new DocumentProcessingError('PDF_EMPTY');
  }

  if (artifactTruncated) {
    diagnostics.push({
      code: 'artifact_truncated',
      severity: 'warning',
      message: `Document text was limited to ${SOURCE_DOCUMENT_ARTIFACT_CHARACTER_LIMIT.toLocaleString()} characters`,
    });
  }

  let contextText = '';
  const contextPages: number[] = [];
  for (const block of blocks) {
    const separator = contextText ? '\n\n' : '';
    const section = `${separator}[Page ${block.pageNumber}]\n${block.text}`;
    const previousLength = contextText.length;
    contextText = appendWithinLimit(contextText, section, SOURCE_DOCUMENT_CONTEXT_CHARACTER_LIMIT);
    if (contextText.length > previousLength) contextPages.push(block.pageNumber);
    if (contextText.length >= SOURCE_DOCUMENT_CONTEXT_CHARACTER_LIMIT) break;
  }
  const fullContextLength = blocks.reduce((sum, block, index) => {
    return sum + (index > 0 ? 2 : 0) + `[Page ${block.pageNumber}]\n`.length + block.text.length;
  }, 0);
  const contextTruncated = contextText.length < fullContextLength;
  if (contextTruncated) {
    diagnostics.push({
      code: 'context_truncated',
      severity: 'warning',
      message: `Generation context was limited to ${SOURCE_DOCUMENT_CONTEXT_CHARACTER_LIMIT.toLocaleString()} characters`,
    });
  }

  return {
    version: 2,
    id: artifactId,
    mediaType: 'application/pdf',
    pageCount: proxy.numPages,
    characterCount: artifactTextLength,
    truncated: artifactTruncated,
    blocks,
    assets: [],
    citations,
    diagnostics,
    context: {
      text: contextText,
      characterCount: contextText.length,
      truncated: contextTruncated,
      pageNumbers: contextPages,
    },
  };
}

function runWithExtractionBounds<T>(
  operation: Promise<T>,
  options: DocumentExtractionOptions,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? SOURCE_DOCUMENT_EXTRACTION_TIMEOUT_MS;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(new DocumentProcessingError('EXTRACTION_ABORTED')));
    const timeout = setTimeout(
      () => finish(() => reject(new DocumentProcessingError('EXTRACTION_TIMEOUT'))),
      timeoutMs,
    );

    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

export function extractDocumentArtifact(
  mediaType: 'application/pdf',
  buffer: Buffer,
  options: DocumentExtractionOptions = {},
) {
  if (mediaType !== 'application/pdf') {
    throw new DocumentProcessingError('INVALID_PDF_TYPE');
  }
  return runWithExtractionBounds(extractPdfArtifact(buffer), options);
}
