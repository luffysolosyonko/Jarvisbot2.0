import { Wrench } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { Button } from '@/components/Button';
import { ICON } from '@/components/icons';

import { TOOLS, type ToolId } from './registry';

/** "Tools": a menu of the bot's commands. Arrow keys move, Escape closes. */
export function ToolsMenu({ onPick }: { onPick: (id: ToolId) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

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
      const next = (idx + (e.key === 'ArrowDown' ? 1 : -1) + TOOLS.length) % TOOLS.length;
      items.current[next]?.focus();
    }
  }

  return (
    <div className="menu-anchor" ref={wrap} onKeyDown={onKey}>
      <Button
        size="small"
        icon={<Wrench {...ICON} aria-hidden="true" />}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        Tools
      </Button>
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
              <span className="hint mono">{t.command}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
