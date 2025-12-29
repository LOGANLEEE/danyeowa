import { View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { type Roster } from '@/lib/supabase/types';

export type StatusBadgeProps = {
  status: Roster['status'];
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
  className?: string;
};

/**
 * Reusable status badge component
 * Consolidates status badge patterns for better token efficiency
 */
export function StatusBadge({
  status,
  size = 'md',
  showDot = false,
  className = '',
}: StatusBadgeProps) {
  const colorScheme = useColorScheme();
  const statusColor = getStatusColor(status, colorScheme ?? 'light');
  const themeColors = Colors[colorScheme ?? 'light'];

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };

  return (
    <View
      className={`${sizeClasses[size]} rounded-full ${className}`}
      style={{
        backgroundColor: statusColor + '20',
      }}>
      <View className="flex-row items-center gap-1">
        {showDot && (
          <View
            className="w-2 h-2 rounded-full"
            style={{backgroundColor: statusColor}}
          />
        )}
        <ThemedText
          className="font-semibold"
          style={{
            color: statusColor,
          }}>
          {status}
        </ThemedText>
      </View>
    </View>
  );
}

function getStatusColor(
  status: Roster['status'],
  colorScheme: 'light' | 'dark',
): string {
  const themeColors = Colors[colorScheme];
  switch (status) {
    case 'Scheduled':
      return colorScheme === 'dark' ? '#3B82F6' : '#2563EB';
    case 'Confirmed':
      return themeColors.tint;
    case 'Delayed':
      return colorScheme === 'dark' ? '#F59E0B' : '#D97706';
    case 'Cancelled':
      return colorScheme === 'dark' ? '#EF4444' : '#DC2626';
    case 'Completed':
      return colorScheme === 'dark' ? '#10B981' : '#059669';
    default:
      return themeColors.tint;
  }
}

