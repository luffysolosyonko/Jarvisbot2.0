import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExerciseSelect } from '@/components/ExerciseSelect';
import { ToastProvider, UNDO_MS } from '@/components/Toast';
import type { Log, LogMode, ParseResult, ParseWarning } from '@/lib/types';
import { Composer } from '@/notebook/Composer';
import { Entry } from '@/notebook/Entry';
import { FixList } from '@/notebook/FixList';
import { Calendar } from '@/pages/Calendar';
import { MoreMenu } from '@/tools/MoreMenu';

const apiMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api')>();
  return { ...real, api: (path: string, opts?: unknown) => apiMock(path, opts) };
});

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

const warning = (w: Partial<ParseWarning>): ParseWarning => ({ line: 1, message: 'Not understood.', code: 'not_understood', fixes: [], ...w });

const PARSED: ParseResult = {
  kind: 'workout',
  sets: [1, 2].map((i) => ({
    idx: i,
    line: 1,
    exercise: 'bench',
    matched_exercise: 'bench',
    reps: 5,
    good_reps: 5,
    failed_reps: 0,
    weight_lb: 155,
    weight_text: '155lb',
    estimated: false,
    bodyweight: false,
    per_hand: false,
    inferred: false,
  })),
  weigh_in: null,
  warnings: [],
  exercises: [{ written: 'bench', matched: 'bench', is_new: false }],
};

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation(async (path: string) => {
    if (path === '/exercises') return { exercises: [] };
    if (path === '/parse') return PARSED;
    throw new Error(`unexpected ${path}`);
  });
});

