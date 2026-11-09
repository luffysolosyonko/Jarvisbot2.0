import { router } from 'expo-router';
import { View } from 'react-native';

import { LiftRow } from '@/components/LiftRow';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { useExercises, useUnit } from '@/hooks/queries';
import { weight } from '@/lib/format';

export default function ExercisesScreen() {
  const q = useExercises();
  const unit = useUnit();
  return (
    <Screen title="Exercises" edges={[]} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      {q.isPending ? (
        <Skeleton rows={8} label="Loading exercises" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState message="No exercises logged yet." actionLabel="Log a workout" onAction={() => router.navigate('/log')} />
      ) : (
        <View>
          {q.data.map((e) => (
            <LiftRow
              key={e.exercise}
              name={e.exercise}
              value={e.best_e1rm ? weight(e.best_e1rm, unit, 0) : '–'}
              detail={`${e.sessions} ${e.sessions === 1 ? 'session' : 'sessions'} · best est. 1RM`}
              unit={unit}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
