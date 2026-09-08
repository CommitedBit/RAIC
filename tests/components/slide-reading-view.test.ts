// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultSlideContent } from '@/lib/api/stage-api-defaults';
import type { PPTElement } from '@/lib/types/slides';
import { SlideReadingView } from '@/components/scene-renderers/slide-reading-view';

vi.mock('@/lib/hooks/use-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/contexts/media-stage-context', () => ({ useMediaStageId: () => 'reading-lesson' }));
const tasks: Record<string, unknown> = {};
vi.mock('@/lib/store/media-generation', () => ({
  isMediaPlaceholder: (src: string) => src.startsWith('pending:'),
  useMediaGenerationStore: (select: (state: unknown) => unknown) => select({ tasks }),
}));

const box = { left: 0, top: 0, width: 400, height: 100, rotate: 0 };
function render(elements: PPTElement[]) {
  const html = renderToStaticMarkup(
    createElement(SlideReadingView, {
      canvas: { ...createDefaultSlideContent().canvas, elements },
      title: 'Reading test',
    }),
  );
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return { html, doc };
}

describe('slide reading view', () => {
  it('reflows prose and shape text in spatial order without executable or tiny styled content', () => {
    const { doc } = render([
      {
        ...box,
        id: 'second',
        type: 'shape',
        top: 100,
        viewBox: [400, 100],
        path: '',
        fill: 'white',
        fixedRatio: false,
        text: {
          content: 'Second line\nAnother line',
          align: 'middle',
          defaultColor: '#333',
          defaultFontName: 'Arial',
        },
      },
      {
        ...box,
        id: 'first',
        type: 'text',
        content:
          '<p style="font-size:2px;color:white" onclick="void(0)"><strong>Readable</strong><img src=x onerror="void(0)"></p><script>unsafe()</script>',
        defaultColor: '#333',
        defaultFontName: 'Arial',
      },
    ]);
    expect(
      [...doc.querySelectorAll('[data-reading-element-id]')].map((e) =>
        e.getAttribute('data-reading-element-id'),
      ),
    ).toEqual(['first', 'second']);
    expect(doc.querySelector('strong')?.textContent).toBe('Readable');
    expect(doc.querySelector('script, img, [onclick], [onerror], p[style]')).toBeNull();
    expect(
      doc.querySelector('[data-reading-element-id="second"] > div')?.getAttribute('style'),
    ).toContain('white-space:pre-line');
  });

  it('renders formulas safely and keeps table strings escaped', () => {
    const { doc } = render([
      { ...box, id: 'formula', type: 'latex', latex: 'x^2', html: '<img src=x onerror="void(0)">' },
      {
        ...box,
        id: 'bad-formula',
        top: 50,
        type: 'latex',
        latex: '\\notARealCommand',
        html: '<img src=x onerror="void(0)"><script>unsafe()</script><span>Formula unavailable</span>',
      },
      {
        ...box,
        id: 'table',
        top: 200,
        type: 'table',
        outline: { style: 'solid', color: '#333', width: 1 },
        colWidths: [1],
        cellMinHeight: 24,
        data: [[{ id: 'cell', colspan: 1, rowspan: 1, text: '<img src=x onerror="void(0)">' }]],
      },
    ]);
    expect(doc.querySelector('.katex')).not.toBeNull();
    expect(doc.querySelector('[role="math"]')?.getAttribute('aria-label')).toBe('x^2');
    expect(doc.querySelector('td')?.textContent).toBe('<img src=x onerror="void(0)">');
    expect(doc.querySelector('img, script, [onerror]')).toBeNull();
  });

  it('makes chart values readable and uses only ready media from the current classroom', () => {
    tasks['pending:other'] = { stageId: 'another-lesson', status: 'done', objectUrl: 'blob:other' };
    tasks['pending:ready'] = { stageId: 'reading-lesson', status: 'done', objectUrl: 'blob:ready' };
    const { doc } = render([
      {
        ...box,
        id: 'chart',
        type: 'chart',
        chartType: 'bar',
        themeColors: ['#333'],
        data: { labels: ['Monday', 'Tuesday'], legends: ['Class A'], series: [[12, 19]] },
      },
      {
        ...box,
        id: 'cross-stage',
        top: 100,
        type: 'image',
        src: 'pending:other',
        fixedRatio: true,
      },
      { ...box, id: 'ready', top: 200, type: 'image', src: 'pending:ready', fixedRatio: true },
    ]);
    expect(doc.querySelector('table')?.textContent).toContain('Tuesday19');
    expect([...doc.querySelectorAll('img')].map((el) => el.getAttribute('src'))).toEqual([
      'blob:ready',
    ]);
    expect(doc.body.textContent).toContain('classroom.reading.mediaUnavailable');
  });
});
