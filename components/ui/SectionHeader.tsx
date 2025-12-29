import { type ReactNode } from 'react';
import { View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';

export type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  animated?: boolean;
  delay?: number;
  className?: string;
  titleClassName?: string;
  subtitleClassName?: string;
};

/**
 * Reusable section header component
 * Consolidates section header patterns for better token efficiency
 */
export function SectionHeader({
  title,
  subtitle,
  right,
  animated = false,
  delay = 0,
  className = '',
  titleClassName = '',
  subtitleClassName = '',
}: SectionHeaderProps) {
  return (
    <View className={`flex-row items-center justify-between mb-4 ${className}`}>
      <View className="flex-1">
        <ThemedText
          animated={animated}
          delay={delay}
          type="subtitle"
          className={`text-xl font-bold ${titleClassName}`}>
          {title}
        </ThemedText>
        {subtitle && (
          <ThemedText
            animated={animated}
            delay={delay + 50}
            className={`text-sm text-gray-500 dark:text-gray-400 mt-1 ${subtitleClassName}`}>
            {subtitle}
          </ThemedText>
        )}
      </View>
      {right && <View className="ml-4">{right}</View>}
    </View>
  );
}

