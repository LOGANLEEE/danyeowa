import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { StyleSheet, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { textEntranceAnimation } from '@/utils/animations';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
  animated?: boolean;
  delay?: number;
  animationType?: 'fade' | 'slide' | 'scale' | 'combined';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  animated = false,
  delay = 0,
  animationType = 'combined',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({light: lightColor, dark: darkColor}, 'text');
  
  // Shared values for animations
  const opacity = useSharedValue(animated ? 0 : 1);
  const translateY = useSharedValue(animated ? 20 : 0);
  const translateX = useSharedValue(0);
  const scale = useSharedValue(animated ? 0.92 : 1);
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (animated) {
      const timer = setTimeout(() => {
        const animations = textEntranceAnimation(delay);
        
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

  const textStyle = [
    {color},
    type === 'default' ? styles.default : undefined,
    type === 'title' ? styles.title : undefined,
    type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
    type === 'subtitle' ? styles.subtitle : undefined,
    type === 'link' ? styles.link : undefined,
    animated ? animatedStyle : undefined,
    style,
  ];

  return <Animated.Text style={textStyle} {...rest} />;
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    color: '#D2691E',
  },
});
