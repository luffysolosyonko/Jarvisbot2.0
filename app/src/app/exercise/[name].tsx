import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { TrendChart } from '@/components/charts';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { Stat, StatRow } from '@/components/Stat';
import { ErrorState, Skeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useExercise, useForecast, useUnit } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { exerciseName, num, parseDate, shortDate, signedWeight, toLb, weight } from '@/lib/format';
import type { ExerciseDetail, Forecast, SetRef, Unit } from '@/lib/types';
import { layout, sizes, space, useTheme } from '@/theme';

export default function ExerciseScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const q = useExercise(name);
  const unit = useUnit();

  return (
    <Screen title={exerciseName(name)} edges={[]} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      {q.isPending ? (
        <Skeleton rows={6} label="Loading exercise" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Detail data={q.data} name={name} unit={unit} />
      )}
    </Screen>
  );
}

function setLabel(s: SetRef, unit: Unit): string {
  const reps = s.failed_reps ? `${s.good_reps}+${s.failed_reps}f` : `${s.good_reps}`;
  const w = s.bodyweight ? 'bodyweight' : weight(s.weight_lb, unit);
  return `${reps} × ${s.estimated ? '~' : ''}${w}${s.per_hand ? ' each' : ''}`;
}

function Detail({ data, name, unit }: { data: ExerciseDetail; name: string; unit: Unit }) {
  const { summary, forecast } = data;
  const latest = data.sessions[data.sessions.length - 1];
  return (
    <View>
      <Section title="Estimated 1-rep max" first>
        <StatRow>
          <Stat label="Latest session" value={weight(latest?.value, unit, 0)} />
          <Stat
            label="Best"
            value={weight(summary.best_e1rm, unit, 0)}
            detail={summary.e1rm_change !== null ? `${signedWeight(summary.e1rm_change, unit, 0)} since start` : undefined}
            detailTone={summary.e1rm_change !== null && summary.e1rm_change < 0 ? 'danger' : 'success'}
          />
        </StatRow>
        {data.sessions.length >= 2 ? (
          <TrendChart
            main={data.sessions}
            projection={forecast?.projection}
            unit={unit}
            mainLabel="Best set per session"
            accessibilityLabel={forecastSummary(forecast, unit) ?? `${data.sessions.length} sessions logged.`}
          />
        ) : null}
        <Text tone="secondary">
          {forecastSummary(forecast, unit) ??
            'A forecast needs at least 4 sessions over 2 or more weeks.'}
        </Text>
      </Section>

      {forecast ? (
        <Section title="When will I hit a target?">
          <TargetForm name={name} unit={unit} />
        </Section>
      ) : null}

      <Section title="Best sets">
        {data.best_set ? (
          <Row label="Highest est. 1RM" value={setLabel(data.best_set, unit)} detail={shortDate(data.best_set.date)} />
        ) : null}
        {data.heaviest_set ? (
          <Row label="Heaviest" value={setLabel(data.heaviest_set, unit)} detail={shortDate(data.heaviest_set.date)} />
        ) : null}
        {!data.best_set && !data.heaviest_set ? <Text tone="secondary">No weighted sets yet.</Text> : null}
      </Section>

      {data.rep_targets.length ? (
        <Section title="Rep targets">
          <Text tone="secondary">What your latest estimate suggests you could lift for each rep count.</Text>
          <RepTable targets={data.rep_targets} unit={unit} />
        </Section>
      ) : null}

      <Section title={`Last session · ${shortDate(summary.last_date)}`}>
        <View>
          {data.last_session.map((s, i) => (
            <Row key={i} label={`Set ${i + 1}`} value={setLabel(s, unit)} />
          ))}
        </View>
        {summary.failed_reps ? (
          <Text variant="label" tone="secondary">
            {summary.failed_reps} failed reps on top of {summary.good_reps} good reps overall.
          </Text>
        ) : null}
      </Section>
    </View>
  );
}

function forecastSummary(f: Forecast | null | undefined, unit: Unit): string | null {
  if (!f) return null;
  const p = f.projection;
  return (
    `Trend ${signedWeight(p.slope_per_week, unit)} a week over ${p.points} sessions. ` +
    `Projected ${weight(p.pred, unit, 0)} by ${shortDate(p.target_date)} ` +
    `(range ${num(p.low, 0)}–${num(p.high, 0)}).`
  );
}

function TargetForm({ name, unit }: { name: string; unit: Unit }) {
  const [input, setInput] = useState('');
  const [targetLb, setTargetLb] = useState<number | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const q = useForecast(name, targetLb);

  function submit() {
    const v = Number(input.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      setInputError(`Enter a weight in ${unit}, like ${unit === 'kg' ? '100' : '225'}.`);
      return;
    }
    setInputError(null);
    setTargetLb(Math.round(toLb(v, unit) * 10) / 10);
  }

  return (
    <View style={styles.form}>
      <View style={styles.formRow}>
        <View style={styles.flex}>
          <TextField
            label={`Target 1RM (${unit})`}
            value={input}
            onChangeText={setInput}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={submit}
            mono
            error={inputError}
          />
        </View>
        <View style={styles.formButton}>
          <Button label="Get date" onPress={submit} loading={q.isFetching} />
        </View>
      </View>
      {q.isError ? (
        <Text tone="danger">{errorMessage(q.error)}</Text>
      ) : q.data ? (
        <Text accessibilityLiveRegion="polite">{reachText(q.data, unit)}</Text>
      ) : null}
    </View>
  );
}

function reachText(f: Forecast, unit: Unit): string {
  const t = weight(f.target_lb, unit, 0);
  if (f.reach === 'already') return `You're already there: your estimated 1RM is at or above ${t}.`;
  if (f.reach === 'flat') return `Your trend isn't going up right now, so there's no date for ${t} yet.`;
  if (f.reach === 'date' && f.reach_date) {
    const weeks = Math.round(
      (parseDate(f.reach_date).getTime() - parseDate(f.projection.last_date).getTime()) / (7 * 86_400_000),
    );
    const caution = f.optimistic ? ' Gains usually slow down, so treat a far-off date as optimistic.' : '';
    return `At this pace you'd reach ${t} around ${shortDate(f.reach_date)}, about ${weeks} weeks from your last session.${caution}`;
  }
  return '';
}

function Row({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.row, { borderBottomColor: colors.border }]}
      accessible
      accessibilityLabel={`${label}: ${value}${detail ? `, ${detail}` : ''}`}>
      <Text tone="secondary" style={styles.flex}>
        {label}
      </Text>
      <Text mono tabular>
        {value}
      </Text>
      {detail ? (
        <Text variant="label" tone="secondary" style={styles.detail}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

function RepTable({ targets, unit }: { targets: { reps: number; weight_lb: number }[]; unit: Unit }) {
  const { colors } = useTheme();
  return (
    <View>
      {targets.map((t) => (
        <View
          key={t.reps}
          style={[styles.row, { borderBottomColor: colors.border }]}
          accessible
          accessibilityLabel={`${t.reps} reps: ${weight(t.weight_lb, unit, 0)}`}>
          <Text mono tabular style={styles.flex}>
            {t.reps} {t.reps === 1 ? 'rep' : 'reps'}
          </Text>
          <Text mono tabular weight="semibold">
            {weight(t.weight_lb, unit, 0)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.sm },
  formRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, flexWrap: 'wrap' },
  formButton: { paddingBottom: 0 },
  flex: { flex: 1, minWidth: sizes.statMinWidth },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: layout.touchTarget,
    borderBottomWidth: layout.hairline,
  },
  detail: { minWidth: space.xxl, textAlign: 'right' },
});
