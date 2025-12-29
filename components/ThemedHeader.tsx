import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/ThemedText';
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
 * @param titleClassName - Additional className for the title ThemedText
 * @param subtitleClassName - Additional className for the subtitle ThemedText
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
  const isOverlay = variant === 'overlay';
  const hasCustomLayout = left !== undefined || center !== undefined || right !== undefined;

  // Animation shared values
  const containerOpacity = useSharedValue(animated ? 0 : 1);
  const containerTranslateY = useSharedValue(animated ? -10 : 0);
  const leftOpacity = useSharedValue(animated && left ? 0 : 1);
  const leftTranslateX = useSharedValue(animated && left ? -20 : 0);
  const rightOpacity = useSharedValue(animated && right ? 0 : 1);
  const rightTranslateX = useSharedValue(animated && right ? 20 : 0);

  // Container animation
  useEffect(() => {
    if (animated) {
      containerOpacity.value = delay > 0
        ? withDelay(delay, withTiming(1, { duration: 450, easing: easingCurves.easeOut }))
        : withTiming(1, { duration: 450, easing: easingCurves.easeOut });
      containerTranslateY.value = delay > 0
        ? withDelay(delay, withSpring(0, viewSpringConfig))
        : withSpring(0, viewSpringConfig);
    }
  }, [animated, delay, containerOpacity, containerTranslateY]);

  // Left section animation
  useEffect(() => {
    if (animated && left) {
      const leftDelay = staggerChildren ? delay + staggerDelay(0, 50) : delay;
      leftOpacity.value = leftDelay > 0
        ? withDelay(leftDelay, withTiming(1, { duration: 450, easing: easingCurves.easeOut }))
        : withTiming(1, { duration: 450, easing: easingCurves.easeOut });
      leftTranslateX.value = leftDelay > 0
        ? withDelay(leftDelay, withSpring(0, viewSpringConfig))
        : withSpring(0, viewSpringConfig);
    }
  }, [animated, left, delay, staggerChildren, leftOpacity, leftTranslateX]);

  // Right section animation
  useEffect(() => {
    if (animated && right) {
      const rightDelay = staggerChildren ? delay + staggerDelay(1, 50) : delay;
      rightOpacity.value = rightDelay > 0
        ? withDelay(rightDelay, withTiming(1, { duration: 450, easing: easingCurves.easeOut }))
        : withTiming(1, { duration: 450, easing: easingCurves.easeOut });
      rightTranslateX.value = rightDelay > 0
        ? withDelay(rightDelay, withSpring(0, viewSpringConfig))
        : withSpring(0, viewSpringConfig);
    }
  }, [animated, right, delay, staggerChildren, rightOpacity, rightTranslateX]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ translateY: containerTranslateY.value }],
  }));

  const leftAnimatedStyle = useAnimatedStyle(() => ({
    opacity: leftOpacity.value,
    transform: [{ translateX: leftTranslateX.value }],
  }));

  const rightAnimatedStyle = useAnimatedStyle(() => ({
    opacity: rightOpacity.value,
    transform: [{ translateX: rightTranslateX.value }],
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

  // Calculate title and subtitle delays for stagger effect
  const titleDelay = staggerChildren ? delay + staggerDelay(0, 80) : delay;
  const subtitleDelay = staggerChildren && subtitle ? delay + staggerDelay(1, 80) : delay;

  // Render default title/subtitle content
  const renderDefaultContent = () => (
    <>
      {title && (
        <ThemedText
          type="title"
          className={`${defaultTitleClasses} ${titleClassName}`}
          lightColor={isOverlay ? '#FFFFFF' : undefined}
          darkColor={isOverlay ? '#FFFFFF' : undefined}
          style={isOverlay ? overlayTextShadow : undefined}
          animated={animated}
          delay={titleDelay}
          animationType="combined">
          {title}
        </ThemedText>
      )}
      {subtitle && (
        <ThemedText
          className={`${defaultSubtitleClasses} ${subtitleClassName}`}
          lightColor={isOverlay ? 'rgba(255, 255, 255, 0.9)' : undefined}
          darkColor={isOverlay ? 'rgba(255, 255, 255, 0.9)' : undefined}
          style={isOverlay ? overlaySubtitleShadow : undefined}
          animated={animated}
          delay={subtitleDelay}
          animationType="combined">
          {subtitle}
        </ThemedText>
      )}
    </>
  );

  // If custom layout is provided, use flex row layout
  if (hasCustomLayout) {
    return (
      <Animated.View
        className={`${containerClasses} flex-row items-center`}
        style={[animated ? containerAnimatedStyle : undefined, {overflow: 'visible'}, style]}>
        {/* Left section */}
        {left && (
          <Animated.View className="flex-shrink-0" style={animated ? leftAnimatedStyle : undefined}>
            {left}
          </Animated.View>
        )}

        {/* Center section */}
        <View className="flex-1 mx-3" style={{minWidth: 0}}>
          {center !== undefined ? center : renderDefaultContent()}
        </View>

        {/* Right section */}
        {right && (
          <Animated.View
            className="flex-shrink-0"
            style={[animated ? rightAnimatedStyle : undefined, {zIndex: 10}]}>
            {right}
          </Animated.View>
        )}
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
