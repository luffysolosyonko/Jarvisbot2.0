/** The "↳" margin notes under each entry. */
import { exerciseName, fromLb, num, weight } from './format';
import type { ParsedSet, Unit, WeighIn } from './types';

export type NoteLine = { text: string; fail: string | null };

function load(s: ParsedSet, unit: Unit): string {
  if (s.bodyweight && s.weight_lb === null) return 'bodyweight';
  const w = `${s.estimated ? '~' : ''}${weight(s.weight_lb, unit)}`;
  return s.per_hand ? `${w} each hand` : w;
}

/**
 * One line per run of sets with the same exercise and load:
 * "Bench · 3 reps · 135 lb", "Bench · 5, 2, 1 reps · 155 lb · ✗ last rep".
 */
export function setNotes(sets: ParsedSet[], unit: Unit): NoteLine[] {
  const groups: ParsedSet[][] = [];
  for (const s of sets) {
    const last = groups[groups.length - 1];
    const key = (x: ParsedSet) => `${x.matched_exercise ?? x.exercise}|${load(x, unit)}`;
    if (last && key(last[0]) === key(s)) last.push(s);
    else groups.push([s]);
  }
  return groups.map((g) => {
    const name = exerciseName(g[0].matched_exercise ?? g[0].exercise);
    const reps = g.map((s) => s.reps);
    const repText = reps.length === 1 ? `${reps[0]} ${reps[0] === 1 ? 'rep' : 'reps'}` : `${reps.join(', ')} reps`;
    const failed = g.reduce((a, s) => a + s.failed_reps, 0);
    const lastFailed = g[g.length - 1].failed_reps > 0;
    const fail = failed === 0 ? null : failed === 1 && lastFailed ? '✗ last rep' : `✗ ${failed} failed`;
    return { text: `${name} · ${repText} · ${load(g[0], unit)}`, fail };
  });
}

/**
 * "weigh-in · 182.4 lb". A number typed without a unit, and read in the other unit
 * than the one shown, spells out the conversion: "weigh-in · 90 kg = 198.4 lb".
 */
export function weighInNote(w: WeighIn, unit: Unit): NoteLine {
  const shown = `${fromLb(w.weight_lb, unit).toFixed(1)} ${unit}`;
  const read = w.unit_assumed && w.typed !== null && w.typed_unit !== unit ? `${num(w.typed)} ${w.typed_unit} = ` : '';
  return { text: `weigh-in · ${read}${shown}${w.note ? ` · ${w.note}` : ''}`, fail: null };
}
