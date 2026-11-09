import { useId } from 'react';

import { useRecentExercises } from '@/hooks/queries';
import { exerciseName } from '@/lib/format';

/** Pick one of the user's exercises, most recent first. */
export function ExerciseSelect({
  value,
  onChange,
  label = 'Exercise',
}: {
  value: string;
  onChange: (name: string) => void;
  label?: string;
}) {
  const id = useId();
  const names = useRecentExercises();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose an exercise</option>
        {names.map((n) => (
          <option key={n} value={n}>
            {exerciseName(n)}
          </option>
        ))}
      </select>
    </div>
  );
}
