import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { type ViewProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { entranceAnimation, easingCurves } from '@/utils/animations';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  animated?: boolean;
  delay?: number;
  animationType?: 'fade' | 'slide' | 'scale' | 'combined';
  exit?: boolean;
};

export function ThemedView({
  style,
  lightColor,
  darkColor,
  animated = false,
  delay = 0,
  animationType = 'combined',
  exit = false,
  ...otherProps
}: ThemedViewProps) {
  const backgroundColor = useThemeColor({light: lightColor, dark: darkColor}, 'background');
  
  // Shared values for animations
  const opacity = useSharedValue(animated ? 0 : 1);
  const translateY = useSharedValue(animated ? 30 : 0);
  const translateX = useSharedValue(0);
  const scale = useSharedValue(animated ? 0.92 : 1);
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (animated) {
      const timer = setTimeout(() => {
        const animations = entranceAnimation(delay);
        
        // Apply animations based on type
        switch (animationType) {
          case 'fade':
            opacity.value = animations.opacity;
            break;
          case 'slide':
            opacity.value = animations.opacity;
            translateY.value = animations.translateY;
            break;
          case 'scale':
            opacity.value = animations.opacity;
            scale.value = animations.scale;
            break;
          case 'combined':
          default:
            opacity.value = animations.opacity;
            translateY.value = animations.translateY;
            scale.value = animations.scale;
            break;
        }
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [animated, delay, animationType, opacity, translateY, scale]);

  // Handle exit animation
  useEffect(() => {
    if (exit) {
      opacity.value = withTiming(0, {
        duration: 300,
        easing: easingCurves.easeIn,
      });
      scale.value = withTiming(0.95, {
        duration: 300,
        easing: easingCurves.easeIn,
      });
    }
  }, [exit, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => {
    const transforms: {translateY?: number; translateX?: number; scale?: number; rotate?: string}[] = [];
    
    if (animationType === 'slide' || animationType === 'combined') {
      transforms.push({ translateY: translateY.value });
    }
    if (animationType === 'scale' || animationType === 'combined') {
      transforms.push({ scale: scale.value });
    }
    if (translateX.value !== 0) {
      transforms.push({ translateX: translateX.value });
    }
    if (rotation.value !== 0) {
      transforms.push({ rotate: `${rotation.value}deg` });
    }

    return {
      opacity: opacity.value,
      transform: transforms.length > 0 ? transforms : undefined,
    };
  }, [animationType]);

  return (
    <Animated.View
      style={[
        {backgroundColor},
        animated ? animatedStyle : undefined,
        style,
      ]}
      {...otherProps}
    />
  );
}
