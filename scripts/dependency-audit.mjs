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
} from './lib/dependency-audit.mjs';

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

async function runBulkAuditFallback() {
  const lockfile = yaml.load(readFileSync('pnpm-lock.yaml', 'utf8'));
  const packageVersions = collectLockfilePackageVersions(lockfile);
  const advisoryResponse = await fetchBulkAdvisories(packageVersions);
  const findings = normalizeBulkAdvisories(advisoryResponse, packageVersions, 'low');

  if (findings.length === 0) {
    console.log(
      `[dependency-audit] PASS: npm bulk advisory scan found 0 low-or-higher advisories across ${Object.keys(packageVersions).length} locked packages.`,
    );
    return;
  }

  console.error(
    `[dependency-audit] FAIL: found ${findings.length} low-or-higher locked dependency advisories.`,
  );
  for (const finding of findings) {
    console.error(
      `[dependency-audit] ${finding.severity.toUpperCase()} ${finding.packageName} ${finding.versions.join(',')} ${finding.advisoryId} vulnerable=${finding.vulnerableVersions}`,
    );
  }
  process.exitCode = 1;
}

async function main() {
  const nativeAudit = runPnpmAudit();
  if (nativeAudit.status === 0) {
    console.log('[dependency-audit] PASS: pnpm audit found 0 low-or-higher advisories.');
    return;
  }

  if (!isRetiredPnpmAuditEndpoint(nativeAudit)) {
    printNativeAuditFailure(nativeAudit);
    process.exitCode = nativeAudit.status ?? 2;
    return;
  }

  console.warn(
    '[dependency-audit] pnpm audit endpoint returned 410; using npm bulk advisory fallback.',
  );
  await runBulkAuditFallback();
}

main().catch((error) => {
  console.error(
    `[dependency-audit] ERROR: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 2;
});
