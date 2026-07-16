import { describe, expect, it } from 'vitest';

import { formatAttributes, toHTML } from '@/lib/export/html-parser/stringify';

describe('export HTML stringification', () => {
  it('omits empty style without dropping sibling attributes', () => {
    expect(
      formatAttributes([
        { key: 'class', value: 'formula' },
        { key: 'style', value: '' },
        { key: 'data-role', value: 'answer' },
      ]),
    ).toBe(" class='formula' data-role='answer'");
  });

  it('preserves sibling attributes through full HTML serialization', () => {
    expect(
      toHTML([
        {
          type: 'element',
          tagName: 'span',
          attributes: [
            { key: 'class', value: 'formula' },
            { key: 'style', value: '' },
          ],
          children: [{ type: 'text', content: 'x' }],
        },
      ]),
    ).toBe("<span class='formula'>x</span>");
  });
});
