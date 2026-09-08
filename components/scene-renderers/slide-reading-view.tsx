'use client';

import { useMemo } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useMediaStageId } from '@/lib/contexts/media-stage-context';
import { isMediaPlaceholder, useMediaGenerationStore } from '@/lib/store/media-generation';
import type { PPTElement, PPTLatexElement, Slide } from '@/lib/types/slides';
import {
  preservesPlainTextLineBreaks,
  sanitizeSlideReadingHtml,
} from '@/lib/utils/sanitize-slide-html';
import { sanitizeLatexHtml } from '@/lib/utils/sanitize-latex-html';
import { renderLatexToHtml } from '@/lib/quiz/math-text';

function ReadingText({ content, heading = false }: { content: string; heading?: boolean }) {
  const html = useMemo(() => sanitizeSlideReadingHtml(content), [content]);
  return (
    <div
      role={heading ? 'heading' : undefined}
      aria-level={heading ? 2 : undefined}
      className={heading ? 'text-2xl font-bold leading-snug' : undefined}
      style={{ whiteSpace: preservesPlainTextLineBreaks(content) ? 'pre-line' : undefined }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ReadingFormula({ element }: { element: PPTLatexElement }) {
  const html = useMemo(
    () => sanitizeLatexHtml(renderLatexToHtml(element.latex, true) ?? element.html ?? ''),
    [element.latex, element.html],
  );
  return html ? (
    <div className="max-w-full overflow-x-auto py-2" role="math" aria-label={element.latex}>
      <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  ) : (
    <p className="whitespace-pre-wrap font-mono">{element.latex}</p>
  );
}

type MediaElement = Extract<PPTElement, { type: 'image' | 'audio' | 'video' }>;

function ReadingMedia({ element, index }: { element: MediaElement; index: number }) {
  const { t } = useI18n();
  const stageId = useMediaStageId();
  const placeholder = isMediaPlaceholder(element.src);
  const task = useMediaGenerationStore((state) => {
    const candidate = placeholder ? state.tasks[element.src] : undefined;
    return candidate?.stageId === stageId ? candidate : undefined;
  });
  // Reading existing media never schedules a generation or retry.
  const src = placeholder ? (task?.status === 'done' ? task.objectUrl : null) : element.src;
  if (!src)
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {t('classroom.reading.mediaUnavailable')}
      </p>
    );
  const label = t(`classroom.reading.${element.type}`, { number: index + 1 });
  return (
    <figure className="space-y-2">
      {element.type === 'image' ? (
        <img src={src} alt={label} className="mx-auto max-h-[60dvh] max-w-full object-contain" />
      ) : element.type === 'video' ? (
        <video
          src={src}
          controls
          preload="metadata"
          aria-label={label}
          className="max-h-[60dvh] w-full"
        />
      ) : (
        <audio src={src} controls preload="metadata" aria-label={label} className="w-full" />
      )}
      <figcaption className="text-sm text-slate-500 dark:text-slate-400">{label}</figcaption>
    </figure>
  );
}

export function SlideReadingView({ canvas, title }: { canvas: Slide; title: string }) {
  const { t } = useI18n();
  const elements = useMemo(
    () => [...canvas.elements].sort((a, b) => a.top - b.top || a.left - b.left),
    [canvas.elements],
  );
  return (
    <article
      data-testid="slide-reading-view"
      aria-label={title}
      tabIndex={0}
      className="h-full overflow-y-auto overscroll-contain bg-white px-5 py-6 text-base leading-relaxed text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 dark:bg-slate-900 dark:text-slate-100 sm:px-8"
    >
      <div className="mx-auto max-w-3xl space-y-5 break-words [overflow-wrap:anywhere] [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1">
        {elements.map((element, index) => {
          let content;
          switch (element.type) {
            case 'text':
              content = (
                <ReadingText
                  content={element.content}
                  heading={element.textType === 'title' || element.textType === 'header'}
                />
              );
              break;
            case 'shape':
              if (!element.text?.content) return null;
              content = <ReadingText content={element.text.content} />;
              break;
            case 'latex':
              content = <ReadingFormula element={element} />;
              break;
            case 'table':
              content = (
                <div className="max-w-full overflow-x-auto">
                  <table className="w-full border-collapse text-left text-base">
                    <caption className="sr-only">
                      {t('classroom.reading.table', { number: index + 1 })}
                    </caption>
                    <tbody>
                      {element.data.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {row.map((cell) => (
                            <td
                              key={cell.id}
                              colSpan={cell.colspan}
                              rowSpan={cell.rowspan}
                              className="border border-slate-300 p-2 dark:border-slate-600"
                            >
                              {cell.text}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
              break;
            case 'chart':
              content = (
                <div className="max-w-full overflow-x-auto">
                  <table className="w-full border-collapse text-left text-base">
                    <caption>{t('classroom.reading.chart', { number: index + 1 })}</caption>
                    <thead>
                      <tr>
                        <th scope="col" className="border p-2">
                          {t('classroom.reading.category')}
                        </th>
                        {element.data.legends.map((legend, i) => (
                          <th scope="col" key={i} className="border p-2">
                            {legend}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {element.data.labels.map((label, rowIndex) => (
                        <tr key={rowIndex}>
                          <th scope="row" className="border p-2">
                            {label}
                          </th>
                          {element.data.series.map((series, i) => (
                            <td key={i} className="border p-2">
                              {series[rowIndex] ?? '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
              break;
            case 'image':
            case 'video':
            case 'audio':
              content = <ReadingMedia element={element} index={index} />;
              break;
            default:
              return null;
          }
          return (
            <div key={element.id} data-reading-element-id={element.id}>
              {content}
            </div>
          );
        })}
        <p className="border-t border-slate-200 pt-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {t('classroom.reading.layoutNote')}
        </p>
      </div>
    </article>
  );
}
