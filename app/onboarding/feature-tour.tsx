import { AnimatedWelcomeBackground } from '@/components/AnimatedWelcomeBackground';
import { ThemedHeader } from '@/components/ThemedHeader';
import { saveOnboardingCompleted } from '@/lib/secure-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Button, Surface, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { easingCurves, viewSpringConfig } from '@/utils/animations';

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

function AnimatedFeatureCard({
  feature,
  index,
}: {
  feature: (typeof features)[0];
  index: number;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(30);
  const scale = useSharedValue(0.92);

  useEffect(() => {
    const delay = index * 100;
    opacity.value = delay > 0
      ? withDelay(delay, withTiming(1, { duration: 450, easing: easingCurves.easeOut }))
      : withTiming(1, { duration: 450, easing: easingCurves.easeOut });
    translateY.value = delay > 0
      ? withDelay(delay, withSpring(0, viewSpringConfig))
      : withSpring(0, viewSpringConfig);
    scale.value = delay > 0
      ? withDelay(delay, withSpring(1, viewSpringConfig))
      : withSpring(1, viewSpringConfig);
  }, [index, opacity, translateY, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View style={[styles.featureCardContainer, animatedStyle]}>
      <Surface elevation={0} style={styles.featureCard}>
        <View style={styles.featureContent}>
          <Text style={styles.featureIcon}>{feature.icon}</Text>
          <View style={styles.featureTextContainer}>
            <Text variant="titleLarge" style={styles.featureTitle}>
              {feature.title}
            </Text>
            <Text variant="bodyLarge" style={styles.featureDescription}>
              {feature.description}
            </Text>
          </View>
        </View>
      </Surface>
    </Animated.View>
  );
}

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
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      {/* Animated Background */}
      <AnimatedWelcomeBackground />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            {/* Header */}
            <ThemedHeader
              title="Discover Roaster Me"
              subtitle="Here's what you can do with Roaster Me"
              variant="overlay"
            />

            {/* Features */}
            <View style={styles.featuresContainer}>
              {features.map((feature, index) => (
                <AnimatedFeatureCard key={index} feature={feature} index={index} />
              ))}
            </View>

            {/* Action Button */}
            <View style={styles.buttonContainer}>
              <Button
                mode="contained"
                onPress={handleComplete}
                loading={isLoading}
                disabled={isLoading}
                style={styles.button}
                contentStyle={styles.buttonContent}
                labelStyle={styles.buttonLabel}>
                Start Using Roaster Me
              </Button>
            </View>
          </View>
        </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 32,
  },
  featuresContainer: {
    flex: 1,
    justifyContent: 'center',
    marginBottom: 32,
  },
  featureCardContainer: {
    marginBottom: 24,
  },
  featureCard: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  featureContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  featureIcon: {
    fontSize: 36,
    marginRight: 16,
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    marginBottom: 8,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 2,
  },
  featureDescription: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  buttonContainer: {
    paddingBottom: 16,
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

