import * as SecureStore from 'expo-secure-store';
import {
  saveAuthData,
  getAuthData,
  clearAuthData,
  isSessionValid,
  saveSession,
  saveUser,
  getSession,
  getUser,
} from '@/lib/secure-storage';
import { Session, User } from '@supabase/supabase-js';

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

describe('secure-storage', () => {
  const mockUser: User = {
    id: 'test-user-id',
    email: 'test@example.com',
    email_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    role: 'authenticated',
    identities: [],
  } as User;

  const mockSession: Session = {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: mockUser,
  } as Session;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveSession', () => {
    it('should save session successfully', async () => {
      mockSecureStore.setItemAsync.mockResolvedValue(undefined);

      await saveSession(mockSession);

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'auth_session',
        JSON.stringify(mockSession),
      );
    });

    it('should handle errors when saving session', async () => {
      const error = new Error('Storage error');
      mockSecureStore.setItemAsync.mockRejectedValue(error);

      await expect(saveSession(mockSession)).rejects.toThrow('Storage error');
    });
  });

  describe('saveUser', () => {
    it('should save user successfully', async () => {
      mockSecureStore.setItemAsync.mockResolvedValue(undefined);

      await saveUser(mockUser);

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'auth_user',
        JSON.stringify(mockUser),
      );
    });

    it('should handle errors when saving user', async () => {
      const error = new Error('Storage error');
      mockSecureStore.setItemAsync.mockRejectedValue(error);

      await expect(saveUser(mockUser)).rejects.toThrow('Storage error');
    });
  });

  describe('saveAuthData', () => {
    it('should save both session and user', async () => {
      mockSecureStore.setItemAsync.mockResolvedValue(undefined);
      mockSecureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(mockSession));
      mockSecureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(mockUser));

      await saveAuthData(mockSession, mockUser);

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledTimes(2);
    });

    it('should verify data was saved', async () => {
      mockSecureStore.setItemAsync.mockResolvedValue(undefined);
      mockSecureStore.getItemAsync
        .mockResolvedValueOnce(JSON.stringify(mockSession))
        .mockResolvedValueOnce(JSON.stringify(mockUser));

      await saveAuthData(mockSession, mockUser);

      expect(mockSecureStore.getItemAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('getSession', () => {
    it('should retrieve session successfully', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(mockSession));

      const session = await getSession();

      expect(session).toEqual(mockSession);
      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('auth_session');
    });

    it('should return null if session not found', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const session = await getSession();

      expect(session).toBeNull();
    });

    it('should handle errors when retrieving session', async () => {
      const error = new Error('Storage error');
      mockSecureStore.getItemAsync.mockRejectedValue(error);

      const session = await getSession();

      expect(session).toBeNull();
    });

    it('should convert string expires_at to number', async () => {
      const sessionWithStringExpires = {
        ...mockSession,
        expires_at: String(mockSession.expires_at),
      };
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionWithStringExpires));

      const session = await getSession();

      expect(session?.expires_at).toBe(mockSession.expires_at);
      expect(typeof session?.expires_at).toBe('number');
    });
  });

  describe('getUser', () => {
    it('should retrieve user successfully', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(mockUser));

      const user = await getUser();

      expect(user).toEqual(mockUser);
      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('auth_user');
    });

    it('should return null if user not found', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const user = await getUser();

      expect(user).toBeNull();
    });

    it('should handle errors when retrieving user', async () => {
      const error = new Error('Storage error');
      mockSecureStore.getItemAsync.mockRejectedValue(error);

      const user = await getUser();

      expect(user).toBeNull();
    });
  });

  describe('getAuthData', () => {
    it('should retrieve both session and user', async () => {
      mockSecureStore.getItemAsync
        .mockResolvedValueOnce(JSON.stringify(mockSession))
        .mockResolvedValueOnce(JSON.stringify(mockUser));

      const { session, user } = await getAuthData();

      expect(session).toEqual(mockSession);
      expect(user).toEqual(mockUser);
    });

    it('should return null values if SecureStore is not available', async () => {
      mockSecureStore.isAvailableAsync = jest.fn().mockResolvedValue(false);

      const { session, user } = await getAuthData();

      expect(session).toBeNull();
      expect(user).toBeNull();
    });
  });

  describe('clearAuthData', () => {
    it('should clear both session and user', async () => {
      mockSecureStore.deleteItemAsync.mockResolvedValue(undefined);

      await clearAuthData();

      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('auth_session');
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('auth_user');
    });

    it('should handle errors when clearing data', async () => {
      const error = new Error('Storage error');
      mockSecureStore.deleteItemAsync.mockRejectedValue(error);

      await expect(clearAuthData()).rejects.toThrow('Storage error');
    });
  });

  describe('isSessionValid', () => {
    it('should return true for valid session', () => {
      const validSession = {
        ...mockSession,
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };

      expect(isSessionValid(validSession)).toBe(true);
    });

    it('should return false for expired session', () => {
      const expiredSession = {
        ...mockSession,
        expires_at: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      };

      expect(isSessionValid(expiredSession)).toBe(false);
    });

    it('should return false for session without expires_at', () => {
      const sessionWithoutExpires = {
        ...mockSession,
        expires_at: undefined,
      };

      expect(isSessionValid(sessionWithoutExpires as Session)).toBe(false);
    });

    it('should return false for null session', () => {
      expect(isSessionValid(null)).toBe(false);
    });
  });
});

