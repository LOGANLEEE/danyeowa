import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { forwardRef, useEffect, useState } from 'react';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { TextInput, View, type TextInputProps } from 'react-native';

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  containerClassName?: string;
  animated?: boolean;
  delay?: number;
};

export const ThemedInput = forwardRef<TextInput, InputProps>(
  ({label, error, containerClassName, className, onFocus, onBlur, animated = false, delay = 0, ...props}, ref) => {
    const colorScheme = useColorScheme();
    const [isFocused, setIsFocused] = useState(false);
    const borderColorProgress = useSharedValue(0);
    const scale = useSharedValue(animated ? 0.96 : 1);
    const opacity = useSharedValue(animated ? 0 : 1);

    // Initial animation
    useEffect(() => {
      if (animated) {
        const timer = setTimeout(() => {
          opacity.value = withTiming(1, {duration: 400});
          scale.value = withSpring(1, {
            damping: 18,
            stiffness: 140,
            mass: 0.7,
          });
        }, delay);
        return () => clearTimeout(timer);
      }
    }, [animated, delay, opacity, scale]);

    const handleFocus = (e: any) => {
      setIsFocused(true);
      borderColorProgress.value = withSpring(1, {
        damping: 15,
        stiffness: 200,
      });
      onFocus?.(e);
    };

    const handleBlur = (e: any) => {
      setIsFocused(false);
      borderColorProgress.value = withSpring(0, {
        damping: 15,
        stiffness: 200,
      });
      onBlur?.(e);
    };

    const borderAnimatedStyle = useAnimatedStyle(() => {
      // Smooth color interpolation using interpolateColor
      const borderColor = interpolateColor(
        borderColorProgress.value,
        [0, 1],
        colorScheme === 'dark' 
          ? ['#374151', '#DEB887'] // gray-700 to dark tint
          : ['#E5E7EB', '#D2691E'] // gray-200 to light tint
      );
      
      return {
        borderColor,
        transform: [{scale: scale.value}],
        opacity: opacity.value,
      };
    });

    return (
      <View className={containerClassName}>
        {label && (
          <ThemedText 
            animated={animated}
            delay={delay + 50}
            className="mb-3 text-sm font-semibold tracking-wide text-gray-700 dark:text-gray-300 uppercase">
            {label}
          </ThemedText>
        )}
        <Animated.View
          style={[
            {
              borderWidth: 2,
              borderRadius: 12,
            },
            borderAnimatedStyle,
          ]}>
          <ThemedView className="rounded-xl bg-white dark:bg-gray-800 shadow-sm min-h-[60px]">
            <TextInput
              ref={ref}
              className={`px-5 py-4 text-lg text-gray-900 dark:text-gray-100 font-medium ${
                className || ''
              }`}
              placeholderTextColor="#9CA3AF"
              onFocus={handleFocus}
              onBlur={handleBlur}
              {...props}
            />
          </ThemedView>
        </Animated.View>
        {error && (
          <ThemedText 
            animated
            delay={100}
            className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</ThemedText>
        )}
      </View>
    );
  },
);

ThemedInput.displayName = 'ThemedInput';
