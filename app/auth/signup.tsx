import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

/**
 * Signup screen - redirects to login for seamless flow
 * Supabase automatically creates accounts when OTP is verified,
 * so we don't need a separate signup screen.
 */
export default function SignUpScreen() {
  useFocusEffect(
    useCallback(() => {
      // Redirect to login screen immediately
      router.replace('/auth/login');
    }, []),
  );

  // Return null since we're redirecting
  return null;
}

