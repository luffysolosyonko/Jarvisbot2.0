import { render, screen } from '@testing-library/react-native';

import { setFlags, SetTable } from '@/components/SetTable';

import { HEADLINE_PARSE } from '../test-utils/fixtures';

describe('SetTable', () => {
  it('shows each parsed set with good and failed reps', async () => {
    await render(<SetTable sets={HEADLINE_PARSE.sets} unit="lb" />);
    expect(screen.getByText('Bench')).toBeTruthy(); // the name once, not per row
    expect(screen.getAllByText('155')).toHaveLength(5);
    expect(screen.getByLabelText('Bench, 0 good, 1 failed, 155 lb')).toBeTruthy();
    expect(screen.getByLabelText('Bench, 5 reps, 155 lb')).toBeTruthy();
  });

  it('converts to kg for display', async () => {
    await render(<SetTable sets={HEADLINE_PARSE.sets.slice(0, 1)} unit="kg" />);
    expect(screen.getByText('70.3')).toBeTruthy();
    expect(screen.getByLabelText('Bench, 5 reps, 70.3 kg')).toBeTruthy();
  });

  it('labels estimated, bodyweight and per-hand sets', async () => {
    expect(setFlags({ estimated: true, bodyweight: false, per_hand: true })).toBe('est each');
    expect(setFlags({ estimated: false, bodyweight: true, per_hand: false })).toBe('bw');
    const bw = { ...HEADLINE_PARSE.sets[0], bodyweight: true, weight_lb: null, exercise: 'dips', matched_exercise: 'dips' };
    await render(<SetTable sets={[bw]} unit="lb" />);
    expect(screen.getByLabelText('Dips, 5 reps, bodyweight')).toBeTruthy();
  });
});
