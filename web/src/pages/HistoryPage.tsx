import { useState } from 'react';

import { Button } from '@/components/Button';
import { Stat } from '@/components/Stat';
import { EmptyState, ErrorState, QueryView, SkeletonCalendar, SkeletonEntries } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useNavigate } from 'react-router';

import { useCalendar, useLogs, useTz, useUnit } from '@/hooks/queries';
import { useTitle } from '@/hooks/useTitle';
import { longDate, signedWeight, todayIn, volume, weight } from '@/lib/format';
import type { CalendarDay } from '@/lib/types';
import { Entry } from '@/notebook/Entry';

import { Calendar } from './Calendar';

function DayDetail({ day, today, summary }: { day: string; today: string; summary: CalendarDay | undefined }) {
  const unit = useUnit();
  const navigate = useNavigate();
  const logs = useLogs(day, day);
  const { pendingDeletes } = useToast();
  const list = (logs.data ?? []).filter((l) => !pendingDeletes.has(l.id)).reverse();
  return (
    <section className="section" aria-label={longDate(day)}>
      <h2 className="t-heading section-head">
        {longDate(day)}
      </h2>
      {logs.error && !logs.data ? (
        <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />
      ) : !logs.data ? (
        <SkeletonEntries count={2} />
      ) : !list.length ? (
        <EmptyState
          message={
            day === today
              ? 'Nothing logged today. Type a set like 8x 160lb bench in the Notebook.'
              : `Nothing logged on ${longDate(day)}. To log today, type a set like 8x 160lb bench in the Notebook.`
          }
          actionLabel="Open notebook"
          onAction={() => navigate('/')}
        />
      ) : (
        <div className="stack-4">
          <div className="stats">
            <Stat label="Sets" value={`${summary?.sets ?? list.flatMap((l) => l.sets).length} sets`} />
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
  useTitle('History');
  const unit = useUnit();
  const today = todayIn(useTz());
  // Until you pick, follow "today" (it settles once the account's time zone loads).
  const [pickedMonth, setMonth] = useState<string | null>(null);
  const [picked, setSelected] = useState<string | null>(null);
  const month = pickedMonth ?? today.slice(0, 7);
  const selected = picked ?? today;
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
          Present
        </Button>
      </div>
      <section className="section">
        <QueryView query={cal} skeleton={<SkeletonCalendar />}>
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
      {selected ? <DayDetail day={selected} today={today} summary={current?.days.find((d) => d.date === selected)} /> : null}
    </main>
  );
}
