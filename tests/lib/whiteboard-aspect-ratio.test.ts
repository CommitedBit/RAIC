import { describe, expect, it } from 'vitest';
import { createWhiteboardAPI } from '@/lib/api/stage-api-whiteboard';
import { createDefaultSlideContent } from '@/lib/api/stage-api-defaults';
import type { StageStore } from '@/lib/api/stage-api-types';
import type { Stage } from '@/lib/types/stage';

describe('whiteboard creation', () => {
  it('creates a landscape board matching the stage height-over-width convention', () => {
    let stage: Stage | null = {
      id: 'board-lesson',
      name: 'Board lesson',
      createdAt: 1,
      updatedAt: 1,
    };
    const store = {
      getState: () => ({ stage }),
      setState: (updates: { stage?: Stage }) => {
        if (updates.stage) stage = updates.stage;
      },
    } as StageStore;
    const board = createWhiteboardAPI(store).create();
    expect(board.success).toBe(true);
    expect(board.data?.viewportRatio).toBe(0.5625);
    expect(board.data?.viewportRatio).toBe(createDefaultSlideContent().canvas.viewportRatio);
    expect(stage.whiteboard?.[0]).toEqual(board.data);
  });
});
