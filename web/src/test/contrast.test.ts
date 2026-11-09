import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { palettes, type ColorTokens } from '@/theme/tokens';
import { contrastRatio } from '@/theme/contrast';

const BODY = 4.5; // WCAG AA body text
const LARGE = 3; // large text, icons and chart lines

const TEXT: (keyof ColorTokens)[] = ['ink', 'inkSecondary', 'inkTertiary', 'accent', 'success', 'danger'];
const BACKGROUNDS: (keyof ColorTokens)[] = ['bg', 'surface', 'paperSunk'];

describe.each(Object.entries(palettes))('%s theme', (_name, c) => {
  it.each(TEXT.flatMap((t) => BACKGROUNDS.map((b) => [t, b] as const)))(
    '%s on %s meets AA for body text',
    (text, bg) => {
      expect(contrastRatio(c[text], c[bg])).toBeGreaterThanOrEqual(BODY);
    },
  );

  it('the outlier warning text meets AA on its box', () => {
    expect(contrastRatio(c.warnText, c.warnBg)).toBeGreaterThanOrEqual(BODY);
  });

  it('onAccent on accent meets AA for body text (primary button)', () => {
    expect(contrastRatio(c.onAccent, c.accent)).toBeGreaterThanOrEqual(BODY);
  });

  it('chart series and icons meet 3:1 on surfaces', () => {
    for (const fg of ['accent', 'inkSecondary', 'ink'] as const) {
      for (const bg of BACKGROUNDS) {
        expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(LARGE);
      }
    }
  });
});

it('contrastRatio matches known values', () => {
  expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  expect(() => contrastRatio('red', '#FFFFFF')).toThrow();
});

describe('tokens.css', () => {
  it('defines the same color values as tokens.ts', () => {
    const css = readFileSync(`${process.cwd()}/src/theme/tokens.css`, 'utf8').toLowerCase();
    for (const palette of Object.values(palettes)) {
      for (const hex of Object.values(palette)) expect(css).toContain(hex.toLowerCase());
    }
  });
});
