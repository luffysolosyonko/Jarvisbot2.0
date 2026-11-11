import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Layout } from '@/components/Layout';
import { ToastProvider } from '@/components/Toast';
import { ApiError } from '@/lib/api';
import type { AskMessage } from '@/lib/types';
import { NotebookPage } from '@/notebook/NotebookPage';
import { AskPage } from '@/pages/AskPage';
import { AppRoutes } from '@/App';

const ME = {
  id: 1,
  email: 'tom@example.com',
  display_name: 'Tom',
  auth_provider: 'password',
  created_at: '2026-01-01T00:00:00Z',
  settings: { tz_name: 'UTC', set_unit: 'lb' },
};

let history: AskMessage[] = [];
const apiMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api')>();
  return { ...real, api: (path: string, opts?: unknown) => apiMock(path, opts) };
});

/** Each call to askStream: the question, a way to stream text in, and to finish or fail it. */
type Stream = { question: string; delta: (text: string) => void; done: () => void; fail: (e: unknown) => void };
const streams: Stream[] = [];
vi.mock('@/lib/askStream', () => ({
  askStream: (question: string, onDelta: (text: string) => void) =>
    new Promise((resolve, reject) => {
      streams.push({ question, delta: onDelta, done: () => resolve({}), fail: reject });
    }),
}));

vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, initializing: false, restoring: false, needsVerification: false }),
}));

const message = (id: number, asked_at: string, question: string, answer: string): AskMessage => ({
  id,
  asked_at,
  question,
  answer,
  input_tokens: 10,
  output_tokens: 10,
});

beforeEach(() => {
  history = [];
  streams.length = 0;
  localStorage.clear();
  window.scrollTo = vi.fn();
  // jsdom has no IntersectionObserver (the Notebook loads earlier days with one).
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    disconnect() {}
  });
  apiMock.mockReset();
  apiMock.mockImplementation(async (path: string) => {
    if (path === '/me') return ME;
    if (path === '/ask/history') return { messages: history };
    if (path === '/logs') return { logs: [] };
    if (path === '/parse') return { kind: 'workout', sets: [], weigh_in: null, warnings: [], exercises: [] };
    throw new Error(`unexpected ${path}`);
  });
});

