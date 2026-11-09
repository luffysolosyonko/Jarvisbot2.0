import { exerciseName, longDate, parseDate, weight } from './format';
import type { Forecast, Log, Me, ParseResult, SetRef, Unit } from './types';

/** "5 + 1f × 155 lb" */
export function setRefText(s: SetRef | null, unit: Unit): string {
  if (!s) return '–';
  const load = s.bodyweight && s.weight_lb === null ? 'uw' : weight(s.weight_lb, unit);
  const failed = s.failed_reps ? ` + ${s.failed_reps}f` : '';
  return `${s.good_reps}${failed} × ${load}${s.estimated ? ' (est)' : ''}`;
}

export function reachText(f: Forecast, unit: Unit): string {
  if (f.reach === 'already') return `You've already hit ${weight(f.target_lb, unit)} (best e1RM ${weight(f.best_e1rm, unit)}).`;
  if (f.reach === 'flat') return 'Not trending up, so no date at this pace.';
  if (f.reach === 'date' && f.reach_date) {
    const year = parseDate(f.reach_date).getFullYear();
    const when = year === new Date().getFullYear() ? longDate(f.reach_date) : `${longDate(f.reach_date)}, ${year}`;
    return `About ${when} at this pace${f.optimistic ? ' (an optimistic read; few sessions)' : ''}.`;
  }
  return '';
}

/** "5 sets · Bench" or "→ 185 lb": what the text will log, in one line. */
export function summarize(r: ParseResult, unit: Unit): string {
  if (r.weigh_in) return `→ ${weight(r.weigh_in.weight_lb, unit)}${r.weigh_in.note ? ` · ${r.weigh_in.note}` : ''}`;
  if (!r.sets.length) return '';
  const names = [...new Set(r.sets.map((s) => exerciseName(s.matched_exercise ?? s.exercise)))];
  const fresh = r.exercises.filter((e) => e.is_new).map((e) => exerciseName(e.matched));
  const sets = `${r.sets.length} set${r.sets.length === 1 ? '' : 's'}`;
  return `${sets} · ${names.join(', ')}${fresh.length ? ` (new: ${fresh.join(', ')})` : ''}`;
}

/** What a saved log recorded, in a few words: "5 sets · Bench" or "185 lb". */
export function logSummary(log: Log, unit: Unit): string {
  if (log.weigh_in) return weight(log.weigh_in.weight_lb, unit);
  const names = [...new Set(log.sets.map((s) => exerciseName(s.matched_exercise ?? s.exercise)))];
  return `${log.sets.length} set${log.sets.length === 1 ? '' : 's'} · ${names.join(', ')}`;
}

/** The name shown on your messages in the notebook. */
export function authorName(me: Me | undefined): string {
  return me?.display_name || me?.email?.split('@')[0] || 'You';
}
