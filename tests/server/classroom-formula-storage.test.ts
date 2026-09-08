import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedClassroomData } from '@/lib/server/classroom-storage';
import {
  formulaLesson,
  lessonFormulaHtml,
  SAFE_FORMULA,
  UNSAFE_FORMULA,
} from '../support/formula-lesson';

describe.each(['json', 'postgres'] as const)('%s formula persistence boundary', (backend) => {
  const originalCwd = process.cwd();
  let testRoot: string;
  let record: PersistedClassroomData | null;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    testRoot = path.join(originalCwd, '.vitest-tmp', `formula-${backend}-${crypto.randomUUID()}`);
    vi.spyOn(process, 'cwd').mockReturnValue(testRoot);
    record = null;
    vi.doMock('@/lib/db/client', () => ({ isPostgresConfigured: () => backend === 'postgres' }));
    vi.doMock('@/lib/db/repositories/classrooms', () => ({
      readClassroomRecord: async () => structuredClone(record),
      upsertClassroomRecord: async (next: PersistedClassroomData) =>
        (record = structuredClone(next)),
      updateClassroomRecord: async (
        _id: string,
        updater: (value: PersistedClassroomData) => PersistedClassroomData,
      ) => {
        if (!record) return null;
        record = structuredClone(updater(structuredClone(record)));
        return record;
      },
      listClassroomRecordsForAccess: async () => (record ? [structuredClone(record)] : []),
    }));
  });

  afterEach(async () => {
    vi.doUnmock('@/lib/db/client');
    vi.doUnmock('@/lib/db/repositories/classrooms');
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.rm(testRoot, { recursive: true, force: true });
  });

  async function storedRecord() {
    if (backend === 'postgres') return record!;
    const { resolveClassroomJsonPath } = await import('@/lib/server/classroom-storage');
    return JSON.parse(
      await fs.readFile(resolveClassroomJsonPath('formula-room'), 'utf8'),
    ) as PersistedClassroomData;
  }

  it('sanitizes initial saves and updates, including both whiteboard representations', async () => {
    const { persistClassroom, readClassroom, updateClassroom } =
      await import('@/lib/server/classroom-storage');
    const input = formulaLesson();
    const saved = await persistClassroom(input, 'https://classroom.example');

    expect(lessonFormulaHtml(saved)).toEqual([SAFE_FORMULA, SAFE_FORMULA, SAFE_FORMULA]);
    expect(lessonFormulaHtml(await storedRecord())).toEqual([
      SAFE_FORMULA,
      SAFE_FORMULA,
      SAFE_FORMULA,
    ]);
    expect(lessonFormulaHtml(input)).toEqual([UNSAFE_FORMULA, UNSAFE_FORMULA, UNSAFE_FORMULA]);
    expect(saved.url).toBe('https://classroom.example/classroom/formula-room');
    expect(saved.ownerUserId).toBe('teacher-1');

    await updateClassroom(input.id, (current) => ({
      ...current,
      ...formulaLesson('<svg onload="void 0"></svg>'),
    }));
    const readBack = (await readClassroom(input.id))!;
    expect(lessonFormulaHtml(readBack)).toEqual(['<svg></svg>', '<svg></svg>', '<svg></svg>']);
    expect(lessonFormulaHtml(await storedRecord())).toEqual(lessonFormulaHtml(readBack));
    expect(readBack.roomVersion).toBe(1);
  });

  it('normalizes legacy records on read without altering the stored legacy payload', async () => {
    const { ensureClassroomsDir, readClassroom, resolveClassroomJsonPath } =
      await import('@/lib/server/classroom-storage');
    const legacy: PersistedClassroomData = {
      ...formulaLesson(),
      roomVersion: 4,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    };
    if (backend === 'postgres') record = structuredClone(legacy);
    else {
      await ensureClassroomsDir();
      await fs.writeFile(resolveClassroomJsonPath(legacy.id), JSON.stringify(legacy));
    }

    const readBack = (await readClassroom(legacy.id))!;
    expect(lessonFormulaHtml(readBack)).toEqual([SAFE_FORMULA, SAFE_FORMULA, SAFE_FORMULA]);
    expect(readBack.roomVersion).toBe(4);
    expect(readBack.createdAt).toBe(legacy.createdAt);
    expect(lessonFormulaHtml(await storedRecord())).toEqual([
      UNSAFE_FORMULA,
      UNSAFE_FORMULA,
      UNSAFE_FORMULA,
    ]);
  });
});
