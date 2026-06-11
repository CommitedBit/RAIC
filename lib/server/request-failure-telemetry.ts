import 'server-only';

import type { NextRequest } from 'next/server';
import type { AuthContext } from '@/lib/auth/current-user';
import { appendAuditLog } from '@/lib/db/repositories/audit-logs';
import { createLogger } from '@/lib/logger';

const log = createLogger('RequestFailureTelemetry');
const SAFE_IDENTIFIER_RE = /^[a-zA-Z0-9_.:/-]+$/;
const MAX_IDENTIFIER_LENGTH = 160;

function safeIdentifier(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > MAX_IDENTIFIER_LENGTH || !SAFE_IDENTIFIER_RE.test(normalized)) {
    return '[redacted]';
  }

  return normalized;
}

function safeErrorField(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  return safeIdentifier(value);
}

function summarizeError(error: unknown): Record<string, string | number | null> {
  if (!error || typeof error !== 'object') {
    return {
      errorName: null,
      upstreamCode: null,
      upstreamStatus: null,
      upstreamStatusCode: null,
      governedApiErrorCode: null,
    };
  }

  const candidate = error as {
    name?: unknown;
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
    apiErrorCode?: unknown;
  };

  return {
    errorName: safeErrorField(candidate.name),
    upstreamCode: safeErrorField(candidate.code),
    upstreamStatus: safeErrorField(candidate.status),
    upstreamStatusCode: safeErrorField(candidate.statusCode),
    governedApiErrorCode: safeErrorField(candidate.apiErrorCode),
  };
}

function compactMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null),
  );
}

export async function recordRequestFailureTelemetry(input: {
  auth?: AuthContext | null;
  request: NextRequest;
  routeId: string;
  scenarioProfileId?: string | null;
  status: number;
  errorCode: string;
  failureSource: string;
  error?: unknown;
  providerId?: string | null;
  modelId?: string | null;
  taskBucket?: string | null;
}) {
  const action = input.scenarioProfileId
    ? 'provider_scenario.request_failed'
    : 'api.request_failed';
  const resourceType = input.scenarioProfileId ? 'provider_scenario' : 'api_route';
  const metadata = compactMetadata({
    scenarioProfileId: safeIdentifier(input.scenarioProfileId),
    routeId: safeIdentifier(input.routeId),
    method: input.request.method,
    path: input.request.nextUrl.pathname,
    status: input.status,
    errorCode: safeIdentifier(input.errorCode),
    failureSource: safeIdentifier(input.failureSource),
    providerId: safeIdentifier(input.providerId),
    modelId: safeIdentifier(input.modelId),
    taskBucket: safeIdentifier(input.taskBucket),
    ...summarizeError(input.error),
  });

  try {
    await appendAuditLog({
      organizationId: input.auth?.organization?.id ?? null,
      userId: input.auth?.user?.id ?? null,
      actorRole: input.auth?.session.role ?? null,
      action,
      resourceType,
      resourceId: input.routeId,
      metadata,
    });
  } catch (error) {
    log.warn('Failed to record request failure telemetry', {
      routeId: input.routeId,
      status: input.status,
      errorCode: input.errorCode,
      auditError: summarizeError(error),
    });
  }
}
