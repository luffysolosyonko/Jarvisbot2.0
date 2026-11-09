import { JetBrainsMono_400Regular, JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono';
import { Manrope_400Regular, Manrope_600SemiBold, useFonts } from '@expo-google-fonts/manrope';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { ApiError } from '@/lib/api';
import { fonts, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync();

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Don't retry client errors (4xx); one retry for network/server errors.
        retry: (count, error) =>
          count < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  });
}

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_600SemiBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_600SemiBold,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RootNavigator ready={fontsLoaded || !!fontError} />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator({ ready }: { ready: boolean }) {
  const { user, initializing } = useAuth();
  const { scheme, colors } = useTheme();
  const loading = !ready || initializing;

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null; // the splash screen stays up until fonts and auth are ready

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.bg,
      card: colors.bg,
      text: colors.ink,
      border: colors.border,
      notification: colors.accent,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: fonts.uiSemiBold },
          headerShadowVisible: false,
        }}>
        {/* Signed out: "/" and the app screens send you to sign-in, and back after. */}
        <Stack.Protected guard={!user} redirectTo="/">
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={!!user} redirectTo="/sign-in">
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="exercise/[name]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="exercises" options={{ headerShown: true, title: '' }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
