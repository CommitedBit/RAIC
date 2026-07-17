import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { prepareStandaloneAssets } from '../../scripts/prepare-standalone-assets.mjs';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'raic-standalone-assets-'));
  roots.push(root);
  return root;
}

describe('prepareStandaloneAssets', () => {
  it('copies static and public assets into the standalone server tree', async () => {
    const root = await makeRoot();
    await mkdir(path.join(root, '.next', 'standalone'), { recursive: true });
    await mkdir(path.join(root, '.next', 'static', 'chunks'), { recursive: true });
    await mkdir(path.join(root, 'public'), { recursive: true });
    await mkdir(path.join(root, 'data', 'platform'), { recursive: true });
    await mkdir(path.join(root, '.next', 'standalone', 'data'), { recursive: true });
    await writeFile(path.join(root, '.next', 'static', 'chunks', 'app.js'), 'app');
    await writeFile(path.join(root, 'public', 'icon.svg'), '<svg />');
    await writeFile(path.join(root, 'data', 'platform', 'store.json'), '{}');
    await writeFile(path.join(root, '.next', 'standalone', 'data', 'stale.json'), 'stale');

    await prepareStandaloneAssets(root);

    await expect(
      readFile(
        path.join(root, '.next', 'standalone', '.next', 'static', 'chunks', 'app.js'),
        'utf8',
      ),
    ).resolves.toBe('app');
    await expect(
      readFile(path.join(root, '.next', 'standalone', 'public', 'icon.svg'), 'utf8'),
    ).resolves.toBe('<svg />');
    await expect(realpath(path.join(root, '.next', 'standalone', 'data'))).resolves.toBe(
      await realpath(path.join(root, 'data')),
    );
    await expect(
      readFile(path.join(root, '.next', 'standalone', 'data', 'platform', 'store.json'), 'utf8'),
    ).resolves.toBe('{}');
  });

  it('fails clearly when standalone output has not been built', async () => {
    const root = await makeRoot();

    await expect(prepareStandaloneAssets(root)).rejects.toThrow(
      'Standalone build output not found',
    );
  });
});
