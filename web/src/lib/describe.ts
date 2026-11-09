import { longDate, parseDate, weight } from './format';
import type { Forecast, SetRef, Unit } from './types';

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
