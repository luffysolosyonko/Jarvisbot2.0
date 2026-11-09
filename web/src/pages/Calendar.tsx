import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';

import { IconButton } from '@/components/Button';
import { ICON } from '@/components/icons';
import { isoDate, parseDate } from '@/lib/format';
import { monthLabel, shiftMonth } from '@/lib/month';
import type { CalendarDay } from '@/lib/types';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function describe(d: CalendarDay | undefined, iso: string): string {
  const date = parseDate(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (!d || (!d.has_workout && !d.has_weight)) return `${date}, nothing logged`;
  const parts = [d.has_workout ? `workout, ${d.sets} sets` : null, d.has_weight ? 'weigh-in' : null].filter(Boolean);
  return `${date}, ${parts.join(' and ')}`;
}

/**
 * A month grid. Workout days are filled with the accent, weigh-in-only days are outlined,
 * today is underlined. Arrow keys move between days.
 */
export function Calendar({
  month,
  days,
  today,
  selected,
  onSelect,
  onMonth,
}: {
  month: string;
  days: CalendarDay[];
  today: string;
  selected: string | null;
  onSelect: (iso: string) => void;
  onMonth: (month: string) => void;
}) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const count = new Date(y, m, 0).getDate();
  const byDate = new Map(days.map((d) => [d.date, d]));
  const cells: (string | null)[] = [
    ...Array<null>(first.getDay()).fill(null),
    ...Array.from({ length: count }, (_, i) => isoDate(new Date(y, m - 1, i + 1))),
  ];
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const firstDay = cells.find((c): c is string => c !== null) ?? `${month}-01`;
  const focusable = selected?.startsWith(month) ? selected : today.startsWith(month) ? today : firstDay;

  function onKey(e: KeyboardEvent, iso: string) {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const step = steps[e.key];
    if (!step) return;
    e.preventDefault();
    const d = parseDate(iso);
    d.setDate(d.getDate() + step);
    const next = isoDate(d);
    if (!next.startsWith(month)) onMonth(next.slice(0, 7));
    onSelect(next);
    requestAnimationFrame(() => refs.current.get(next)?.focus());
  }

  return (
    <div className="stack-3">
      <div className="row-between">
        <h2 className="t-heading" aria-live="polite">
          {monthLabel(month)}
        </h2>
        <div className="row" style={{ gap: 4 }}>
          <IconButton label="Previous month" onClick={() => onMonth(shiftMonth(month, -1))}>
            <ChevronLeft {...ICON} />
          </IconButton>
          <IconButton label="Next month" onClick={() => onMonth(shiftMonth(month, 1))}>
            <ChevronRight {...ICON} />
          </IconButton>
        </div>
      </div>
      <div className="calendar" role="grid" aria-label={monthLabel(month)}>
        {DOW.map((d) => (
          <div key={d} className="cal-dow" role="columnheader" aria-label={d}>
            {d.slice(0, 2)}
          </div>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <div key={`pad${i}`} className="cal-day outside" aria-hidden="true" />;
          const d = byDate.get(iso);
          const cls = [
            'cal-day',
            d?.has_workout && 'workout',
            !d?.has_workout && d?.has_weight && 'weight',
            iso === today && 'today',
            iso === selected && 'selected',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={iso}
              ref={(el) => {
                if (el) refs.current.set(iso, el);
                else refs.current.delete(iso);
              }}
              type="button"
              role="gridcell"
              className={cls}
              aria-label={describe(d, iso)}
              aria-selected={iso === selected}
              aria-current={iso === today ? 'date' : undefined}
              tabIndex={iso === focusable ? 0 : -1}
              onClick={() => onSelect(iso)}
              onKeyDown={(e) => onKey(e, iso)}>
              {Number(iso.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="legend">
        <span>
          <i className="swatch filled" aria-hidden="true" /> Workout
        </span>
        <span>
          <i className="swatch outlined" aria-hidden="true" /> Weigh-in only
        </span>
        <span>
          <span className="semibold" style={{ textDecoration: 'underline', textDecorationThickness: 2, textUnderlineOffset: 4 }}>
            Today
          </span>
        </span>
      </div>
    </div>
  );
}
