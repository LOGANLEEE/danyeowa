import { ThemedText } from '@/components/ThemedText';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { DateTime } from 'luxon';
import { TouchableOpacity, View } from 'react-native';

type MonthNavigationProps = {
  currentMonth: DateTime;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
};

export function MonthNavigation({
  currentMonth,
  onPreviousMonth,
  onNextMonth,
  onToday,
}: MonthNavigationProps) {
  const colorScheme = useColorScheme();

  const formatMonthYear = (dateTime: DateTime): string => {
    return dateTime.toFormat('MMMM yyyy');
  };

  return (
    <View className="flex-row items-center justify-between mb-6">
      <TouchableOpacity
        onPress={onPreviousMonth}
        className="p-2 rounded-full bg-white dark:bg-gray-700 shadow-sm">
        <Ionicons
          name="chevron-back"
          size={24}
          color={colorScheme === 'dark' ? '#ECEDEE' : '#11181C'}
        />
      </TouchableOpacity>

      <View className="flex-1 items-center">
        <ThemedText className="text-xl font-bold">{formatMonthYear(currentMonth)}</ThemedText>
        <TouchableOpacity onPress={onToday} className="mt-1">
          <ThemedText className="text-xs text-gray-500 dark:text-gray-400">Today</ThemedText>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={onNextMonth}
        className="p-2 rounded-full bg-white dark:bg-gray-700 shadow-sm">
        <Ionicons
          name="chevron-forward"
          size={24}
          color={colorScheme === 'dark' ? '#ECEDEE' : '#11181C'}
        />
      </TouchableOpacity>
    </View>
  );
}

