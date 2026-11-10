import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '@/lib/types';
import { SettingsPage } from '@/pages/SettingsPage';

const ME: Me = {
  id: 1,
  email: 'tom@example.com',
  display_name: 'Tom',
  auth_provider: 'google.com',
  is_demo: false,
  created_at: '2026-01-01T00:00:00Z',
  settings: { tz_name: 'UTC', set_unit: 'lb', bar_lb: 45, outlier_pct: 5 },
};

const update = vi.fn();
const del = vi.fn();
vi.mock('@/hooks/queries', () => ({
  useMe: () => ({ data: ME, isPending: false, error: null }),
  useUpdateSettings: () => ({ mutate: update, isPending: false, error: null }),
  useAliases: () => ({ data: [{ id: 1, short: 'bench', full: 'bench press' }, { id: 2, short: 'inc', full: 'incline' }] }),
  useDataSummary: () => ({ data: { sets: 613, weigh_ins: 60 } }),
  useImportJarvis1: () => ({ mutate: vi.fn(), isPending: false, error: null, data: undefined }),
  useDeleteAccount: () => ({ mutate: del, isPending: false, error: null }),
}));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ signOut: vi.fn(), hasPassword: false }) }));

beforeEach(() => {
  update.mockClear();
  del.mockClear();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe('Settings', () => {
  it('shows the account, the alias caption, live counts, shorthand and the footer', () => {
    renderPage();
    expect(screen.getByText('Tom')).toBeInTheDocument();
    expect(screen.getByText('tom@example.com · Google')).toBeInTheDocument();
    expect(screen.getByText('bench → Bench press · 1 more')).toBeInTheDocument();
    expect(screen.getByText('613 sets · 60 weigh-ins')).toBeInTheDocument();
    expect(screen.getByText('3xf 155lb')).toBeInTheDocument();
    expect(screen.getByText('last rep failed')).toBeInTheDocument();
    expect(screen.getByText('Jarvis 2.0 · built by Tom')).toBeInTheDocument();
  });

  it('applies settings immediately: unit and the weigh-in check', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'kg' }));
    expect(update).toHaveBeenCalledWith({ set_unit: 'kg' });
    const check = screen.getByRole('group', { name: 'Double-check weigh-ins' });
    await userEvent.click(within(check).getByRole('button', { name: 'More' }));
    expect(update).toHaveBeenCalledWith({ outlier_pct: 6 });
  });

  it('deletes only after DELETE is typed', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Delete account and data' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete account' });
    const go = within(dialog).getByRole('button', { name: 'Delete everything' });
    await userEvent.type(within(dialog).getByLabelText('Type DELETE to confirm'), 'delete');
    expect(go).toBeDisabled();
    await userEvent.clear(within(dialog).getByLabelText('Type DELETE to confirm'));
    await userEvent.type(within(dialog).getByLabelText('Type DELETE to confirm'), 'DELETE');
    expect(go).toBeEnabled();
    await userEvent.click(go);
    expect(del).toHaveBeenCalled();
  });
});
