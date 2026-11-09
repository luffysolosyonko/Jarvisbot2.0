import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { LogEntry } from '@/components/LogEntry';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { useDashboard, useLogs, useUnit } from '@/hooks/queries';
import { dayLabel, isoDate, parseDate } from '@/lib/format';
import type { Log } from '@/lib/types';
import { layout, space } from '@/theme';


const PAGE_DAYS = 14;

/** Read-only: logs by day, raw text above its parsed rows. */
export default function HistoryScreen() {
  const unit = useUnit();
  const today = useDashboard().data?.today.date ?? isoDate(new Date());
  const [days, setDays] = useState(PAGE_DAYS);
  const from = useMemo(() => {
    const d = parseDate(today);
    d.setDate(d.getDate() - (days - 1));
    return isoDate(d);
  }, [today, days]);
  const q = useLogs(from, today);

  const byDay = useMemo(() => {
    const groups = new Map<string, Log[]>();
    for (const log of q.data ?? []) {
      groups.set(log.local_date, [...(groups.get(log.local_date) ?? []), log]);
    }
    return [...groups.entries()];
  }, [q.data]);

  return (
    <Screen title="History" onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      {q.isPending ? (
        <Skeleton rows={6} label="Loading history" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !byDay.length ? (
        <EmptyState
          message={`Nothing logged in the last ${days} days.`}
          actionLabel="Log a workout"
          onAction={() => router.navigate('/log')}
        />
      ) : (
        <View>
          {byDay.map(([day, logs], i) => (
            <Section key={day} title={dayLabel(day, today)} first={i === 0}>
              <View style={styles.logs}>
                {[...logs].reverse().map((log) => (
                  <LogEntry key={log.id} log={log} unit={unit} />
                ))}
              </View>
            </Section>
          ))}
          {days < 364 ? (
            <View style={styles.more}>
              <Button
                label="Show earlier"
                variant="secondary"
                onPress={() => setDays((d) => Math.min(d + PAGE_DAYS * 2, 364))}
                loading={q.isFetching}
              />
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  logs: { gap: layout.itemGap },
  more: { marginTop: space.xl, alignSelf: 'flex-start' },
});
