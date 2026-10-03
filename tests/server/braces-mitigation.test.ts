import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BRACES_ADVISORY,
  BRACES_PATCH_SHA256,
  isVerifiedBracesFinding,
  verifyBracesMitigation,
} from '../../scripts/lib/braces-mitigation.mjs';

const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
type TestLock = {
  packages: Record<string, unknown>;
  snapshots: Record<string, { dependencies: Record<string, string> }>;
  patchedDependencies: Record<string, { hash: string; path: string }>;
};
const lock = () => yaml.load(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')) as TestLock;
const fixtures: string[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe('installed braces mitigation', () => {
  it('verifies the frozen lock, exact installed sources and real depth/control probes', () => {
    expect(verifyBracesMitigation(root, lock(), manifest)).toMatchObject({
      advisoryId: BRACES_ADVISORY,
      patchSHA256: BRACES_PATCH_SHA256,
      installedCopies: 1,
      consumers: 2,
    });
  });

  it('rejects an additional version, unpatched snapshot or unpatched consumer', () => {
    const extraVersion = lock();
    extraVersion.packages['braces@3.0.2'] = {};
    expect(() => verifyBracesMitigation(root, extraVersion, manifest)).toThrow(
      'reviewed braces version',
    );
    const extraSnapshot = lock();
    extraSnapshot.snapshots['braces@3.0.3'] = { dependencies: {} };
    expect(() => verifyBracesMitigation(root, extraSnapshot, manifest)).toThrow(
      'Unpatched braces snapshot',
    );
    const consumer = lock();
    consumer.snapshots['micromatch@4.0.8'].dependencies.braces = '3.0.3';
    expect(() => verifyBracesMitigation(root, consumer, manifest)).toThrow(
      'Unpatched braces consumer',
    );
  });

  it('rejects a removed or mismatched patch configuration', () => {
    expect(() => verifyBracesMitigation(root, lock(), { ...manifest, pnpm: {} })).toThrow(
      'patch configuration',
    );
    const changed = lock();
    changed.patchedDependencies['braces@3.0.3'].hash = 'wrong';
    expect(() => verifyBracesMitigation(root, changed, manifest)).toThrow('patch binding changed');
  });

  it('rejects stale installed bytes even when the patch file and lock are correct', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'openraic-braces-stale-'));
    fixtures.push(fixture);
    mkdirSync(join(fixture, 'patches'));
    copyFileSync(
      join(root, 'patches/braces@3.0.3.patch'),
      join(fixture, 'patches/braces@3.0.3.patch'),
    );
    const require = createRequire(
      join(root, 'node_modules/.pnpm/micromatch@4.0.8/node_modules/micromatch/package.json'),
    );
    const source = dirname(require.resolve('braces/package.json'));
    const stale = join(fixture, 'braces');
    cpSync(source, stale, { recursive: true });
    writeFileSync(join(stale, 'lib/compile.js'), "'use strict'; module.exports = () => 'stale';\n");
    for (const name of ['micromatch@4.0.8', 'chokidar@3.6.0']) {
      const modules = join(fixture, 'node_modules/.pnpm', name, 'node_modules');
      const consumerName = name.split('@')[0];
      mkdirSync(join(modules, consumerName), { recursive: true });
      writeFileSync(
        join(modules, consumerName, 'package.json'),
        JSON.stringify({ name: consumerName }),
      );
      symlinkSync(stale, join(modules, 'braces'));
    }
    expect(() => verifyBracesMitigation(fixture, lock(), manifest)).toThrow(
      'Installed braces bytes differ',
    );
  });
});

describe('exact advisory classification', () => {
  const finding = {
    packageName: 'braces',
    versions: ['3.0.3'],
    severity: 'high',
    advisoryId: BRACES_ADVISORY,
    vulnerableVersions: '<=3.0.3',
  };
  const proof = { advisoryId: BRACES_ADVISORY, patchSHA256: BRACES_PATCH_SHA256 };

  it('requires proof and the exact reviewed advisory and version', () => {
    expect(isVerifiedBracesFinding(finding, proof)).toBe(true);
    expect(isVerifiedBracesFinding(finding, null)).toBe(false);
    for (const change of [
      { advisoryId: 'GHSA-OTHER-ADVISORY-XXXX' },
      { packageName: 'other' },
      { versions: ['3.0.2', '3.0.3'] },
      { versions: ['3.0.4'] },
      { vulnerableVersions: '<=3.0.4' },
      { severity: 'critical' },
    ])
      expect(isVerifiedBracesFinding({ ...finding, ...change }, proof)).toBe(false);
  });
});
