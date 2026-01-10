import { AnimatedWelcomeBackground } from '@/components/AnimatedWelcomeBackground';
import { ThemedHeader } from '@/components/ThemedHeader';
import { ThemedText } from '@/components/ThemedText';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { useBiometric } from '@/hooks/use-biometric';
import { useAuthStore } from '@/stores/use-auth-store';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { Button, Card, HelperText, TextInput, useTheme } from 'react-native-paper';

export default function LoginScreen() {
  const [email, setEmail] = useState(
    __DEV__
      ? Platform.select({
          ios: 'dlfjgkssk1@naver.com',
          android: 'dlfjgkssk1@gmail.com',
          default: '',
        })
      : '',
  );
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
  const theme = useTheme();

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
              ? `Sign in instantly with ${getBiometricName()} below, or enter your email to verify your account.`
              : "Enter your email below and we'll send you a secure one-time sign-in link. If you don't have an account, we'll create one for you automatically—no password needed."
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
              <Card
                mode="contained"
                style={[
                  styles.biometricCard,
                  {
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    borderWidth: 2,
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                  },
                ]}
                onPress={handleBiometricLogin}
                disabled={isLoading || authLoading}>
                <Card.Content style={styles.biometricCardContent}>
                  <Ionicons
                    name={Platform.OS === 'ios' ? 'lock-closed' : 'lock-closed'}
                    size={24}
                    color="#FFFFFF"
                  />
                  <View className="flex-1 ml-3">
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
                </Card.Content>
              </Card>
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
              <TextInput
                focusable={true}
                label="Email"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (error) setError('');
                }}
                mode="outlined"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                onSubmitEditing={handleSendOtp}
                returnKeyType="send"
                autoFocus={!biometricAvailable || !biometricEmail}
                error={!!error}
                placeholder="your.email@example.com"
                style={styles.textInput}
                contentStyle={styles.textInputContent}
                outlineStyle={styles.textInputOutline}
                theme={{
                  ...theme,
                  colors: {
                    ...theme.colors,
                    primary: theme.colors.primary,
                    error: theme.colors.error,
                    onSurface: 'rgba(255, 255, 255, 0.9)',
                    onSurfaceVariant: 'rgba(255, 255, 255, 0.7)',
                    outline: 'rgba(255, 255, 255, 0.5)',
                  },
                }}
              />
              <HelperText type="error" visible={!!error} style={styles.helperText}>
                {error}
              </HelperText>
            </View>
            <ThemedText
              className="text-xs mt-2"
              lightColor="rgba(255, 255, 255, 0.8)"
              darkColor="rgba(255, 255, 255, 0.8)">
              We'll send a 6-digit code to your email. If you're new, we'll create your account
              automatically.
            </ThemedText>
          </View>

          <Button
            mode="contained"
            onPress={handleSendOtp}
            loading={isLoading || authLoading}
            disabled={!email.trim() || isLoading || authLoading}
            style={styles.button}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}>
            Send OTP Code
          </Button>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  biometricCard: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  biometricCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  textInputContent: {
    backgroundColor: 'transparent',
  },
  textInputOutline: {
    borderWidth: 2,
  },
  helperText: {
    marginTop: 4,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  button: {
    borderRadius: 12,
    minHeight: 60,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