function ComposerHarness({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<LogMode>('workout');
  return (
    <Composer
      mode={mode}
      onModeChange={setMode}
      text={text}
      onTextChange={setText}
      onSend={() => onSend(text)}
      error={null}
      unit="lb"
      tools={null}
    />
  );
}

describe('Composer', () => {
  it('has the Workout/Weight switch, a labelled box and a save button, and nothing for Ask', () => {
    wrap(<ComposerHarness onSend={vi.fn()} />);
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['Workout', 'Weight']);
    expect(screen.getByRole('radio', { name: 'Workout' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('button', { name: /Ask/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Log a set')).toHaveAttribute('placeholder', '(reps)x (weight) (lift)');
    expect(screen.getByText('e.g. 8x 135lb bench')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save entry' })).toBeDisabled();
  });

  it('sends on Enter and adds a line on Shift+Enter', async () => {
    const onSend = vi.fn();
    wrap(<ComposerHarness onSend={onSend} />);
    const input = screen.getByLabelText('Log a set');
    await userEvent.type(input, '5x 155lb bench{Shift>}{Enter}{/Shift}8x 135lb');
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue('5x 155lb bench\n8x 135lb');
    await userEvent.type(input, '{Enter}');
    expect(onSend).toHaveBeenCalledWith('5x 155lb bench\n8x 135lb');
  });

  it('previews the note the entry will get, using the mode', async () => {
    wrap(<ComposerHarness onSend={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Log a set'), '5x 155lb 1x bench');
    expect(await screen.findByText(/↳ Bench · 5, 5 reps · 155 lb/)).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith('/parse', expect.objectContaining({ body: { text: '5x 155lb 1x bench', mode: 'workout' } }));
  });

  it('stays quiet about a half-typed line: no warnings or fix buttons, just the example', async () => {
    apiMock.mockImplementation(async (path: string) =>
      path === '/parse'
        ? {
            ...PARSED,
            sets: [],
            exercises: [],
            warnings: [
              warning({
                message: 'No exercise name.',
                fixes: [{ label: 'Add sit ups', line: 1, text: '12x sit ups', template: null, placeholder: null, mode: null }],
              }),
            ],
          }
        : { exercises: [] },
    );
    wrap(<ComposerHarness onSend={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Log a set'), '12x');
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/parse', expect.objectContaining({ body: { text: '12x', mode: 'workout' } })));
    expect(screen.queryByText('No exercise name.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add sit ups' })).not.toBeInTheDocument();
    expect(screen.getByText('e.g. 8x 135lb bench')).toBeInTheDocument();
  });

  it('Weight mode has its own label and placeholder', async () => {
    wrap(<ComposerHarness onSend={vi.fn()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Weight' }));
    expect(screen.getByLabelText('Log weight')).toHaveAttribute('placeholder', '(weight)kg/lb');
    expect(screen.getByText('e.g. 70.3kg or 155lb')).toBeInTheDocument();
  });
});

describe('MoreMenu', () => {
  it('lists the tools, and only the tools', async () => {
    const onPick = vi.fn();
    render(<MoreMenu onPick={onPick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tools' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Stats',
      'Lift',
      'Estimate',
      'Predict weight',
      'Predict lift',
      'Charts',
      'Search',
      'Syntax',
    ]);
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: /^Predict lift/ }));
    expect(onPick).toHaveBeenCalledWith('predict-lift');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('FixList', () => {
  it('applies a one-click fix and a fix that needs a value', async () => {
    const onApply = vi.fn();
    render(
      <FixList
        text={'8x 135lb bench\n8 135 squat'}
        onApply={onApply}
        warnings={[
          warning({
            line: 2,
            fixes: [
              { label: 'Add unit: lb', line: 2, text: '8x 135lb squat', template: null, placeholder: null, mode: null },
              { label: 'Add weight in kg', line: 2, text: null, template: '8x {}kg squat', placeholder: '60', mode: null },
            ],
          }),
        ]}
      />,
    );
    expect(screen.getByText('Not understood.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add unit: lb' }));
    expect(onApply).toHaveBeenLastCalledWith('8x 135lb bench\n8x 135lb squat', null);
    await userEvent.click(screen.getByRole('button', { name: 'Add weight in kg…' }));
    await userEvent.type(screen.getByPlaceholderText('60'), '60');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenLastCalledWith('8x 135lb bench\n8x 60kg squat', null);
  });
});

const LOG: Log = {
  id: 7,
  kind: 'workout',
  raw_text: '5x 155lb bench\n8 135 squat',
  logged_at: '2026-11-09T17:00:00Z',
  local_date: '2026-11-09',
  sets: PARSED.sets.slice(0, 1),
  weigh_in: null,
  warnings: [
    warning({ line: 2, fixes: [{ label: 'Add unit: lb', line: 2, text: '8x 135lb squat', template: null, placeholder: null, mode: null }] }),
  ],
};

describe('Entry', () => {
  it('shows Logged, marks the unparsed line and fixes it with a PATCH', async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path === '/logs/7') return { ...LOG, raw_text: '5x 155lb bench\n8x 135lb squat', warnings: [] };
      return {};
    });
    wrap(<Entry log={LOG} unit="lb" />);
    expect(screen.getByRole('button', { name: /^Logged: 1 set · Bench/ })).toBeInTheDocument();
    expect(screen.queryByText('You')).not.toBeInTheDocument(); // no names on entries
    expect(screen.getByText(/Not logged/)).toBeInTheDocument();
    expect(screen.getByText('↳ Bench · 5 reps · 155 lb')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fix' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add unit: lb' }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/logs/7', { method: 'PATCH', body: { text: '5x 155lb bench\n8x 135lb squat' } }),
    );
  });

  it('edits inline and saves with Enter', async () => {
    apiMock.mockResolvedValue({ ...LOG, warnings: [] });
    wrap(<Entry log={LOG} unit="lb" />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit entry' }));
    const box = screen.getByLabelText('Edit entry text');
    await userEvent.clear(box);
    await userEvent.type(box, '5x 160lb bench{Enter}');
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/logs/7', { method: 'PATCH', body: { text: '5x 160lb bench' } }));
  });

  it('clicking the text edits it in place: clicking away saves, Escape puts it back', async () => {
    apiMock.mockResolvedValue({ ...LOG, warnings: [] });
    wrap(
      <>
        <Entry log={LOG} unit="lb" />
        <button type="button">elsewhere</button>
      </>,
    );
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('5x 155lb bench'));
    const box = screen.getByLabelText('Edit entry text');
    expect(box).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByLabelText('Edit entry text')).not.toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith('/logs/7', expect.anything());

    await userEvent.click(screen.getByText('5x 155lb bench'));
    await userEvent.clear(screen.getByLabelText('Edit entry text'));
    await userEvent.type(screen.getByLabelText('Edit entry text'), '5x 165lb bench');
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/logs/7', { method: 'PATCH', body: { text: '5x 165lb bench' } }));
  });

  it('deletes only after the undo window, and Undo cancels it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apiMock.mockResolvedValue(undefined);
    try {
      wrap(<Entry log={LOG} unit="lb" />);
      fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      await act(async () => {
        vi.advanceTimersByTime(UNDO_MS + 100);
      });
      expect(apiMock).not.toHaveBeenCalledWith('/logs/7', { method: 'DELETE' });

      fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
      await act(async () => {
        vi.advanceTimersByTime(UNDO_MS + 100);
      });
      await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/logs/7', { method: 'DELETE' }));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Calendar', () => {
  const days = [
    { date: '2026-11-02', has_workout: true, has_weight: true, sets: 20, volume_lb: 9000, weight_lb: 181 },
    { date: '2026-11-04', has_workout: false, has_weight: true, sets: 0, volume_lb: 0, weight_lb: 180.5 },
  ];

  it('shades days by sets, dots weigh-ins and marks today', async () => {
    const onSelect = vi.fn();
    render(<Calendar month="2026-11" days={days} today="2026-11-09" selected={null} onSelect={onSelect} onMonth={vi.fn()} />);
    const workout = screen.getByRole('gridcell', { name: /November 2, workout, 20 sets and weigh-in/ });
    expect(workout).toHaveClass('l3');
    expect(workout.querySelector('.dot')).not.toBeNull();
    const weighIn = screen.getByRole('gridcell', { name: /November 4, weigh-in/ });
    expect(weighIn).not.toHaveClass('l1');
    expect(weighIn.querySelector('.dot')).not.toBeNull();
    expect(screen.getByRole('gridcell', { name: /November 9, nothing logged/ })).toHaveAttribute('aria-current', 'date');
    await userEvent.click(workout);
    expect(onSelect).toHaveBeenCalledWith('2026-11-02');
    expect(screen.getByText(/More sets/)).toBeInTheDocument();
  });

  it('moves between months with the buttons and arrow keys', async () => {
    const onMonth = vi.fn();
    const onSelect = vi.fn();
    render(<Calendar month="2026-11" days={days} today="2026-11-09" selected="2026-11-30" onSelect={onSelect} onMonth={onMonth} />);
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onMonth).toHaveBeenLastCalledWith('2026-12');
    fireEvent.keyDown(screen.getByRole('gridcell', { name: /November 30/ }), { key: 'ArrowRight' });
    expect(onMonth).toHaveBeenLastCalledWith('2026-12');
    expect(onSelect).toHaveBeenLastCalledWith('2026-12-01');
  });
});

const WEIGH_IN: Log = {
  id: 9,
  kind: 'weight',
  raw_text: '90',
  logged_at: '2026-11-10T14:00:00Z',
  local_date: '2026-11-10',
  sets: [],
  weigh_in: { weight_lb: 198.4, note: null, typed: 90, typed_unit: 'kg', unit_assumed: true },
  warnings: [],
};

describe('Weigh-in note', () => {
  it('is a plain note of what was logged: no warning, no buttons to confirm it', () => {
    const typed = { ...WEIGH_IN, raw_text: '250lb', weigh_in: { ...WEIGH_IN.weigh_in!, weight_lb: 250, typed: 250, typed_unit: 'lb' as const, unit_assumed: false } };
    wrap(<Entry log={typed} unit="lb" />);
    expect(screen.getByText('↳ weigh-in · 250.0 lb')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Logged: 250 lb/ })).toHaveClass('note');
    expect(screen.queryByText(/7-day average|assumed|\?/)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Check this weigh-in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Keep|It was|Edit$)/ })).not.toBeInTheDocument();
  });

  it('shows the conversion when the unit was assumed, in the same plain note', () => {
    wrap(<Entry log={WEIGH_IN} unit="lb" />);
    const note = screen.getByText('↳ weigh-in · 90 kg = 198.4 lb');
    expect(note.closest('button')).toHaveClass('note');
    expect(document.querySelector('.warn')).toBeNull();
    expect(screen.queryByRole('button', { name: /^(Keep|It was|Edit$)/ })).not.toBeInTheDocument();
  });

  it('needs no conversion when the assumed unit is the one shown', () => {
    wrap(<Entry log={WEIGH_IN} unit="kg" />);
    expect(screen.getByText('↳ weigh-in · 90.0 kg')).toBeInTheDocument();
  });
});

describe('ExerciseSelect', () => {
  const ex = (exercise: string, last_date: string) => ({ exercise, last_date });

  function Harness({ onPick }: { onPick: (n: string) => void }) {
    const [v, setV] = useState('');
    return (
      <ExerciseSelect
        value={v}
        onChange={(n) => {
          setV(n);
          onPick(n);
        }}
      />
    );
  }

  it('filters as you type and picks with the keyboard or a click, newest first', async () => {
    apiMock.mockImplementation(async (path: string) =>
      path === '/exercises' ? { exercises: [ex('bench', '2026-11-01'), ex('squat', '2026-11-03'), ex('barbell row', '2026-10-01')] } : {},
    );
    const onPick = vi.fn();
    wrap(<Harness onPick={onPick} />);
    const box = screen.getByRole('combobox', { name: 'Exercise' });
    await userEvent.click(box);
    await waitFor(() => expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Squat', 'Bench', 'Barbell row']));
    await userEvent.type(box, 'ba');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Barbell row']);
    await userEvent.keyboard('{Enter}');
    expect(onPick).toHaveBeenLastCalledWith('barbell row');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(box).toHaveValue('Barbell row');
    await userEvent.click(box);
    await userEvent.click(screen.getByRole('option', { name: 'Squat' }));
    expect(onPick).toHaveBeenLastCalledWith('squat');
  });
});
