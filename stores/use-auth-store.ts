import {
  clearAuthData,
  getAuthData,
  getBiometricPreference,
  isSessionValid,
  saveAuthData,
  saveBiometricPreference,
} from '@/lib/secure-storage';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/supabase/types';
import { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  initialized: boolean;
  isAuthenticated: boolean;
}

interface AuthActions {
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (isLoading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
  sendOtp: (email: string) => Promise<{ error: Error | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: Error | null }>;
  fetchProfile: () => Promise<{ error: Error | null }>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
  loginWithBiometric: () => Promise<{ error: Error | null }>;
  enableBiometric: (email: string) => Promise<{ error: Error | null }>;
  getBiometricEmail: () => Promise<string | null>;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()((set, get) => ({
  // State
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  initialized: false,
  isAuthenticated: false,

  // Actions
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setLoading: (isLoading) => set({ isLoading }),
  setInitialized: (initialized) => set({ initialized }),

  signOut: async () => {
    await supabase.auth.signOut();
    // Clear secure storage
    await clearAuthData();
    set({ user: null, session: null, profile: null, isAuthenticated: false });
  },

  initialize: async () => {
    try {
      // Try to restore session from secure storage first
      const { session: storedSession, user: storedUser } = await getAuthData();

      if (storedSession && storedUser) {
        // Check if session is still valid (not expired)
        if (isSessionValid(storedSession)) {
          set({
            session: storedSession,
            user: storedUser,
            isLoading: false,
            initialized: true,
            isAuthenticated: !!storedUser,
          });
          
          // Also try to get session from Supabase if available
          const { data: { session: supabaseSession } } = await supabase.auth.getSession();
          if (supabaseSession) {
            set({
              session: supabaseSession,
              user: supabaseSession.user,
              isAuthenticated: !!supabaseSession.user,
            });
            // Update secure storage with fresh session
            await saveAuthData(supabaseSession, supabaseSession.user);
            // Fetch user profile
            await get().fetchProfile();
          }
          // Listen for auth changes
          supabase.auth.onAuthStateChange(async (_event, newSession) => {
            if (newSession) {
              set({
                session: newSession,
                user: newSession.user,
                isAuthenticated: !!newSession.user,
              });
              // Update secure storage
              await saveAuthData(newSession, newSession.user);
              // Fetch user profile
              await get().fetchProfile();
            } else {
              // Session expired or signed out
              set({ session: null, user: null, profile: null, isAuthenticated: false });
              await clearAuthData();
            }
          });
          return;
        } else {
          // Session expired, clear storage
          await clearAuthData();
        }
      }

      // No stored session or expired, try Supabase
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        set({
          session,
          user: session.user,
          isLoading: false,
          initialized: true,
          isAuthenticated: !!session.user,
        });
        // Save to secure storage
        await saveAuthData(session, session.user);
        // Fetch user profile
        await get().fetchProfile();
      } else {
        set({
          session: null,
          user: null,
          profile: null,
          isLoading: false,
          initialized: true,
          isAuthenticated: false,
        });
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (_event, newSession) => {
        if (newSession) {
          set({
            session: newSession,
            user: newSession.user,
            isAuthenticated: !!newSession.user,
          });
          // Update secure storage
          await saveAuthData(newSession, newSession.user);
          // Fetch user profile
          await get().fetchProfile();
        } else {
          // Session expired or signed out
          set({ session: null, user: null, profile: null, isAuthenticated: false });
          await clearAuthData();
        }
      });
    } catch (error) {
      // Error reading from secure storage, fallback to Supabase
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      set({
        session,
        user,
        profile: null,
        isLoading: false,
        initialized: true,
        isAuthenticated: !!user,
      });
      if (user) {
        await get().fetchProfile();
      }
    }
  },

  sendOtp: async (email: string) => {
    set({ isLoading: true });
    
    // Validate email format
    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      set({ isLoading: false });
      return { error: new Error('Invalid email address') };
    }
    
    try {
      // Send OTP via Supabase
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          // For mobile apps, you might want to use a deep link
          // emailRedirectTo: 'your-app://auth/callback',
        },
      });
      
      set({ isLoading: false });
      
      if (otpError) {
        console.error('[AuthStore] Error sending OTP:', otpError);
        return { error: new Error(otpError.message || 'Failed to send OTP') };
      }
      
      return { error: null };
    } catch (error) {
      set({ isLoading: false });
      console.error('[AuthStore] Exception sending OTP:', error);
      return { error: error instanceof Error ? error : new Error('Failed to send OTP') };
    }
  },

  verifyOtp: async (email: string, token: string) => {
    set({ isLoading: true });
    
    if (token.trim().length !== 6) {
      set({ isLoading: false });
      return { error: new Error('Invalid code. Please enter a 6-digit code.') };
    }
    
    try {
      // Verify OTP with Supabase
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type: 'email',
      });
      
      if (verifyError) {
        set({ isLoading: false });
        console.error('[AuthStore] Error verifying OTP:', verifyError);
        return { error: new Error(verifyError.message || 'Invalid code. Please try again.') };
      }
      
      if (!data.session || !data.user) {
        set({ isLoading: false });
        return { error: new Error('No session returned after verification') };
      }
      
      // Save to device-level secure storage FIRST before setting state
      // This ensures the session is persisted even if the app crashes
      try {
        await saveAuthData(data.session, data.user);
      } catch (storageError) {
        console.error('[AuthStore] Failed to save session to secure storage:', storageError);
        // Still allow login to proceed, but log the error
      }
      
      // Set state after successful save to secure storage
      set({
        user: data.user,
        session: data.session,
        isLoading: false,
        isAuthenticated: true,
      });
      
      // Fetch user profile (trigger will create it if it doesn't exist)
      await get().fetchProfile();
      
      return { error: null };
    } catch (error) {
      set({ isLoading: false });
      console.error('[AuthStore] Exception verifying OTP:', error);
      return { error: error instanceof Error ? error : new Error('Failed to verify OTP') };
    }
  },

  fetchProfile: async () => {
    const { user } = get();
    if (!user) {
      return { error: new Error('No user logged in') };
    }
    
    try {
      // Try to fetch profile with retry logic (trigger might need a moment to create it)
      let profile = null;
      let profileError = null;
      const maxRetries = 3;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (data && !error) {
          profile = data;
          break;
        }
        
        profileError = error;
        
        // If profile doesn't exist and trigger hasn't created it yet, wait and retry
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
      
      // If profile still doesn't exist after retries, create it manually
      if (!profile && profileError) {
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email || null,
            full_name: user.user_metadata?.full_name || null,
          })
          .select()
          .single();
        
        if (createError) {
          console.error('[AuthStore] Failed to create profile:', createError);
          // Don't return error - user can still use the app
          return { error: null };
        }
        
        profile = newProfile;
      }
      
      if (profile) {
        set({ profile: profile as Profile });
      }
      
      return { error: null };
    } catch (error) {
      console.error('[AuthStore] Exception fetching profile:', error);
      return { error: error instanceof Error ? error : new Error('Failed to fetch profile') };
    }
  },

  updateProfile: async (updates: Partial<Profile>) => {
    const { user } = get();
    if (!user) {
      return { error: new Error('No user logged in') };
    }
    
    try {
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();
      
      if (updateError) {
        console.error('[AuthStore] Error updating profile:', updateError);
        return { error: new Error(updateError.message || 'Failed to update profile') };
      }
      
      set({ profile: updatedProfile as Profile });
      return { error: null };
    } catch (error) {
      console.error('[AuthStore] Exception updating profile:', error);
      return { error: error instanceof Error ? error : new Error('Failed to update profile') };
    }
  },

  loginWithBiometric: async () => {
    try {
      const { email } = await getBiometricPreference();
      if (!email) {
        return { error: new Error('No biometric login configured') };
      }

      // Get stored session for this email
      const { session: storedSession, user: storedUser } = await getAuthData();
      
      if (!storedSession || !storedUser || storedUser.email !== email) {
        return { error: new Error('No saved session found for biometric login') };
      }

      // Check if session is still valid
      if (!isSessionValid(storedSession)) {
        return { error: new Error('Session expired. Please sign in again.') };
      }

      // Restore session
      set({
        session: storedSession,
        user: storedUser,
        isAuthenticated: true,
      });

      // Fetch profile
      await get().fetchProfile();

      return { error: null };
    } catch (error) {
      console.error('[AuthStore] Biometric login error:', error);
      return { error: error instanceof Error ? error : new Error('Biometric login failed') };
    }
  },

  enableBiometric: async (email: string) => {
    try {
      await saveBiometricPreference(true, email);
      return { error: null };
    } catch (error) {
      console.error('[AuthStore] Failed to enable biometric:', error);
      return { error: error instanceof Error ? error : new Error('Failed to enable biometric') };
    }
  },

  getBiometricEmail: async () => {
    try {
      const { email } = await getBiometricPreference();
      return email;
    } catch (error) {
      console.error('[AuthStore] Failed to get biometric email:', error);
      return null;
    }
  },
}));


