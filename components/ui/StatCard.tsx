import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { BarChart } from '@/components/ui/BarChart';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

type StatCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  color: string;
  delay?: number;
  onPress?: () => void;
  iconColor?: string;
  progress?: number;
  showChart?: boolean;
  chartData?: number[];
  chartLabels?: string[];
};

export function StatCard({
  icon,
  label,
  value,
  color,
  delay = 0,
  onPress,
  iconColor,
  progress,
  showChart = false,
  chartData,
  chartLabels,
}: StatCardProps) {
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    const timer = setTimeout(() => {
      scale.value = withSpring(1, {damping: 15, stiffness: 150});
      opacity.value = withTiming(1, {duration: 300});
    }, delay);

    return () => clearTimeout(timer);
  }, [delay, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{scale: scale.value}],
    opacity: opacity.value,
  }));

  const content = (
    <Animated.View style={animatedStyle}>
      <ThemedView className="rounded-2xl p-4 border border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
        <View className="flex-row items-center justify-between mb-2">
          {iconColor ? (
            <LinearGradient
              colors={[`${iconColor}20`, `${iconColor}10`]}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 1}}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Ionicons name={icon} size={20} color={iconColor} />
            </LinearGradient>
          ) : (
            <View
              className="w-10 h-10 rounded-xl items-center justify-center"
              style={{backgroundColor: `${color}15`}}>
              <Ionicons name={icon} size={20} color={color} />
            </View>
          )}
          {progress !== undefined && (
            <CircularProgress
              progress={progress}
              size={40}
              strokeWidth={4}
              color={color}
              delay={delay + 100}
            />
          )}
          {onPress && (
            <Ionicons name="chevron-forward-outline" size={16} color={themeColors.icon} />
          )}
        </View>
        <ThemedText className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          {label}
        </ThemedText>
        <ThemedText className="text-2xl font-bold mb-2" style={{color}}>
          {value}
        </ThemedText>
        {showChart && chartData && (
          <View className="mt-3">
            <BarChart
              data={chartData}
              labels={chartLabels}
              color={color}
              height={50}
              delay={delay + 200}
            />
          </View>
        )}
      </ThemedView>
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}





