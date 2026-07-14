import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/lib/auth/current-user';

const { appendAuditLogMock, loggerWarnMock } = vi.hoisted(() => ({
  appendAuditLogMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('@/lib/db/repositories/audit-logs', () => ({
  appendAuditLog: appendAuditLogMock,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
}));

import { recordGenerationRetryTelemetry } from '@/lib/server/request-failure-telemetry';

describe('generation retry telemetry', () => {
  beforeEach(() => {
    appendAuditLogMock.mockReset();
    loggerWarnMock.mockReset();
  });

  it('records sanitized retry metadata without request query data', async () => {
    await recordGenerationRetryTelemetry({
      auth: {
        organization: { id: 'org-1' },
        session: { role: 'teacher' },
        user: { id: 'teacher-1' },
      } as AuthContext,
      request: new NextRequest(
        'https://open-raic.com/api/generate/scene-content?api_key=request-secret',
        { method: 'POST' },
      ),
      routeId: 'scene-content',
      label: 'scene-content:slide',
      category: 'http_429',
      attempt: 1,
      maxAttempts: 3,
      nextDelayMs: 1000,
      outcome: 'scheduled',
      modelId: 'openai:gpt-5.4-mini?api_key=model-secret',
    });

    expect(appendAuditLogMock).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'teacher-1',
      actorRole: 'teacher',
      action: 'generation.retry_scheduled',
      resourceType: 'api_route',
      resourceId: 'scene-content',
      metadata: {
        routeId: 'scene-content',
        method: 'POST',
        path: '/api/generate/scene-content',
        label: 'scene-content:slide',
        category: 'http_429',
        attempt: 1,
        maxAttempts: 3,
        nextDelayMs: 1000,
        outcome: 'scheduled',
        modelId: '[redacted]',
      },
    });
    expect(JSON.stringify(appendAuditLogMock.mock.calls)).not.toContain('request-secret');
    expect(JSON.stringify(appendAuditLogMock.mock.calls)).not.toContain('model-secret');
  });

  it('does not let audit failures change request handling or leak raw errors', async () => {
    appendAuditLogMock.mockRejectedValueOnce(new Error('database password=telemetry-secret'));

    await expect(
      recordGenerationRetryTelemetry({
        request: new NextRequest('https://open-raic.com/api/generate/scene-actions', {
          method: 'POST',
        }),
        routeId: 'scene-actions',
        label: 'scene-actions:quiz',
        category: 'network',
        attempt: 2,
        maxAttempts: 2,
        outcome: 'failed',
      }),
    ).resolves.toBeUndefined();

    expect(loggerWarnMock).toHaveBeenCalled();
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain('telemetry-secret');
  });
});
