import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { LiftRow } from '@/components/LiftRow';
import { TrendChart, WeeklyBars } from '@/components/charts';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { Stat, StatRow } from '@/components/Stat';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useDashboard, useUnit } from '@/hooks/queries';
import { exerciseName, longDate, num, shortDate, signedWeight, volume, weight } from '@/lib/format';
import type { Dashboard, Unit } from '@/lib/types';
import { space } from '@/theme';

export default function DashboardScreen() {
  const q = useDashboard();
  const unit = useUnit();

  return (
    <Screen
      title="Dashboard"
      subtitle={q.data ? longDate(q.data.today.date) : undefined}
      onRefresh={() => q.refetch()}
      refreshing={q.isRefetching}>
      {q.isPending ? (
        <Skeleton rows={6} label="Loading your dashboard" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <DashboardBody data={q.data} unit={unit} />
      )}
    </Screen>
  );
}

function DashboardBody({ data, unit }: { data: Dashboard; unit: Unit }) {
  const { today, week, previous_week: prev, weight: w } = data;
  const hasAnything = week.sets > 0 || w.points.length > 0 || data.top_lifts.length > 0;
  if (!hasAnything && today.sets === 0) {
    return (
      <EmptyState
        message="Log your first workout to see your trends here."
        actionLabel="Log a workout"
        onAction={() => router.navigate('/log')}
      />
    );
  }
  const setsDelta = week.sets - prev.sets;

  return (
    <View>
      <Section title="Today" first>
        {today.sets > 0 ? (
          <>
            <StatRow>
              <Stat label="Sets" value={String(today.sets)} />
              <Stat label="Volume" value={volume(today.volume_lb, unit)} />
            </StatRow>
            <Text tone="secondary">{today.exercises.map(exerciseName).join(', ')}</Text>
          </>
        ) : (
          <View style={styles.inline}>
            <Text>No sets logged today.</Text>
            <Button label="Log a workout" variant="secondary" onPress={() => router.navigate('/log')} />
          </View>
        )}
        {today.weight_lb !== null ? (
          <Text tone="secondary">Weighed in at {weight(today.weight_lb, unit)} this morning.</Text>
        ) : null}
      </Section>

      <Section title="This week">
        <StatRow>
          <Stat
            label="Sets"
            value={String(week.sets)}
            detail={`${setsDelta >= 0 ? '+' : '−'}${Math.abs(setsDelta)} vs last week`}
          />
          <Stat label="Volume" value={volume(week.volume_lb, unit)} detail={`${week.sessions} sessions`} />
        </StatRow>
        <WeeklyBars weeks={data.weekly} />
      </Section>

      <Section title="Body weight">
        {w.points.length >= 2 ? (
          <>
            <TrendChart
              main={w.points}
              avg={w.average_7d}
              projection={w.projection}
              unit={unit}
              mainLabel="Weigh-ins"
              avgLabel="7-day average"
              mainStyle="dots"
              accessibilityLabel={weightSummary(data, unit)}
            />
            <Text tone="secondary">{weightSummary(data, unit)}</Text>
          </>
        ) : (
          <EmptyState
            message="Log a weigh-in like 182.4 to start your trend."
            actionLabel="Log a weigh-in"
            onAction={() => router.navigate('/log')}
          />
        )}
      </Section>

      <Section
        title="Top lifts"
        action={<Button label="All exercises" variant="text" onPress={() => router.push('/exercises')} />}>
        {data.top_lifts.length ? (
          <View>
            {data.top_lifts.map((l) => (
              <LiftRow
                key={l.exercise}
                name={l.exercise}
                value={weight(l.latest_e1rm, unit, 0)}
                change={l.e1rm_change}
                unit={unit}
              />
            ))}
            <Text variant="caption" tone="secondary" style={styles.note}>
              Estimated 1-rep max (Epley), latest session. Change is since your first sessions.
            </Text>
          </View>
        ) : (
          <Text tone="secondary">Log three sessions of a lift to see it here.</Text>
        )}
      </Section>
    </View>
  );
}

function weightSummary(data: Dashboard, unit: Unit): string {
  const p = data.weight.projection;
  const last = data.weight.points[data.weight.points.length - 1];
  const latest = last ? `Latest ${weight(last.value, unit)}.` : '';
  if (!p) return `${latest} Ten weigh-ins unlock a projection.`.trim();
  return (
    `${latest} Trend ${signedWeight(p.slope_per_week, unit)} a week; ` +
    `about ${weight(p.pred, unit)} by ${shortDate(p.target_date)} ` +
    `(${num(p.low)}–${num(p.high)}).`
  );
}

const styles = StyleSheet.create({
  inline: { gap: space.sm, alignItems: 'flex-start' },
  note: { marginTop: space.sm },
});
