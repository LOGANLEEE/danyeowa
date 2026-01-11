import { AnimatedWelcomeBackground } from '@/components/AnimatedWelcomeBackground';
import { ThemedHeader } from '@/components/ThemedHeader';
import { useBiometric } from '@/hooks/use-biometric';
import { getOnboardingCompleted } from '@/lib/secure-storage';
import { useAuthStore } from '@/stores/use-auth-store';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  CodeField,
  Cursor,
  useBlurOnFulfill,
  useClearByFocusCell,
} from 'react-native-confirmation-code-field';
import { Button, Surface, Switch, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

const CELL_COUNT = 6;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  headerContainer: {
    marginBottom: 32,
    marginTop: 16,
  },
  emailText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitleText: {
    fontSize: 12,
    marginTop: 8,
  },
  otpContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  otpInputContainer: {
    marginBottom: 24,
  },
  otpCellText: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  biometricContainer: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  biometricContent: {
    flex: 1,
    marginRight: 16,
  },
  biometricTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  biometricDescription: {
    fontSize: 12,
  },
  footerContainer: {
    marginTop: 32,
    alignItems: 'center',
    paddingBottom: 16,
  },
  footerText: {
    fontSize: 14,
    marginBottom: 8,
  },
});

export default function VerifyOtpScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{email: string}>();
  const email = params.email || '';
  const [value, setValue] = useState('');
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

  const ref = useBlurOnFulfill({value, cellCount: CELL_COUNT});
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const [props, getCellOnLayoutHandler] = useClearByFocusCell({
    value,
    setValue,
  });

  useEffect(() => {
    // Redirect if email is missing
    if (!email) {
      router.replace('/auth/login');
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value.length === CELL_COUNT && !isLoading && !authLoading && !error) {
      const timer = setTimeout(() => {
        handleVerify();
      }, 200);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleVerify = async () => {
    if (value.length !== CELL_COUNT) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    setIsLoading(true);
    setError('');
    const {error: verifyError} = await verifyOtp(email, value);
    setIsLoading(false);

    if (verifyError) {
      const errorMessage = verifyError.message || 'Invalid code. Please try again.';
      setError(errorMessage);
      setValue('');
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
      setValue('');
      setError('');
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      {/* Animated Background */}
      <AnimatedWelcomeBackground />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}>
        <ScrollView
          contentContainerStyle={styles.scrollViewContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.container}>
            {/* Header */}
            <View style={styles.headerContainer}>
              <ThemedHeader
                title="Verify Code"
                subtitle="We've sent a 6-digit code to"
                variant="overlay"
              />
              <Text
                variant="bodyLarge"
                style={[
                  styles.emailText,
                  {
                    color: '#FFFFFF',
                    textShadowColor: 'rgba(0, 0, 0, 0.3)',
                    textShadowOffset: {width: 1, height: 1},
                    textShadowRadius: 2,
                  },
                ]}>
                {email}
              </Text>
              <Text
                variant="bodySmall"
                style={[
                  styles.subtitleText,
                  {
                    color: 'rgba(255, 255, 255, 0.8)',
                  },
                ]}>
                Enter the code to sign in or create your account
              </Text>
            </View>

            {/* OTP Input */}
            <View style={styles.otpContainer}>
              <View style={styles.otpInputContainer}>
                <CodeField
                  ref={ref}
                  {...props}
                  value={value}
                  onChangeText={(text: string) => {
                    setValue(text);
                    setError('');
                  }}
                  cellCount={CELL_COUNT}
                  rootStyle={{
                    marginBottom: 16,
                  }}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                  renderCell={({index, symbol, isFocused}) => {
                    const hasError = !!error;
                    const borderColor = symbol
                      ? '#FFFFFF'
                      : hasError
                      ? '#ff6b6b'
                      : isFocused
                      ? '#FFFFFF'
                      : 'rgba(255, 255, 255, 0.5)';

                    return (
                      <Surface
                        key={index}
                        onLayout={getCellOnLayoutHandler(index)}
                        style={[
                          {
                            flex: 1,
                            height: 64,
                            borderRadius: 12,
                            borderWidth: 2,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginHorizontal: 6,
                            // Note: Native 'backdrop-blur' is not available cross-platform RN.
                            // You may implement a BlurView wrapper for true effect.
                          },
                          {
                            borderColor,
                            backgroundColor: symbol
                              ? 'rgba(255, 255, 255, 0.2)'
                              : 'rgba(255, 255, 255, 0.1)',
                            elevation: 0,
                          },
                          {
                            borderColor,
                            backgroundColor: symbol
                              ? 'rgba(255, 255, 255, 0.2)'
                              : 'rgba(255, 255, 255, 0.1)',
                            elevation: 0,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.otpCellText,
                            {
                              color: '#FFFFFF',
                            },
                          ]}>
                          {symbol || (isFocused ? <Cursor /> : null)}
                        </Text>
                      </Surface>
                    );
                  }}
                />
                {error && (
                  <Text
                    variant="bodySmall"
                    style={[
                      styles.errorText,
                      {
                        color: '#ff6b6b',
                        textShadowColor: 'rgba(0, 0, 0, 0.5)',
                        textShadowOffset: {width: 1, height: 1},
                        textShadowRadius: 2,
                      },
                    ]}>
                    {error}
                  </Text>
                )}
              </View>

              <Button
                mode="contained"
                onPress={handleVerify}
                loading={isLoading || authLoading}
                disabled={value.length !== CELL_COUNT || isLoading || authLoading}
                style={{
                  borderRadius: 12,
                  minHeight: 60,
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  borderWidth: 2,
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                }}
                contentStyle={{
                  paddingVertical: 8,
                }}
                labelStyle={{
                  fontSize: 16,
                  fontWeight: '600',
                  letterSpacing: 0.5,
                  color: '#FFFFFF',
                }}>
                Verify
              </Button>

              {/* Biometric Enable Option */}
              {biometricAvailable && (
                <Surface
                  style={[
                    styles.biometricContainer,
                    {
                      elevation: 0,
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      borderColor: 'rgba(255, 255, 255, 0.3)',
                    },
                  ]}>
                  <View style={styles.biometricContent}>
                    <Text
                      variant="bodyMedium"
                      style={[
                        styles.biometricTitle,
                        {
                          color: '#FFFFFF',
                          textShadowColor: 'rgba(0, 0, 0, 0.3)',
                          textShadowOffset: {width: 1, height: 1},
                          textShadowRadius: 2,
                        },
                      ]}>
                      Enable {getBiometricName()}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={[
                        styles.biometricDescription,
                        {
                          color: 'rgba(255, 255, 255, 0.8)',
                        },
                      ]}>
                      Sign in faster next time with {getBiometricName().toLowerCase()}
                    </Text>
                  </View>
                  <Switch
                    value={enableBiometric}
                    onValueChange={setEnableBiometric}
                    color="#FFFFFF"
                  />
                </Surface>
              )}
            </View>

            {/* Footer */}
            <View style={styles.footerContainer}>
              <Text
                variant="bodyMedium"
                style={[
                  styles.footerText,
                  {
                    color: 'rgba(255, 255, 255, 0.8)',
                  },
                ]}>
                Didn't receive the code?
              </Text>
              <Button
                mode="outlined"
                onPress={handleResend}
                loading={isResending}
                disabled={isResending}
                style={{
                  borderRadius: 12,
                  minHeight: 60,
                  borderColor: 'rgba(255, 255, 255, 0.5)',
                  borderWidth: 2,
                }}
                contentStyle={{
                  paddingVertical: 8,
                }}
                labelStyle={{
                  fontSize: 16,
                  fontWeight: '600',
                  letterSpacing: 0.5,
                  color: '#FFFFFF',
                }}>
                {isResending ? 'Resending...' : 'Resend Code'}
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
