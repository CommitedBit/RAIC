import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { BaseLatexElement } from '@/components/slide-renderer/components/element/LatexElement/BaseLatexElement';
import { LatexElement } from '@/components/slide-renderer/components/element/LatexElement';
import type { PPTLatexElement } from '@/lib/types/slides';

function formula(html?: string): PPTLatexElement {
  return {
    id: 'formula',
    type: 'latex',
    latex: 'x',
    html,
    left: 0,
    top: 0,
    width: 320,
    height: 120,
    rotate: 0,
  };
}

describe.each([
  { mode: 'playback', Component: BaseLatexElement },
  { mode: 'editor', Component: LatexElement },
])('$mode formula rendering', ({ Component }) => {
  it('removes active markup from stored or imported HTML at the render sink', () => {
    const markup = renderToStaticMarkup(
      React.createElement(Component, {
        elementInfo: formula('<img src="x" onerror="void 0"><span class="katex">x</span>'),
      }),
    );

    expect(markup).not.toContain('onerror');
    expect(markup).not.toContain('<img');
    expect(markup).toContain('<span class="katex">x</span>');
  });

  it('preserves genuine fractions and SVG radicals', () => {
    const html = katex.renderToString('\\frac{1}{\\sqrt{x^2+1}}', {
      output: 'html',
      displayMode: true,
      trust: false,
    });
    const markup = renderToStaticMarkup(
      React.createElement(Component, { elementInfo: formula(html) }),
    );

    expect(markup).toContain('class="katex"');
    expect(markup).toContain('viewBox=');
    expect(markup).toContain('preserveAspectRatio=');
    expect(markup).toContain('<path d=');
  });

  it('preserves the legacy SVG path fallback', () => {
    const markup = renderToStaticMarkup(
      React.createElement(Component, {
        elementInfo: {
          ...formula(),
          path: 'M 0 0 L 10 10',
          viewBox: [100, 40],
          color: '#123456',
          strokeWidth: 2,
        },
      }),
    );

    expect(markup).toContain('<path d="M 0 0 L 10 10"');
    expect(markup).toContain('stroke="#123456"');
    expect(markup).toContain('stroke-width="2"');
  });
});