function renderAt(path: string, ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const box = () => screen.getByLabelText('Ask Jarvis');

describe('Ask page', () => {
  it('shows the previous questions and answers, oldest first, under day headings with their times', async () => {
    history = [
      message(1, '2026-11-08T09:06:00Z', 'How is my squat?', 'Up 10 lbs in a month.'),
      message(2, '2026-11-09T17:30:00Z', 'And my bench?', 'Flat since October.'),
    ];
    renderAt('/ask', <AskPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Ask' })).toBeInTheDocument();
    const groups = await screen.findAllByRole('group', { name: 'Question to Jarvis' });
    expect(groups).toHaveLength(2);
    expect(within(groups[0]).getByText('How is my squat?')).toBeInTheDocument();
    expect(within(groups[0]).getByText('Up 10 lbs in a month.')).toBeInTheDocument();
    expect(within(groups[0]).getByText('9:06 AM')).toBeInTheDocument();
    expect(within(groups[1]).getByText('And my bench?')).toBeInTheDocument();
    expect(within(groups[1]).getByText('5:30 PM')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Sunday, November 8', 'Monday, November 9']);
    expect(box()).toHaveAttribute('placeholder', 'Ask about your training');
    expect(box()).toHaveAttribute('maxlength', '500');
    expect(apiMock).not.toHaveBeenCalledWith('/logs', expect.anything());
  });

  it('sends on Enter, streams the answer in, then shows the saved one', async () => {
    renderAt('/ask', <AskPage />);
    await screen.findByText(/No questions yet/);
    await userEvent.type(box(), 'Is my bench up?{Enter}');
    expect(streams.map((s) => s.question)).toEqual(['Is my bench up?']);
    expect(box()).toHaveValue('');
    expect(box()).toHaveFocus();
    expect(screen.getByText('Is my bench up?')).toBeInTheDocument();
    expect(screen.getByText(/↳ thinking/)).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled();

    act(() => streams[0].delta('Bench '));
    act(() => streams[0].delta('is up.'));
    const streaming = screen.getByText('Bench is up.');
    expect(streaming).toHaveClass('streaming');
    expect(streaming).toHaveAttribute('aria-busy', 'true');
    expect(streaming.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');

    history = [message(5, new Date().toISOString(), 'Is my bench up?', 'Bench is up.')];
    const calls = apiMock.mock.calls.filter(([path]) => path === '/ask/history').length;
    await act(async () => streams[0].done());
    await waitFor(() => expect(screen.getByText('Bench is up.')).not.toHaveClass('streaming'));
    expect(apiMock.mock.calls.filter(([path]) => path === '/ask/history').length).toBe(calls + 1);
    expect(screen.getAllByRole('group', { name: 'Question to Jarvis' })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Today');
  });

  it('needs at least 3 characters', async () => {
    renderAt('/ask', <AskPage />);
    await userEvent.type(box(), 'hi{Enter}');
    expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled();
    expect(streams).toHaveLength(0);
    expect(box()).toHaveValue('hi');
  });

  it('shows why an answer failed (the daily allowance, a rate limit) and retries the same question', async () => {
    renderAt('/ask', <AskPage />);
    await userEvent.type(box(), 'How is my squat?{Enter}');
    await act(async () => streams[0].fail(new ApiError(429, 'daily_cap_reached', 'You’ve used today’s questions. Try again tomorrow.')));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('You’ve used today’s questions. Try again tomorrow.');
    expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled(); // nothing typed
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(streams.map((s) => s.question)).toEqual(['How is my squat?', 'How is my squat?']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Question to Jarvis' })).toHaveLength(1);
    act(() => streams[1].delta('Up.'));
    expect(screen.getByText('Up.')).toBeInTheDocument();
  });

  it('with no questions yet, invites one and offers examples that fill the box', async () => {
    renderAt('/ask', <AskPage />);
    expect(await screen.findByText(/No questions yet/)).toBeInTheDocument();
    const examples = within(screen.getByRole('list')).getAllByRole('button');
    expect(examples.length).toBeGreaterThanOrEqual(2);
    expect(examples.length).toBeLessThanOrEqual(3);
    await userEvent.click(examples[0]);
    expect(box()).toHaveValue(examples[0].textContent);
    expect(box()).toHaveFocus();
    expect(streams).toHaveLength(0); // filled, not sent
  });

  it('offers a retry when the history cannot be loaded', async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path === '/me') return ME;
      throw new ApiError(0, 'network', 'Can’t reach the server.');
    });
    renderAt('/ask', <AskPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Can’t reach the server.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('has Ask in the main navigation, active on /ask', async () => {
    renderAt('/ask', <AppRoutes />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('aria-label'))).toEqual(['Notebook', 'Ask', 'History', 'Progress', 'Settings']);
    const ask = within(nav).getByRole('link', { name: 'Ask' });
    expect(ask).toHaveAttribute('href', '/ask');
    expect(ask).toHaveClass('active');
    expect(ask).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Notebook' })).not.toHaveClass('active');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ask' })).toBeInTheDocument();
  });

  it('treats the demo account like any other: its time zone is adopted from the browser too', async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path === '/me') return { ...ME, is_demo: true };
      if (path === '/me/settings') return { ...ME, is_demo: true, settings: { tz_name: 'Europe/Paris', set_unit: 'lb' } };
      return {};
    });
    const zone = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'Europe/Paris' } as Intl.ResolvedDateTimeFormatOptions);
    try {
      renderAt('/settings/none', <Layout />);
      await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/me/settings', { method: 'PATCH', body: { tz_name: 'Europe/Paris' } }));
    } finally {
      zone.mockRestore();
    }
  });
});

describe('Notebook without Ask', () => {
  it('logs workouts and weight only: no questions, no answers, no demo hint', async () => {
    history = [message(1, new Date().toISOString(), 'How is my squat?', 'Up 10 lbs in a month.')];
    apiMock.mockImplementation(async (path: string) => {
      if (path === '/me') return { ...ME, is_demo: true };
      if (path === '/logs') return { logs: [] };
      if (path === '/ask/history') return { messages: history };
      return { kind: 'workout', sets: [], weigh_in: null, warnings: [], exercises: [] };
    });
    renderAt('/', <NotebookPage />);
    expect(await screen.findByText(/Type a set like 8x 160lbs bench/)).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['Workout', 'Weight']);
    expect(screen.queryByRole('button', { name: /Ask/ })).not.toBeInTheDocument();
    expect(screen.queryByText('How is my squat?')).not.toBeInTheDocument();
    expect(screen.queryByText(/Demo account/)).not.toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith('/ask/history', undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Tools' }));
    expect(screen.queryByRole('menuitem', { name: 'Hide answers' })).not.toBeInTheDocument();
  });

  it('falls back to Workout when the stored mode is the old "ask"', async () => {
    localStorage.setItem('jarvis.mode', JSON.stringify('ask'));
    renderAt('/', <NotebookPage />);
    expect(screen.getByRole('radio', { name: 'Workout' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Log a set')).toHaveAttribute('placeholder', '(reps)x (weight) (lift)');
    await userEvent.click(screen.getByRole('radio', { name: 'Weight' }));
    expect(screen.getByLabelText('Log weight')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('jarvis.mode')!)).toBe('weight');
  });
});
