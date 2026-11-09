import { describe, expect, it } from 'vitest';

import { buildRows } from '@/lib/chartRows';
import { reachText, setRefText } from '@/lib/describe';
import { monthLabel, shiftMonth } from '@/lib/month';
import { appendLine, applyFix, insertToken, insertWord, replaceLine, replaceName, setToLine, withUnit } from '@/lib/text';
import type { Fix, ParsedSet } from '@/lib/types';

const fix = (f: Partial<Fix>): Fix => ({ label: 'x', line: 1, text: null, template: null, placeholder: null, mode: null, ...f });

const set = (s: Partial<ParsedSet>): ParsedSet => ({
  idx: 0,
  line: 1,
  exercise: 'bench',
  matched_exercise: 'bench',
  reps: 5,
  good_reps: 5,
  failed_reps: 0,
  weight_lb: 155,
  weight_text: '155lb',
  estimated: false,
  bodyweight: false,
  per_hand: false,
  inferred: false,
  ...s,
});

describe('insertToken', () => {
  it('attaches unit and rep suffixes to the number before them', () => {
    expect(insertToken('8', 1, 1, 'x')).toEqual({ text: '8x', cursor: 2 });
    expect(insertToken('8x 135', 6, 6, 'lb')).toEqual({ text: '8x 135lb', cursor: 8 });
    expect(insertToken('12x1', 4, 4, 'f').text).toBe('12x1f');
  });

  it('spaces words like uw, bar and each hand', () => {
    expect(insertToken('10x', 3, 3, 'uw')).toEqual({ text: '10x uw ', cursor: 7 });
    expect(insertToken('25x 15kg', 8, 8, 'each hand').text).toBe('25x 15kg each hand ');
    expect(insertToken('', 0, 0, '^').text).toBe('^ ');
  });

  it('inserts mid-text and replaces a selection', () => {
    expect(insertToken('8x bench', 3, 3, 'bar')).toEqual({ text: '8x bar bench', cursor: 7 });
    expect(insertToken('8x 135kg bench', 6, 8, 'lb').text).toBe('8x 135lb bench');
  });

  it('inserts names with spaces around them', () => {
    expect(insertWord('8x 135lb', 8, 8, 'bench press').text).toBe('8x 135lb bench press ');
  });
});

describe('fixes', () => {
  it('replaces or removes one line', () => {
    expect(replaceLine('a\nb\nc', 2, 'B')).toBe('a\nB\nc');
    expect(replaceLine('a\nb\nc', 2, '')).toBe('a\nc');
    expect(replaceLine('a', 5, 'x')).toBe('a');
  });

  it('applies a text fix', () => {
    expect(applyFix('8x 135lb bench\n8 135 squat', fix({ line: 2, text: '8x 135lb squat' }))).toBe('8x 135lb bench\n8x 135lb squat');
  });

  it('fills a template fix, and refuses an empty value', () => {
    const f = fix({ template: '8x {}lb bench' });
    expect(applyFix('8x bench', f, ' 135 ')).toBe('8x 135lb bench');
    expect(applyFix('8x bench', f, '  ')).toBeNull();
  });

  it('renames a whole-word exercise only', () => {
    expect(replaceName('5x 140lb bp\n8x 50lb bpx', 'bp', 'bench press')).toBe('5x 140lb bench press\n8x 50lb bpx');
  });
});

describe('quick buttons', () => {
  it('writes a set back as shorthand', () => {
    expect(setToLine(set({}))).toBe('5x 155lb bench');
    expect(setToLine(set({ reps: 2, good_reps: 1, failed_reps: 1, weight_text: '200lb' }))).toBe('1x1f 200lb bench');
    expect(setToLine(set({ bodyweight: true, weight_lb: null, weight_text: 'uw', exercise: 'dips', matched_exercise: 'dips' }))).toBe('5x uw dips');
    expect(setToLine(set({ per_hand: true, weight_text: '15kg', matched_exercise: 'shrug' }))).toBe('5x 15kg each hand shrug');
    expect(setToLine(set({ weight_text: '^' }))).toBe('5x 155lb bench');
  });

  it('adds the chosen unit to a bare weigh-in number only', () => {
    expect(withUnit('84', 'kg')).toBe('84kg');
    expect(withUnit(' 182.4 ', 'lb')).toBe('182.4lb');
    expect(withUnit('83.9kg', 'lb')).toBe('83.9kg');
    expect(withUnit('182 different scale', 'kg')).toBe('182 different scale');
  });

  it('appends a line', () => {
    expect(appendLine('', '5x 155lb bench')).toBe('5x 155lb bench');
    expect(appendLine('8x 135lb bench\n', '5x 155lb bench')).toBe('8x 135lb bench\n5x 155lb bench');
  });
});

describe('charts and dates', () => {
  it('merges series into one row per day', () => {
    const { rows } = buildRows(
      [{ date: '2026-11-01', value: 180 }, { date: '2026-11-03', value: 179 }],
      [{ date: '2026-11-03', value: 179.5 }],
      [{ date: '2026-11-10', value: 178 }],
      'lb',
    );
    expect(rows).toEqual([
      { x: 0, main: 180 },
      { x: 2, main: 179, avg: 179.5 },
      { x: 9, forecast: 178 },
    ]);
  });

  it('converts chart values to kg', () => {
    expect(buildRows([{ date: '2026-11-01', value: 220.462 }], [], [], 'kg').rows[0].main).toBe(100);
  });

  it('labels and steps months across years', () => {
    expect(monthLabel('2026-11')).toBe('November 2026');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('describes sets and forecasts', () => {
    const ref = { date: '2026-11-01', reps: 6, good_reps: 5, failed_reps: 1, weight_lb: 100, estimated: true, bodyweight: false, per_hand: false, e1rm: 116 };
    expect(setRefText(ref, 'lb')).toBe('5 + 1f × 100 lb (est)');
    const projection = { slope_per_week: 2, now: 180, last_date: '2026-11-01', target_date: '2026-12-01', pred: 188, low: 180, high: 196, points: 8, span_days: 60, line: [] };
    const base = { exercise: 'bench', best_e1rm: 180, target_lb: 225, optimistic: false, projection };
    expect(reachText({ ...base, reach: 'flat', reach_date: null }, 'lb')).toMatch(/Not trending up/);
    expect(reachText({ ...base, reach: 'already', reach_date: null }, 'lb')).toMatch(/already hit 225 lb/);
    expect(reachText({ ...base, reach: 'date', reach_date: '2099-04-06' }, 'lb')).toBe('About Monday, Apr 6, 2099 at this pace.');
  });
});
