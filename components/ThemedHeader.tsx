import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Appbar, Text, useTheme } from 'react-native-paper';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { easingCurves, staggerDelay, viewSpringConfig } from '@/utils/animations';
import { type ReactNode } from 'react';

export type ThemedHeaderProps = {
  title?: string;
  subtitle?: string;
  variant?: 'default' | 'overlay';
  className?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  style?: ViewStyle;
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  animated?: boolean;
  delay?: number;
  staggerChildren?: boolean;
};

/**
 * Reusable header component for screens
 *
 * @param title - Main header title (optional if using center prop)
 * @param subtitle - Optional subtitle/description text
 * @param variant - 'default' for regular screens, 'overlay' for screens with background images
 * @param className - Additional className for the container View
 * @param titleClassName - Additional className for the title Text
 * @param subtitleClassName - Additional className for the subtitle Text
 * @param style - Additional style for the container View
 * @param left - Optional left component (e.g., back button, menu icon)
 * @param center - Optional center component (overrides title/subtitle if provided)
 * @param right - Optional right component (e.g., action buttons, icons)
 *
 * @example
 * // Default variant with title/subtitle (backward compatible)
 * <ThemedHeader
 *   title="Dashboard"
 *   subtitle="Welcome back! 🐔 Here's your roster overview"
 * />
 *
 * @example
 * // Overlay variant (for screens with AnimatedWelcomeBackground)
 * <ThemedHeader
 *   title="Welcome Back"
 *   subtitle="Sign in with Face ID or enter your email"
 *   variant="overlay"
 * />
 *
 * @example
 * // Custom layout with left, center, and right components
 * <ThemedHeader
 *   left={<TouchableOpacity onPress={goBack}><Ionicons name="arrow-back" /></TouchableOpacity>}
 *   center={<ThemedText>Custom Center</ThemedText>}
 *   right={<TouchableOpacity><Ionicons name="settings" /></TouchableOpacity>}
 * />
 *
 * @example
 * // Mix of title/subtitle with left and right components
 * <ThemedHeader
 *   title="Settings"
 *   left={<BackButton />}
 *   right={<SaveButton />}
 * />
 */
