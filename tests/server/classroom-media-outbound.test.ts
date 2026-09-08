import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneOutline } from '@/lib/types/generation';
import type { ImageProviderOverride } from '@/lib/server/classroom-generation';

const { fixture, generateImageMock, resolveConfigMock } = vi.hoisted(() => ({
  fixture: { root: '' },
  generateImageMock: vi.fn(),
  resolveConfigMock: vi.fn(),
}));
vi.mock('node:dns', () => ({
  promises: { lookup: vi.fn(async () => [{ address: '8.8.8.8', family: 4 }]) },
}));
vi.mock('@/lib/server/classroom-storage', () => ({
  get CLASSROOMS_DIR() {
    return fixture.root;
  },
}));
vi.mock('@/lib/server/ai-governance', () => ({ resolveGovernedProviderConfig: resolveConfigMock }));
vi.mock('@/lib/media/image-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/image-providers')>()),
  generateImage: generateImageMock,
}));

const fetchMock = vi.fn<typeof fetch>();
const outlines = [
  {
    title: 'Synthetic fixture',
    mediaGenerations: [{ type: 'image', elementId: 'figure', prompt: 'Synthetic figure' }],
  },
] as SceneOutline[];
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('ALLOW_LOCAL_NETWORKS', '');
  fixture.root = await mkdtemp(path.join(tmpdir(), 'openraic-outbound-media-'));
  fetchMock.mockReset().mockRejectedValue(new Error('Unexpected fixture network request'));
  vi.stubGlobal('fetch', fetchMock);
  generateImageMock.mockReset();
  resolveConfigMock.mockReset().mockImplementation(async ({ family }: { family: string }) => {
    if (family !== 'image') throw new Error('Fixture provider disabled');
    return { providerId: 'seedream', apiKey: 'synthetic', baseUrl: 'https://provider.example' };
  });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(fixture.root, { recursive: true, force: true });
});

describe('background classroom media download boundaries', () => {
  it('rejects an internal generated image URL before fetching or writing it', async () => {
    generateImageMock.mockResolvedValue({ url: 'http://127.0.0.1/private.png' });
    const { generateMediaForClassroom } = await import('@/lib/server/classroom-media-generation');
    const result = await generateMediaForClassroom(
      outlines,
      'fixture',
      'https://classroom.example',
      { organizationId: null },
    );
    expect(result.mediaMap).toEqual({});
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'media_request_failed' })]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not let request-scoped overrides supply a trusted-origin exception', async () => {
    generateImageMock.mockResolvedValue({ url: 'http://127.0.0.1/private.png' });
    const override = {
      providerId: 'seedream',
      apiKey: 'synthetic',
      baseUrl: 'http://127.0.0.1',
      trustedBaseUrl: 'http://127.0.0.1',
    } as ImageProviderOverride;
    const { generateMediaForClassroom } = await import('@/lib/server/classroom-media-generation');
    const result = await generateMediaForClassroom(
      outlines,
      'fixture',
      'https://classroom.example',
      { organizationId: null, imageProviderOverride: override },
    );
    expect(result.mediaMap).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(
      generateImageMock.mock.calls[0][0].fetchImpl('http://127.0.0.1/generate'),
    ).rejects.toThrow('Local/private');
  });

  it('preserves downloads from an explicitly configured local provider origin', async () => {
    resolveConfigMock.mockImplementation(async ({ family }: { family: string }) => {
      if (family !== 'image') throw new Error('Fixture provider disabled');
      return {
        providerId: 'seedream',
        apiKey: 'synthetic',
        baseUrl: 'http://127.0.0.1:9000/v1',
        trustedBaseUrl: 'http://127.0.0.1:9000/v1',
      };
    });
    generateImageMock.mockResolvedValue({ url: 'http://127.0.0.1:9000/fixture.png' });
    fetchMock.mockResolvedValue(new Response('synthetic media fixture'));
    const { generateMediaForClassroom } = await import('@/lib/server/classroom-media-generation');
    const result = await generateMediaForClassroom(
      outlines,
      'fixture',
      'https://classroom.example',
      { organizationId: null },
    );
    expect(result.warnings).toEqual([]);
    expect(result.mediaMap.figure).toBe(
      'https://classroom.example/api/classroom-media/fixture/media/figure.png',
    );
    expect(await readFile(path.join(fixture.root, 'fixture/media/figure.png'), 'utf8')).toBe(
      'synthetic media fixture',
    );
  });

  it('keeps adapter-produced inline bytes without making a network request', async () => {
    generateImageMock.mockResolvedValue({ url: 'data:image/png;base64,c3ludGhldGlj' });
    const { generateMediaForClassroom } = await import('@/lib/server/classroom-media-generation');
    const result = await generateMediaForClassroom(
      outlines,
      'fixture',
      'https://classroom.example',
      { organizationId: null },
    );
    expect(result.warnings).toEqual([]);
    expect(await readFile(path.join(fixture.root, 'fixture/media/figure.png'), 'utf8')).toBe(
      'synthetic',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
