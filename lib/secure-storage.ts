import { Session, User } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// Storage keys
const SESSION_STORAGE_KEY = 'auth_session';
const USER_STORAGE_KEY = 'auth_user';
const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
const BIOMETRIC_EMAIL_KEY = 'biometric_email';
const ONBOARDING_COMPLETED_KEY = 'onboarding_completed';
const FLIGHT_CODE_PREFIX_KEY = 'flight_code_prefix';

/**
 * Save session to secure storage (device-level)
 */
export async function saveSession(session: Session): Promise<void> {
  try {
    const serialized = JSON.stringify(session);
    await SecureStore.setItemAsync(SESSION_STORAGE_KEY, serialized);
  } catch (error) {
    console.error('[SecureStorage] Failed to save session to secure storage:', error);
    throw error;
  }
}

/**
 * Save user to secure storage (device-level)
 */
export async function saveUser(user: User): Promise<void> {
  try {
    const serialized = JSON.stringify(user);
    await SecureStore.setItemAsync(USER_STORAGE_KEY, serialized);
  } catch (error) {
    console.error('[SecureStorage] Failed to save user to secure storage:', error);
    throw error;
  }
}

/**
 * Save both session and user to secure storage
 */
export async function saveAuthData(session: Session, user: User): Promise<void> {
  try {
    // Check if SecureStore is available (method may not exist in all versions)
    try {
      if (typeof SecureStore.isAvailableAsync === 'function') {
        const isAvailable = await SecureStore.isAvailableAsync();
        if (!isAvailable) {
          console.warn('[SecureStorage] SecureStore is not available on this platform, cannot save auth data');
          throw new Error('SecureStore is not available');
        }
      }
    } catch (checkError) {
      // If isAvailableAsync doesn't exist, continue anyway
    }

    await Promise.all([
      saveSession(session),
      saveUser(user),
    ]);
    
    // Verify the data was saved by reading it back (with a small delay to ensure write completes)
    await new Promise(resolve => setTimeout(resolve, 100));
    const verifySession = await getSession();
    const verifyUser = await getUser();
    
    if (!verifySession || !verifyUser) {
      console.error('[SecureStorage] Failed to verify saved auth data - data may not have been persisted');
      console.error('[SecureStorage] Verification result:', {
        hasSession: !!verifySession,
        hasUser: !!verifyUser,
      });
      throw new Error('Failed to verify saved auth data');
    }
  } catch (error) {
    console.error('[SecureStorage] Failed to save auth data to secure storage:', error);
    throw error;
  }
}

/**
 * Get session from secure storage (device-level)
 */
export async function getSession(): Promise<Session | null> {
  try {
    const storedSession = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
    if (!storedSession) {
      return null;
    }
    const parsed = JSON.parse(storedSession) as Session;
    
    // Ensure expires_at is a number (JSON.parse might return it as a string in some cases)
    if (parsed.expires_at && typeof parsed.expires_at === 'string') {
      parsed.expires_at = parseInt(parsed.expires_at, 10);
    }
    
    return parsed;
  } catch (error) {
    console.error('[SecureStorage] Failed to get session from secure storage:', error);
    return null;
  }
}

/**
 * Get user from secure storage (device-level)
 */
export async function getUser(): Promise<User | null> {
  try {
    const storedUser = await SecureStore.getItemAsync(USER_STORAGE_KEY);
    if (!storedUser) {
      return null;
    }
    const parsed = JSON.parse(storedUser) as User;
    return parsed;
  } catch (error) {
    console.error('[SecureStorage] Failed to get user from secure storage:', error);
    return null;
  }
}

/**
 * Get both session and user from secure storage
 */
export async function getAuthData(): Promise<{ session: Session | null; user: User | null }> {
  try {
    // Check if SecureStore is available (method may not exist in all versions)
    try {
      if (typeof SecureStore.isAvailableAsync === 'function') {
        const isAvailable = await SecureStore.isAvailableAsync();
        if (!isAvailable) {
          console.warn('[SecureStorage] SecureStore is not available on this platform');
          return { session: null, user: null };
        }
      }
    } catch (checkError) {
      // If isAvailableAsync doesn't exist or fails, continue anyway
    }

    const [session, user] = await Promise.all([
      getSession(),
      getUser(),
    ]);
    
    return { session, user };
  } catch (error) {
    console.error('[SecureStorage] Failed to get auth data from secure storage:', error);
    return { session: null, user: null };
  }
}

