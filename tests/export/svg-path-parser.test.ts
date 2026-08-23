import { describe, expect, it } from 'vitest';

import { getSvgPathRange } from '@/lib/export/svg-path-parser';

describe('getSvgPathRange', () => {
  it('does not inject the origin for closed paths away from zero', () => {
    expect(getSvgPathRange('M 100 100 L 200 100 L 200 200 L 100 200 Z')).toEqual({
      minX: 100,
      minY: 100,
      maxX: 200,
      maxY: 200,
    });
  });

  it('resolves relative path commands', () => {
    expect(getSvgPathRange('m 100 100 l 50 0 l 0 50 l -50 0 z')).toEqual({
      minX: 100,
      minY: 100,
      maxX: 150,
      maxY: 150,
    });
  });

  it('includes arc bulge in the bounds', () => {
    expect(getSvgPathRange('M 0 50 A 50 50 0 0 1 100 50')).toEqual({
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 50,
    });
  });

  it('keeps tolerant zero bounds for malformed paths', () => {
    expect(getSvgPathRange('not a path')).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });
});
