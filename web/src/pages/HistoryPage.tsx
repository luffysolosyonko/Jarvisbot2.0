import { useState } from 'react';

import { Button } from '@/components/Button';
import { Stat } from '@/components/Stat';
import { EmptyState, ErrorState, QueryView, Skeleton } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useCalendar, useLogs, useTz, useUnit } from '@/hooks/queries';
import { longDate, signedWeight, todayIn, volume, weight } from '@/lib/format';
import type { CalendarDay } from '@/lib/types';
import { Entry } from '@/notebook/Entry';

import { Calendar } from './Calendar';

function DayDetail({ day, summary }: { day: string; summary: CalendarDay | undefined }) {
  const unit = useUnit();
  const logs = useLogs(day, day);
  const { pendingDeletes } = useToast();
  const list = (logs.data ?? []).filter((l) => !pendingDeletes.has(l.id)).reverse();
  return (
    <section className="section" aria-label={longDate(day)}>
      <h2 className="t-heading" style={{ marginBottom: 24 }}>
        {longDate(day)}
      </h2>
      {logs.error && !logs.data ? (
        <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />
      ) : !logs.data ? (
        <Skeleton lines={4} />
      ) : !list.length ? (
        <EmptyState message="Nothing logged this day." />
      ) : (
        <div className="stack-4">
          <div className="stats">
            <Stat label="Sets" value={String(summary?.sets ?? list.flatMap((l) => l.sets).length)} />
            <Stat label="Volume" value={volume(summary?.volume_lb ?? 0, unit)} />
            <Stat label="Weigh-in" value={summary?.weight_lb != null ? weight(summary.weight_lb, unit) : '–'} />
          </div>
          <div>
            {list.map((l) => (
              <Entry key={l.id} log={l} unit={unit} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function HistoryPage() {
  const unit = useUnit();
  const today = todayIn(useTz());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(today);
  const cal = useCalendar(month);
  const current = cal.data?.month === month ? cal.data : undefined;

  return (
    <main className="main" id="main">
      <div className="page-header">
        <h1 className="t-title">History</h1>
        <Button
          size="small"
          onClick={() => {
            setMonth(today.slice(0, 7));
            setSelected(today);
          }}>
          Jump to today
        </Button>
      </div>
      <section className="section">
        <QueryView query={cal} lines={6}>
          {(c) => (
            <div className="stack-3">
              <Calendar
                month={month}
                days={current?.days ?? []}
                today={today}
                selected={selected}
                onSelect={setSelected}
                onMonth={setMonth}
              />
              <p className="t-label" aria-live="polite">
                {c.workouts} workout{c.workouts === 1 ? '' : 's'} this month · {c.sets} sets · {volume(c.volume_lb, unit)}
                {c.weight_change_lb !== null ? ` · weight ${signedWeight(c.weight_change_lb, unit)}` : ''}
              </p>
            </div>
          )}
        </QueryView>
      </section>
      {selected ? <DayDetail day={selected} summary={current?.days.find((d) => d.date === selected)} /> : null}
    </main>
  );
}
