import { describe, expect, it } from 'vitest';
import { gradeChoiceQuestions, isShortAnswer, reconcileQuizResults } from '@/lib/quiz/grading';
import type { QuizQuestion } from '@/lib/types/stage';

describe('legacy choice grading', () => {
  it('leaves an ambiguous answer key ungraded', () => {
    const question = {
      id: 'q',
      type: 'single',
      question: 'Choose',
      options: [
        { value: 'A', label: 'same' },
        { value: 'B', label: 'same' },
      ],
      answer: ['same'],
      points: 2,
    } satisfies QuizQuestion;
    expect(gradeChoiceQuestions([question], { q: 'A' })[0]).toMatchObject({
      correct: null,
      status: 'ungraded',
      earned: 0,
    });
  });
  it('does not send a missing choice key to short-answer AI grading', () => {
    expect(isShortAnswer({ id: 'q', type: 'single', question: 'Choose', hasAnswer: false })).toBe(
      false,
    );
  });
  it('grades correct and incorrect multiple selections by their complete option set', () => {
    const question: QuizQuestion = {
      id: 'q',
      type: 'multiple',
      question: 'Choose',
      options: [
        { value: 'A', label: 'first' },
        { value: 'B', label: 'second' },
        { value: 'C', label: 'third' },
      ],
      answer: ['first', 'third'],
      points: 3,
    };
    expect(gradeChoiceQuestions([question], { q: ['C', ' A '] })[0]).toMatchObject({
      correct: true,
      earned: 3,
    });
    for (const selected of [[], ['A'], ['A', 'B', 'C'], ['A', 'A', 'C']]) {
      expect(gradeChoiceQuestions([question], { q: selected })[0]).toMatchObject({
        correct: false,
        earned: 0,
      });
    }
  });
  it('preserves valid short-answer feedback and removes old invented fallback credit', () => {
    const questions: QuizQuestion[] = [
      { id: 'saved', type: 'short_answer', question: 'Explain' },
      { id: 'failed', type: 'short_answer', question: 'Explain more' },
    ];
    const results = reconcileQuizResults(questions, {}, [
      {
        questionId: 'saved',
        correct: true,
        status: 'correct',
        earned: 1,
        aiComment: 'Supported explanation.',
      },
      {
        questionId: 'failed',
        correct: null,
        status: 'incorrect',
        earned: 1,
        aiComment: 'Base score given.',
      },
    ]);
    expect(results[0]).toMatchObject({
      correct: true,
      earned: 1,
      aiComment: 'Supported explanation.',
    });
    expect(results[1]).toEqual({
      questionId: 'failed',
      correct: null,
      status: 'ungraded',
      earned: 0,
      reason: 'grading_unavailable',
    });
  });
});
