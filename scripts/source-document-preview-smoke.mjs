import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createMultipartUploader } from '@vercel/blob/client';

const MINIMUM_PROOF_BYTES = 4.5 * 1024 * 1024;
const SYNTHETIC_PDF_BYTES = 5.25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const SESSION_COOKIE_NAME = 'raic_session';

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parsePreviewUrl(rawValue) {
  const value = new URL(rawValue);
  if (value.protocol !== 'https:' || !value.hostname.endsWith('.vercel.app')) {
    throw new Error('RAIC_SOURCE_SMOKE_BASE_URL must be an HTTPS Vercel preview URL');
  }
  if (value.hostname === 'open-raic.com' || value.hostname === 'www.open-raic.com') {
    throw new Error('Source-document smoke refuses the production alias');
  }
  value.pathname = '/';
  value.search = '';
  value.hash = '';
  return value;
}

function escapePdfText(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function buildSyntheticPdf(runId) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const lessonText = escapePdfText(
    `Synthetic governed source ${runId}: Alaska classroom source evidence for preview verification.`,
  );
  const stream = `BT /F1 16 Tf 72 720 Td (${lessonText}) Tj ET`;
  objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);

  const chunks = [Buffer.from('%PDF-1.4\n% governed-source-smoke\n')];
  const offsets = [0];
  let length = chunks[0].length;
  for (const [index, object] of objects.entries()) {
    offsets.push(length);
    const chunk = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`);
    chunks.push(chunk);
    length += chunk.length;
  }

  const paddingLine = Buffer.from('% source-smoke-padding\n');
  const paddingTarget = Math.ceil(SYNTHETIC_PDF_BYTES - length - 512);
  const paddingCount = Math.max(0, Math.ceil(paddingTarget / paddingLine.length));
  const padding = Buffer.alloc(paddingCount * paddingLine.length);
  for (let offset = 0; offset < padding.length; offset += paddingLine.length) {
    paddingLine.copy(padding, offset);
  }
  chunks.push(padding);
  length += padding.length;

  const xrefOffset = length;
  const xrefEntries = offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n `)
    .join('\n');
  chunks.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xrefEntries}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(chunks);
}

