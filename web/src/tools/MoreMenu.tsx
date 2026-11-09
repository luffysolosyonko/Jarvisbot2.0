import { Ellipsis } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { IconButton } from '@/components/Button';
import { ICON } from '@/components/icons';

import { TOOLS, type ToolId } from './registry';

/**
 * The ⋯ menu: the bot's commands, and "Hide answers" when there are answers to hide.
 * Arrow keys move between items; Escape closes it.
 */
export function MoreMenu({ onPick, onHideAnswers }: { onPick: (id: ToolId) => void; onHideAnswers?: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const count = TOOLS.length + (onHideAnswers ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function onKey(e: KeyboardEvent) {
    const idx = items.current.findIndex((el) => el === document.activeElement);
    if (e.key === 'Escape') {
      setOpen(false);
      wrap.current?.querySelector<HTMLButtonElement>('button')?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (idx + (e.key === 'ArrowDown' ? 1 : -1) + count) % count;
      items.current[next]?.focus();
    }
  }

  function pick(fn: () => void) {
    setOpen(false);
    fn();
  }

  return (
    <div className="menu-anchor" ref={wrap} onKeyDown={onKey}>
      <IconButton label="More: tools and options" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Ellipsis {...ICON} />
      </IconButton>
      {open ? (
        <div className="menu" role="menu" aria-label="More">
          {TOOLS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                items.current[i] = el;
              }}
              type="button"
              role="menuitem"
              onClick={() => pick(() => onPick(t.id))}>
              {t.label}
              <span className="hint">{t.command}</span>
            </button>
          ))}
          {onHideAnswers ? (
            <>
              <div role="separator" />
              <button
                ref={(el) => {
                  items.current[TOOLS.length] = el;
                }}
                type="button"
                role="menuitem"
                onClick={() => pick(onHideAnswers)}>
                Hide answers
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
