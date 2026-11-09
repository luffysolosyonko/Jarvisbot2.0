import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api';

import { HEADLINE_PARSE } from '../test-utils/fixtures';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/lib/firebase', () => ({ getFirebaseAuth: () => null }));
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return { ...actual, api: jest.fn() };
});

const mockAuth = {
  signIn: jest.fn(),
  signUp: jest.fn(),
  signInWithGoogle: jest.fn(),
  signInDemo: jest.fn(),
  resetPassword: jest.fn(),
};
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() } }));

// eslint-disable-next-line import/first
import { api } from '@/lib/api';

const mockApi = api as jest.MockedFunction<typeof api>;

async function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Sign in', () => {
  const SignIn = require('@/app/(auth)/sign-in').default;

  it('offers email, Google, forgot password, sign up and the demo', async () => {
    await wrap(<SignIn />);
    for (const label of ['Email', 'Password', 'Sign in', 'Continue with Google', 'Try the demo', 'Forgot password?', 'Create an account']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('validates before calling Firebase', async () => {
    await wrap(<SignIn />);
    await fireEvent.press(screen.getByLabelText('Sign in'));
    expect(screen.getByText('Enter your email and password.')).toBeTruthy();
    expect(mockAuth.signIn).not.toHaveBeenCalled();
  });

  it('shows a clear error when the demo is unavailable', async () => {
    mockAuth.signInDemo.mockRejectedValueOnce(new ApiError(503, 'demo_unavailable', 'The demo isn’t available right now.'));
    await wrap(<SignIn />);
    await fireEvent.press(screen.getByLabelText('Try the demo'));
    expect(await screen.findByText('The demo isn’t available right now.')).toBeTruthy();
  });

  it('switches to sign up', async () => {
    await wrap(<SignIn />);
    await fireEvent.press(screen.getByLabelText('Create an account'));
    expect(screen.getByText('Create your account')).toBeTruthy();
  });
});

describe('Log', () => {
  const Log = require('@/app/(tabs)/log').default;

  beforeEach(() => {
    mockApi.mockImplementation(async (path: string) => {
      if (path === '/me') return { settings: { set_unit: 'lb', tz_name: 'UTC', bar_lb: 45 } };
      if (path === '/dashboard') return { today: { date: '2026-03-02' } };
      if (path === '/logs') return { logs: [] };
      if (path === '/parse') return HEADLINE_PARSE;
      throw new Error(`unexpected ${path}`);
    });
  });

  it('previews the headline line as five bench sets after a short pause', async () => {
    await wrap(<Log />);
    await fireEvent.changeText(screen.getByLabelText('Sets or a weigh-in'), '5x 155lb 2x1x1xf bench');
    expect(await screen.findByLabelText('Bench, 0 good, 1 failed, 155 lb')).toBeTruthy();
    expect(screen.getAllByText('155')).toHaveLength(5);
    expect(mockApi).toHaveBeenCalledWith('/parse', expect.objectContaining({ body: { text: '5x 155lb 2x1x1xf bench' } }));
  });

  it('starts with an empty preview that offers an example', async () => {
    await wrap(<Log />);
    expect(screen.getByText('Start typing and the parsed sets show up here.')).toBeTruthy();
    expect(await screen.findByText('Nothing logged today yet.')).toBeTruthy();
  });
});

describe('Ask Jarvis', () => {
  const Ask = require('@/app/(tabs)/ask').default;

  it('shows the answer with a tokens-used line', async () => {
    mockApi.mockResolvedValueOnce({
      answer: 'Your bench e1RM is up 12 lb since March.',
      input_tokens: 1200,
      output_tokens: 80,
      tokens_used_today: 1280,
      daily_token_cap: 10000,
      topics: ['workouts'],
    });
    await wrap(<Ask />);
    await fireEvent.press(screen.getByLabelText('Ask that'));
    expect(await screen.findByText('Your bench e1RM is up 12 lb since March.')).toBeTruthy();
    expect(screen.getByText(/1,280 tokens · 1,280 of 10,000 today/)).toBeTruthy();
  });

  it('shows a clear error with a retry instead of hanging', async () => {
    mockApi
      .mockRejectedValueOnce(new ApiError(504, 'ai_timeout', 'Jarvis took too long to answer. Try again.'))
      .mockResolvedValueOnce({
        answer: 'Done.',
        input_tokens: 1,
        output_tokens: 1,
        tokens_used_today: 2,
        daily_token_cap: 10,
        topics: [],
      });
    await wrap(<Ask />);
    await fireEvent.press(screen.getByLabelText('Ask that'));
    expect(await screen.findByText('Jarvis took too long to answer. Try again.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Try again'));
    await waitFor(() => expect(screen.getByText('Done.')).toBeTruthy());
  });

  it('explains when Ask Jarvis is not configured', async () => {
    mockApi.mockRejectedValueOnce(new ApiError(503, 'ai_not_configured', 'Ask Jarvis isn’t set up on this server.'));
    await wrap(<Ask />);
    await fireEvent.press(screen.getByLabelText('Ask that'));
    expect(await screen.findByText('Ask Jarvis isn’t set up on this server.')).toBeTruthy();
  });
});