function runVercelRequest({ baseUrl, cookie, pathname, method = 'GET', body, headers = {} }) {
  const args = [
    'pnpm',
    'dlx',
    'vercel',
    'curl',
    pathname,
    '--deployment',
    baseUrl.toString(),
    '--',
    '--silent',
    '--show-error',
    '--request',
    method,
  ];
  if (cookie) args.push('--header', `Cookie: ${SESSION_COOKIE_NAME}=${cookie}`);
  for (const [name, value] of Object.entries(headers)) {
    args.push('--header', `${name}: ${value}`);
  }
  let input;
  if (body !== undefined) {
    args.push('--header', 'Content-Type: application/json', '--data-binary', '@-');
    input = JSON.stringify(body);
  }

  const result = spawnSync('corepack', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    input,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Protected preview request failed for ${pathname}`);
  }

  let response;
  try {
    response = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(`Protected preview returned invalid JSON for ${pathname}`);
  }
  if (response?.success === false) {
    const code = typeof response.errorCode === 'string' ? response.errorCode : 'REQUEST_FAILED';
    throw new Error(`Protected preview rejected ${pathname}: ${code}`);
  }
  return response;
}

async function uploadSyntheticPdf({ baseUrl, cookie, intent, pdf, smokeSecret }) {
  const tokenResponse = runVercelRequest({
    baseUrl,
    cookie,
    pathname: '/api/source-documents/upload',
    method: 'POST',
    body: {
      type: 'blob.generate-client-token',
      payload: {
        pathname: intent.pathname,
        clientPayload: intent.capability,
        multipart: true,
      },
    },
  });
  if (typeof tokenResponse.clientToken !== 'string') {
    throw new Error('Preview did not issue a source-document client token');
  }

  const uploader = await createMultipartUploader(intent.pathname, {
    access: 'private',
    token: tokenResponse.clientToken,
    contentType: 'application/pdf',
  });
  const part = await uploader.uploadPart(1, pdf);
  await uploader.complete([part]);

  const extraction = runVercelRequest({
    baseUrl,
    cookie,
    pathname: '/api/source-documents/extract',
    method: 'POST',
    body: { pathname: intent.pathname, capability: intent.capability },
  });
  const artifact = extraction.artifact;
  if (
    artifact?.version !== 2 ||
    artifact.mediaType !== 'application/pdf' ||
    artifact.pageCount !== 1 ||
    typeof artifact.context?.text !== 'string' ||
    artifact.context.text.length === 0
  ) {
    throw new Error('Preview returned an invalid document artifact');
  }
  const deletion = runVercelRequest({
    baseUrl,
    pathname: '/api/internal/preview-smoke-session',
    method: 'POST',
    headers: { Authorization: `Bearer ${smokeSecret}` },
    body: { action: 'verify-source-blob-deleted', pathname: intent.pathname },
  });
  if (deletion.deleted !== true) {
    throw new Error('Raw source Blob remained after extraction');
  }
  return artifact;
}

async function generateSourceRequiredClassroom({ baseUrl, cookie, artifact, runId, timeoutMs }) {
  const queued = runVercelRequest({
    baseUrl,
    cookie,
    pathname: '/api/generate-classroom',
    method: 'POST',
    body: {
      requirement:
        'Create a concise source-grounded classroom lesson from the attached synthetic source. Keep it factual and classroom appropriate.',
      requestKey: `source-smoke-${runId}`,
      pdfContent: { text: artifact.context.text, images: [] },
      language: 'en-US',
      enableWebSearch: false,
      interactiveMode: false,
      experiencePreset: 'historical-vlogger',
      selectedModel: 'gpt-5.4-mini',
      enableImageGeneration: false,
      enableVideoGeneration: false,
      enableTTS: false,
      agentMode: 'default',
    },
  });
  if (typeof queued.jobId !== 'string') throw new Error('Preview did not queue generation');

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const job = runVercelRequest({
      baseUrl,
      cookie,
      pathname: `/api/generate-classroom/${queued.jobId}`,
    });
    if (!job.done) continue;
    if (job.status !== 'succeeded' || typeof job.result?.id !== 'string') {
      throw new Error(`Source-required classroom generation ended with ${job.status || 'failure'}`);
    }
    return {
      jobId: queued.jobId,
      classroomId: job.result.id,
      completionStatus: job.result.completionStatus,
      scenesCount: job.result.scenesCount,
    };
  }
  throw new Error('Source-required classroom generation timed out');
}

async function main() {
  const baseUrl = parsePreviewUrl(requiredEnv('RAIC_SOURCE_SMOKE_BASE_URL'));
  const smokeSecret = requiredEnv('RAIC_PREVIEW_SMOKE_SECRET');
  const evidencePath = process.env.RAIC_SOURCE_SMOKE_EVIDENCE_PATH?.trim() || '';
  const timeoutMs = Number(process.env.RAIC_SOURCE_SMOKE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 60_000) {
    throw new Error('RAIC_SOURCE_SMOKE_TIMEOUT_MS must be at least 60000');
  }

  const runId = randomUUID().replaceAll('-', '').slice(0, 16);
  const pdf = buildSyntheticPdf(runId);
  if (pdf.length <= MINIMUM_PROOF_BYTES) {
    throw new Error('Synthetic PDF did not exceed the Vercel Function body limit');
  }

  let teacher;
  let uploadedPathname;
  let evidence;
  try {
    teacher = runVercelRequest({
      baseUrl,
      pathname: '/api/internal/preview-smoke-session',
      method: 'POST',
      headers: { Authorization: `Bearer ${smokeSecret}` },
      body: { action: 'create' },
    });
    if (typeof teacher.sessionToken !== 'string' || typeof teacher.cleanupToken !== 'string') {
      throw new Error('Preview did not issue a disposable teacher session');
    }
    const intentResponse = runVercelRequest({
      baseUrl,
      cookie: teacher.sessionToken,
      pathname: '/api/source-documents/upload-intent',
      method: 'POST',
    });
    if (
      typeof intentResponse.intent?.pathname !== 'string' ||
      typeof intentResponse.intent?.capability !== 'string'
    ) {
      throw new Error('Preview did not issue a governed upload intent');
    }
    uploadedPathname = intentResponse.intent.pathname;

    const artifact = await uploadSyntheticPdf({
      baseUrl,
      cookie: teacher.sessionToken,
      intent: intentResponse.intent,
      pdf,
      smokeSecret,
    });
    uploadedPathname = undefined;
    const generation = await generateSourceRequiredClassroom({
      baseUrl,
      cookie: teacher.sessionToken,
      artifact,
      runId,
      timeoutMs,
    });

    evidence = {
      script: 'source-document-preview-smoke',
      runAt: new Date().toISOString(),
      deploymentOrigin: baseUrl.origin,
      pdfBytes: pdf.length,
      artifact: {
        pageCount: artifact.pageCount,
        characterCount: artifact.characterCount,
        diagnosticCount: artifact.diagnostics.length,
      },
      rawBlobDeleted: true,
      generation: {
        completionStatus: generation.completionStatus,
        scenesCount: generation.scenesCount,
      },
    };
  } finally {
    if (uploadedPathname) {
      runVercelRequest({
        baseUrl,
        pathname: '/api/internal/preview-smoke-session',
        method: 'POST',
        headers: { Authorization: `Bearer ${smokeSecret}` },
        body: { action: 'delete-source-blob', pathname: uploadedPathname },
      });
    }
    if (teacher) {
      runVercelRequest({
        baseUrl,
        pathname: '/api/internal/preview-smoke-session',
        method: 'POST',
        headers: { Authorization: `Bearer ${smokeSecret}` },
        body: { action: 'cleanup', cleanupToken: teacher.cleanupToken },
      });
    }
  }

  evidence.disposableDataCleaned = true;
  if (evidencePath) {
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  }
  console.log(
    `[source-document-smoke] PASS pdfBytes=${pdf.length} pages=${evidence.artifact.pageCount} rawBlobDeleted=true classroomGenerated=true disposableDataCleaned=true`,
  );
}

main().catch((error) => {
  console.error(
    `[source-document-smoke] FAIL ${error instanceof Error ? error.message : 'Unknown error'}`,
  );
  process.exitCode = 1;
});
