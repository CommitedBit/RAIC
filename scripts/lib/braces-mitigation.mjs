import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectLockfilePackageVersions } from './dependency-audit.mjs';

export const BRACES_ADVISORY = 'GHSA-VFJ7-8CJW-P6XM';
// No upstream release fixes this advisory as of 2026-10-03:
// https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
// The local patch caps parser, AST, queue and parent-chain traversal at 100.
// Unlike upstream PR #72, it preserves existing stringify escapeInvalid behavior.
// Replace this exact mitigation with a verified upstream release when available.
export const BRACES_PATCH_SHA256 =
  '6112759799c1266d6654b7e7949b13b6b7f2815b5b51bd39643d86ea8bffdab6';
const PATCH_PATH = 'patches/braces@3.0.3.patch';
const SOURCE_SHA256 = {
  'index.js': '332ea07c7b006361aad12aa994ca75dc1db8e8382b884909e2f38f10b85c88a4',
  'lib/compile.js': '2d53da2fbf1d7c27cd3896706c181d162783734489a75a0bdbc95e26667a6522',
  'lib/constants.js': 'c18ac5adb57308f1ce42a28552da3a31f5d83709743ebd9a636336813a744d4b',
  'lib/expand.js': 'd43f719c13fae8e2452c5ad7baa25b70085e9f430ddd2c066d7971bab22b472f',
  'lib/parse.js': 'adf3c108a16afaabe5379298d2227881e88f536cc7345b7df780a80d38dd01f9',
  'lib/stringify.js': '4563f489a2ea9dfe7e036d9cd84a87df90bbde029bddfdaa298c3abf9d1bb372',
  'lib/utils.js': 'db48166ff6dcf2f30b3968562833c7f0d0ecddcbaff169d0fb2fa0a61d2c10a4',
  'package.json': '56f08b888a4f30dc7cf8a7dbb36ffe92b737912ba36abe9d069d32167c957ac7',
};
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

// This is an exact installed-code verification, not an advisory ignore list.
export function verifyBracesMitigation(root, lockfile, packageJson) {
  const patchedVersion = '3.0.3(patch_hash=' + BRACES_PATCH_SHA256 + ')';
  assert.deepEqual(
    collectLockfilePackageVersions(lockfile).braces,
    ['3.0.3'],
    'Only the reviewed braces version may use this mitigation',
  );
  assert.equal(
    packageJson.pnpm?.patchedDependencies?.['braces@3.0.3'],
    PATCH_PATH,
    'Missing braces patch configuration',
  );
  assert.deepEqual(
    lockfile.patchedDependencies?.['braces@3.0.3'],
    { hash: BRACES_PATCH_SHA256, path: PATCH_PATH },
    'Braces lockfile patch binding changed',
  );
  assert.equal(sha256(join(root, PATCH_PATH)), BRACES_PATCH_SHA256, 'Braces patch bytes changed');
  assert.deepEqual(
    Object.keys(lockfile.snapshots ?? {}).filter((key) => key.startsWith('braces@')),
    ['braces@' + patchedVersion],
    'Unpatched braces snapshot',
  );

  const store = join(root, 'node_modules/.pnpm');
  const installedEntries = readdirSync(store);
  const roots = new Set();
  let consumers = 0;
  for (const [key, snapshot] of Object.entries(lockfile.snapshots ?? {})) {
    const reference = snapshot.dependencies?.braces ?? snapshot.optionalDependencies?.braces;
    if (reference === undefined) continue;
    assert.equal(reference, patchedVersion, 'Unpatched braces consumer: ' + key);
    const packageKey = key.split('(')[0];
    const split = packageKey.lastIndexOf('@');
    const name = packageKey.slice(0, split);
    const prefix = packageKey.replace('/', '+');
    const entries = installedEntries.filter(
      (entry) => entry === prefix || entry.startsWith(prefix + '_'),
    );
    assert(entries.length > 0, 'Missing installed braces consumer: ' + key);
    for (const entry of entries) {
      const consumer = join(store, entry, 'node_modules', name, 'package.json');
      assert(existsSync(consumer), 'Missing installed consumer manifest: ' + key);
      const resolved = createRequire(consumer).resolve('braces/package.json');
      roots.add(dirname(realpathSync(resolved)));
    }
    consumers++;
  }
  assert(consumers > 0 && roots.size > 0, 'No installed braces consumer verified');
  for (const importer of Object.values(lockfile.importers ?? {})) {
    for (const kind of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const reference = importer[kind]?.braces;
      if (reference)
        assert.equal(reference.version, patchedVersion, 'Unpatched direct braces dependency');
    }
  }
  const direct = join(root, 'node_modules/braces/package.json');
  if (existsSync(direct)) roots.add(dirname(realpathSync(direct)));
  for (const packageRoot of roots) {
    for (const [file, expected] of Object.entries(SOURCE_SHA256)) {
      assert.equal(
        sha256(join(packageRoot, file)),
        expected,
        'Installed braces bytes differ: ' + file,
      );
    }
    const probe = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./braces-depth-probe.mjs', import.meta.url)), packageRoot],
      { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 },
    );
    assert.equal(
      probe.status,
      0,
      'Braces mitigation probe failed: ' +
        String(probe.stderr || probe.error?.message || probe.signal || 'unknown'),
    );
  }
  return {
    advisoryId: BRACES_ADVISORY,
    packageName: 'braces',
    version: '3.0.3',
    patchSHA256: BRACES_PATCH_SHA256,
    installedCopies: roots.size,
    consumers,
  };
}

export function isVerifiedBracesFinding(finding, mitigation) {
  return (
    mitigation?.advisoryId === BRACES_ADVISORY &&
    mitigation.patchSHA256 === BRACES_PATCH_SHA256 &&
    finding.advisoryId === BRACES_ADVISORY &&
    finding.packageName === 'braces' &&
    finding.severity === 'high' &&
    finding.versions.length === 1 &&
    finding.versions[0] === '3.0.3' &&
    finding.vulnerableVersions === '<=3.0.3'
  );
}
