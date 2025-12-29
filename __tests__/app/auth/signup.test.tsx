import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SignUpScreen from '@/app/auth/signup';
import { useAuthStore } from '@/stores/use-auth-store';

// Mock the auth store
jest.mock('@/stores/use-auth-store');
const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
  router: {
    push: jest.fn(),
  },
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

describe('SignUpScreen', () => {
  const mockSendOtp = jest.fn();
  const mockRouter = {
    push: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthStore.mockReturnValue({
      sendOtp: mockSendOtp,
      isLoading: false,
    } as any);
    require('expo-router').router.push = mockRouter.push;
  });

  it('should render signup screen', () => {
    const { getByText, getByPlaceholderText } = render(<SignUpScreen />);

    expect(getByText('Create Account')).toBeTruthy();
    expect(getByPlaceholderText('your.email@example.com')).toBeTruthy();
    expect(getByText('Continue')).toBeTruthy();
  });

  it('should validate email format', async () => {
    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);
    const emailInput = getByPlaceholderText('your.email@example.com');
    const continueButton = getByText('Continue');

    fireEvent.changeText(emailInput, 'invalid-email');
    fireEvent.press(continueButton);

    await waitFor(() => {
      expect(mockSendOtp).not.toHaveBeenCalled();
    });
  });

  it('should send OTP on valid email', async () => {
    mockSendOtp.mockResolvedValue({ error: null });
    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);
    const emailInput = getByPlaceholderText('your.email@example.com');
    const continueButton = getByText('Continue');

    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.press(continueButton);

    await waitFor(() => {
      expect(mockSendOtp).toHaveBeenCalledWith('test@example.com');
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/auth/verify-otp',
        params: { email: 'test@example.com' },
      });
    });
  });

  it('should show error alert on OTP send failure', async () => {
    const error = new Error('Failed to send OTP');
    mockSendOtp.mockResolvedValue({ error });
    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);
    const emailInput = getByPlaceholderText('your.email@example.com');
    const continueButton = getByText('Continue');

    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.press(continueButton);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to send OTP');
    });
  });
});

