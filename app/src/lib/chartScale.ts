/** Pure scale helpers for the SVG charts (no React, so they're easy to test). */

/** A "nice" tick step (1, 2, 5 x 10^n) that splits `span` into about `count` parts. */
export function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const m = n >= 7.5 ? 10 : n >= 3.5 ? 5 : n >= 1.5 ? 2 : 1;
  return m * mag;
}

/** Widen [min, max] to whole nice steps. A flat series gets a one-step band around it. */
export function niceDomain(min: number, max: number, count: number): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) > 0 ? niceStep(Math.abs(min) / 10, 1) : 1;
    return [min - pad, max + pad];
  }
  const step = niceStep(max - min, count);
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step];
}

/** Ticks at every `step` inside [min, max], ends included. */
export function ticksEvery(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  const first = Math.ceil(min / step - 1e-9) * step;
  for (let v = first; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

/** A nice domain covering [min, max] and its ticks, from one shared step so they line up. */
export function niceAxis(min: number, max: number, count: number): { domain: [number, number]; ticks: number[] } {
  const domain = niceDomain(min, max, count);
  return { domain, ticks: ticksEvery(domain[0], domain[1], niceStep(max - min || domain[1] - domain[0], count)) };
}

/** Linear map from a domain to a pixel range. A zero-width domain maps to the range's middle. */
export function linear(domain: [number, number], range: [number, number]): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  return (v) => (span === 0 ? (r0 + r1) / 2 : r0 + ((v - d0) / span) * (r1 - r0));
}

/** `count` evenly spaced integers from min to max, without duplicates. */
export function evenTicks(min: number, max: number, count: number): number[] {
  if (count < 2 || max <= min) return [min];
  const out = new Set<number>();
  for (let i = 0; i < count; i++) out.add(Math.round(min + ((max - min) * i) / (count - 1)));
  return [...out];
}

/** SVG path through the points, in order. */
export function linePath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

/** A bar with rounded top corners. Empty when the bar has no height. */
export function barPath(x: number, top: number, width: number, bottom: number, radius: number): string {
  const h = bottom - top;
  if (h <= 0 || width <= 0) return '';
  const r = Math.min(radius, h, width / 2);
  const x1 = x + width;
  return [
    `M${x},${bottom}`,
    `L${x},${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `L${x1 - r},${top}`,
    `Q${x1},${top} ${x1},${top + r}`,
    `L${x1},${bottom}`,
    'Z',
  ].join(' ');
}

/** Approximate width of a JetBrains Mono label (every glyph is 0.6em wide). */
export function monoWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6;
}
