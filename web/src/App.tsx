import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { Layout } from '@/components/Layout';
import { InkCursor } from '@/components/Loading';
import { ToastProvider } from '@/components/Toast';
import { useDelayedFlag } from '@/hooks/useDelayedFlag';
import { persistCache, restoreCache } from '@/lib/cache';
import { makeQueryClient } from '@/lib/queryClient';
import { NotebookPage } from '@/notebook/NotebookPage';
import { AskPage } from '@/pages/AskPage';
import { ExerciseNamesPage } from '@/pages/ExerciseNamesPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { LiftPage } from '@/pages/LiftPage';
import { ProgressPage } from '@/pages/ProgressPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SignInPage } from '@/pages/SignInPage';
import { VerifyEmailPage } from '@/pages/VerifyEmailPage';

function RequireUser({ children }: { children: ReactNode }) {
  const { user, initializing, restoring, needsVerification } = useAuth();
  const location = useLocation();
  // Signed in last time: show the app (and its cached data) while Firebase confirms.
  if (restoring) return <>{children}</>;
  if (initializing) return <Splash />;
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  if (needsVerification) return <VerifyEmailPage />;
  return <>{children}</>;
}

function SignedOutOnly({ children }: { children: ReactNode }) {
  const { user, initializing, restoring } = useAuth();
  const location = useLocation();
  if (restoring) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />;
  if (initializing) return <Splash />;
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (user) return <Navigate to={from} replace />;
  return <>{children}</>;
}

/** First visit (nothing cached): ruled paper and the ink cursor, after 300 ms. */
function Splash() {
  const show = useDelayedFlag(true);
  return (
    <main className="main">
      <div className="feed splash">{show ? <InkCursor /> : null}</div>
    </main>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/sign-in"
        element={
          <SignedOutOnly>
            <SignInPage />
          </SignedOutOnly>
        }
      />
      <Route
        element={
          <RequireUser>
            <ToastProvider>
              <Layout />
            </ToastProvider>
          </RequireUser>
        }>
        <Route index element={<NotebookPage />} />
        <Route path="ask" element={<AskPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="progress/:name" element={<LiftPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/names" element={<ExerciseNamesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  const [queryClient] = useState(() => {
    const client = makeQueryClient();
    restoreCache(client); // last session's data, shown while it refreshes
    return client;
  });
  useEffect(() => persistCache(queryClient), [queryClient]);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
