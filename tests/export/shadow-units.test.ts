import { describe, expect, it } from 'vitest';

import { getShadowOption } from '@/lib/export/use-export-pptx';

describe('PPTX shadow units', () => {
  it('converts both blur and offset from pixels to points', () => {
    const shadow = getShadowOption({ h: 8, v: 0, blur: 12, color: '#000000' }, 4 / 3);

    expect(shadow.blur).toBe(9);
    expect(shadow.offset).toBe(6);
  });
});
