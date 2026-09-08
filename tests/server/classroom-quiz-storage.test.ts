import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedClassroomData } from '@/lib/server/classroom-storage';
import { quizLesson } from '../support/quiz-lesson';

describe.each(['json', 'postgres'] as const)('%s quiz storage', (backend) => {
  const originalCwd = process.cwd();
  let testRoot: string;
  let record: PersistedClassroomData | null;
  beforeEach(() => {
    vi.resetModules();
    testRoot = path.join(originalCwd, '.vitest-tmp', `quiz-${backend}-${crypto.randomUUID()}`);
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
        return (record = structuredClone(updater(structuredClone(record))));
      },
    }));
  });
  afterEach(async () => {
    vi.doUnmock('@/lib/db/client');
    vi.doUnmock('@/lib/db/repositories/classrooms');
    vi.restoreAllMocks();
    await fs.rm(testRoot, { recursive: true, force: true });
  });
  function expectKeys(value: { scenes: PersistedClassroomData['scenes'] }) {
    expect(value.scenes[0].content).toMatchObject({
      questions: [
        { answer: ['A'], hasAnswer: true },
        { answer: ['same'], hasAnswer: false, answerKeyIssue: 'ambiguous_answer' },
      ],
    });
  }
  it('normalizes writes and updates while preserving source keys for review', async () => {
    const { persistClassroom, readClassroom, updateClassroom } =
      await import('@/lib/server/classroom-storage');
    const input = quizLesson();
    expectKeys(await persistClassroom(input, 'https://classroom.example'));
    expectKeys((await readClassroom(input.id))!);
    await updateClassroom(input.id, (current) => ({ ...current, scenes: input.scenes }));
    expectKeys((await readClassroom(input.id))!);
    expect(input.scenes[0].content).toMatchObject({
      questions: [{ answer: ['(6, 2)'] }, { answer: ['same'] }],
    });
  });
  it('normalizes legacy reads without rewriting disk or inventing an answer', async () => {
    const { ensureClassroomsDir, readClassroom, resolveClassroomJsonPath } =
      await import('@/lib/server/classroom-storage');
    const input: PersistedClassroomData = {
      ...quizLesson(),
      roomVersion: 2,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    if (backend === 'postgres') record = structuredClone(input);
    else {
      await ensureClassroomsDir();
      await fs.writeFile(resolveClassroomJsonPath(input.id), JSON.stringify(input));
    }
    const loaded = (await readClassroom(input.id))!;
    expectKeys(loaded);
    expect(loaded.roomVersion).toBe(2);
    const stored =
      backend === 'postgres'
        ? record
        : JSON.parse(await fs.readFile(resolveClassroomJsonPath(input.id), 'utf8'));
    expect(stored).toEqual(input);
  });
});
