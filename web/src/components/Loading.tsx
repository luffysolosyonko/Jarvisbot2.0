/**
 * Loading indicators in the logbook style. With motion allowed: a blinking ink cursor
 * and dots that fill one by one. With reduced motion: plain static text instead.
 */

/** "▍" blinking where the first entry will be written; "Loading…" without motion. */
export function InkCursor({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="ink-loading" role="status" aria-label={label}>
      <span className="ink-cursor" aria-hidden="true">
        ▍
      </span>
      <span className="ink-static">{label}…</span>
    </div>
  );
}

/** Three dots that fill in turn (a static "…" without motion). Decorative. */
export function Dots() {
  return (
    <span className="dots" aria-hidden="true">
      <i>.</i>
      <i>.</i>
      <i>.</i>
    </span>
  );
}