/**
 * Check if session is still valid (not expired)
 */
export function isSessionValid(session: Session | null): boolean {
  if (!session || !session.expires_at) {
    return false;
  }
  const currentTime = Math.floor(Date.now() / 1000);
  return session.expires_at > currentTime;
}

/**
 * Clear all auth data from secure storage
 */
export async function clearAuthData(): Promise<void> {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(SESSION_STORAGE_KEY),
      SecureStore.deleteItemAsync(USER_STORAGE_KEY),
      SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY),
      SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY),
      SecureStore.deleteItemAsync(ONBOARDING_COMPLETED_KEY),
    ]);
  } catch (error) {
    console.error('Failed to clear auth data from secure storage:', error);
    throw error;
  }
}

/**
 * Save biometric preference
 */
export async function saveBiometricPreference(enabled: boolean, email?: string): Promise<void> {
  try {
    if (enabled && email) {
      await Promise.all([
        SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true'),
        SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, email),
      ]);
    } else {
      await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
      await SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY);
    }
  } catch (error) {
    console.error('[SecureStorage] Failed to save biometric preference:', error);
    throw error;
  }
}

/**
 * Get biometric preference
 */
export async function getBiometricPreference(): Promise<{ enabled: boolean; email: string | null }> {
  try {
    const [enabled, email] = await Promise.all([
      SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY),
      SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY),
    ]);

    return {
      enabled: enabled === 'true',
      email: email || null,
    };
  } catch (error) {
    console.error('[SecureStorage] Failed to get biometric preference:', error);
    return { enabled: false, email: null };
  }
}

/**
 * Save onboarding completed flag
 */
export async function saveOnboardingCompleted(completed: boolean): Promise<void> {
  try {
    if (completed) {
      await SecureStore.setItemAsync(ONBOARDING_COMPLETED_KEY, 'true');
    } else {
      await SecureStore.deleteItemAsync(ONBOARDING_COMPLETED_KEY);
    }
  } catch (error) {
    console.error('[SecureStorage] Failed to save onboarding completed flag:', error);
    throw error;
  }
}

/**
 * Get onboarding completed flag
 */
export async function getOnboardingCompleted(): Promise<boolean> {
  try {
    const completed = await SecureStore.getItemAsync(ONBOARDING_COMPLETED_KEY);
    return completed === 'true';
  } catch (error) {
    console.error('[SecureStorage] Failed to get onboarding completed flag:', error);
    return false;
  }
}

/**
 * Save flight code prefix preference
 */
export async function saveFlightCodePrefix(prefix: string): Promise<void> {
  try {
    if (prefix.trim()) {
      await SecureStore.setItemAsync(FLIGHT_CODE_PREFIX_KEY, prefix.trim().toUpperCase());
    } else {
      await SecureStore.deleteItemAsync(FLIGHT_CODE_PREFIX_KEY);
    }
  } catch (error) {
    console.error('[SecureStorage] Failed to save flight code prefix:', error);
    throw error;
  }
}

/**
 * Get flight code prefix preference
 */
export async function getFlightCodePrefix(): Promise<string | null> {
  try {
    const prefix = await SecureStore.getItemAsync(FLIGHT_CODE_PREFIX_KEY);
    return prefix || null;
  } catch (error) {
    console.error('[SecureStorage] Failed to get flight code prefix:', error);
    return null;
  }
}

/**
 * Clear all app-specific data stored in SecureStore.
 * This removes session, user, onboarding, biometric, and flightCodePrefix data.
 * Always await this before critical flows like sign-out.
 */
export async function clearAllSecureStore(): Promise<void> {
  try {
    // Add new keys here if more app-specific SecureStore items are introduced
    const keysToClear = [
      SESSION_STORAGE_KEY,
      USER_STORAGE_KEY,
      BIOMETRIC_ENABLED_KEY,
      BIOMETRIC_EMAIL_KEY,
      ONBOARDING_COMPLETED_KEY,
      FLIGHT_CODE_PREFIX_KEY,
    ];

    await Promise.all(keysToClear.map(key => SecureStore.deleteItemAsync(key)));
  } catch (error) {
    console.error('[SecureStorage] Failed to clear all SecureStore data:', error);
    throw error;
  }
}
