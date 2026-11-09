import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

import { IconButton } from "@/components/Button";
import { ICON } from "@/components/icons";
import { isoDate, parseDate } from "@/lib/format";
import { monthLabel, shiftMonth } from "@/lib/month";
import type { CalendarDay } from "@/lib/types";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Heatmap shade for a day's sets: 0 none, then 1-8, 9-16, 17+. */
function heatLevel(sets: number): 0 | 1 | 2 | 3 {
  if (sets <= 0) return 0;
  if (sets <= 8) return 1;
  if (sets <= 16) return 2;
  return 3;
}
function describe(d: CalendarDay | undefined, iso: string): string {
  const date = parseDate(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if (!d || (!d.has_workout && !d.has_weight)) return `${date}, nothing logged`;
  const parts = [
    d.has_workout ? `workout, ${d.sets} sets` : null,
    d.has_weight ? "weigh-in" : null,
  ].filter(Boolean);
  return `${date}, ${parts.join(" and ")}`;
}

/**
 * A month heatmap: each day shaded by how many sets you logged, an ink dot for a
 * weigh-in, today bold and underlined. Arrow keys move between days. Without
 * `onMonth` it shows just the one month (no month arrows).
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
  onMonth?: (month: string) => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const count = new Date(y, m, 0).getDate();
  const byDate = new Map(days.map((d) => [d.date, d]));
  const cells: (string | null)[] = [
    ...Array<null>(first.getDay()).fill(null),
    ...Array.from({ length: count }, (_, i) =>
      isoDate(new Date(y, m - 1, i + 1)),
    ),
  ];
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const firstDay = cells.find((c): c is string => c !== null) ?? `${month}-01`;
  const focusable = selected?.startsWith(month)
    ? selected
    : today.startsWith(month)
      ? today
      : firstDay;

  function onKey(e: KeyboardEvent, iso: string) {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const step = steps[e.key];
    if (!step) return;
    e.preventDefault();
    const d = parseDate(iso);
    d.setDate(d.getDate() + step);
    const next = isoDate(d);
    if (!next.startsWith(month)) {
      if (!onMonth) return;
      onMonth(next.slice(0, 7));
    }
    onSelect(next);
    requestAnimationFrame(() => refs.current.get(next)?.focus());
  }

  return (
    <div className="stack-3">
      <div className="row-between">
        <h2 className="caps" aria-live="polite">
          {monthLabel(month)}
        </h2>
        {onMonth ? (
          <div className="row tight">
            <IconButton
              label="Previous month"
              onClick={() => onMonth(shiftMonth(month, -1))}
            >
              <ChevronLeft {...ICON} />
            </IconButton>
            <IconButton
              label="Next month"
              onClick={() => onMonth(shiftMonth(month, 1))}
            >
              <ChevronRight {...ICON} />
            </IconButton>
          </div>
        ) : null}
      </div>
      <div className="heatmap" role="grid" aria-label={monthLabel(month)}>
        {DOW.map((d) => (
          <div key={d} className="heat-dow" role="columnheader" aria-label={d}>
            {d.slice(0, 1)}
          </div>
        ))}
        {cells.map((iso, i) => {
          if (!iso)
            return (
              <div
                key={`pad${i}`}
                className="heat-day outside"
                aria-hidden="true"
              />
            );
          const d = byDate.get(iso);
          const cls = [
            "heat-day",
            d && heatLevel(d.sets) ? `l${heatLevel(d.sets)}` : null,
            iso === today && "today",
            iso === selected && "selected",
          ]
            .filter(Boolean)
            .join(" ");
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
              aria-current={iso === today ? "date" : undefined}
              tabIndex={iso === focusable ? 0 : -1}
              onClick={() => onSelect(iso)}
              onKeyDown={(e) => onKey(e, iso)}
            >
              {Number(iso.slice(8))}
              {d?.has_weight ? (
                <span className="dot" aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="heat-legend" aria-hidden="true">
        <span>
          Less <i style={{ background: "var(--heat-0)" }} />
          <i style={{ background: "var(--heat-1)" }} />
          <i style={{ background: "var(--heat-2)" }} />
          <i style={{ background: "var(--heat-3)" }} /> More sets
        </span>
        <span>
          <i className="dot-key" /> weigh-in
        </span>
      </div>
    </div>
  );
}
