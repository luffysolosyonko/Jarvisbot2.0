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
  settings: { tz_name: 'UTC', set_unit: 'lb' },
};

const update = vi.fn();
const del = vi.fn();
vi.mock('@/hooks/queries', () => ({
  useMe: () => ({ data: ME, isPending: false, error: null }),
  useUpdateSettings: () => ({ mutate: update, isPending: false, error: null }),
  useAliases: () => ({ data: [{ id: 1, short: 'bench', full: 'bench press' }, { id: 2, short: 'inc', full: 'incline' }] }),
  useDataSummary: () => ({ data: { sets: 613, weigh_ins: 60 } }),
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
  it('shows the account, the alias caption, live counts and the footer, and nothing removed', () => {
    renderPage();
    expect(screen.getByText('Tom')).toBeInTheDocument();
    expect(screen.getByText('tom@example.com')).toBeInTheDocument();
    expect(screen.getByText('signed in with Google')).toBeInTheDocument();
    expect(screen.getByText('bench → Bench press · 1 more')).toBeInTheDocument();
    expect(screen.getByText('613 sets · 60 weigh-ins')).toBeInTheDocument();
    expect(screen.getByText('Jarvis 2.0')).toBeInTheDocument();
    expect(screen.queryByText(/built by/)).not.toBeInTheDocument();
    for (const gone of [/Double-check/, /Bar weight/, /Shorthand/, /Jarvis 1\.0/])
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
  });

  it('applies the unit immediately', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'kg' }));
    expect(update).toHaveBeenCalledWith({ set_unit: 'kg' });
  });

  it('edits the name: Edit, type, Enter saves; Escape cancels', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const box = screen.getByLabelText('Your name');
    await userEvent.clear(box);
    await userEvent.type(box, '  Thomas  {Enter}');
    expect(update).toHaveBeenCalledWith({ display_name: 'Thomas' });
    update.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.type(screen.getByLabelText('Your name'), 'xyz{Escape}');
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText('Tom')).toBeInTheDocument();
  });

  it('saving the same name sends nothing', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(update).not.toHaveBeenCalled();
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
