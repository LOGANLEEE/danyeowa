import { AnimatedWelcomeBackground } from '@/components/AnimatedWelcomeBackground';
import { ThemedHeader } from '@/components/ThemedHeader';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { ThemedButton } from '@/components/ui/ThemedButton';
import { ThemedInput } from '@/components/ui/ThemedInput';
import { useBiometric } from '@/hooks/use-biometric';
import { useAuthStore } from '@/stores/use-auth-store';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, TouchableOpacity, View } from 'react-native';

export default function LoginScreen() {
  const [email, setEmail] = useState(__DEV__ ? 'dlfjgkssk1@naver.com' : '');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const {sendOtp, isLoading: authLoading, loginWithBiometric, getBiometricEmail} = useAuthStore();
  const {
    available: biometricAvailable,
    isLoading: biometricLoading,
    authenticate,
    getBiometricName,
  } = useBiometric();
  const [biometricEmail, setBiometricEmail] = useState<string | null>(null);

  useEffect(() => {
    // Check if biometric login is available
    const checkBiometricEmail = async () => {
      const savedEmail = await getBiometricEmail();
      setBiometricEmail(savedEmail);
    };
    checkBiometricEmail();
  }, [getBiometricEmail]);

  const handleBiometricLogin = async () => {
    if (!biometricAvailable || !biometricEmail) {
      Alert.alert(
        'Biometric Unavailable',
        'Biometric authentication is not available or not configured.',
      );
      return;
    }

    setIsLoading(true);
    setError('');

    // First authenticate with biometric
    const {success, error: authError} = await authenticate();

    if (!success) {
      setIsLoading(false);
      if (authError?.message !== 'User canceled authentication') {
        Alert.alert(
          'Authentication Failed',
          authError?.message || 'Biometric authentication failed. Please try again.',
        );
      }
      return;
    }

    // If biometric succeeds, login with stored credentials
    const {error: loginError} = await loginWithBiometric();
    setIsLoading(false);

    if (loginError) {
      setError(loginError.message);
      Alert.alert('Login Failed', loginError.message);
    } else {
      // Success - navigate to home
      router.replace('/(tabs)/home');
    }
  };

  const validateEmail = (emailValue: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailValue.trim()) {
      setError('Email is required');
      return false;
    }
    if (!emailRegex.test(emailValue.trim())) {
      setError('Please enter a valid email address');
      return false;
    }
    setError('');
    return true;
  };

  const handleSendOtp = async () => {
    if (!validateEmail(email)) return;

    setIsLoading(true);
    setError('');
    const {error: otpError} = await sendOtp(email.trim());
    setIsLoading(false);

    if (otpError) {
      const errorMessage = otpError.message || 'Failed to send OTP. Please try again.';
      setError(errorMessage);
      Alert.alert('Error', errorMessage);
    } else {
      // Success - navigate to verify OTP screen
      router.push({
        pathname: '/auth/verify-otp',
        params: {email: email.trim()},
      });
    }
  };

  return (
    <ScreenContainer
      edges={[]}
      scrollable={false}
      keyboardBehavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardShouldPersistTaps="handled"
      showScrollIndicator={false}>
      {/* Animated Background */}
      <AnimatedWelcomeBackground />

      <View className="flex-1 px-6 py-8 mt-5">
        {/* Header */}
        <ThemedHeader
          title={biometricAvailable && biometricEmail ? 'Welcome Back' : 'Get Started'}
          subtitle={
            biometricAvailable && biometricEmail
              ? `Sign in with ${getBiometricName()} or enter your email`
              : "Enter your email to continue. We'll create your account automatically."
          }
          variant="overlay"
        />

        {/* Form */}
        <View className="flex-1 justify-center">
          {/* Method 1: Biometric Login */}
          {biometricAvailable && biometricEmail && !biometricLoading && (
            <View className="mb-6">
              <ThemedText
                animated
                delay={0}
                className="text-sm font-semibold mb-3 uppercase tracking-wide"
                lightColor="rgba(255, 255, 255, 0.9)"
                darkColor="rgba(255, 255, 255, 0.9)"
                style={{
                  textShadowColor: 'rgba(0, 0, 0, 0.3)',
                  textShadowOffset: {width: 1, height: 1},
                  textShadowRadius: 2,
                }}>
                Method 1: Biometric Authentication
              </ThemedText>
              <ThemedView
                animated
                delay={50}
                className="rounded-xl border-2 border-white/30 bg-white/20 dark:bg-white/30 backdrop-blur-sm">
                <TouchableOpacity
                  onPress={handleBiometricLogin}
                  disabled={isLoading || authLoading}
                  className="flex-row items-center justify-center gap-3 py-4 px-6 active:opacity-70">
                  <Ionicons
                    name={Platform.OS === 'ios' ? 'lock-closed' : 'lock-closed'}
                    size={24}
                    color="#FFFFFF"
                  />
                  <View className="flex-1">
                    <ThemedText
                      animated
                      delay={100}
                      className="text-base font-semibold"
                      lightColor="#FFFFFF"
                      darkColor="#FFFFFF"
                      style={{
                        textShadowColor: 'rgba(0, 0, 0, 0.3)',
                        textShadowOffset: {width: 1, height: 1},
                        textShadowRadius: 2,
                      }}>
                      Sign in with {getBiometricName()}
                    </ThemedText>
                    <ThemedText
                      animated
                      delay={150}
                      className="text-xs mt-0.5"
                      lightColor="rgba(255, 255, 255, 0.8)"
                      darkColor="rgba(255, 255, 255, 0.8)">
                      {biometricEmail}
                    </ThemedText>
                  </View>
                </TouchableOpacity>
              </ThemedView>
              <View className="flex-row items-center my-4">
                <View className="flex-1 h-px bg-white/30" />
                <ThemedText
                  animated
                  delay={200}
                  className="mx-4 text-sm"
                  lightColor="rgba(255, 255, 255, 0.7)"
                  darkColor="rgba(255, 255, 255, 0.7)">
                  OR
                </ThemedText>
                <View className="flex-1 h-px bg-white/30" />
              </View>
            </View>
          )}

          {/* Method 2: OTP Login */}
          <View className="mb-6">
            {biometricAvailable && biometricEmail && (
              <ThemedText
                animated
                delay={biometricAvailable && biometricEmail ? 250 : 0}
                className="text-sm font-semibold mb-3 uppercase tracking-wide"
                lightColor="rgba(255, 255, 255, 0.9)"
                darkColor="rgba(255, 255, 255, 0.9)"
                style={{
                  textShadowColor: 'rgba(0, 0, 0, 0.3)',
                  textShadowOffset: {width: 1, height: 1},
                  textShadowRadius: 2,
                }}>
                Method 2: OTP Verification
              </ThemedText>
            )}
            {(!biometricAvailable || !biometricEmail) && (
              <ThemedText
                animated
                delay={0}
                className="text-sm font-semibold mb-3 uppercase tracking-wide"
                lightColor="rgba(255, 255, 255, 0.9)"
                darkColor="rgba(255, 255, 255, 0.9)"
                style={{
                  textShadowColor: 'rgba(0, 0, 0, 0.3)',
                  textShadowOffset: {width: 1, height: 1},
                  textShadowRadius: 2,
                }}>
                OTP Verification
              </ThemedText>
            )}
            <View>
              <ThemedText
                animated
                delay={biometricAvailable && biometricEmail ? 300 : 50}
                className="mb-3 text-sm font-semibold tracking-wide uppercase"
                lightColor="rgba(255, 255, 255, 0.9)"
                darkColor="rgba(255, 255, 255, 0.9)"
                style={{
                  textShadowColor: 'rgba(0, 0, 0, 0.3)',
                  textShadowOffset: {width: 1, height: 1},
                  textShadowRadius: 2,
                }}>
                Email
              </ThemedText>
              <ThemedInput
                animated
                delay={biometricAvailable && biometricEmail ? 350 : 100}
                placeholder="your.email@example.com"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (error) setError('');
                }}
                error={error}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                onSubmitEditing={handleSendOtp}
                returnKeyType="send"
                autoFocus={!biometricAvailable || !biometricEmail}
              />
            </View>
            <ThemedText
              className="text-xs mt-2"
              lightColor="rgba(255, 255, 255, 0.8)"
              darkColor="rgba(255, 255, 255, 0.8)">
              We'll send a 6-digit code to your email. If you're new, we'll create your account
              automatically.
            </ThemedText>
          </View>

          <ThemedButton
            title="Send OTP Code"
            variant="primary"
            fullWidth
            onPress={handleSendOtp}
            isLoading={isLoading || authLoading}
            disabled={!email.trim() || isLoading || authLoading}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}
