import { AnimatedWelcomeBackground } from '@/components/AnimatedWelcomeBackground';
import { ThemedText } from '@/components/ThemedText';
import { ThemedButton } from '@/components/ui/ThemedButton';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WelcomeScreen() {
  const [isLoading, setIsLoading] = useState(false);

  const handleStartRoaster = () => {
    router.push('/auth/login');
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
            {/* Logo/Icon Section */}
            <View className="items-center mt-8">
              <ThemedView 
                animated
                delay={0}
                className="w-20 h-20 rounded-full bg-white/20 dark:bg-white/30 items-center justify-center mb-6 backdrop-blur-sm border-2 border-white/30">
                <ThemedText 
                  animated
                  delay={50}
                  className="text-5xl">✈️</ThemedText>
              </ThemedView>
              <ThemedText
                animated
                delay={100}
                type="title"
                className="text-4xl font-bold text-center mb-2 drop-shadow-lg"
                lightColor="#FFFFFF"
                darkColor="#FFFFFF"
                style={{
                  textShadowColor: 'rgba(0, 0, 0, 0.5)',
                  textShadowOffset: {width: 2, height: 2},
                  textShadowRadius: 4,
                }}>
                Roaster Me
              </ThemedText>
              <ThemedText
                animated
                delay={150}
                className="text-base text-center drop-shadow-md"
                lightColor="rgba(255, 255, 255, 0.9)"
                darkColor="rgba(255, 255, 255, 0.9)"
                style={{
                  textShadowColor: 'rgba(0, 0, 0, 0.3)',
                  textShadowOffset: {width: 1, height: 1},
                  textShadowRadius: 2,
                }}>
                Your flight roster, perfectly managed
              </ThemedText>
            </View>

            {/* Action Button - Fixed at Bottom */}
            <View className="pb-4">
              <ThemedButton
                title="Start Roaster"
                variant="primary"
                fullWidth
                onPress={handleStartRoaster}
                isLoading={isLoading}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
