import { describe, expect, it } from 'vitest';

import { generateSceneActions, generateSceneContent } from '@/lib/generation/scene-generator';
import type { SceneOutline } from '@/lib/types/generation';

const slideOutline: SceneOutline = {
  id: 'scene-1',
  type: 'slide',
  title: 'Agency Before Assistance',
  description: 'Introduce governed AI use as a classroom practice scaffold.',
  keyPoints: ['Baseline intention', 'Verification checkpoint', 'No-AI transfer'],
  order: 1,
  language: 'en-US',
  experiencePreset: 'governed-co-thinking',
};

describe('governed-co-thinking preset scene prompts', () => {
  it('passes agency practice context into slide content and action prompts', async () => {
    const contentCalls: Array<{ system: string; user: string }> = [];
    const content = await generateSceneContent(slideOutline, async (system, user) => {
      contentCalls.push({ system, user });
      return JSON.stringify({
        background: { type: 'solid', color: '#ffffff' },
        elements: [
          {
            id: 'title',
            type: 'text',
            left: 60,
            top: 60,
            width: 800,
            height: 70,
            content: '<p style="font-size:32px;"><strong>Agency Before Assistance</strong></p>',
            defaultFontName: '',
            defaultColor: '#111827',
          },
        ],
      });
    });

    expect(content).not.toBeNull();
    expect(contentCalls[0]?.user).toContain('Governed Co-Thinking Practice Mode');
    expect(contentCalls[0]?.user).toContain('pre-empirical practice scaffold');
    expect(contentCalls[0]?.user).toContain('no-AI transfer task');

    const actionCalls: Array<{ system: string; user: string }> = [];
    await generateSceneActions(slideOutline, content!, async (system, user) => {
      actionCalls.push({ system, user });
      return JSON.stringify([
        { type: 'text', content: 'Write your intention before asking the model.' },
      ]);
    });

    expect(actionCalls[0]?.user).toContain('Governed Co-Thinking Practice Mode');
    expect(actionCalls[0]?.user).toContain('Do not score students with AUI');
  });

  it('passes agency practice context into quiz content prompts', async () => {
    const quizOutline: SceneOutline = {
      ...slideOutline,
      id: 'quiz-1',
      type: 'quiz',
      title: 'Transfer Check',
      quizConfig: {
        questionCount: 2,
        difficulty: 'medium',
        questionTypes: ['single', 'text'],
      },
    };
    const calls: Array<{ system: string; user: string }> = [];

    const content = await generateSceneContent(quizOutline, async (system, user) => {
      calls.push({ system, user });
      return JSON.stringify([
        {
          id: 'q1',
          type: 'text',
          question: 'What can you now do without AI support?',
          correctAnswer: 'State an independent transfer step.',
        },
      ]);
    });

    expect(content).not.toBeNull();
    expect(calls[0]?.user).toContain('Governed Co-Thinking Practice Mode');
    expect(calls[0]?.user).toContain('agency-oriented check-for-understanding');
    expect(calls[0]?.user).toContain('Avoid named student portfolios');
  });
});
