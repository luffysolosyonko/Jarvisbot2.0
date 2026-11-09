import { useRef, type CSSProperties, type KeyboardEvent } from 'react';

type Option<T extends string> = { value: T; label: string };

/**
 * A radio group drawn as a segmented control: the chosen option is filled with ink,
 * and the fill slides between options. `value` may be null (nothing chosen).
 * Arrow keys move the selection.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = options.findIndex((o) => o.value === value);
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  const thumb = { '--n': options.length, '--i': Math.max(index, 0) } as CSSProperties;
  return (
    <div role="radiogroup" aria-label={label} className="segmented">
      <span className="segmented-thumb" style={thumb} hidden={index < 0} aria-hidden="true" />
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value || (index < 0 && i === 0) ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKey(e, i)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
