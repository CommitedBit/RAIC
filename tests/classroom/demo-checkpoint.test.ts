import { describe, expect, it } from 'vitest';
import { buildOpenRaicRitDemoCoursePayload } from '@/lib/data/openraic-rit-demo';
import { normalizeQuizQuestions } from '@/lib/quiz/normalize';
import { gradeChoiceQuestions } from '@/lib/quiz/grading';

describe('built-in demo checkpoint', () => {
  it('contains a locally gradable checkpoint with meaningful explanations', () => {
    const lesson = buildOpenRaicRitDemoCoursePayload(100);
    const quiz = lesson.scenes.find((s) => s.content.type === 'quiz')?.content;
    if (quiz?.type !== 'quiz') throw new Error('Missing demo checkpoint');
    const questions = normalizeQuizQuestions(quiz.questions);
    expect(questions).toHaveLength(2);
    expect(
      questions.every(
        (q) => !q.answerKeyIssue && q.type === 'single' && (q.analysis?.length ?? 0) > 50,
      ),
    ).toBe(true);
    expect(
      gradeChoiceQuestions(questions, { 'demo-band-choice': 'B', 'demo-shared-goal': 'A' }).map(
        (r) => r.correct,
      ),
    ).toEqual([true, true]);
    expect(
      gradeChoiceQuestions(questions, { 'demo-band-choice': 'A', 'demo-shared-goal': 'C' }).map(
        (r) => r.correct,
      ),
    ).toEqual([false, false]);
    expect(lesson.scenes.every((s) => !s.actions?.length)).toBe(true);
  });

  it('isolates each seeded lesson from edits to another copy', () => {
    const first = buildOpenRaicRitDemoCoursePayload(100);
    const quiz = first.scenes.find((s) => s.content.type === 'quiz')?.content;
    if (quiz?.type !== 'quiz') throw new Error('Missing demo checkpoint');
    quiz.questions[0].answer = ['C'];
    const secondQuiz = buildOpenRaicRitDemoCoursePayload(200).scenes.find(
      (s) => s.content.type === 'quiz',
    )?.content;
    expect(secondQuiz?.type === 'quiz' ? secondQuiz.questions[0].answer : null).toEqual(['B']);
  });
});
