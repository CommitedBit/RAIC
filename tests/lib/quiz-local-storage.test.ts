import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  db,
  exportDatabase,
  importDatabase,
  getScenesByStageId,
  type SceneRecord,
} from '@/lib/utils/database';
import { loadStageData, saveStageData } from '@/lib/utils/stage-storage';
import { quizLesson } from '../support/quiz-lesson';

vi.mock('@/lib/utils/chat-storage', () => ({
  saveChatSessions: vi.fn(async () => undefined),
  loadChatSessions: vi.fn(async () => []),
}));

describe('local quiz import and persistence', () => {
  let scenes: SceneRecord[];
  beforeEach(() => {
    const input = quizLesson();
    scenes = input.scenes.map((scene) => ({
      ...structuredClone(scene),
      createdAt: 1,
      updatedAt: 1,
    }));
    vi.spyOn(db.stages, 'get').mockImplementation(() => Dexie.Promise.resolve(input.stage));
    vi.spyOn(db.stages, 'put').mockImplementation(() => Dexie.Promise.resolve(input.id));
    vi.spyOn(db.stages, 'toArray').mockImplementation(() => Dexie.Promise.resolve([input.stage]));
    vi.spyOn(db.scenes, 'toArray').mockImplementation(() =>
      Dexie.Promise.resolve(structuredClone(scenes)),
    );
    vi.spyOn(db.scenes, 'bulkPut').mockImplementation((next) => {
      scenes = next.map((scene) => ({ ...structuredClone(scene), id: scene.id! }));
      return Dexie.Promise.resolve(scenes.at(-1)?.id ?? '');
    });
    vi.spyOn(db.scenes, 'where').mockImplementation(
      () =>
        ({
          equals: () => ({
            sortBy: async () => structuredClone(scenes),
            delete: async () => {
              scenes = [];
              return 0;
            },
          }),
        }) as never,
    );
    vi.spyOn(db.chatSessions, 'toArray').mockResolvedValue([]);
    vi.spyOn(db.playbackState, 'toArray').mockResolvedValue([]);
    vi.spyOn(db, 'transaction').mockImplementation((...args: unknown[]) =>
      Dexie.Promise.resolve((args.at(-1) as () => Promise<void>)()),
    );
  });
  afterEach(() => vi.restoreAllMocks());
  function expectKeys(actual: SceneRecord[]) {
    expect(actual[0].content).toMatchObject({
      questions: [{ answer: ['A'] }, { answer: ['same'], answerKeyIssue: 'ambiguous_answer' }],
    });
  }
  it('normalizes legacy reads and saves without changing the source input', async () => {
    const input = quizLesson();
    const loaded = (await loadStageData(input.id))!;
    expect(loaded.scenes[0].content).toMatchObject({
      questions: [{ answer: ['A'] }, { answerKeyIssue: 'ambiguous_answer' }],
    });
    expectKeys(await getScenesByStageId(input.id));
    await saveStageData(input.id, { ...input, currentSceneId: input.scenes[0].id, chats: [] });
    expectKeys(scenes);
    expect(input.scenes[0].content).toMatchObject({
      questions: [{ answer: ['(6, 2)'] }, { answer: ['same'] }],
    });
  });
  it('normalizes backup export and import while retaining the unmodified imported object', async () => {
    const input = structuredClone(scenes);
    expectKeys((await exportDatabase()).scenes);
    await importDatabase({ scenes: input });
    expectKeys(scenes);
    expect(input[0].content).toMatchObject({
      questions: [{ answer: ['(6, 2)'] }, { answer: ['same'] }],
    });
  });
});
