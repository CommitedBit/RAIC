#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import yaml from 'js-yaml';
import {
  collectLockfilePackageVersions,
  fetchBulkAdvisories,
  isRetiredPnpmAuditEndpoint,
  normalizeBulkAdvisories,
  normalizeNativeAudit,
} from './lib/dependency-audit.mjs';
import { isVerifiedBracesFinding, verifyBracesMitigation } from './lib/braces-mitigation.mjs';

const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

function runPnpmAudit() {
  return spawnSync(corepackCommand, ['pnpm', 'audit', '--audit-level', 'low', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function printNativeAuditFailure(result) {
  const output = String(result.stdout || result.stderr || result.error?.message || '').trim();
  console.error('[dependency-audit] pnpm audit failed.');
  if (output) console.error(output);
}

function reportFindings(findings, mitigation, source) {
  const unmitigated = findings.filter((finding) => !isVerifiedBracesFinding(finding, mitigation));
  for (const finding of findings) {
    const state = isVerifiedBracesFinding(finding, mitigation)
      ? 'LOCALLY MITIGATED'
      : 'UNMITIGATED';
    console.log(
      `[dependency-audit] ${state}: ${finding.severity.toUpperCase()} ${finding.packageName} ${finding.versions.join(',')} ${finding.advisoryId} vulnerable=${finding.vulnerableVersions}`,
    );
  }
  console.log(
    `[dependency-audit] ${unmitigated.length ? 'FAIL' : 'PASS'}: ${source} returned ${findings.length} low-or-higher advisories; ${unmitigated.length} unmitigated; ${findings.length - unmitigated.length} locally mitigated.`,
  );
  console.log(
    `[dependency-audit] Verified braces patch ${mitigation.patchSHA256}; ${mitigation.installedCopies} installed copies through ${mitigation.consumers} locked consumers. Upstream advisory remains visible.`,
  );
  process.exitCode = unmitigated.length ? 1 : 0;
}

async function main() {
  const lockfile = yaml.load(readFileSync('pnpm-lock.yaml', 'utf8'));
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const packageVersions = collectLockfilePackageVersions(lockfile);
  const mitigation = verifyBracesMitigation(process.cwd(), lockfile, packageJson);
  const nativeAudit = runPnpmAudit();
  if (isRetiredPnpmAuditEndpoint(nativeAudit)) {
    console.warn(
      '[dependency-audit] pnpm audit endpoint returned 410; using npm bulk advisory fallback.',
    );
    const response = await fetchBulkAdvisories(packageVersions);
    const findings = normalizeBulkAdvisories(response, packageVersions, 'low');
    if (findings.length) console.log(JSON.stringify(response, null, 2));
    reportFindings(findings, mitigation, 'npm bulk audit');
    return;
  }
  if (nativeAudit.error || ![0, 1].includes(nativeAudit.status)) {
    printNativeAuditFailure(nativeAudit);
    process.exitCode = nativeAudit.status ?? 2;
    return;
  }
  const response = JSON.parse(nativeAudit.stdout);
  const findings = normalizeNativeAudit(response, packageVersions);
  if ((findings.length === 0) !== (nativeAudit.status === 0)) {
    throw new Error('Native audit exit status contradicts its findings');
  }
  if (findings.length) console.log(nativeAudit.stdout.trim());
  reportFindings(findings, mitigation, 'pnpm audit');
}

main().catch((error) => {
  console.error(
    `[dependency-audit] ERROR: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 2;
});
