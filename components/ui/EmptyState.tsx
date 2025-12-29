import { type ReactNode } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export type EmptyStateProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  iconSize?: number;
  title?: string;
  message: string;
  action?: ReactNode;
  animated?: boolean;
  delay?: number;
  className?: string;
};

/**
 * Reusable empty state component
 * Consolidates empty state patterns for better token efficiency
 */
export function EmptyState({
  icon = 'airplane-outline',
  iconSize = 40,
  title,
  message,
  action,
  animated = true,
  delay = 0,
  className = '',
}: EmptyStateProps) {
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];
  const iconColor = colorScheme === 'dark' ? '#A0002A' : '#800020';

  return (
    <ThemedView
      animated={animated}
      delay={delay}
      className={`rounded-2xl p-6 border-2 border-[#800020]/20 dark:border-[#A0002A]/30 bg-[#800020]/5 dark:bg-[#A0002A]/10 ${className}`}>
      <View className="items-center">
        {icon && (
          <View className="flex-row items-center justify-center mb-2">
            <Ionicons name={icon} size={iconSize} color={iconColor} />
          </View>
        )}
        {title && (
          <ThemedText
            animated={animated}
            delay={delay + 50}
            className="text-lg font-semibold mb-2 text-center">
            {title}
          </ThemedText>
        )}
        <ThemedText
          animated={animated}
          delay={delay + 100}
          className="text-gray-500 dark:text-gray-400 text-sm text-center mt-4">
          {message}
        </ThemedText>
        {action && <View className="mt-6">{action}</View>}
      </View>
    </ThemedView>
  );
}

