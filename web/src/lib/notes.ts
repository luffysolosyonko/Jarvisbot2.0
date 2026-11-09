/** The "↳" margin notes under each entry, and the outlier weigh-in wording. */
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

export function weighInNote(w: WeighIn, unit: Unit): NoteLine {
  return { text: `weigh-in · ${fromLb(w.weight_lb, unit).toFixed(1)} ${unit}${w.note ? ` · ${w.note}` : ''}`, fail: null };
}

/** "80 kg = 176.4 lb?" for a reading typed in kg; "250 lb?" otherwise. */
export function outlierTitle(w: WeighIn): string {
  const lb = w.weight_lb.toFixed(1);
  if (w.typed !== null && w.typed_unit === 'kg') return `${num(w.typed)} kg = ${lb} lb?`;
  return `${lb} lb?`;
}

/** "That's 19 lb above your 7-day average. No unit was given, so kg was assumed." */
export function outlierReason(w: WeighIn): string {
  const parts: string[] = [];
  if (w.avg_7d !== null) {
    const diff = Math.round(w.weight_lb - w.avg_7d);
    parts.push(`That's ${Math.abs(diff)} lb ${diff >= 0 ? 'above' : 'below'} your 7-day average.`);
  }
  if (w.unit_assumed) parts.push(`No unit was given, so ${w.typed_unit} was assumed.`);
  return parts.join(' ');
}

/** The other unit than the one the parser assumed. */
export function otherUnit(w: WeighIn): 'kg' | 'lb' {
  return w.typed_unit === 'kg' ? 'lb' : 'kg';
}

/** Rewrite the typed number in `text` with an explicit unit: "80" -> "80lb". */
export function withExplicitUnit(text: string, typed: number, unit: 'kg' | 'lb'): string {
  const n = num(typed).replace('.', '\\.');
  const re = new RegExp(`(^|[^\\d.])(${n}(?:\\.0+)?)(?![\\d.])\\s*(?:kgs?|lbs?|pounds)?`, 'i');
  return re.test(text) ? text.replace(re, `$1$2${unit}`) : `${num(typed)}${unit}`;
}
