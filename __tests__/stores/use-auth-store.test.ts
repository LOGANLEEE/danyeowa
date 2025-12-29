import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useAuthStore } from '@/stores/use-auth-store';
import * as secureStorage from '@/lib/secure-storage';
import { supabase } from '@/lib/supabase/client';

// Mock secure storage
jest.mock('@/lib/secure-storage');
const mockSecureStorage = secureStorage as jest.Mocked<typeof secureStorage>;

// Mock supabase
jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      signOut: jest.fn(),
      signInWithOtp: jest.fn(),
      verifyOtp: jest.fn(),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    from: jest.fn(),
  },
}));

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

describe('useAuthStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store state
    const { result } = renderHook(() => useAuthStore());
    act(() => {
      result.current.setUser(null);
      result.current.setSession(null);
      result.current.setProfile(null);
      result.current.setLoading(false);
      result.current.setInitialized(false);
    });
  });

  describe('Initial State', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useAuthStore());

      // Zustand stores initialize immediately with default state
      expect(result.current.user).toBeNull();
      expect(result.current.session).toBeNull();
      expect(result.current.profile).toBeNull();
      // isLoading and initialized may be set by initialize() if called
      // So we just check the core state values
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('State Setters', () => {
    it('should set user and update isAuthenticated', () => {
      const { result } = renderHook(() => useAuthStore());
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
      } as any;

      act(() => {
        result.current.setUser(mockUser);
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('should set session', () => {
      const { result } = renderHook(() => useAuthStore());
      const mockSession = {
        access_token: 'test-token',
        user: { id: 'test-user-id' },
      } as any;

      act(() => {
        result.current.setSession(mockSession);
      });

      expect(result.current.session).toEqual(mockSession);
    });

    it('should set profile', () => {
      const { result } = renderHook(() => useAuthStore());
      const mockProfile = {
        id: 'test-user-id',
        email: 'test@example.com',
        full_name: 'Test User',
        avatar_url: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      act(() => {
        result.current.setProfile(mockProfile);
      });

      expect(result.current.profile).toEqual(mockProfile);
    });

    it('should set loading state', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setLoading(true);
      });

      expect(result.current.isLoading).toBe(true);

      act(() => {
        result.current.setLoading(false);
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('sendOtp', () => {
    it('should send OTP successfully', async () => {
      mockSupabase.auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
      mockSecureStorage.getAuthData.mockResolvedValue({ session: null, user: null });

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        const response = await result.current.sendOtp('test@example.com');
        expect(response.error).toBeNull();
      });

      expect(mockSupabase.auth.signInWithOtp).toHaveBeenCalledWith({
        email: 'test@example.com',
        options: {},
      });
    });

    it('should return error for invalid email', async () => {
      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        const response = await result.current.sendOtp('invalid-email');
        expect(response.error).not.toBeNull();
        expect(response.error?.message).toBe('Invalid email address');
      });

      expect(mockSupabase.auth.signInWithOtp).not.toHaveBeenCalled();
    });

    it('should handle Supabase errors', async () => {
      const mockError = { message: 'Failed to send OTP', status: 400 };
      mockSupabase.auth.signInWithOtp.mockResolvedValue({ data: {}, error: mockError as any });

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        const response = await result.current.sendOtp('test@example.com');
        expect(response.error).not.toBeNull();
        expect(response.error?.message).toBe('Failed to send OTP');
      });
    });
  });

  describe('verifyOtp', () => {
    const mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      email_confirmed_at: new Date().toISOString(),
    } as any;

    const mockSession = {
      access_token: 'test-token',
      refresh_token: 'test-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: mockUser,
    } as any;

    it('should verify OTP successfully', async () => {
      mockSupabase.auth.verifyOtp.mockResolvedValue({
        data: { session: mockSession, user: mockUser },
        error: null,
      });
      mockSecureStorage.saveAuthData.mockResolvedValue(undefined);

      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
          }),
        }),
      });
      mockSupabase.from = mockFrom as any;

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        const response = await result.current.verifyOtp('test@example.com', '123456');
        expect(response.error).toBeNull();
      });

      expect(mockSupabase.auth.verifyOtp).toHaveBeenCalledWith({
        email: 'test@example.com',
        token: '123456',
        type: 'email',
      });
      expect(mockSecureStorage.saveAuthData).toHaveBeenCalledWith(mockSession, mockUser);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.session).toEqual(mockSession);
    });

    it('should return error for invalid token length', async () => {
      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        const response = await result.current.verifyOtp('test@example.com', '123');
        expect(response.error).not.toBeNull();
        expect(response.error?.message).toBe('Invalid code. Please enter a 6-digit code.');
      });

      expect(mockSupabase.auth.verifyOtp).not.toHaveBeenCalled();
    });

    it('should handle verification errors', async () => {
      const mockError = { message: 'Invalid code', status: 400 };
      mockSupabase.auth.verifyOtp.mockResolvedValue({
        data: { session: null, user: null },
        error: mockError as any,
      });

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        const response = await result.current.verifyOtp('test@example.com', '123456');
        expect(response.error).not.toBeNull();
        expect(response.error?.message).toBe('Invalid code');
      });
    });
  });

  describe('fetchProfile', () => {
    it('should fetch profile successfully', async () => {
      const mockUser = { id: 'test-user-id' } as any;
      const mockProfile = {
        id: 'test-user-id',
        email: 'test@example.com',
        full_name: 'Test User',
        avatar_url: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockProfile, error: null }),
          }),
        }),
      });
      mockSupabase.from = mockFrom as any;

      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setUser(mockUser);
      });

      await act(async () => {
        const response = await result.current.fetchProfile();
        expect(response.error).toBeNull();
      });

      expect(result.current.profile).toEqual(mockProfile);
    });

    it('should return error when no user is logged in', async () => {
      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        const response = await result.current.fetchProfile();
        expect(response.error).not.toBeNull();
        expect(response.error?.message).toBe('No user logged in');
      });
    });
  });

  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      const mockUser = { id: 'test-user-id' } as any;
      const updatedProfile = {
        id: 'test-user-id',
        email: 'test@example.com',
        full_name: 'Updated Name',
        avatar_url: 'https://example.com/avatar.jpg',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      const mockFrom = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: updatedProfile, error: null }),
            }),
          }),
        }),
      });
      mockSupabase.from = mockFrom as any;

      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setUser(mockUser);
      });

      await act(async () => {
        const response = await result.current.updateProfile({
          full_name: 'Updated Name',
          avatar_url: 'https://example.com/avatar.jpg',
        });
        expect(response.error).toBeNull();
      });

      expect(result.current.profile).toEqual(updatedProfile);
    });

    it('should return error when no user is logged in', async () => {
      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        const response = await result.current.updateProfile({ full_name: 'Test' });
        expect(response.error).not.toBeNull();
        expect(response.error?.message).toBe('No user logged in');
      });
    });
  });

  describe('signOut', () => {
    it('should sign out successfully', async () => {
      mockSupabase.auth.signOut.mockResolvedValue({ error: null });
      mockSecureStorage.clearAuthData.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setUser({ id: 'test-user' } as any);
        result.current.setSession({ access_token: 'token' } as any);
        result.current.setProfile({ id: 'test-user' } as any);
      });

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
      expect(mockSecureStorage.clearAuthData).toHaveBeenCalled();
      expect(result.current.user).toBeNull();
      expect(result.current.session).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });
});

