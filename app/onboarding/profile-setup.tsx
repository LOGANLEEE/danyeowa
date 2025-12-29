import { AnimatedWelcomeBackground } from '@/components/AnimatedWelcomeBackground';
import { ThemedHeader } from '@/components/ThemedHeader';
import { ThemedText } from '@/components/ThemedText';
import { ThemedButton } from '@/components/ui/ThemedButton';
import { ThemedInput } from '@/components/ui/ThemedInput';
import { useAuthStore } from '@/stores/use-auth-store';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileSetupScreen() {
  const { profile, updateProfile } = useAuthStore();
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
      const { error: updateError } = await updateProfile({
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
            <ThemedHeader
              title="Let's set up your profile"
              subtitle="Tell us your name so we can personalize your experience"
              variant="overlay"
            />

            {/* Form */}
            <View className="flex-1 justify-center">
              <View className="mb-6">
                <ThemedText
                  animated
                  delay={0}
                  className="mb-3 text-sm font-semibold tracking-wide uppercase"
                  lightColor="rgba(255, 255, 255, 0.9)"
                  darkColor="rgba(255, 255, 255, 0.9)"
                  style={{
                    textShadowColor: 'rgba(0, 0, 0, 0.3)',
                    textShadowOffset: {width: 1, height: 1},
                    textShadowRadius: 2,
                  }}>
                  Full Name
                </ThemedText>
                <ThemedInput
                  animated
                  delay={50}
                  placeholder="Enter your full name"
                  value={fullName}
                  onChangeText={(text) => {
                    setFullName(text);
                    if (error) setError('');
                  }}
                  error={error}
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  onSubmitEditing={handleNext}
                  returnKeyType="next"
                  autoFocus
                />
              </View>

              <ThemedButton
                title="Continue"
                variant="primary"
                fullWidth
                onPress={handleNext}
                isLoading={isLoading}
                disabled={!fullName.trim() || isLoading}
              />

              <ThemedButton
                title="Skip for now"
                variant="outline"
                fullWidth
                onPress={handleSkip}
                disabled={isLoading}
                style={{ marginTop: 12 }}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

