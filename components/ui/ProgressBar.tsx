import { ThemedText } from '@/components/ThemedText';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

type ProgressBarProps = {
  progress: number; // 0-1
  color: string;
  backgroundColor?: string;
  height?: number;
  delay?: number;
  showLabel?: boolean;
};

export function ProgressBar({
  progress,
  color,
  backgroundColor = '#E5E7EB',
  height = 8,
  delay = 0,
  showLabel = false,
}: ProgressBarProps) {
  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      animatedProgress.value = withSpring(progress, {damping: 15, stiffness: 100});
    }, delay);
    return () => clearTimeout(timer);
  }, [progress, delay, animatedProgress]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value * 100}%`,
  }));

  return (
    <View>
      {showLabel && (
        <View className="flex-row justify-between mb-1">
          <ThemedText className="text-xs text-gray-500 dark:text-gray-400">Progress</ThemedText>
          <ThemedText className="text-xs font-semibold" style={{color}}>
            {Math.round(progress * 100)}%
          </ThemedText>
        </View>
      )}
      <View
        style={{
          height,
          backgroundColor,
          borderRadius: height / 2,
          overflow: 'hidden',
        }}>
        <Animated.View
          style={[
            {
              height: '100%',
              backgroundColor: color,
              borderRadius: height / 2,
            },
            animatedStyle,
          ]}
        />
      </View>
    </View>
  );
}


