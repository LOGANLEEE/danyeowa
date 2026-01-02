import { ThemedText } from '@/components/ThemedText';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

type CircularProgressProps = {
  progress: number; // 0-1
  size?: number;
  strokeWidth?: number;
  color: string;
  backgroundColor?: string;
  delay?: number;
};

export function CircularProgress({
  progress,
  size = 60,
  strokeWidth = 6,
  color,
  backgroundColor = '#E5E7EB',
  delay = 0,
}: CircularProgressProps) {
  const animatedProgress = useSharedValue(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const timer = setTimeout(() => {
      animatedProgress.value = withSpring(progress, {damping: 15, stiffness: 100});
    }, delay);
    return () => clearTimeout(timer);
  }, [progress, delay, animatedProgress]);

  return (
    <View style={{width: size, height: size, justifyContent: 'center', alignItems: 'center'}}>
      <Svg width={size} height={size} style={{transform: [{rotate: '-90deg'}]}}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeLinecap="round"
          strokeDashoffset={circumference * (1 - progress)}
        />
      </Svg>
      {/* Center percentage */}
      <View style={{position: 'absolute', justifyContent: 'center', alignItems: 'center'}}>
        <ThemedText className="text-xs font-bold" style={{color, fontSize: size * 0.15}}>
          {Math.round(progress * 100)}%
        </ThemedText>
      </View>
    </View>
  );
}





