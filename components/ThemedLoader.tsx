import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { ActivityIndicator, type ActivityIndicatorProps, View } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { entranceAnimation, easingCurves } from '@/utils/animations';

export type ThemedLoaderProps = ActivityIndicatorProps & {
  message?: string;
  fullScreen?: boolean;
  inline?: boolean;
  size?: 'small' | 'large';
  className?: string;
  animated?: boolean;
  delay?: number;
};

/**
 * Themed loader component with roaster theme colors and high-quality animations
 * Supports light/dark mode with roaster golden brown colors
 * 
 * Modes:
 * - inline: Blends seamlessly within containers (default)
 * - fullScreen: Takes full screen with themed background
 * 
 * Animations:
 * - Smooth fade-in entrance
 * - Pulsing scale effect on loader
 * - Animated message text
 */
export function ThemedLoader({
  message,
  fullScreen = false,
  inline = true,
  size = 'large',
  className = '',
  style,
  animated = true,
  delay = 0,
  ...props
}: ThemedLoaderProps) {
  const tintColor = useThemeColor(
    { light: '#D2691E', dark: '#DEB887' },
    'tint'
  );

  // Animation values
  const containerOpacity = useSharedValue(animated ? 0 : 1);
  const containerScale = useSharedValue(animated ? 0.9 : 1);
  const loaderScale = useSharedValue(1);
  const messageOpacity = useSharedValue(animated && message ? 0 : 1);
  const messageTranslateY = useSharedValue(animated && message ? 10 : 0);

  // Container entrance animation
  useEffect(() => {
    if (animated) {
      const timer = setTimeout(() => {
        const animations = entranceAnimation(delay);
        containerOpacity.value = animations.opacity;
        containerScale.value = animations.scale;
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [animated, delay, containerOpacity, containerScale]);

  // Pulsing loader animation
  useEffect(() => {
    if (animated) {
      loaderScale.value = withRepeat(
        withTiming(1.1, {
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true
      );
    }
  }, [animated, loaderScale]);

  // Message animation (delayed after loader appears)
  useEffect(() => {
    if (animated && message) {
      const messageDelay = delay + 200;
      const timer = setTimeout(() => {
        messageOpacity.value = withTiming(1, {
          duration: 400,
          easing: easingCurves.easeOut,
        });
        messageTranslateY.value = withTiming(0, {
          duration: 400,
          easing: easingCurves.easeOut,
        });
      }, messageDelay);

      return () => clearTimeout(timer);
    }
  }, [animated, message, delay, messageOpacity, messageTranslateY]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ scale: containerScale.value }],
  }));

  const loaderAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: loaderScale.value }],
  }));

  const messageAnimatedStyle = useAnimatedStyle(() => ({
    opacity: messageOpacity.value,
    transform: [{ translateY: messageTranslateY.value }],
  }));

  const loader = (
    <Animated.View 
      style={[
        { alignItems: 'center', justifyContent: 'center' },
        animated ? containerAnimatedStyle : undefined,
        style
      ]}
    >
      <Animated.View style={animated ? loaderAnimatedStyle : undefined}>
        <ActivityIndicator
          size={size}
          color={tintColor}
          {...props}
        />
      </Animated.View>
      {message && (
        <Animated.View style={animated ? messageAnimatedStyle : undefined}>
          <ThemedText className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            {message}
          </ThemedText>
        </Animated.View>
      )}
    </Animated.View>
  );

  if (fullScreen) {
    return (
      <ThemedView className="flex-1 items-center justify-center">
        {loader}
      </ThemedView>
    );
  }

  // Inline mode - blends with container
  if (inline) {
    return (
      <View className={`items-center justify-center py-6 ${className}`}>
        {loader}
      </View>
    );
  }

  return loader;
}

