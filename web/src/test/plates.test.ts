import { describe, expect, it } from 'vitest';

import { goalLoad, perSideKg, platesFor } from '@/lib/plates';

describe('goal bar plates', () => {
  it('loads competition plates heaviest first, leaving off anything under 10 kg', () => {
    expect(platesFor(47.5)).toEqual([25, 20]);
    expect(platesFor(35)).toEqual([25, 10]);
    expect(platesFor(9)).toEqual([]);
  });

  it('converts a total in lb to kg per side of a 20 kg bar', () => {
    expect(perSideKg(225)).toBeCloseTo(41.03, 1);
    expect(perSideKg(30)).toBe(0);
  });

  it('shows what is loaded now and the plates still needed for the goal', () => {
    // 174 lb ~ 78.9 kg: 29.5 kg a side -> one 25. 225 lb needs 41 a side -> 15 more.
    expect(goalLoad(174, 225)).toEqual({ loaded: [25], toGo: [15] });
    expect(goalLoad(240, 225).toGo).toEqual([]);
  });
});
