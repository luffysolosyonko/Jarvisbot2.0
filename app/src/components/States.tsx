import { StyleSheet, View } from 'react-native';

import { errorMessage } from '@/lib/api';
import { radii, space, useTheme } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

/** Skeleton rows: the loading state for every screen (no centered spinners). */
export function Skeleton({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel={label} accessibilityRole="progressbar" style={styles.skeleton}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <View style={[styles.bar, { backgroundColor: colors.border, width: i % 2 ? '45%' : '70%' }]} />
          <View style={[styles.barSmall, { backgroundColor: colors.border, width: i % 2 ? '30%' : '20%' }]} />
        </View>
      ))}
    </View>
  );
}

/** One sentence and one action. */
export function EmptyState({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.state}>
      <Text>{message}</Text>
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} variant="secondary" onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

/** What went wrong, and a retry. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View style={styles.state} accessibilityLiveRegion="polite">
      <Text tone="danger">{errorMessage(error)}</Text>
      <View style={styles.action}>
        <Button label="Try again" variant="secondary" onPress={onRetry} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { gap: space.md },
  skeletonRow: { gap: space.xs },
  bar: { height: space.sm, borderRadius: radii.control },
  barSmall: { height: space.xs, borderRadius: radii.control },
  state: { gap: space.sm, alignItems: 'flex-start' },
  action: { alignSelf: 'flex-start' },
});
