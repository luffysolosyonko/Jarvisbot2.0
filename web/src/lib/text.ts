/** Pure helpers for editing the notebook's text: inserting tokens, applying fixes. */
import { num } from './format';
import type { Fix, ParsedSet, Unit } from './types';

export type Edit = { text: string; cursor: number };

/** Tokens that attach to the number before them ("8" + "x" = "8x"). */
const ATTACHED = new Set(['x', 'lb', 'kg', 'f', '?']);

/**
 * Insert a syntax token at the selection. Suffixes like "x" and "lb" attach to what's
 * before them; words like "uw" or "each hand" get a space on each side as needed.
 */
export function insertToken(text: string, start: number, end: number, token: string): Edit {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const attached = ATTACHED.has(token);
  const needsLead = !attached && before.length > 0 && !/\s$/.test(before);
  const needsTrail = !attached && (after.length === 0 || !/^\s/.test(after));
  const insert = `${needsLead ? ' ' : ''}${token}${needsTrail ? ' ' : ''}`;
  return { text: before + insert + after, cursor: before.length + insert.length };
}

/** Insert a word (an exercise name, a weight) at the selection, with spaces around it. */
export function insertWord(text: string, start: number, end: number, word: string): Edit {
  return insertToken(text, start, end, word.trim());
}

/** Replace 1-based line `n`. An empty replacement removes the line. */
export function replaceLine(text: string, n: number, replacement: string): string {
  const lines = text.split('\n');
  if (n < 1 || n > lines.length) return text;
  if (replacement === '') lines.splice(n - 1, 1);
  else lines[n - 1] = replacement;
  return lines.join('\n');
}

/** The new text for a fix; `value` fills a template's `{}`. Null if a needed value is missing. */
export function applyFix(text: string, fix: Fix, value = ''): string | null {
  if (fix.template !== null) {
    const v = value.trim();
    if (!v) return null;
    return replaceLine(text, fix.line, fix.template.replace('{}', v));
  }
  return replaceLine(text, fix.line, fix.text ?? '');
}

/** Swap a name for another on every line it appears as a whole word. */
export function replaceName(text: string, from: string, to: string): string {
  if (!from || from === to) return text;
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'gim'), `$1${to}`);
}

/** A set written back as shorthand, so "Repeat last set" can insert it. */
export function setToLine(s: ParsedSet): string {
  const reps = s.failed_reps > 0 ? `${s.good_reps}x${s.failed_reps}f` : `${s.reps}x`;
  let load: string;
  if (s.bodyweight) load = 'uw';
  else if (s.weight_text && !/^[\^?]$/.test(s.weight_text)) load = s.weight_text;
  else if (s.weight_lb !== null) load = `${s.estimated ? '?' : ''}${num(s.weight_lb)}lb`;
  else load = '?';
  const hand = s.per_hand && !/each hand/i.test(load) ? ' each hand' : '';
  const name = s.matched_exercise ?? s.exercise ?? '';
  return `${reps} ${load}${hand}${name ? ` ${name}` : ''}`;
}

/** Weight mode: a bare number gets the chosen unit, so "84" isn't guessed. */
export function withUnit(text: string, unit: Unit): string {
  return /^\s*\d+(\.\d+)?\s*$/.test(text) ? `${text.trim()}${unit}` : text;
}

/** Text with a line appended (on a new line if the text isn't empty). */
export function appendLine(text: string, line: string): string {
  if (!text.trim()) return line;
  return `${text.replace(/\s+$/, '')}\n${line}`;
}
