import { AnimatedWelcomeBackground } from '@/components/AnimatedWelcomeBackground';
import { ThemedHeader } from '@/components/ThemedHeader';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ThemedButton } from '@/components/ui/ThemedButton';
import { saveOnboardingCompleted } from '@/lib/secure-storage';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const features = [
  {
    icon: '📅',
    title: 'Manage Your Schedule',
    description: 'View and organize all your flight rosters in one place',
  },
  {
    icon: '✈️',
    title: 'Track Your Flights',
    description: 'Keep track of routes, departure times, and flight status',
  },
  {
    icon: '🔔',
    title: 'Stay Updated',
    description: 'Get notified about schedule changes and important updates',
  },
];

export default function FeatureTourScreen() {
  const [isLoading, setIsLoading] = useState(false);

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      // Mark onboarding as completed
      await saveOnboardingCompleted(true);
      // Navigate to home
      router.replace('/(tabs)/home');
    } catch (error) {
      console.error('[Onboarding] Failed to save onboarding completed:', error);
      // Still navigate to home even if saving fails
      router.replace('/(tabs)/home');
    } finally {
      setIsLoading(false);
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
            <ThemedHeader
              title="Discover Roaster Me"
              subtitle="Here's what you can do with Roaster Me"
              variant="overlay"
            />

            {/* Features */}
            <View className="flex-1 justify-center mb-8">
              {features.map((feature, index) => (
                <ThemedView
                  key={index}
                  animated
                  delay={index * 100}
                  className="mb-6 p-6 rounded-xl border-2 border-white/30 bg-white/20 dark:bg-white/30 backdrop-blur-sm">
                  <View className="flex-row items-start gap-4">
                    <ThemedText className="text-4xl">{feature.icon}</ThemedText>
                    <View className="flex-1">
                      <ThemedText
                        className="text-xl font-bold mb-2"
                        lightColor="#FFFFFF"
                        darkColor="#FFFFFF"
                        style={{
                          textShadowColor: 'rgba(0, 0, 0, 0.3)',
                          textShadowOffset: {width: 1, height: 1},
                          textShadowRadius: 2,
                        }}>
                        {feature.title}
                      </ThemedText>
                      <ThemedText
                        className="text-base"
                        lightColor="rgba(255, 255, 255, 0.9)"
                        darkColor="rgba(255, 255, 255, 0.9)">
                        {feature.description}
                      </ThemedText>
                    </View>
                  </View>
                </ThemedView>
              ))}
            </View>

            {/* Action Button */}
            <View className="pb-4">
              <ThemedButton
                title="Start Using Roaster Me"
                variant="primary"
                fullWidth
                onPress={handleComplete}
                isLoading={isLoading}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

