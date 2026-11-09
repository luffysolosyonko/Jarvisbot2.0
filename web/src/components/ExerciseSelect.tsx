import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { useRecentExercises } from '@/hooks/queries';
import { exerciseName } from '@/lib/format';

/**
 * Pick one of the user's exercises, most recent first. A searchable picker instead of
 * a native select: type to filter, and the list opens inline (about six rows, then it
 * scrolls), so it always fits on screen, even inside a popup.
 */
export function ExerciseSelect({
  value,
  onChange,
  label = 'Exercise',
}: {
  value: string;
  onChange: (name: string) => void;
  label?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const names = useRecentExercises();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? names.filter((n) => n.includes(q) || exerciseName(n).toLowerCase().includes(q)) : names;
  }, [names, query]);

  // Close when a click lands elsewhere.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  function pick(name: string) {
    onChange(name);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => Math.min(Math.max(a + step, 0), Math.max(matches.length - 1, 0)));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (matches[active]) pick(matches[active]);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation(); // close the list, not the tool popup
      setOpen(false);
      setQuery('');
    } else if (e.key === 'Tab') {
      setOpen(false);
      setQuery('');
    }
  }

  const shown = open ? query : value ? exerciseName(value) : '';

  return (
    <div className="field picker" ref={wrap}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder={open && value ? exerciseName(value) : 'Choose an exercise'}
        value={shown}
        onFocus={() => {
          setOpen(true);
          setActive(Math.max(0, names.indexOf(value)));
        }}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <ul id={listId} ref={list} role="listbox" aria-label={label} className="picker-list">
          {matches.length ? (
            matches.map((n, i) => (
              <li
                key={n}
                id={`${listId}-${i}`}
                data-i={i}
                role="option"
                aria-selected={n === value}
                className={i === active ? 'active' : undefined}
                onMouseDown={(e) => e.preventDefault()} // keep focus in the input
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(n)}>
                {exerciseName(n)}
              </li>
            ))
          ) : (
            <li className="picker-empty" aria-disabled="true">
              No exercise matches “{query.trim()}”
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
