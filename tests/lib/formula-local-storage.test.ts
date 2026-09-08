import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import {
  db,
  exportDatabase,
  getScenesByStageId,
  importDatabase,
  type SceneRecord,
  type StageRecord,
} from '@/lib/utils/database';
import { getFirstSlideByStages, loadStageData, saveStageData } from '@/lib/utils/stage-storage';
import type { PPTLatexElement } from '@/lib/types/slides';
import {
  formulaLesson,
  lessonFormulaHtml,
  SAFE_FORMULA,
  UNSAFE_FORMULA,
} from '../support/formula-lesson';

vi.mock('@/lib/utils/chat-storage', () => ({
  saveChatSessions: vi.fn(async () => undefined),
  loadChatSessions: vi.fn(async () => []),
}));

describe('formula boundaries around IndexedDB operations', () => {
  let stages: StageRecord[];
  let scenes: SceneRecord[];

  function stored<T extends { id?: string }>(value: T): T & { id: string } {
    if (!value.id) throw new Error('Fixture record must have an id');
    return { ...structuredClone(value), id: value.id };
  }

  beforeEach(() => {
    stages = [];
    scenes = [];
    // Exercise the actual storage helpers; replace only Dexie's I/O methods.
    vi.spyOn(db.stages, 'put').mockImplementation((stage) => {
      stages = [stored(stage)];
      return Dexie.Promise.resolve(stages[0].id);
    });
    vi.spyOn(db.stages, 'get').mockImplementation(() =>
      Dexie.Promise.resolve(structuredClone(stages[0])),
    );
    vi.spyOn(db.stages, 'bulkPut').mockImplementation((next) => {
      stages = next.map(stored);
      return Dexie.Promise.resolve(stages.at(-1)?.id ?? '');
    });
    vi.spyOn(db.scenes, 'bulkPut').mockImplementation((next) => {
      scenes = next.map(stored);
      return Dexie.Promise.resolve(scenes.at(-1)?.id ?? '');
    });
    vi.spyOn(db.scenes, 'where').mockImplementation(
      () =>
        ({
          equals: (stageId: string) => ({
            sortBy: async () =>
              structuredClone(
                scenes
                  .filter((scene) => scene.stageId === stageId)
                  .sort((a, b) => a.order - b.order),
              ),
            delete: async () => {
              scenes = scenes.filter((scene) => scene.stageId !== stageId);
              return 0;
            },
          }),
        }) as never,
    );
    vi.spyOn(db.stages, 'toArray').mockImplementation(() =>
      Dexie.Promise.resolve(structuredClone(stages)),
    );
    vi.spyOn(db.scenes, 'toArray').mockImplementation(() =>
      Dexie.Promise.resolve(structuredClone(scenes)),
    );
    vi.spyOn(db.chatSessions, 'toArray').mockResolvedValue([]);
    vi.spyOn(db.playbackState, 'toArray').mockResolvedValue([]);
    vi.spyOn(db, 'transaction').mockImplementation((...args: unknown[]) => {
      return Dexie.Promise.resolve((args.at(-1) as () => Promise<void>)());
    });
  });

  afterEach(() => vi.restoreAllMocks());

  function seedLegacyRecords() {
    const lesson = formulaLesson();
    stages = [structuredClone(lesson.stage)];
    scenes = lesson.scenes.map((scene) => ({
      ...structuredClone(scene),
      createdAt: 1,
      updatedAt: 1,
    }));
    return lesson;
  }

  it('sanitizes scene formulas before saving without rewriting the caller data', async () => {
    const lesson = formulaLesson();
    await saveStageData(lesson.id, { ...lesson, currentSceneId: lesson.scenes[0].id, chats: [] });

    expect(lessonFormulaHtml({ stage: lesson.stage, scenes }).slice(1)).toEqual([
      SAFE_FORMULA,
      SAFE_FORMULA,
    ]);
    expect(lessonFormulaHtml(lesson)).toEqual([UNSAFE_FORMULA, UNSAFE_FORMULA, UNSAFE_FORMULA]);
    expect(stages[0].currentSceneId).toBe(lesson.scenes[0].id);
  });

  it('normalizes legacy loads, scene reads and thumbnails while retaining old data on disk', async () => {
    const lesson = seedLegacyRecords();
    const loaded = (await loadStageData(lesson.id))!;
    expect(lessonFormulaHtml(loaded)).toEqual([SAFE_FORMULA, SAFE_FORMULA, SAFE_FORMULA]);
    const readScenes = await getScenesByStageId(lesson.id);
    expect(lessonFormulaHtml({ stage: loaded.stage, scenes: readScenes })).toEqual([
      SAFE_FORMULA,
      SAFE_FORMULA,
      SAFE_FORMULA,
    ]);
    const thumbnail = (await getFirstSlideByStages([lesson.id]))[lesson.id];
    expect((thumbnail.elements[0] as PPTLatexElement).html).toBe(SAFE_FORMULA);
    expect(lessonFormulaHtml({ stage: stages[0], scenes })).toEqual([
      UNSAFE_FORMULA,
      UNSAFE_FORMULA,
      UNSAFE_FORMULA,
    ]);
  });

  it('sanitizes backup export and restore with no changes to unrelated backup tables', async () => {
    const lesson = seedLegacyRecords();
    const backup = await exportDatabase();
    expect(lessonFormulaHtml({ stage: backup.stages[0], scenes: backup.scenes })).toEqual([
      SAFE_FORMULA,
      SAFE_FORMULA,
      SAFE_FORMULA,
    ]);
    expect(backup.chatSessions).toEqual([]);
    expect(backup.playbackState).toEqual([]);

    const imported = { stages: structuredClone(stages), scenes: structuredClone(scenes) };
    await importDatabase(imported);
    expect(lessonFormulaHtml({ stage: stages[0], scenes })).toEqual([
      SAFE_FORMULA,
      SAFE_FORMULA,
      SAFE_FORMULA,
    ]);
    expect(lessonFormulaHtml({ stage: imported.stages[0], scenes: imported.scenes })).toEqual([
      UNSAFE_FORMULA,
      UNSAFE_FORMULA,
      UNSAFE_FORMULA,
    ]);
    expect(stages[0].id).toBe(lesson.id);
    expect(db.transaction).toHaveBeenCalledWith(
      'rw',
      [db.stages, db.scenes, db.chatSessions, db.playbackState],
      expect.any(Function),
    );
  });
});
