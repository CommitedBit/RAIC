export type DocumentBlockKind = 'heading' | 'paragraph' | 'list' | 'table' | 'unknown';

export interface DocumentBlock {
  id: string;
  kind: DocumentBlockKind;
  pageNumber: number;
  text: string;
}

export interface DocumentAsset {
  id: string;
  kind: 'image';
  pageNumber: number;
  mimeType: string;
  byteLength?: number;
  width?: number;
  height?: number;
}

export interface DocumentCitation {
  id: string;
  pageNumber: number;
  blockIds: string[];
  label: string;
}

export type DocumentDiagnosticCode =
  | 'artifact_truncated'
  | 'context_truncated'
  | 'empty_page'
  | 'asset_omitted';

export interface DocumentDiagnostic {
  code: DocumentDiagnosticCode;
  severity: 'info' | 'warning';
  message: string;
  pageNumber?: number;
}

export interface DocumentContext {
  text: string;
  characterCount: number;
  truncated: boolean;
  pageNumbers: number[];
}

export interface DocumentArtifact {
  version: 2;
  id: string;
  mediaType: 'application/pdf';
  pageCount: number;
  characterCount: number;
  truncated: boolean;
  blocks: DocumentBlock[];
  assets: DocumentAsset[];
  citations: DocumentCitation[];
  diagnostics: DocumentDiagnostic[];
  context: DocumentContext;
}

export interface SourceDocumentUploadIntent {
  uploadId: string;
  pathname: string;
  capability: string;
  expiresAt: string;
}

export interface SourceDocumentUploadClaims {
  version: 1;
  uploadId: string;
  pathname: string;
  userId: string;
  organizationId: string | null;
  issuedAt: number;
  expiresAt: number;
}
