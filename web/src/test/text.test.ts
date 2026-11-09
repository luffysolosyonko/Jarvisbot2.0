import { describe, expect, it } from 'vitest';

import { buildRows } from '@/lib/chartRows';
import { reachText, setRefText } from '@/lib/describe';
import { monthLabel, shiftMonth } from '@/lib/month';
import { applyFix, replaceLine } from '@/lib/text';
import type { Fix } from '@/lib/types';

const fix = (f: Partial<Fix>): Fix => ({ label: 'x', line: 1, text: null, template: null, placeholder: null, mode: null, ...f });


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
    expect(reachText({ ...base, reach: 'date', reach_date: '2099-04-06' }, 'lb')).toBe('About Mon, Apr 6, 2099 at this pace.');
  });
});
