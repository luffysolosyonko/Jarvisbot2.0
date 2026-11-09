import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider, UNDO_MS } from '@/components/Toast';
import type { Log, Mode, ParseResult, ParseWarning } from '@/lib/types';
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

function ComposerHarness({ onSend, initialMode = 'workout' }: { onSend: (text: string) => void; initialMode?: Mode }) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>(initialMode);
  return (
    <Composer
      mode={mode}
      onModeChange={setMode}
      text={text}
      onTextChange={setText}
      onSend={() => onSend(text)}
      sending={false}
      error={null}
      unit="lb"
      tz="America/Chicago"
      tools={null}
    />
  );
}

describe('Composer', () => {
  it('is just the mode switch, a time line and the text box', () => {
    wrap(<ComposerHarness onSend={vi.fn()} />);
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Sets, one per line')).toBeInTheDocument();
    expect(document.querySelector('time')?.textContent).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), \w{3} \d{1,2} · \d{1,2}:\d{2} (AM|PM)$/);
  });

  it('sends on Enter and adds a line on Shift+Enter', async () => {
    const onSend = vi.fn();
    wrap(<ComposerHarness onSend={onSend} />);
    const input = screen.getByLabelText('Sets, one per line');
    await userEvent.type(input, '5x 155lb bench{Shift>}{Enter}{/Shift}8x 135lb');
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue('5x 155lb bench\n8x 135lb');
    await userEvent.type(input, '{Enter}');
    expect(onSend).toHaveBeenCalledWith('5x 155lb bench\n8x 135lb');
  });

  it('reads the text in one line, using the mode', async () => {
    wrap(<ComposerHarness onSend={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Sets, one per line'), '5x 155lb 1x bench');
    expect(await screen.findByText('2 sets · Bench')).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith('/parse', expect.objectContaining({ body: { text: '5x 155lb 1x bench', mode: 'workout' } }));
  });

  it('Ask mode has the question box and no logging line', async () => {
    wrap(<ComposerHarness onSend={vi.fn()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Ask' }));
    expect(screen.getByLabelText('Question for Jarvis')).toHaveAttribute('placeholder', 'Is my bench still improving?');
    expect(document.querySelector('time')).toBeNull();
    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();
  });

  it('has one simple send button in every mode', async () => {
    const onSend = vi.fn();
    wrap(<ComposerHarness onSend={onSend} />);
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Sets, one per line'), '5x 155lb bench');
    await userEvent.click(send);
    expect(onSend).toHaveBeenCalledTimes(1);
    for (const mode of ['Weight', 'Ask']) {
      await userEvent.click(screen.getByRole('radio', { name: mode }));
      expect(screen.getAllByRole('button', { name: 'Send' })).toHaveLength(1);
    }
  });

});

describe('MoreMenu', () => {
  it('lists the tools and, when there are answers, Hide answers', async () => {
    const onPick = vi.fn();
    const onHide = vi.fn();
    render(<MoreMenu onPick={onPick} onHideAnswers={onHide} />);
    await userEvent.click(screen.getByRole('button', { name: /^More/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Predict lift/ }));
    expect(onPick).toHaveBeenCalledWith('predict-lift');
    await userEvent.click(screen.getByRole('button', { name: /^More/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Hide answers' }));
    expect(onHide).toHaveBeenCalled();
  });

  it('has no Hide answers item when there is nothing to hide', async () => {
    render(<MoreMenu onPick={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /^More/ }));
    expect(screen.queryByRole('menuitem', { name: 'Hide answers' })).not.toBeInTheDocument();
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
    expect(screen.getByText('Not logged')).toBeInTheDocument();
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

  it('fills workout days, outlines weigh-in-only days and marks today', async () => {
    const onSelect = vi.fn();
    render(<Calendar month="2026-11" days={days} today="2026-11-09" selected={null} onSelect={onSelect} onMonth={vi.fn()} />);
    const workout = screen.getByRole('gridcell', { name: /November 2, workout, 20 sets and weigh-in/ });
    expect(workout).toHaveClass('workout');
    expect(screen.getByRole('gridcell', { name: /November 4, weigh-in/ })).toHaveClass('weight');
    expect(screen.getByRole('gridcell', { name: /November 9, nothing logged/ })).toHaveAttribute('aria-current', 'date');
    await userEvent.click(workout);
    expect(onSelect).toHaveBeenCalledWith('2026-11-02');
    expect(screen.getByText('Weigh-in only')).toBeInTheDocument();
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
