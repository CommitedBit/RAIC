import { describe, expect, it } from 'vitest';
import { generateSceneContent } from '@/lib/generation/scene-generator';
import { gradeChoiceQuestions } from '@/lib/quiz/grading';
import type { GeneratedQuizContent, SceneOutline } from '@/lib/types/generation';

const outline: SceneOutline = {
  id: 'vector-check',
  type: 'quiz',
  title: 'Vector addition',
  description: 'Add matching coordinates.',
  keyPoints: ['Vector addition'],
  order: 1,
  language: 'en-US',
  quizConfig: { questionCount: 1, difficulty: 'easy', questionTypes: ['single'] },
};

const question = {
  id: 'q1',
  type: 'single',
  question: '(2, 3) + (4, -1) = ?',
  options: [
    { value: 'A', label: '(6, 2)' },
    { value: 'B', label: '(2, -4)' },
  ],
  analysis: 'Add the first coordinates, then the second coordinates.',
};

async function makeQuiz(answer: unknown) {
  return (await generateSceneContent(outline, async () =>
    JSON.stringify([{ ...question, answer }]),
  )) as GeneratedQuizContent | null;
}

describe('generated quiz answer keys', () => {
  it.each(['A', '(6, 2)', ' A '])(
    'grades a correct selection when the key is %j',
    async (answer) => {
      const quiz = await makeQuiz(answer);
      expect(quiz).not.toBeNull();
      expect(gradeChoiceQuestions(quiz!.questions, { q1: 'A' })[0].correct).toBe(true);
    },
  );

  it('rejects an unknown key instead of publishing a misgraded question', async () => {
    expect(await makeQuiz('none of these')).toBeNull();
  });
  it('retains the supported legacy text-question alias as a short answer', async () => {
    const quiz = (await generateSceneContent(outline, async () =>
      JSON.stringify([{ id: 'q1', type: 'text', question: 'Explain your reasoning.' }]),
    )) as GeneratedQuizContent;
    expect(quiz.questions[0]).toMatchObject({ type: 'short_answer', hasAnswer: false });
    expect(gradeChoiceQuestions(quiz.questions, {})).toEqual([]);
  });
  it('rejects repeated question IDs and an empty generated quiz', async () => {
    for (const input of [
      [],
      [
        { ...question, answer: 'A' },
        { ...question, answer: 'B' },
      ],
    ]) {
      expect(await generateSceneContent(outline, async () => JSON.stringify(input))).toBeNull();
    }
  });
});
