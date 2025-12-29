import LoginScreen from '@/app/auth/login';
import { useAuthStore } from '@/stores/use-auth-store';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

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

describe('LoginScreen', () => {
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

  it('should render login screen', () => {
    const { getByText, getByPlaceholderText } = render(<LoginScreen />);

    expect(getByText('Welcome Back')).toBeTruthy();
    expect(getByPlaceholderText('your.email@example.com')).toBeTruthy();
    expect(getByText('Continue')).toBeTruthy();
  });

  it('should validate email format', async () => {
    const { getByPlaceholderText, getByText } = render(<LoginScreen />);
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
    const { getByPlaceholderText, getByText } = render(<LoginScreen />);
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
    const { getByPlaceholderText, getByText } = render(<LoginScreen />);
    const emailInput = getByPlaceholderText('your.email@example.com');
    const continueButton = getByText('Continue');

    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.press(continueButton);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to send OTP');
    });
  });

  it('should disable button when email is empty', () => {
    const { getByText } = render(<LoginScreen />);
    const continueButton = getByText('Continue');

    expect(continueButton.props.disabled).toBe(true);
  });

  it('should enable button when email is valid', () => {
    const { getByPlaceholderText, getByText } = render(<LoginScreen />);
    const emailInput = getByPlaceholderText('your.email@example.com');
    const continueButton = getByText('Continue');

    fireEvent.changeText(emailInput, 'test@example.com');

    expect(continueButton.props.disabled).toBe(false);
  });
});

