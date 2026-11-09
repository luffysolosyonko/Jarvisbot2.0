import type { Unit } from './types';

export const KG_PER_LB = 1 / 2.20462;

export function fromLb(lb: number, unit: Unit): number {
  return unit === 'kg' ? lb * KG_PER_LB : lb;
}

export function toLb(value: number, unit: Unit): number {
  return unit === 'kg' ? value / KG_PER_LB : value;
}

/** 155 -> "155", 70.25 -> "70.3"; no trailing ".0". */
export function num(value: number, digits = 1): string {
  const fixed = value.toFixed(digits);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

export function weight(lb: number | null | undefined, unit: Unit, digits = 1): string {
  if (lb === null || lb === undefined) return '–';
  return `${num(fromLb(lb, unit), digits)} ${unit}`;
}

export function signedWeight(lb: number, unit: Unit, digits = 1): string {
  const v = fromLb(lb, unit);
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${num(Math.abs(v), digits)} ${unit}`;
}

/** Big totals: 12,340 lb */
export function volume(lb: number, unit: Unit): string {
  return `${Math.round(fromLb(lb, unit)).toLocaleString('en-US')} ${unit}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "2026-03-02" -> a Date at local midnight (no UTC shift). */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function shortDate(iso: string): string {
  const d = parseDate(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function longDate(iso: string): string {
  const d = parseDate(iso);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function dayLabel(iso: string, todayIso: string): string {
  if (iso === todayIso) return 'Today';
  const diff = Math.round((parseDate(todayIso).getTime() - parseDate(iso).getTime()) / 86_400_000);
  if (diff === 1) return 'Yesterday';
  return longDate(iso);
}

/** "Bench press" from "bench press" — sentence case for exercise names. */
export function exerciseName(name: string | null | undefined): string {
  if (!name) return 'Unnamed';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Today's date ("YYYY-MM-DD") in a time zone; the browser's if it's unknown. */
export function todayIn(tz: string | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return isoDate(new Date());
  }
}

/** "9:06 AM" for an instant, in a time zone. */
export function clockTime(iso: string, tz: string | undefined): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
  } catch {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
}

/** The calendar day ("YYYY-MM-DD") an instant falls on in a time zone. */
export function dayIn(iso: string, tz: string | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  } catch {
    return isoDate(new Date(iso));
  }
}
