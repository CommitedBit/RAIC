#!/usr/bin/env node

import { cp, mkdir, rm, stat, symlink } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

async function isDirectory(target) {
  try {
    return (await stat(target)).isDirectory();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function prepareStandaloneAssets(root = process.cwd()) {
  const standaloneDir = path.join(root, '.next', 'standalone');
  if (!(await isDirectory(standaloneDir))) {
    throw new Error(`Standalone build output not found: ${standaloneDir}`);
  }

  const staticSource = path.join(root, '.next', 'static');
  if (!(await isDirectory(staticSource))) {
    throw new Error(`Next.js static assets not found: ${staticSource}`);
  }

  const standaloneNextDir = path.join(standaloneDir, '.next');
  await mkdir(standaloneNextDir, { recursive: true });
  await cp(staticSource, path.join(standaloneNextDir, 'static'), {
    recursive: true,
    force: true,
  });

  const publicSource = path.join(root, 'public');
  if (await isDirectory(publicSource)) {
    await cp(publicSource, path.join(standaloneDir, 'public'), {
      recursive: true,
      force: true,
    });
  }

  const dataSource = path.join(root, 'data');
  await mkdir(dataSource, { recursive: true });

  const standaloneData = path.join(standaloneDir, 'data');
  await rm(standaloneData, { recursive: true, force: true });
  await symlink(dataSource, standaloneData, process.platform === 'win32' ? 'junction' : 'dir');
}

const isDirectExecution =
  process.argv[1] != null &&
  path.normalize(path.resolve(process.argv[1])).toLowerCase() ===
    path.normalize(fileURLToPath(import.meta.url)).toLowerCase();

if (isDirectExecution) {
  await prepareStandaloneAssets();
  console.log('[standalone-assets] Copied client assets and linked Playwright fixture data.');
}
