import { AnimatedWelcomeBackground } from '@/components/AnimatedWelcomeBackground';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Surface, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function OnboardingWelcomeScreen() {
  const handleNext = () => {
    router.push('/onboarding/profile-setup');
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      {/* Animated Background */}
      <AnimatedWelcomeBackground />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}>
        <ScrollView
          contentContainerClassName="flex-grow"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View className="flex-1 px-6 py-12 justify-between">
            {/* Content */}
            <View className="flex-1 justify-center items-center">
              <Surface
                elevation={0}
                style={[
                  styles.iconContainer,
                  {
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                  },
                ]}>
                <Text variant="displayLarge" style={styles.iconEmoji}>
                  ✈️
                </Text>
              </Surface>
              <Text
                variant="displaySmall"
                style={[
                  styles.title,
                  {
                    color: '#FFFFFF',
                    textShadowColor: 'rgba(0, 0, 0, 0.5)',
                    textShadowOffset: {width: 2, height: 2},
                    textShadowRadius: 4,
                  },
                ]}>
                Welcome to Roaster Me
              </Text>
              <Text
                variant="bodyLarge"
                style={[
                  styles.subtitle,
                  {
                    color: 'rgba(255, 255, 255, 0.9)',
                    textShadowColor: 'rgba(0, 0, 0, 0.3)',
                    textShadowOffset: {width: 1, height: 1},
                    textShadowRadius: 2,
                  },
                ]}>
                Your personal flight roster manager. Keep track of your schedules, routes, and
                flights all in one place.
              </Text>
            </View>

            {/* Action Button */}
            <View className="pb-4">
              <Button
                mode="contained"
                onPress={handleNext}
                style={styles.button}
                contentStyle={styles.buttonContent}
                labelStyle={styles.buttonLabel}>
                Get Started
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    borderWidth: 2,
  },
  iconEmoji: {
    fontSize: 64,
  },
  title: {
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: 'bold',
  },
  subtitle: {
    textAlign: 'center',
    paddingHorizontal: 16,
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
});
