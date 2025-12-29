import { AnimatedWelcomeBackground } from '@/components/AnimatedWelcomeBackground';
import { ThemedHeader } from '@/components/ThemedHeader';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ThemedButton } from '@/components/ui/ThemedButton';
import { useBiometric } from '@/hooks/use-biometric';
import { getOnboardingCompleted } from '@/lib/secure-storage';
import { useAuthStore } from '@/stores/use-auth-store';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function VerifyOtpScreen() {
  const params = useLocalSearchParams<{email: string}>();
  const email = params.email || '';
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [enableBiometric, setEnableBiometric] = useState(false);
  const {
    verifyOtp,
    sendOtp,
    isLoading: authLoading,
    enableBiometric: enableBiometricAuth,
  } = useAuthStore();
  const {available: biometricAvailable, getBiometricName} = useBiometric();
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    // Redirect if email is missing
    if (!email) {
      router.replace('/auth/login');
      return;
    }
    inputRefs.current[0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOtpChange = (value: string, index: number) => {
    if (value && !/^\d+$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setError('');

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  useEffect(() => {
    const otpCode = otp.join('');
    if (otpCode.length === 6 && !isLoading && !authLoading && !error) {
      const timer = setTimeout(() => {
        handleVerify();
      }, 200);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp.join('')]);

  const handleVerify = async () => {
    const otpCode = otp.join('');

    if (otpCode.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    setIsLoading(true);
    setError('');
    const {error: verifyError} = await verifyOtp(email, otpCode);
    setIsLoading(false);

    if (verifyError) {
      const errorMessage = verifyError.message || 'Invalid code. Please try again.';
      setError(errorMessage);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } else {
      // Enable biometric if user selected it
      if (enableBiometric && biometricAvailable) {
        await enableBiometricAuth(email);
      }
      
      // Check if onboarding is completed
      const onboardingCompleted = await getOnboardingCompleted();
      
      if (onboardingCompleted) {
        // Existing user - go to home
        router.replace('/(tabs)/home');
      } else {
        // New user - go to onboarding
        router.replace('/onboarding/welcome');
      }
    }
  };

  const handleResend = async () => {
    if (!email) {
      Alert.alert('Error', 'Email is required to resend code.');
      return;
    }

    setIsResending(true);
    setError('');
    const {error: resendError} = await sendOtp(email);
    setIsResending(false);

    if (resendError) {
      const errorMessage = resendError.message || 'Failed to resend OTP. Please try again.';
      Alert.alert('Error', errorMessage);
    } else {
      Alert.alert('Success', 'A new code has been sent to your email.');
      setOtp(['', '', '', '', '', '']);
      setError('');
      inputRefs.current[0]?.focus();
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1">
      {/* Animated Background */}
      <AnimatedWelcomeBackground />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1">
        <ScrollView
          contentContainerClassName="flex-grow"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View className="flex-1 px-6 py-8">
            {/* Header */}
            <View className="mb-8 mt-4">
              <ThemedHeader
                title="Verify Code"
                subtitle="We've sent a 6-digit code to"
                variant="overlay"
              />
              <ThemedText
                className="text-base font-semibold mb-1"
                lightColor="#FFFFFF"
                darkColor="#FFFFFF"
                style={{
                  textShadowColor: 'rgba(0, 0, 0, 0.3)',
                  textShadowOffset: {width: 1, height: 1},
                  textShadowRadius: 2,
                }}>
                {email}
              </ThemedText>
              <ThemedText
                className="text-xs mt-2"
                lightColor="rgba(255, 255, 255, 0.8)"
                darkColor="rgba(255, 255, 255, 0.8)">
                Enter the code to sign in or create your account
              </ThemedText>
            </View>

            {/* OTP Input */}
            <View className="flex-1 justify-center">
              <View className="mb-6">
                <View className="flex-row justify-between gap-3 mb-4">
                  {otp.map((digit, index) => {
                    const hasError = !!error;
                    const borderColor = digit
                      ? '#FFFFFF'
                      : hasError
                        ? '#ff6b6b'
                        : 'rgba(255, 255, 255, 0.5)';

                    return (
                      <ThemedView
                        key={index}
                        animated
                        delay={index * 50}
                        className="flex-1 h-16 rounded-xl border-2 items-center justify-center backdrop-blur-sm"
                        style={{
                          borderColor,
                          backgroundColor: digit
                            ? 'rgba(255, 255, 255, 0.2)'
                            : 'rgba(255, 255, 255, 0.1)',
                        }}>
                        <TextInput
                          ref={(ref) => {
                            inputRefs.current[index] = ref;
                          }}
                          className="text-2xl font-bold text-center w-full h-full"
                          style={{
                            color: '#FFFFFF',
                          }}
                          autoFocus={index === 0}
                          value={digit}
                          onChangeText={(value) => handleOtpChange(value, index)}
                          onKeyPress={({nativeEvent}) => handleKeyPress(nativeEvent.key, index)}
                          keyboardType="number-pad"
                          maxLength={1}
                          selectTextOnFocus
                          textContentType="oneTimeCode"
                          placeholderTextColor="rgba(255, 255, 255, 0.5)"
                        />
                      </ThemedView>
                    );
                  })}
                </View>
                {error && (
                  <ThemedText
                    className="text-sm text-center"
                    lightColor="#ff6b6b"
                    darkColor="#ff6b6b"
                    style={{
                      textShadowColor: 'rgba(0, 0, 0, 0.5)',
                      textShadowOffset: {width: 1, height: 1},
                      textShadowRadius: 2,
                    }}>
                    {error}
                  </ThemedText>
                )}
              </View>

              <ThemedButton
                title="Verify"
                variant="primary"
                fullWidth
                onPress={handleVerify}
                isLoading={isLoading || authLoading}
                disabled={otp.join('').length !== 6 || isLoading || authLoading}
              />

              {/* Biometric Enable Option */}
              {biometricAvailable && (
                <View className="mt-4 flex-row items-center justify-between p-4 rounded-xl border-2 border-white/30 bg-white/20 dark:bg-white/30 backdrop-blur-sm">
                  <View className="flex-1 mr-4">
                    <ThemedText
                      className="text-sm font-semibold mb-1"
                      lightColor="#FFFFFF"
                      darkColor="#FFFFFF"
                      style={{
                        textShadowColor: 'rgba(0, 0, 0, 0.3)',
                        textShadowOffset: {width: 1, height: 1},
                        textShadowRadius: 2,
                      }}>
                      Enable {getBiometricName()}
                    </ThemedText>
                    <ThemedText
                      className="text-xs"
                      lightColor="rgba(255, 255, 255, 0.8)"
                      darkColor="rgba(255, 255, 255, 0.8)">
                      Sign in faster next time with {getBiometricName().toLowerCase()}
                    </ThemedText>
                  </View>
                  <Switch
                    value={enableBiometric}
                    onValueChange={setEnableBiometric}
                    trackColor={{false: 'rgba(255, 255, 255, 0.3)', true: '#FFFFFF'}}
                    thumbColor={enableBiometric ? '#800020' : '#ffffff'}
                  />
                </View>
              )}
            </View>

            {/* Footer */}
            <View className="mt-8 items-center pb-4">
              <ThemedText
                className="text-sm mb-2"
                lightColor="rgba(255, 255, 255, 0.8)"
                darkColor="rgba(255, 255, 255, 0.8)">
                Didn't receive the code?
              </ThemedText>
              <ThemedButton
                title={isResending ? 'Resending...' : 'Resend Code'}
                variant="outline"
                onPress={handleResend}
                isLoading={isResending}
                disabled={isResending}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
