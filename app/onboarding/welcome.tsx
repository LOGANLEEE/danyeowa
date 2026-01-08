import { AnimatedWelcomeBackground } from '@/components/AnimatedWelcomeBackground';
import { ThemedText } from '@/components/ThemedText';
import { ThemedButton } from '@/components/ui/ThemedButton';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function OnboardingWelcomeScreen() {
  const handleNext = () => {
    router.push('/onboarding/profile-setup');
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
          <View className="flex-1 px-6 py-12 justify-between">
            {/* Content */}
            <View className="flex-1 justify-center items-center">
              <View className="w-24 h-24 rounded-full bg-white/20 dark:bg-white/30 items-center justify-center mb-8 backdrop-blur-sm border-2 border-white/30">
                <ThemedText className="text-6xl">✈️</ThemedText>
              </View>
              <ThemedText
                type="title"
                className="text-4xl font-bold text-center mb-4"
                lightColor="#FFFFFF"
                darkColor="#FFFFFF"
                style={{
                  textShadowColor: 'rgba(0, 0, 0, 0.5)',
                  textShadowOffset: {width: 2, height: 2},
                  textShadowRadius: 4,
                }}>
                Welcome to Roaster Me
              </ThemedText>
              <ThemedText
                className="text-lg text-center px-4"
                lightColor="rgba(255, 255, 255, 0.9)"
                darkColor="rgba(255, 255, 255, 0.9)"
                style={{
                  textShadowColor: 'rgba(0, 0, 0, 0.3)',
                  textShadowOffset: {width: 1, height: 1},
                  textShadowRadius: 2,
                }}>
                Your personal flight roster manager. Keep track of your schedules, routes, and
                flights all in one place.
              </ThemedText>
            </View>

            {/* Action Button */}
            <View className="pb-4">
              <ThemedButton title="Get Started" variant="primary" fullWidth onPress={handleNext} />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
