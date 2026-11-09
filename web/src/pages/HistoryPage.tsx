import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '@/components/Button';
import { Section } from '@/components/Section';
import { SetRows } from '@/components/SetRows';
import { EmptyState, ErrorState, QueryView, SkeletonCalendar, SkeletonEntries } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useCalendar, useLogs, useTz, useUnit } from '@/hooks/queries';
import { useTitle } from '@/hooks/useTitle';
import { longDate, signedWeight, todayIn, weight } from '@/lib/format';
import type { CalendarDay } from '@/lib/types';

import { Calendar } from './Calendar';

function DayDetail({ day, today, summary }: { day: string; today: string; summary: CalendarDay | undefined }) {
  const unit = useUnit();
  const navigate = useNavigate();
  const logs = useLogs(day, day);
  const { pendingDeletes } = useToast();
  const list = (logs.data ?? []).filter((l) => !pendingDeletes.has(l.id)).reverse(); // oldest first
  const sets = list.flatMap((l) => l.sets);
  const weighIn = summary?.weight_lb ?? list.findLast((l) => l.weigh_in)?.weigh_in?.weight_lb ?? null;
  return (
    <Section title={longDate(day)}>
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
        <div className="stack-3">
          {sets.length ? (
            <div className="surface">
              <SetRows sets={sets} unit={unit} caption={`Sets on ${longDate(day)}`} />
            </div>
          ) : null}
          {weighIn !== null ? (
            <p className="t-label">
              Weigh-in <span className="tnum semibold">{weight(weighIn, unit)}</span>
            </p>
          ) : null}
        </div>
      )}
    </Section>
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
          Jump to today
        </Button>
      </div>
      <div className="grid-2">
      <Section title="Calendar">
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
                {c.workouts} workout{c.workouts === 1 ? '' : 's'} this month · {c.sets} sets
                {c.weight_change_lb !== null ? ` · weight ${signedWeight(c.weight_change_lb, unit)}` : ''}
              </p>
            </div>
          )}
        </QueryView>
      </Section>
      {selected ? <DayDetail day={selected} today={today} summary={current?.days.find((d) => d.date === selected)} /> : null}
      </div>
    </main>
  );
}
