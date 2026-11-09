import { dayLabel, exerciseName, fromLb, num, shortDate, signedWeight, toLb, volume, weight } from '@/lib/format';

describe('format', () => {
  it('converts units both ways', () => {
    expect(fromLb(220.462, 'kg')).toBeCloseTo(100, 3);
    expect(toLb(100, 'kg')).toBeCloseTo(220.462, 3);
    expect(fromLb(155, 'lb')).toBe(155);
  });

  it('formats weights without trailing zeros', () => {
    expect(num(155)).toBe('155');
    expect(num(70.25)).toBe('70.3');
    expect(weight(155, 'lb')).toBe('155 lb');
    expect(weight(null, 'lb')).toBe('–');
    expect(weight(220.462, 'kg', 0)).toBe('100 kg');
    expect(signedWeight(2.5, 'lb')).toBe('+2.5 lb');
    expect(signedWeight(-0.3, 'lb')).toBe('−0.3 lb');
    expect(volume(12340.4, 'lb')).toBe('12,340 lb');
  });

  it('formats dates without time-zone drift', () => {
    expect(shortDate('2026-03-02')).toBe('Mar 2');
    expect(dayLabel('2026-03-02', '2026-03-02')).toBe('Today');
    expect(dayLabel('2026-03-01', '2026-03-02')).toBe('Yesterday');
    expect(dayLabel('2026-02-26', '2026-03-02')).toBe('Thursday, Feb 26');
  });

  it('sentence-cases exercise names', () => {
    expect(exerciseName('bench press')).toBe('Bench press');
    expect(exerciseName(null)).toBe('Unnamed');
  });
});
