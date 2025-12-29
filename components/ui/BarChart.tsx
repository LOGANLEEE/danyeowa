import { ThemedText } from '@/components/ThemedText';
import { Dimensions , View } from 'react-native';
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2 - 8;

type BarChartProps = {
  data: number[];
  labels?: string[];
  color: string;
  maxValue?: number;
  height?: number;
  delay?: number;
};

export function BarChart({data, labels, color, maxValue, height = 80, delay = 0}: BarChartProps) {
  const animatedHeights = useSharedValue(0);
  const max = maxValue || Math.max(...data, 1);
  const barWidth = (CARD_WIDTH - 32) / data.length - 4;

  useEffect(() => {
    const timer = setTimeout(() => {
      animatedHeights.value = withSpring(1, {damping: 15, stiffness: 100});
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, animatedHeights]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: animatedHeights.value,
  }));

  return (
    <Animated.View
      style={[
        {height, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between'},
        animatedStyle,
      ]}>
      {data.map((value, index) => {
        const barHeight = (value / max) * height;
        const animatedBarHeight = useSharedValue(0);

        useEffect(() => {
          const timer = setTimeout(
            () => {
              animatedBarHeight.value = withSpring(barHeight, {damping: 15, stiffness: 100});
            },
            delay + index * 50,
          );
          return () => clearTimeout(timer);
        }, [barHeight, delay, index, animatedBarHeight]);

        const barStyle = useAnimatedStyle(() => ({
          height: animatedBarHeight.value,
        }));

        return (
          <View key={index} style={{alignItems: 'center', flex: 1}}>
            <Animated.View
              style={[
                {
                  width: barWidth,
                  backgroundColor: color,
                  borderRadius: 4,
                  marginHorizontal: 2,
                },
                barStyle,
              ]}
            />
            {labels && labels[index] && (
              <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {labels[index]}
              </ThemedText>
            )}
          </View>
        );
      })}
    </Animated.View>
  );
}


