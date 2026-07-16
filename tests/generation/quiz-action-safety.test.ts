import { describe, expect, it } from 'vitest';

import { generateSceneActions } from '@/lib/generation/scene-generator';
import type { GeneratedQuizContent, SceneOutline } from '@/lib/types/generation';

const outline: SceneOutline = {
  id: 'quiz-1',
  type: 'quiz',
  title: 'Independent Checkpoint',
  description: 'DISTINCTIVE_CONCEPT_DESCRIPTION',
  keyPoints: ['DISTINCTIVE_KEY_POINT'],
  order: 2,
  language: 'en-US',
  quizConfig: {
    questionCount: 2,
    difficulty: 'medium',
    questionTypes: ['single', 'text'],
  },
};

const content: GeneratedQuizContent = {
  questions: [
    {
      id: 'q1',
      type: 'single',
      question: 'DISTINCTIVE_SECRET_STEM',
      options: [
        { value: 'A', label: 'DISTINCTIVE_WRONG_OPTION' },
        { value: 'B', label: 'DISTINCTIVE_CORRECT_OPTION' },
      ],
      answer: ['B'],
      analysis: 'DISTINCTIVE_ANSWER_EXPLANATION',
    },
    {
      id: 'q2',
      type: 'short_answer',
      question: 'DISTINCTIVE_SHORT_ANSWER_STEM',
      commentPrompt: 'DISTINCTIVE_GRADING_GUIDANCE',
    },
  ],
};

describe('quiz action safety', () => {
  it('uses metadata-only prompts and enforces brief speech-only output', async () => {
    let capturedSystem = '';
    let capturedUser = '';

    const actions = await generateSceneActions(outline, content, async (system, user) => {
      capturedSystem = system;
      capturedUser = user;
      return JSON.stringify([
        { type: 'text', content: 'Try the checkpoint independently.' },
        { type: 'text', content: 'Submit when you are ready.' },
        { type: 'text', content: 'This third segment must be removed.' },
        {
          type: 'action',
          name: 'discussion',
          params: { topic: 'DISTINCTIVE_SECRET_STEM' },
        },
      ]);
    });

    expect(capturedSystem).toContain('Never reveal, eliminate, compare, or hint at an answer');
    expect(capturedSystem).toContain('Never emit `type:"action"`');
    expect(capturedUser).toContain('Question count: 2');
    expect(capturedUser).toContain('single: 1');
    expect(capturedUser).toContain('short_answer: 1');
    expect(capturedUser).not.toContain('DISTINCTIVE_SECRET_STEM');
    expect(capturedUser).not.toContain('DISTINCTIVE_SHORT_ANSWER_STEM');
    expect(capturedUser).not.toContain('DISTINCTIVE_WRONG_OPTION');
    expect(capturedUser).not.toContain('DISTINCTIVE_CORRECT_OPTION');
    expect(capturedUser).not.toContain('DISTINCTIVE_ANSWER_EXPLANATION');
    expect(capturedUser).not.toContain('DISTINCTIVE_GRADING_GUIDANCE');
    expect(capturedUser).not.toContain('DISTINCTIVE_CONCEPT_DESCRIPTION');
    expect(capturedUser).not.toContain('DISTINCTIVE_KEY_POINT');
    expect(actions).toHaveLength(2);
    expect(actions.map((action) => action.type)).toEqual(['speech', 'speech']);
  });
});
