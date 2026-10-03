import { describe, expect, it } from 'vitest';

const {
  collectLockfilePackageVersions,
  isRetiredPnpmAuditEndpoint,
  normalizeBulkAdvisories,
  normalizeNativeAudit,
} = await import('../../scripts/lib/dependency-audit.mjs');

describe('dependency audit fallback', () => {
  it('collects deterministic registry package versions from a pnpm lockfile', () => {
    expect(
      collectLockfilePackageVersions({
        packages: {
          'zod@4.3.6': {},
          '@scope/example@2.0.0(peer@1.0.0)': {},
          'zod@4.4.3': {},
          'workspace-package@link:packages/example': {},
        },
      }),
    ).toEqual({
      '@scope/example': ['2.0.0'],
      zod: ['4.3.6', '4.4.3'],
    });
  });

  it('falls back only for the retired pnpm endpoint response', () => {
    expect(
      isRetiredPnpmAuditEndpoint({
        stdout: JSON.stringify({
          error: {
            code: 'ERR_PNPM_AUDIT_BAD_RESPONSE',
            message: 'The audit endpoint responded with 410: endpoint is being retired.',
          },
        }),
      }),
    ).toBe(true);

    expect(
      isRetiredPnpmAuditEndpoint({
        stdout: JSON.stringify({ advisories: { example: { severity: 'high' } } }),
      }),
    ).toBe(false);
  });

  it('normalizes and orders low-or-higher advisories without raw response fields', () => {
    const findings = normalizeBulkAdvisories(
      {
        alpha: [
          {
            id: 10,
            severity: 'low',
            vulnerable_versions: '<1.2.3',
            url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
            title: 'raw upstream title',
          },
        ],
        beta: [
          {
            id: 20,
            severity: 'high',
            vulnerable_versions: '<4.5.6',
            url: 'https://example.test/advisory/20',
          },
        ],
      },
      { alpha: ['1.0.0'], beta: ['4.0.0'] },
    );

    expect(findings).toEqual([
      {
        packageName: 'beta',
        versions: ['4.0.0'],
        severity: 'high',
        advisoryId: 'npm:20',
        vulnerableVersions: '<4.5.6',
      },
      {
        packageName: 'alpha',
        versions: ['1.0.0'],
        severity: 'low',
        advisoryId: 'GHSA-AAAA-BBBB-CCCC',
        vulnerableVersions: '<1.2.3',
      },
    ]);
  });
});

describe('dependency audit response integrity', () => {
  const advisory = {
    id: 1,
    module_name: 'example',
    severity: 'high',
    vulnerable_versions: '<2.0.0',
    url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
  };
  const response = () => ({
    advisories: { '1': advisory },
    muted: [],
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 } },
  });
  const versions = { example: ['1.0.0'] };

  it('uses the same identity and versions in native and bulk findings', () => {
    expect(normalizeNativeAudit(response(), versions)).toEqual(
      normalizeBulkAdvisories({ example: [advisory] }, versions),
    );
  });

  it.each([
    null,
    [],
    { example: null },
    { example: {} },
    { example: [{ ...advisory, severity: 'unexpected' }] },
    { example: [{ severity: 'high' }] },
    { unknown: [advisory] },
  ])('rejects malformed bulk response %j', (body) => {
    expect(() => normalizeBulkAdvisories(body, versions)).toThrow();
  });

  it('rejects native findings missing from the summary and summary findings missing from the body', () => {
    const missingCount = response();
    missingCount.metadata.vulnerabilities.high = 0;
    expect(() => normalizeNativeAudit(missingCount, versions)).toThrow('count mismatch');
    expect(() => normalizeNativeAudit({ ...response(), advisories: {} }, versions)).toThrow(
      'count mismatch',
    );
  });

  it('rejects muted findings, malformed responses, and unknown severities', () => {
    expect(() => normalizeNativeAudit({ ...response(), muted: ['example'] }, versions)).toThrow();
    expect(() => normalizeNativeAudit({}, versions)).toThrow();
    expect(() =>
      normalizeNativeAudit(
        {
          ...response(),
          advisories: {
            '1': { ...advisory, severity: 'unexpected' },
          },
        },
        versions,
      ),
    ).toThrow();
  });
});
