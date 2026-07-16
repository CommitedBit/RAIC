import { describe, expect, it } from 'vitest';

import { mml2omml } from 'mathml2omml';

describe('MathML conversion', () => {
  it('preserves text after an inline glyph in a text container', () => {
    const omml = mml2omml('<math><mtext><mglyph src="unused" alt="A"/> trailing</mtext></math>');

    expect(omml).toContain('A trailing');
  });
});
