import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StaticTable } from '@/components/slide-renderer/components/element/TableElement/StaticTable';
import {
  preservesPlainTextLineBreaks,
  sanitizeSlideHtml,
  sanitizeSlideReadingHtml,
} from '@/lib/utils/sanitize-slide-html';
import { BaseTextElement } from '@/components/slide-renderer/components/element/TextElement/BaseTextElement';
import { BaseShapeElement } from '@/components/slide-renderer/components/element/ShapeElement/BaseShapeElement';

describe('sanitizeSlideHtml', () => {
  it('preserves safe formatting while removing dangerous markup and styles', () => {
    const sanitized = sanitizeSlideHtml(
      '<p onclick="alert(1)" style="color:#ff0000;font-size:24px;position:fixed">' +
        '<strong>Hi</strong><script>alert(1)</script>' +
        '<span style="text-decoration:underline;background-image:url(javascript:alert(1))">there</span>' +
        '</p>',
    );

    expect(sanitized).toContain('<p style="');
    expect(sanitized).toContain('color:#ff0000');
    expect(sanitized).toContain('font-size:24px');
    expect(sanitized).toContain('<strong>Hi</strong>');
    expect(sanitized).not.toContain('onclick');
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('position:fixed');
    expect(sanitized).not.toContain('background-image');
  });

  it('drops xmp raw-text contents instead of rehydrating executable markup', () => {
    const sanitized = sanitizeSlideHtml(
      '<xmp><img src=x onerror=alert(1)><svg onload=alert(1)></xmp><p>Safe</p>',
    );

    expect(sanitized).toBe('<p>Safe</p>');
    expect(sanitized).not.toContain('<img');
    expect(sanitized).not.toContain('<svg');
    expect(sanitized).not.toContain('onerror');
    expect(sanitized).not.toContain('onload');
  });

  it('renders table cell text as escaped plain text instead of executable HTML', () => {
    const markup = renderToStaticMarkup(
      React.createElement(StaticTable, {
        elementInfo: {
          width: 320,
          data: [
            [
              {
                id: 'cell-1',
                text: '<img src=x onerror=alert(1)>\nline 2',
                colspan: 1,
                rowspan: 1,
                style: {},
              },
            ],
          ],
          colWidths: [1],
          cellMinHeight: 24,
          outline: undefined,
          theme: undefined,
        },
      } as never),
    );

    expect(markup).not.toContain('<img');
    expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(markup).toContain('line 2');
    expect(markup).toContain('white-space:pre-wrap');
  });
});

describe('plain slide line breaks', () => {
  it('preserves text newlines while leaving pretty-printed HTML layout alone', () => {
    expect(preservesPlainTextLineBreaks('One\nTwo')).toBe(true);
    expect(preservesPlainTextLineBreaks('x < 2\ny > 3')).toBe(true);
    expect(preservesPlainTextLineBreaks('<p>One</p>\n<p>Two</p>')).toBe(false);
    expect(preservesPlainTextLineBreaks('<!-- note -->\n<p>Two</p>')).toBe(false);
    const box = { id: 'text-lines', left: 0, top: 0, width: 300, height: 100, rotate: 0 };
    const plain = 'One\nTwo';
    const markup = '<p>One</p>\n<p>Two</p>';
    for (const content of [plain, markup]) {
      const text = renderToStaticMarkup(
        React.createElement(BaseTextElement, {
          elementInfo: {
            ...box,
            type: 'text',
            content,
            defaultFontName: 'Arial',
            defaultColor: '#333',
          },
        }),
      );
      const shape = renderToStaticMarkup(
        React.createElement(BaseShapeElement, {
          elementInfo: {
            ...box,
            type: 'shape',
            path: '',
            viewBox: [300, 100],
            fill: '#fff',
            fixedRatio: false,
            text: { content, align: 'middle', defaultFontName: 'Arial', defaultColor: '#333' },
          },
        }),
      );
      expect(text.includes('white-space:pre-line')).toBe(content === plain);
      expect(shape.includes('white-space:pre-line')).toBe(content === plain);
    }
  });

  it('keeps reading text and structure while dropping source sizing and executable markup', () => {
    expect(
      sanitizeSlideReadingHtml(
        '<p style="font-size:1px" onclick="void(0)">Read <strong>this</strong></p><script>unsafe()</script>',
      ),
    ).toBe('<p>Read <strong>this</strong></p>');
  });
});
