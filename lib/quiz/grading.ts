import type { QuizQuestion } from '@/lib/types/stage';
import { normalizeQuizQuestion } from '@/lib/quiz/normalize';

export interface QuestionResult {
  questionId: string;
  correct: boolean | null;
  status: 'correct' | 'incorrect' | 'ungraded';
  earned: number;
  aiComment?: string;
  reason?: 'answer_key' | 'grading_unavailable';
}

export function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export function toArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export function isShortAnswer(q: QuizQuestion): boolean {
  return q.type === 'short_answer' || (q.type as string) === 'text';
}

/** Grade choice questions locally. Returns results only for non-short-answer questions. */
export function gradeChoiceQuestions(
  questions: QuizQuestion[],
  answers: Record<string, string | string[]>,
): QuestionResult[] {
  return questions
    .filter((q) => !isShortAnswer(q))
    .map((source): QuestionResult => {
      const q = normalizeQuizQuestion(source);
      if (q.answerKeyIssue)
        return {
          questionId: q.id,
          correct: null,
          status: 'ungraded',
          earned: 0,
          reason: 'answer_key',
        };
      const pts = q.points ?? 1;
      const userAnswer = toArray(answers[q.id]).map((value) => value.trim());
      const correctAnswer = toArray(q.answer);
      const correct = arraysEqual(userAnswer, correctAnswer);
      return {
        questionId: q.id,
        correct,
        status: correct ? ('correct' as const) : ('incorrect' as const),
        earned: correct ? pts : 0,
      };
    });
}

/** Recalculate legacy choice feedback without repeating billable short-answer grading. */
export function reconcileQuizResults(
  questions: QuizQuestion[],
  answers: Record<string, string | string[]>,
  saved: QuestionResult[],
): QuestionResult[] {
  const choices = new Map(
    gradeChoiceQuestions(questions, answers).map((result) => [result.questionId, result]),
  );
  return questions.map((question): QuestionResult => {
    if (!isShortAnswer(question)) return choices.get(question.id)!;
    const previous = saved.find((result) => result.questionId === question.id);
    if (!previous || previous.correct === null || !Number.isFinite(previous.earned)) {
      return {
        questionId: question.id,
        correct: null,
        status: 'ungraded',
        earned: 0,
        reason: 'grading_unavailable',
      };
    }
    return previous;
  });
}
