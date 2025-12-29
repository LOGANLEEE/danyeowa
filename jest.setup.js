// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  Redirect: ({ href }) => `Redirect to ${href}`,
  Link: ({ href, children }) => `Link to ${href}: ${children}`,
  Stack: {
    Screen: ({ name, options }) => `Screen: ${name}`,
    Protected: ({ children, guard }) => (guard ? children : null),
  },
}));

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    clear: jest.fn(() => Promise.resolve()),
    getAllKeys: jest.fn(() => Promise.resolve([])),
    multiGet: jest.fn(() => Promise.resolve([])),
    multiSet: jest.fn(() => Promise.resolve()),
    multiRemove: jest.fn(() => Promise.resolve()),
  },
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {},
  },
}));

// Set up environment variables for tests
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://yriigjnzhjgumnsoyppf.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyaWlnam56aGpndW1uc295cHBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MjY0ODYsImV4cCI6MjA4MjAwMjQ4Nn0.FYuEG21cD8sEFEMRM5IDAddmc7J23F_qn9-jzCnl6to';

// Mock window.dispatchEvent for React Native test environment
if (typeof window !== 'undefined' && !window.dispatchEvent) {
  window.dispatchEvent = jest.fn();
}

// Suppress console errors in tests (but allow console.error to be spied on)
const originalError = console.error;
console.error = (...args: any[]) => {
  // Only suppress known test environment errors
  if (
    args[0]?.includes?.('Warning:') ||
    args[0]?.includes?.('act(') ||
    args[0]?.includes?.('window.dispatchEvent')
  ) {
    return;
  }
  originalError(...args);
};

