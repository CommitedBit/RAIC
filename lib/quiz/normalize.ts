import type { QuizAnswerKeyIssue, QuizOption, QuizQuestion, Scene } from '@/lib/types/stage';

function scalar(value: unknown): string | null {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function normalizeOptions(input: unknown): { options: QuizOption[]; valid: boolean } {
  if (!Array.isArray(input)) return { options: [], valid: false };
  let valid = input.length >= 2;
  const values = new Set<string>();
  const options = input.map((item, index) => {
    const fallback = String.fromCharCode(65 + index);
    const object = typeof item === 'object' && item !== null ? item : null;
    const value = object && 'value' in object ? scalar(object.value) : fallback;
    const label =
      typeof item === 'string'
        ? item
        : object && 'label' in object
          ? scalar(object.label)
          : object && 'text' in object
            ? scalar(object.text)
            : null;
    if (!value || !label?.trim() || values.has(value)) valid = false;
    values.add(value ?? '');
    return { value: value ?? '', label: label ?? '' };
  });
  return { options, valid };
}

type ResolvedKey =
  | { answer: string[]; issue?: undefined }
  | { answer?: undefined; issue: QuizAnswerKeyIssue };

function resolveKey(raw: unknown, options: QuizOption[], type: QuizQuestion['type']): ResolvedKey {
  const tokens = Array.isArray(raw) ? raw : [raw];
  if (tokens.length === 0) return { issue: 'missing_answer' };
  const selected = new Set<string>();
  for (const token of tokens) {
    const text = scalar(token);
    if (!text) return { issue: 'missing_answer' };
    // Exact identifiers and exact labels must point to the same unique option.
    // Do not split punctuation, strip math notation, or guess from fuzzy text.
    const candidates = options.filter(
      (option) => option.value === text || option.label.trim() === text,
    );
    if (candidates.length === 0) return { issue: 'unknown_answer' };
    if (candidates.length !== 1) return { issue: 'ambiguous_answer' };
    selected.add(candidates[0].value);
  }
  if (type === 'single' && selected.size !== 1) return { issue: 'invalid_answer_count' };
  return {
    answer: options.filter((option) => selected.has(option.value)).map((option) => option.value),
  };
}

/** Preserve unsupported keys for teacher correction; only proven keys become IDs. */
export function normalizeQuizQuestion(question: QuizQuestion): QuizQuestion {
  if (question.type === 'short_answer' || (question.type as string) === 'text') {
    return { ...question, type: 'short_answer', hasAnswer: false, answerKeyIssue: undefined };
  }
  const { options, valid } = normalizeOptions(question.options);
  const reject = (issue: QuizAnswerKeyIssue): QuizQuestion => ({
    ...question,
    options,
    hasAnswer: false,
    answerKeyIssue: issue,
  });
  if (question.type !== 'single' && question.type !== 'multiple') return reject('unsupported_type');
  if (!valid) return reject('invalid_options');
  const source = question as unknown as Record<string, unknown>;
  const rawKeys = [source.answer, source.correctAnswer, source.correct_answer].filter(
    (value) => value !== undefined && value !== null,
  );
  if (rawKeys.length === 0) return reject('missing_answer');
  let answer: string[] | undefined;
  for (const raw of rawKeys) {
    const resolved = resolveKey(raw, options, question.type);
    if (resolved.issue) return reject(resolved.issue);
    if (answer && JSON.stringify(answer) !== JSON.stringify(resolved.answer))
      return reject('conflicting_answers');
    answer = resolved.answer;
  }
  const canonical = { ...question } as QuizQuestion & {
    correctAnswer?: unknown;
    correct_answer?: unknown;
  };
  delete canonical.correctAnswer;
  delete canonical.correct_answer;
  return { ...canonical, options, answer, hasAnswer: true, answerKeyIssue: undefined };
}

export function normalizeQuizQuestions(questions: QuizQuestion[]): QuizQuestion[] {
  return questions.map(normalizeQuizQuestion);
}

/** Shared save/import/read boundary. Other lesson content is left intact. */
export function normalizeQuizScene<T extends Pick<Scene, 'type' | 'content'>>(scene: T): T {
  if (
    scene.type !== 'quiz' ||
    !scene.content ||
    !('questions' in scene.content) ||
    !Array.isArray(scene.content.questions)
  )
    return scene;
  return {
    ...scene,
    content: { ...scene.content, questions: normalizeQuizQuestions(scene.content.questions) },
  };
}

export function normalizeQuizScenes<T extends Pick<Scene, 'type' | 'content'>>(scenes: T[]): T[] {
  return scenes.map(normalizeQuizScene);
}
