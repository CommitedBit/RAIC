import { describe, expect, it } from 'vitest';

import {
  isLikelyStandaloneMathText,
  parseQuizMathText,
  renderLatexToHtml,
  renderQuizMathText,
} from '@/lib/quiz/math-text';

describe('quiz math text', () => {
  it('renders explicit inline and display formulas', () => {
    const inline = parseQuizMathText('Solve $x^2=4$ now.');
    const display = parseQuizMathText('$$\\frac{1}{2}$$');

    expect(inline.some((segment) => segment.type === 'math' && !segment.displayMode)).toBe(true);
    expect(display).toMatchObject([{ type: 'math', displayMode: true }]);
  });

  it('does not treat currency or escaped delimiters as formulas', () => {
    expect(renderQuizMathText('The book costs $12 today.')).toEqual([
      { type: 'text', value: 'The book costs $12 today.' },
    ]);
    expect(renderQuizMathText('Use \\$x instead.')).toEqual([
      { type: 'text', value: 'Use \\$x instead.' },
    ]);
  });

  it('falls back to source text when KaTeX cannot parse a formula', () => {
    expect(parseQuizMathText('Try $\\notacommand{$ here.')).toEqual([
      { type: 'text', value: 'Try $\\notacommand{$ here.' },
    ]);
    expect(renderLatexToHtml('\\notacommand{')).toBeNull();
  });

  it('recognizes delimiter-free standalone algebra without mistaking prose for math', () => {
    expect(isLikelyStandaloneMathText('x^2 + y^2 = 25')).toBe(true);
    expect(renderQuizMathText('x^2 + y^2 = 25').some((segment) => segment.type === 'math')).toBe(
      true,
    );
    expect(renderQuizMathText('Please explain your answer.')).toEqual([
      { type: 'text', value: 'Please explain your answer.' },
    ]);
    expect(renderQuizMathText('enabled = true')).toEqual([
      { type: 'text', value: 'enabled = true' },
    ]);
  });

  it('renders embedded algebra and literal percent formulas while preserving prose', () => {
    const embedded = renderQuizMathText('Use x^2+y^2=25 to find the radius.');
    const percent = renderQuizMathText('25%*4 = 100%');

    expect(embedded[0]).toEqual({ type: 'text', value: 'Use ' });
    expect(embedded.some((segment) => segment.type === 'math')).toBe(true);
    expect(embedded.at(-1)).toEqual({ type: 'text', value: ' to find the radius.' });
    expect(percent.some((segment) => segment.type === 'math')).toBe(true);
  });
});
