import { type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { ThemedView } from '@/components/ThemedView';

export type CardProps = {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'outlined' | 'filled';
  animated?: boolean;
  delay?: number;
  className?: string;
  onPress?: () => void;
};

/**
 * Reusable card component
 * Consolidates card patterns for better token efficiency
 */
export function Card({
  children,
  variant = 'default',
  animated = false,
  delay = 0,
  className = '',
  onPress,
}: CardProps) {
  const variantClasses = {
    default:
      'rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80',
    elevated:
      'rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80 shadow-lg',
    outlined:
      'rounded-xl p-4 border-2 border-[#800020]/30 dark:border-[#A0002A]/40 bg-[#800020]/5 dark:bg-[#A0002A]/10',
    filled:
      'rounded-xl p-4 border-2 border-[#800020]/20 dark:border-[#A0002A]/30 bg-[#800020]/10 dark:bg-[#A0002A]/20',
  };

  const content = (
    <ThemedView
      animated={animated}
      delay={delay}
      className={`${variantClasses[variant]} ${className}`}>
      {children}
    </ThemedView>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }

  return content;
}