export function ThemedHeader({
  title,
  subtitle,
  variant = 'default',
  className = '',
  titleClassName = '',
  subtitleClassName = '',
  style,
  left,
  center,
  right,
  animated = true,
  delay = 0,
  staggerChildren = true,
}: ThemedHeaderProps) {
  const theme = useTheme();
  const isOverlay = variant === 'overlay';
  const hasCustomLayout = left !== undefined || center !== undefined || right !== undefined;

  // Animation shared values
  const containerOpacity = useSharedValue(animated ? 0 : 1);
  const containerTranslateY = useSharedValue(animated ? -10 : 0);
  const leftOpacity = useSharedValue(animated && left ? 0 : 1);
  const leftTranslateX = useSharedValue(animated && left ? -20 : 0);
  const rightOpacity = useSharedValue(animated && right ? 0 : 1);
  const rightTranslateX = useSharedValue(animated && right ? 20 : 0);
  const titleOpacity = useSharedValue(animated ? 0 : 1);
  const titleTranslateY = useSharedValue(animated ? 20 : 0);
  const subtitleOpacity = useSharedValue(animated ? 0 : 1);
  const subtitleTranslateY = useSharedValue(animated ? 20 : 0);

  // Container animation
  useEffect(() => {
    if (animated) {
      containerOpacity.value =
        delay > 0
          ? withDelay(delay, withTiming(1, {duration: 450, easing: easingCurves.easeOut}))
          : withTiming(1, {duration: 450, easing: easingCurves.easeOut});
      containerTranslateY.value =
        delay > 0
          ? withDelay(delay, withSpring(0, viewSpringConfig))
          : withSpring(0, viewSpringConfig);
    }
  }, [animated, delay, containerOpacity, containerTranslateY]);

  // Left section animation
  useEffect(() => {
    if (animated && left) {
      const leftDelay = staggerChildren ? delay + staggerDelay(0, 50) : delay;
      leftOpacity.value =
        leftDelay > 0
          ? withDelay(leftDelay, withTiming(1, {duration: 450, easing: easingCurves.easeOut}))
          : withTiming(1, {duration: 450, easing: easingCurves.easeOut});
      leftTranslateX.value =
        leftDelay > 0
          ? withDelay(leftDelay, withSpring(0, viewSpringConfig))
          : withSpring(0, viewSpringConfig);
    }
  }, [animated, left, delay, staggerChildren, leftOpacity, leftTranslateX]);

  // Right section animation
  useEffect(() => {
    if (animated && right) {
      const rightDelay = staggerChildren ? delay + staggerDelay(1, 50) : delay;
      rightOpacity.value =
        rightDelay > 0
          ? withDelay(rightDelay, withTiming(1, {duration: 450, easing: easingCurves.easeOut}))
          : withTiming(1, {duration: 450, easing: easingCurves.easeOut});
      rightTranslateX.value =
        rightDelay > 0
          ? withDelay(rightDelay, withSpring(0, viewSpringConfig))
          : withSpring(0, viewSpringConfig);
    }
  }, [animated, right, delay, staggerChildren, rightOpacity, rightTranslateX]);

  // Title animation
  useEffect(() => {
    if (animated && title) {
      const titleDelay = staggerChildren ? delay + staggerDelay(0, 80) : delay;
      titleOpacity.value =
        titleDelay > 0
          ? withDelay(titleDelay, withTiming(1, {duration: 450, easing: easingCurves.easeOut}))
          : withTiming(1, {duration: 450, easing: easingCurves.easeOut});
      titleTranslateY.value =
        titleDelay > 0
          ? withDelay(titleDelay, withSpring(0, viewSpringConfig))
          : withSpring(0, viewSpringConfig);
    }
  }, [animated, title, delay, staggerChildren, titleOpacity, titleTranslateY]);

  // Subtitle animation
  useEffect(() => {
    if (animated && subtitle) {
      const subtitleDelay = staggerChildren ? delay + staggerDelay(1, 80) : delay;
      subtitleOpacity.value =
        subtitleDelay > 0
          ? withDelay(subtitleDelay, withTiming(1, {duration: 450, easing: easingCurves.easeOut}))
          : withTiming(1, {duration: 450, easing: easingCurves.easeOut});
      subtitleTranslateY.value =
        subtitleDelay > 0
          ? withDelay(subtitleDelay, withSpring(0, viewSpringConfig))
          : withSpring(0, viewSpringConfig);
    }
  }, [animated, subtitle, delay, staggerChildren, subtitleOpacity, subtitleTranslateY]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{translateY: containerTranslateY.value}],
  }));

  const leftAnimatedStyle = useAnimatedStyle(() => ({
    opacity: leftOpacity.value,
    transform: [{translateX: leftTranslateX.value}],
  }));

  const rightAnimatedStyle = useAnimatedStyle(() => ({
    opacity: rightOpacity.value,
    transform: [{translateX: rightTranslateX.value}],
  }));

  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{translateY: titleTranslateY.value}],
  }));

  const subtitleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{translateY: subtitleTranslateY.value}],
  }));

  // Default container classes
  const containerClasses = isOverlay ? `mb-8 mt-4 ${className}` : `mb-6 ${className}`;

  // Default title classes
  const defaultTitleClasses = isOverlay ? 'text-3xl font-bold mb-2' : 'text-3xl font-bold mb-1';

  // Default subtitle classes
  const defaultSubtitleClasses = isOverlay
    ? 'text-base'
    : 'text-gray-500 dark:text-gray-400 text-base';

  // Overlay text shadow styles
  const overlayTextShadow = {
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: {width: 2, height: 2},
    textShadowRadius: 4,
  };

  const overlaySubtitleShadow = {
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 2,
  };

  // Render default title/subtitle content
  const renderDefaultContent = () => {
    const titleColor = isOverlay ? '#FFFFFF' : theme.colors.onSurface;
    const subtitleColor = isOverlay ? 'rgba(255, 255, 255, 0.9)' : theme.colors.onSurfaceVariant;

    return (
      <>
        {title && (
          <Animated.View style={animated ? titleAnimatedStyle : undefined}>
            <Text
              variant="headlineLarge"
              className={`${defaultTitleClasses} ${titleClassName}`}
              style={[{color: titleColor}, isOverlay ? overlayTextShadow : undefined]}>
              {title}
            </Text>
          </Animated.View>
        )}
        {subtitle && (
          <Animated.View style={animated ? subtitleAnimatedStyle : undefined}>
            <Text
              variant="bodyLarge"
              className={`${defaultSubtitleClasses} ${subtitleClassName}`}
              style={[{color: subtitleColor}, isOverlay ? overlaySubtitleShadow : undefined]}>
              {subtitle}
            </Text>
          </Animated.View>
        )}
      </>
    );
  };

  // If custom layout is provided, use Appbar.Header
  if (hasCustomLayout) {
    const appbarStyle: ViewStyle = {
      backgroundColor: isOverlay ? 'transparent' : theme.colors.surface,
      elevation: isOverlay ? 0 : undefined,
    };

    return (
      <Animated.View
        className={containerClasses}
        style={[animated ? containerAnimatedStyle : undefined, style]}>
        <Appbar.Header style={[appbarStyle, {paddingHorizontal: 0}]} elevated={!isOverlay}>
          {/* Left section */}
          {left && (
            <Animated.View style={animated ? leftAnimatedStyle : undefined}>{left}</Animated.View>
          )}

          {/* Center section */}
          {center !== undefined ? (
            <View className="flex-1 mx-3" style={{minWidth: 0}}>
              {center}
            </View>
          ) : title ? (
            <Appbar.Content
              title={title}
              subtitle={subtitle || undefined}
              titleStyle={[
                isOverlay ? {color: '#FFFFFF'} : {color: theme.colors.onSurface},
                isOverlay ? overlayTextShadow : undefined,
              ]}
              subtitleStyle={[
                isOverlay
                  ? {color: 'rgba(255, 255, 255, 0.9)'}
                  : {color: theme.colors.onSurfaceVariant},
                isOverlay ? overlaySubtitleShadow : undefined,
              ]}
            />
          ) : null}

          {/* Right section */}
          {right && (
            <Animated.View style={[animated ? rightAnimatedStyle : undefined, {zIndex: 10}]}>
              {right}
            </Animated.View>
          )}
        </Appbar.Header>
      </Animated.View>
    );
  }

  // Default vertical layout (backward compatible)
  return (
    <Animated.View
      className={containerClasses}
      style={[animated ? containerAnimatedStyle : undefined, style]}>
      {renderDefaultContent()}
    </Animated.View>
  );
}
