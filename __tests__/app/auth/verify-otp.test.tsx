import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import VerifyOtpScreen from '@/app/auth/verify-otp';
import { useAuthStore } from '@/stores/use-auth-store';

// Mock the auth store
jest.mock('@/stores/use-auth-store');
const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;

// Mock expo-router
const mockRouter = {
  replace: jest.fn(),
  push: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ email: 'test@example.com' }),
  router: mockRouter,
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

describe('VerifyOtpScreen', () => {
  const mockVerifyOtp = jest.fn();
  const mockSendOtp = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthStore.mockReturnValue({
      verifyOtp: mockVerifyOtp,
      sendOtp: mockSendOtp,
      isLoading: false,
    } as any);
  });

  it('should render verify OTP screen', () => {
    const { getByText } = render(<VerifyOtpScreen />);

    expect(getByText('Verify Code')).toBeTruthy();
    expect(getByText("We've sent a 6-digit code to")).toBeTruthy();
    expect(getByText('test@example.com')).toBeTruthy();
  });

  it('should verify OTP when 6 digits are entered', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });
    const { getByText, getAllByDisplayValue } = render(<VerifyOtpScreen />);
    const inputs = getAllByDisplayValue('');

    // Enter 6 digits
    fireEvent.changeText(inputs[0], '1');
    fireEvent.changeText(inputs[1], '2');
    fireEvent.changeText(inputs[2], '3');
    fireEvent.changeText(inputs[3], '4');
    fireEvent.changeText(inputs[4], '5');
    fireEvent.changeText(inputs[5], '6');

    await waitFor(() => {
      expect(mockVerifyOtp).toHaveBeenCalledWith('test@example.com', '123456');
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/home');
    });
  });

  it('should show error on invalid OTP', async () => {
    const error = new Error('Invalid code');
    mockVerifyOtp.mockResolvedValue({ error });
    const { getByText, getAllByDisplayValue } = render(<VerifyOtpScreen />);
    const inputs = getAllByDisplayValue('');

    fireEvent.changeText(inputs[0], '1');
    fireEvent.changeText(inputs[1], '2');
    fireEvent.changeText(inputs[2], '3');
    fireEvent.changeText(inputs[3], '4');
    fireEvent.changeText(inputs[4], '5');
    fireEvent.changeText(inputs[5], '6');

    await waitFor(() => {
      expect(getByText('Invalid code')).toBeTruthy();
    });
  });

  it('should resend OTP successfully', async () => {
    mockSendOtp.mockResolvedValue({ error: null });
    const { getByText } = render(<VerifyOtpScreen />);
    const resendButton = getByText('Resend Code');

    fireEvent.press(resendButton);

    await waitFor(() => {
      expect(mockSendOtp).toHaveBeenCalledWith('test@example.com');
      expect(Alert.alert).toHaveBeenCalledWith('Success', 'A new code has been sent to your email.');
    });
  });

  it('should show error on resend failure', async () => {
    const error = new Error('Failed to resend');
    mockSendOtp.mockResolvedValue({ error });
    const { getByText } = render(<VerifyOtpScreen />);
    const resendButton = getByText('Resend Code');

    fireEvent.press(resendButton);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to resend');
    });
  });

  it('should disable verify button when OTP is incomplete', () => {
    const { getByText, getAllByDisplayValue } = render(<VerifyOtpScreen />);
    const verifyButton = getByText('Verify');
    const inputs = getAllByDisplayValue('');

    expect(verifyButton.props.disabled).toBe(true);

    // Enter only 3 digits
    fireEvent.changeText(inputs[0], '1');
    fireEvent.changeText(inputs[1], '2');
    fireEvent.changeText(inputs[2], '3');

    expect(verifyButton.props.disabled).toBe(true);
  });
});

