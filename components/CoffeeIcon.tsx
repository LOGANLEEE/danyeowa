import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type CoffeeIconProps = {
  size?: number;
  color?: string;
  animated?: boolean;
  onPress?: () => void;
} & Omit<TouchableOpacityProps, 'onPress'>;

/**
 * Coffee icon component with playful animations
 * Supports rotation and opacity animations on tap/hover
 */
export function CoffeeIcon({
  size = 24,
  color,
  animated = true,
  onPress,
  ...props
}: CoffeeIconProps) {
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];
  const iconColor = color || themeColors.coffeeMedium;

  const rotation = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (animated) {
      // Subtle rotation animation on mount
      rotation.value = withSpring(0, { damping: 15, stiffness: 100 });
    }
  }, [animated, rotation]);

  const handlePress = () => {
    if (animated) {
      // Playful rotation and scale animation on press
      rotation.value = withSpring(15, { damping: 10, stiffness: 200 });
      scale.value = withSpring(1.1, { damping: 10, stiffness: 200 });
      opacity.value = withTiming(0.7, { duration: 100 });

      // Reset after animation
      setTimeout(() => {
        rotation.value = withSpring(0, { damping: 15, stiffness: 100 });
        scale.value = withSpring(1, { damping: 15, stiffness: 100 });
        opacity.value = withTiming(1, { duration: 100 });
      }, 200);
    }
    onPress?.();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotation.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  const content = (
    <Animated.View style={animated ? animatedStyle : undefined}>
      <Ionicons name="cafe-outline" size={size} color={iconColor} />
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={handlePress}
        {...props}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}


