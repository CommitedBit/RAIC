import { describe, expect, it } from 'vitest';

const { collectLockfilePackageVersions, isRetiredPnpmAuditEndpoint, normalizeBulkAdvisories } =
  await import('../../scripts/lib/dependency-audit.mjs');

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
