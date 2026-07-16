import { describe, expect, it } from 'vitest';

import { getHiddenCells } from '@/components/slide-renderer/components/element/TableElement/tableUtils';

describe('getHiddenCells', () => {
  it('tolerates malformed generated rows and cells', () => {
    const malformed = [[{ id: 'a', text: 'x', colspan: 2 }, null], null, 5] as never;

    expect(() => getHiddenCells(malformed)).not.toThrow();
    expect(getHiddenCells(malformed)).toEqual(new Set(['0_1']));
  });
});
