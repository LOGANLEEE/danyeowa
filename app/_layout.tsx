import '../global.css';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { OfflineIndicator } from '@/components/OfflineIndicator';
import { ThemedLoader } from '@/components/ThemedLoader';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { OfflineSyncManager } from '@/lib/offline-sync-manager';
import { clearAllSecureStore } from '@/lib/secure-storage';
import { useAuthStore } from '@/stores/use-auth-store';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  clearAllSecureStore()
  const {isAuthenticated, isLoading, initialized} = useAuthStore();
  const colorScheme = useColorScheme();

  // Show loading while initializing auth state
  // The initialize() function checks for stored session and validates expiration
  // If valid session exists, isAuthenticated will be true and auth routes will be skipped
  if (!initialized || isLoading) {
    return (
      <ThemedLoader
        fullScreen
        size="large"
        message="Loading..."
      />
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        {/* Protect tabs route - only accessible when authenticated */}
        <Stack.Protected guard={isAuthenticated}>
          <Stack.Screen name="(tabs)" options={{headerShown: false}} />
        </Stack.Protected>

        {/* Protect auth routes - only accessible when not authenticated */}
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="auth" options={{headerShown: false}} />
        </Stack.Protected>

        {/* Public routes */}
        <Stack.Screen name="index" options={{headerShown: false}} />
        <Stack.Screen name="modal" options={{presentation: 'modal', title: 'Modal'}} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const {initialize, isAuthenticated} = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    // Initialize offline sync manager when authenticated
    if (isAuthenticated) {
      OfflineSyncManager.initialize();
    }

    return () => {
      OfflineSyncManager.cleanup();
    };
  }, [isAuthenticated]);

  return (
    <>
      <RootLayoutNav />
      <OfflineIndicator />
    </>
  );
}
