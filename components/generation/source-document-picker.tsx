'use client';

import { useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { AlertTriangle, FileText, LoaderCircle, Paperclip, RefreshCw, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { PDF_PROVIDERS } from '@/lib/pdf/constants';
import type { PDFProviderId } from '@/lib/pdf/types';
import type { DocumentArtifact, SourceDocumentUploadIntent } from '@/lib/documents/types';

const GOVERNED_PDF_LIMIT_BYTES = 50 * 1024 * 1024;
const LEGACY_PDF_LIMIT_BYTES = 4 * 1024 * 1024;

export type SourceDocumentPickerMode = 'governed' | 'legacy' | 'loading' | 'unavailable';

interface SourceDocumentPickerProps {
  mode: SourceDocumentPickerMode;
  artifact: DocumentArtifact | null;
  onArtifactChange: (artifact: DocumentArtifact | null) => void;
  pdfFile: File | null;
  onPdfFileChange: (file: File | null) => void;
  onError: (error: string | null) => void;
}

interface ApiBody {
  success?: boolean;
  error?: string;
  intent?: SourceDocumentUploadIntent;
  artifact?: DocumentArtifact;
}

export function SourceDocumentPicker({
  mode,
  artifact,
  onArtifactChange,
  pdfFile,
  onPdfFileChange,
  onError,
}: SourceDocumentPickerProps) {
  const { t } = useI18n();
  const pdfProviderId = useSettingsStore((state) => state.pdfProviderId);
  const pdfProvidersConfig = useSettingsStore((state) => state.pdfProvidersConfig);
  const setPDFProvider = useSettingsStore((state) => state.setPDFProvider);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [displayFile, setDisplayFile] = useState<File | null>(null);
  const [busyStage, setBusyStage] = useState<'uploading' | 'extracting' | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => () => abortRef.current?.abort(), []);

  const pillClass =
    'inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors';
  const active = artifact || pdfFile;

  const clearSelection = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusyStage(null);
    setProgress(0);
    setDisplayFile(null);
    onArtifactChange(null);
    onPdfFileChange(null);
    onError(null);
  };

  const handleGovernedUpload = async (file: File) => {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setDisplayFile(file);
    setBusyStage('uploading');
    setProgress(0);
    onError(null);
    onArtifactChange(null);
    onPdfFileChange(null);

    try {
      const intentResponse = await fetch('/api/source-documents/upload-intent', {
        method: 'POST',
        signal: controller.signal,
      });
      const intentBody = (await intentResponse.json().catch(() => null)) as ApiBody | null;
      if (!intentResponse.ok || !intentBody?.intent) {
        throw new Error(intentBody?.error || t('sourceDocuments.uploadFailed'));
      }

      await upload(intentBody.intent.pathname, file, {
        access: 'private',
        handleUploadUrl: '/api/source-documents/upload',
        clientPayload: intentBody.intent.capability,
        multipart: true,
        abortSignal: controller.signal,
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });

      setBusyStage('extracting');
      setProgress(100);
      const extractionResponse = await fetch('/api/source-documents/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pathname: intentBody.intent.pathname,
          capability: intentBody.intent.capability,
        }),
        signal: controller.signal,
      });
      const extractionBody = (await extractionResponse.json().catch(() => null)) as ApiBody | null;
      if (!extractionResponse.ok || !extractionBody?.artifact) {
        throw new Error(extractionBody?.error || t('sourceDocuments.extractionFailed'));
      }
      onArtifactChange(extractionBody.artifact);
      setBusyStage(null);
    } catch (error) {
      if (controller.signal.aborted) return;
      setBusyStage(null);
      setProgress(0);
      onError(error instanceof Error ? error.message : t('sourceDocuments.uploadFailed'));
    }
  };

  const handleFile = (file: File) => {
    const limit = mode === 'governed' ? GOVERNED_PDF_LIMIT_BYTES : LEGACY_PDF_LIMIT_BYTES;
    if (file.type !== 'application/pdf') {
      onError(t('sourceDocuments.pdfOnly'));
      return;
    }
    if (file.size > limit) {
      onError(
        mode === 'governed'
          ? t('sourceDocuments.governedSizeLimit')
          : t('sourceDocuments.legacySizeLimit'),
      );
      return;
    }
    if (mode === 'governed') {
      void handleGovernedUpload(file);
      return;
    }
    if (mode === 'legacy') {
      setDisplayFile(file);
      onArtifactChange(null);
      onPdfFileChange(file);
      onError(null);
    }
  };

  const trigger = (
    <button
      type="button"
      aria-label={
        active
          ? t('sourceDocuments.current', { name: displayFile?.name || t('sourceDocuments.pdf') })
          : t('toolbar.uploadPdf')
      }
      disabled={mode === 'loading' || mode === 'unavailable'}
      className={cn(
        pillClass,
        active
          ? 'border-violet-200/60 bg-violet-100 text-violet-700 dark:border-violet-700/50 dark:bg-violet-900/30 dark:text-violet-300'
          : 'border-border/50 text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground',
        (mode === 'loading' || mode === 'unavailable') && 'cursor-not-allowed opacity-45',
      )}
    >
      {busyStage || mode === 'loading' ? (
        <LoaderCircle className="size-3.5 animate-spin" />
      ) : (
        <Paperclip className="size-3.5" />
      )}
      {artifact ? (
        <span>{t('sourceDocuments.pageCount', { count: artifact.pageCount })}</span>
      ) : null}
      {pdfFile ? <span className="max-w-24 truncate">{pdfFile.name}</span> : null}
    </button>
  );

  if (mode === 'loading' || mode === 'unavailable') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent>
          {mode === 'loading'
            ? t('sourceDocuments.checkingAvailability')
            : t('sourceDocuments.unavailable')}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="application/pdf,.pdf"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
            event.target.value = '';
          }}
        />

        {mode === 'legacy' ? (
          <div className="mb-3 flex items-center gap-2">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {t('toolbar.pdfParser')}
            </span>
            <Select
              value={pdfProviderId}
              onValueChange={(value) => setPDFProvider(value as PDFProviderId)}
            >
              <SelectTrigger className="h-7 min-w-0 flex-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(PDF_PROVIDERS).map((provider) => {
                  const config = pdfProvidersConfig[provider.id];
                  const available =
                    !provider.requiresApiKey || !!config?.apiKey || !!config?.isServerConfigured;
                  return (
                    <SelectItem key={provider.id} value={provider.id} disabled={!available}>
                      {provider.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {busyStage ? (
          <div className="space-y-3 py-2" aria-live="polite">
            <div className="flex items-center gap-2 text-sm font-medium">
              <LoaderCircle className="size-4 animate-spin text-violet-600" />
              <span>
                {busyStage === 'uploading'
                  ? t('sourceDocuments.uploading')
                  : t('sourceDocuments.extracting')}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full bg-violet-600 transition-[width]',
                  busyStage === 'extracting' && 'animate-pulse',
                )}
                style={{ width: `${busyStage === 'extracting' ? 100 : progress}%` }}
              />
            </div>
            <p className="truncate text-xs text-muted-foreground">{displayFile?.name}</p>
          </div>
        ) : artifact ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30">
                <FileText className="size-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{displayFile?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t('sourceDocuments.summary', {
                    pages: artifact.pageCount,
                    characters: artifact.characterCount.toLocaleString(),
                  })}
                </p>
              </div>
            </div>
            {artifact.diagnostics.length > 0 ? (
              <div className="space-y-1" role="status">
                {artifact.diagnostics.slice(0, 3).map((diagnostic, index) => (
                  <p
                    key={`${diagnostic.code}-${index}`}
                    className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-300"
                  >
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                    <span>{diagnostic.message}</span>
                  </p>
                ))}
              </div>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium hover:bg-muted"
              >
                <RefreshCw className="size-3.5" />
                {t('sourceDocuments.replace')}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-destructive/30 text-xs font-medium text-destructive hover:bg-destructive/5"
              >
                <Trash2 className="size-3.5" />
                {t('sourceDocuments.remove')}
              </button>
            </div>
          </div>
        ) : pdfFile ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="size-5 text-violet-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{pdfFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-destructive/30 text-xs font-medium text-destructive hover:bg-destructive/5"
            >
              <Trash2 className="size-3.5" />
              {t('sourceDocuments.remove')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label={t('toolbar.pdfUpload')}
            className={cn(
              'flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors',
              isDragging
                ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/20'
                : 'border-muted-foreground/20 hover:border-violet-300',
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
          >
            <Paperclip className="mb-1.5 size-5 text-muted-foreground/50" />
            <span className="text-xs font-medium">{t('toolbar.pdfUpload')}</span>
            <span className="mt-0.5 text-[10px] text-muted-foreground/60">
              {mode === 'governed'
                ? t('sourceDocuments.governedSizeLimit')
                : t('sourceDocuments.legacySizeLimit')}
            </span>
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
