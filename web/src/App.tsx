import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { Layout } from '@/components/Layout';
import { Skeleton } from '@/components/States';
import { ToastProvider } from '@/components/Toast';
import { makeQueryClient } from '@/lib/queryClient';
import { NotebookPage } from '@/notebook/NotebookPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { LiftPage } from '@/pages/LiftPage';
import { ProgressPage } from '@/pages/ProgressPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SignInPage } from '@/pages/SignInPage';

function RequireUser({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <Splash />;
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function SignedOutOnly({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <Splash />;
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (user) return <Navigate to={from} replace />;
  return <>{children}</>;
}

function Splash() {
  return (
    <main className="main" aria-label="Loading">
      <Skeleton lines={4} />
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
        <Route path="history" element={<HistoryPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="progress/:name" element={<LiftPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  const [queryClient] = useState(makeQueryClient);
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
