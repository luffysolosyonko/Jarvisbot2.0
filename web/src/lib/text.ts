/** Pure helpers for applying the parser's suggested fixes to the notebook's text. */
import type { Fix } from './types';

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

