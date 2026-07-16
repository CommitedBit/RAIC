import { describe, expect, it } from 'vitest';

import { extractOriginalImageId } from '@/lib/utils/image-storage';

describe('extractOriginalImageId', () => {
  it('does not truncate a nanoid containing underscores', () => {
    expect(extractOriginalImageId('session_ab_cd_efgh_img_20')).toBe('img_20');
  });

  it('preserves underscored original image IDs', () => {
    expect(extractOriginalImageId('session_abc123def4_hero_img_1')).toBe('hero_img_1');
  });

  it('rejects malformed storage IDs', () => {
    expect(extractOriginalImageId('session_short_img_1')).toBeUndefined();
    expect(extractOriginalImageId('session_abc123def4_')).toBeUndefined();
    expect(extractOriginalImageId('other_abc123def4_img_1')).toBeUndefined();
  });
});
