import { Wrench } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { IconButton } from '@/components/Button';

import { TOOLS, type ToolId } from './registry';

/**
 * The Tools menu: the bot's commands. Arrow keys move between items; Escape closes it.
 */
export function MoreMenu({ onPick }: { onPick: (id: ToolId) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const count = TOOLS.length;

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

  return (
    <div className="menu-anchor" ref={wrap} onKeyDown={onKey}>
      <IconButton label="Tools" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Wrench size={20} strokeWidth={1.8} />
      </IconButton>
      {open ? (
        <div className="menu" role="menu" aria-label="Tools">
          {TOOLS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                items.current[i] = el;
              }}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(t.id);
              }}>
              {t.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
