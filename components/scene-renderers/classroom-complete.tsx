'use client';

import { useEffect, useMemo, useRef } from 'react';
import { FileText, HelpCircle, MonitorPlay, Puzzle, Trophy } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store';
import { summarizeScenes } from '@/lib/classroom/complete-summary';
import { readAnswersForSummary } from '@/lib/quiz/persistence';
import type { Scene, SceneType } from '@/lib/types/stage';

const sceneTypeIcons: Record<SceneType, typeof FileText> = {
  slide: FileText,
  quiz: HelpCircle,
  interactive: MonitorPlay,
  pbl: Puzzle,
};

export function ClassroomCompletePage({
  scenes,
  title,
  onReviewScene,
}: {
  readonly scenes: Scene[];
  readonly title: string;
  readonly onReviewScene?: (sceneId: string) => void;
}) {
  const { t } = useI18n();
  const heading = useRef<HTMLHeadingElement>(null);
  const summary = useMemo(() => summarizeScenes(scenes, readAnswersForSummary), [scenes]);
  const ordered = useMemo(() => [...scenes].sort((a, b) => a.order - b.order), [scenes]);
  const firstQuiz = ordered.find((scene) => scene.type === 'quiz');
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section
      data-testid="classroom-completion"
      className="h-full overflow-y-auto overscroll-contain bg-gradient-to-br from-amber-50 via-white to-sky-50 p-4 dark:from-gray-950 dark:via-gray-900 dark:to-slate-950 sm:p-6"
    >
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-amber-100 bg-white p-5 dark:border-amber-900/40 dark:bg-gray-900 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            <Trophy className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2
              ref={heading}
              tabIndex={-1}
              className="text-2xl font-bold text-slate-950 outline-none dark:text-white"
            >
              {t('classroom.completion.title')}
            </h2>
            <p className="mt-1 break-words font-medium text-slate-700 dark:text-slate-200">
              {title}
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {t('classroom.completion.subtitle')}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">
              {t('classroom.completion.contents')}
            </h3>
            <dl className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              {Object.entries(summary.countsByType).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between gap-3">
                  <dt>{t(`classroom.completion.types.${type}`)}</dt>
                  <dd className="font-semibold tabular-nums">{count}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
            <h3 className="font-semibold text-amber-900 dark:text-amber-200">
              {t('classroom.completion.quizScore')}
            </h3>
            {summary.quiz ? (
              <>
                <p className="mt-3 text-4xl font-bold text-amber-800 dark:text-amber-300">
                  {summary.quiz.pct}%
                </p>
                <p className="mt-2 text-sm text-amber-900 dark:text-amber-200">
                  {t('classroom.completion.scoreDetail', {
                    correct: summary.quiz.correct,
                    total: summary.quiz.total,
                  })}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-amber-900 dark:text-amber-200">
                {t('classroom.completion.noQuiz')}
              </p>
            )}
          </div>
        </div>

        {onReviewScene ? (
          <>
            <div className="mt-5 flex flex-wrap gap-3">
              {firstQuiz ? (
                <button
                  type="button"
                  onClick={() => onReviewScene(firstQuiz.id)}
                  className="min-h-11 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                >
                  {t('classroom.completion.reviewQuiz')}
                </button>
              ) : null}
              {ordered[0] ? (
                <button
                  type="button"
                  onClick={() => onReviewScene(ordered[0].id)}
                  className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {t('classroom.completion.reviewStart')}
                </button>
              ) : null}
            </div>
            <h3 className="mt-6 font-semibold text-slate-800 dark:text-slate-100">
              {t('classroom.completion.revisit')}
            </h3>
            <ol className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
              {ordered.map((scene, index) => {
                const Icon = sceneTypeIcons[scene.type];
                return (
                  <li key={scene.id}>
                    <button
                      type="button"
                      onClick={() => onReviewScene(scene.id)}
                      className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <span className="tabular-nums text-slate-500 dark:text-slate-400">
                        {index + 1}
                      </span>
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 break-words">{scene.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        ) : null}
      </div>
    </section>
  );
}

export function ClassroomCompletePageConnected({
  onReviewScene,
}: {
  readonly onReviewScene?: (sceneId: string) => void;
}) {
  const stage = useStageStore((s) => s.stage);
  const scenes = useStageStore((s) => s.scenes);
  return (
    <ClassroomCompletePage
      scenes={scenes}
      title={stage?.name ?? ''}
      onReviewScene={onReviewScene}
    />
  );
}
