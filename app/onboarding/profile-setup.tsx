import { AnimatedWelcomeBackground } from '@/components/AnimatedWelcomeBackground';
import { ThemedHeader } from '@/components/ThemedHeader';
import { useAuthStore } from '@/stores/use-auth-store';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Button, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileSetupScreen() {
  const theme = useTheme();
  const {profile, updateProfile} = useAuthStore();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleNext = async () => {
    if (!fullName.trim()) {
      setError('Please enter your name');
      return;
    }

    setIsLoading(true);
    setError('');

    // Update profile if name is different
    if (fullName.trim() !== profile?.full_name) {
      const {error: updateError} = await updateProfile({
        full_name: fullName.trim(),
      });

      if (updateError) {
        setError(updateError.message || 'Failed to update profile');
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(false);
    router.push('/onboarding/feature-tour');
  };

  const handleSkip = () => {
    router.push('/onboarding/feature-tour');
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      {/* Animated Background */}
      <AnimatedWelcomeBackground />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}>
        <View style={styles.content}>
          {/* Header */}
          <ThemedHeader
            title="Let's set up your profile"
            subtitle="Tell us your name so we can personalize your experience"
            variant="overlay"
          />

          {/* Form */}
          <View style={styles.formContainer}>
            <View style={styles.inputContainer}>
              <Text variant="labelLarge" style={styles.label}>
                Full Name
              </Text>
              <TextInput
                label="Enter your full name"
                value={fullName}
                onChangeText={(text) => {
                  setFullName(text);
                  if (error) setError('');
                }}
                mode="outlined"
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                onSubmitEditing={handleNext}
                returnKeyType="next"
                autoFocus
                error={!!error}
                placeholder="Enter your full name"
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

            <Button
              mode="contained"
              onPress={handleNext}
              loading={isLoading}
              disabled={!fullName.trim() || isLoading}
              style={styles.button}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}>
              Continue
            </Button>

            <Button
              mode="outlined"
              onPress={handleSkip}
              disabled={isLoading}
              style={[styles.button, styles.skipButton]}
              contentStyle={styles.buttonContent}
              labelStyle={styles.skipButtonLabel}>
              Skip for now
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 32,
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    marginBottom: 12,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.9)',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 2,
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
    width: '100%',
    borderRadius: 12,
    minHeight: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  buttonContent: {
    paddingVertical: 8,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: '#FFFFFF',
  },
  skipButton: {
    marginTop: 12,
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  skipButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: '#FFFFFF',
  },
});
