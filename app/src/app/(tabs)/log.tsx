import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { SetTable } from '@/components/SetTable';
import { LogEntry } from '@/components/LogEntry';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useDashboard, useLogs, useParsePreview, useSaveLog, useUnit } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { errorMessage } from '@/lib/api';
import { isoDate, weight } from '@/lib/format';
import type { ParseResult, Unit } from '@/lib/types';
import { layout, space } from '@/theme';

const EXAMPLE = '5x 155lb 2x1x1xf bench';

export default function LogScreen() {
  const unit = useUnit();
  const [text, setText] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const debounced = useDebounced(text, 400);
  const preview = useParsePreview(debounced);
  const save = useSaveLog();
  const today = useDashboard().data?.today.date ?? isoDate(new Date());

  const stale = text.trim() !== debounced.trim();
  const result = text.trim() ? preview.data : undefined;
  const canSave = !!result && (result.sets.length > 0 || !!result.weigh_in) && !stale && !save.isPending;

  function onSave() {
    setSaved(null);
    save.mutate(text, {
      onSuccess: (log) => {
        setText('');
        setSaved(
          log.kind === 'weight'
            ? `Saved weigh-in: ${weight(log.weigh_in?.weight_lb, unit)}.`
            : `Saved ${log.sets.length} ${log.sets.length === 1 ? 'set' : 'sets'}.`,
        );
      },
    });
  }

  return (
    <Screen title="Log" subtitle="One set per line, the way you'd write it in your notes.">
      <View style={styles.input}>
        <TextField
          label="Sets or a weigh-in"
          mono
          multiline
          value={text}
          onChangeText={(t) => {
            setText(t);
            setSaved(null);
            save.reset();
          }}
          placeholder={`${EXAMPLE}\n8x 135lb bb row\n182.4`}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          hint="kg is converted to lb. Use f for failed reps, ? for a guess, uw for bodyweight."
        />
        {save.isError ? (
          <Text tone="danger" accessibilityLiveRegion="polite">
            {errorMessage(save.error)}
          </Text>
        ) : null}
        {saved ? (
          <Text tone="success" accessibilityLiveRegion="polite">
            {saved}
          </Text>
        ) : null}
        <Button label="Save" onPress={onSave} disabled={!canSave} loading={save.isPending} fullWidth />
      </View>

      <Section title="Preview">
        <Preview
          text={text}
          result={result}
          loading={!!text.trim() && (stale || preview.isFetching) && !result}
          error={text.trim() && !stale ? preview.error : null}
          onRetry={() => preview.refetch()}
          onExample={() => setText(EXAMPLE)}
          unit={unit}
        />
      </Section>

      <Section title="Today">
        <TodayLogs today={today} unit={unit} />
      </Section>
    </Screen>
  );
}

function Preview({
  text,
  result,
  loading,
  error,
  onRetry,
  onExample,
  unit,
}: {
  text: string;
  result: ParseResult | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onExample: () => void;
  unit: Unit;
}) {
  if (!text.trim()) {
    return (
      <EmptyState message="Start typing and the parsed sets show up here." actionLabel="Try an example" onAction={onExample} />
    );
  }
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading || !result) return <Skeleton rows={2} label="Reading your sets" />;
  return (
    <View style={styles.preview}>
      {result.kind === 'weight' && result.weigh_in ? (
        <Text>
          Weigh-in:{' '}
          <Text mono tabular weight="semibold">
            {weight(result.weigh_in.weight_lb, unit)}
          </Text>
          {result.weigh_in.note ? <Text tone="secondary"> · {result.weigh_in.note}</Text> : null}
        </Text>
      ) : null}
      {result.sets.length ? <SetTable sets={result.sets} unit={unit} /> : null}
      {result.warnings.length ? (
        <View style={styles.warnings} accessibilityLiveRegion="polite">
          {result.warnings.map((w) => (
            <Text key={`${w.line}-${w.message}`} variant="label">
              <Text variant="label" weight="semibold" tone="danger">
                Line {w.line}:
              </Text>{' '}
              {w.message}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function TodayLogs({ today, unit }: { today: string; unit: Unit }) {
  const q = useLogs(today, today);
  if (q.isPending) return <Skeleton rows={2} label="Loading today's logs" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data.length) return <Text tone="secondary">Nothing logged today yet.</Text>;
  return (
    <View style={styles.logs}>
      {q.data.map((log) => (
        <LogEntry key={log.id} log={log} unit={unit} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { gap: layout.itemGap },
  preview: { gap: space.sm },
  warnings: { gap: space.xs },
  logs: { gap: layout.itemGap },
});
