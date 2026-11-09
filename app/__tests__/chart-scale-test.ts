import { barPath, evenTicks, linear, linePath, niceAxis, niceDomain, niceStep, ticksEvery } from '@/lib/chartScale';

describe('niceDomain', () => {
  it('rounds out to whole steps', () => {
    expect(niceDomain(178.4, 186.2, 4)).toEqual([178, 188]);
  });
});

describe('niceStep', () => {
  it('rounds to 1, 2 or 5 times a power of ten', () => {
    expect(niceStep(100, 4)).toBe(20);
    expect(niceStep(7, 4)).toBe(2);
    expect(niceStep(3000, 4)).toBe(1000);
    expect(niceStep(0.9, 4)).toBe(0.2);
  });

  it('falls back to 1 for an empty span', () => {
    expect(niceStep(0, 4)).toBe(1);
  });
});

describe('niceAxis', () => {
  it('widens a body-weight range to whole steps', () => {
    expect(niceAxis(178.4, 186.2, 4)).toEqual({ domain: [178, 188], ticks: [178, 180, 182, 184, 186, 188] });
  });

  it('gives a flat series some height', () => {
    const [lo, hi] = niceDomain(225, 225, 4);
    expect(lo).toBeLessThan(225);
    expect(hi).toBeGreaterThan(225);
  });

  it('starts weekly bars at zero, with ticks on the domain ends', () => {
    expect(niceAxis(0, 26, 2)).toEqual({ domain: [0, 30], ticks: [0, 10, 20, 30] });
  });

  it('always has ticks at both ends of the domain', () => {
    for (const [lo, hi] of [[0, 7], [0, 31], [61.2, 64.9], [180, 405]]) {
      const { domain, ticks } = niceAxis(lo, hi, 4);
      expect(ticks[0]).toBe(domain[0]);
      expect(ticks[ticks.length - 1]).toBe(domain[1]);
    }
  });

  it('avoids floating-point noise in ticks', () => {
    expect(ticksEvery(0, 1, 0.2)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
});

describe('linear', () => {
  it('maps the domain onto the range, inverted for y', () => {
    const y = linear([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(50)).toBe(100);
    expect(y(100)).toBe(0);
  });

  it('puts a zero-width domain in the middle', () => {
    expect(linear([5, 5], [0, 10])(5)).toBe(5);
  });
});

describe('evenTicks', () => {
  it('spreads integer ticks from end to end without duplicates', () => {
    expect(evenTicks(0, 84, 4)).toEqual([0, 28, 56, 84]);
    expect(evenTicks(0, 2, 4)).toEqual([0, 1, 2]);
  });
});

describe('paths', () => {
  it('draws a polyline', () => {
    expect(linePath([{ x: 0, y: 10 }, { x: 5, y: 2.25 }])).toBe('M0.0,10.0 L5.0,2.3');
  });

  it('draws nothing for a zero-height bar', () => {
    expect(barPath(0, 100, 24, 100, 4)).toBe('');
  });

  it('caps the corner radius on a short bar', () => {
    expect(barPath(0, 98, 24, 100, 4)).toContain('Q0,98 2,98');
  });
});
