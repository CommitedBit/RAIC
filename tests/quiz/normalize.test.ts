import { describe, expect, it } from 'vitest';
import { normalizeQuizQuestion, normalizeQuizScenes } from '@/lib/quiz/normalize';
import type { QuizQuestion } from '@/lib/types/stage';
import { quizLesson } from '../support/quiz-lesson';

const base: QuizQuestion = {
  id: 'q',
  type: 'single',
  question: 'Choose',
  options: [
    { value: 'A', label: '(6, 2)' },
    { value: 'B', label: '(2, -4)' },
  ],
  answer: ['A'],
};

describe('choice answer normalization', () => {
  it.each(['answer', 'correctAnswer', 'correct_answer'])(
    'accepts %s with an exact label',
    (field) => {
      const q = { ...base, answer: undefined, [field]: '(6, 2)' };
      expect(normalizeQuizQuestion(q)).toMatchObject({
        answer: ['A'],
        hasAnswer: true,
        answerKeyIssue: undefined,
      });
    },
  );
  it('normalizes string options and unordered multiple answers without mutating input', () => {
    const q = {
      ...base,
      type: 'multiple',
      options: ['first', 'second'],
      answer: ['second', 'first'],
    } as unknown as QuizQuestion;
    expect(normalizeQuizQuestion(q)).toMatchObject({
      options: [
        { value: 'A', label: 'first' },
        { value: 'B', label: 'second' },
      ],
      answer: ['A', 'B'],
    });
    expect(q.options).toEqual(['first', 'second']);
  });
  it('accepts agreement among aliases and trims selection identifiers', () => {
    expect(
      normalizeQuizQuestion({
        ...base,
        options: [
          { value: ' A ', label: '(6, 2)' },
          { value: 'B', label: 'other' },
        ],
        answer: [' A '],
        correct_answer: '(6, 2)',
      } as QuizQuestion),
    ).toMatchObject({ answer: ['A'], answerKeyIssue: undefined });
  });
  it.each([
    [{ answer: undefined }, 'missing_answer'],
    [{ answer: [] }, 'missing_answer'],
    [{ answer: ['A', 'B'] }, 'invalid_answer_count'],
    [{ answer: ['(6,2)'] }, 'unknown_answer'],
    [{ answer: ['A,B'] }, 'unknown_answer'],
    [{ answer: ['a'] }, 'unknown_answer'],
    [{ answer: ['A'], correctAnswer: 'B' }, 'conflicting_answers'],
    [
      {
        options: [
          { value: 'A', label: 'same' },
          { value: 'B', label: 'same' },
        ],
        answer: ['same'],
      },
      'ambiguous_answer',
    ],
    [
      {
        options: [
          { value: 'A', label: 'other' },
          { value: 'B', label: 'A' },
        ],
        answer: ['A'],
      },
      'ambiguous_answer',
    ],
    [
      {
        options: [
          { value: ' A ', label: 'x' },
          { value: 'A', label: 'y' },
        ],
      },
      'invalid_options',
    ],
    [
      {
        options: [
          { value: '', label: 'x' },
          { value: 'B', label: 'y' },
        ],
      },
      'invalid_options',
    ],
    [{ options: [{ value: 'A', label: 'x' }] }, 'invalid_options'],
    [{ type: 'unknown' }, 'unsupported_type'],
  ] as const)('keeps %j ungraded with %s across repeated normalization', (patch, issue) => {
    const input = { ...base, ...patch } as QuizQuestion;
    const normalized = normalizeQuizQuestion(input);
    expect(normalized).toMatchObject({ hasAnswer: false, answerKeyIssue: issue });
    expect(normalizeQuizQuestion(normalized)).toEqual(normalized);
    expect(normalized.answer).toEqual(input.answer);
  });
  it('keeps legacy answer evidence and unrelated scene data intact', () => {
    const original = quizLesson().scenes;
    const normalized = normalizeQuizScenes(original);
    expect(normalized[0].content).toMatchObject({
      questions: [
        { id: 'vector', answer: ['A'], answerKeyIssue: undefined },
        { id: 'ambiguous', answer: ['same'], answerKeyIssue: 'ambiguous_answer' },
      ],
    });
    expect(normalizeQuizScenes(normalized)).toEqual(normalized);
    expect(original[0].content).toMatchObject({
      questions: [{ answer: ['(6, 2)'] }, { answer: ['same'] }],
    });
  });
});
