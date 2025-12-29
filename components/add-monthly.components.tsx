import { Ionicons } from '@expo/vector-icons';
import { DateTime } from 'luxon';
import { useState, useEffect } from 'react';
import { TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedInput } from '@/components/ui/ThemedInput';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getCountryFlag } from '@/utils/country-flags';
import { isToday } from '@/utils/add-monthly.utils';

type MonthSelectorProps = {
  currentMonth: DateTime;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
};

/**
 * Month selector component for navigation
 */
export function MonthSelector({
  currentMonth,
  onPreviousMonth,
  onNextMonth,
  onToday,
}: MonthSelectorProps) {
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];

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

type PrefixInputProps = {
  prefix: string | null;
  onPrefixChange: (prefix: string) => Promise<void>;
  isLoading?: boolean;
};

/**
 * Prefix input component for airline code
 */
export function PrefixInput({ prefix, onPrefixChange, isLoading = false }: PrefixInputProps) {
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];
  const [localPrefix, setLocalPrefix] = useState(prefix || '');

  useEffect(() => {
    setLocalPrefix(prefix || '');
  }, [prefix]);

  const handleBlur = async () => {
    await onPrefixChange(localPrefix);
  };

  return (
    <View className="mb-4">
      <ThemedInput
        label="Airline Code Prefix"
        placeholder="e.g., EK, SQ, CX"
        value={localPrefix}
        onChangeText={setLocalPrefix}
        onBlur={handleBlur}
        autoCapitalize="characters"
        maxLength={3}
        editable={!isLoading}
        containerClassName="mb-2"
      />
      {prefix && (
        <View className="flex-row items-center mt-2">
          <Ionicons
            name="checkmark-circle"
            size={16}
            color={themeColors.tint}
            style={{ marginRight: 6 }}
          />
          <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
            Prefix set: {prefix} (will be prepended to flight numbers)
          </ThemedText>
        </View>
      )}
    </View>
  );
}

type CalendarDayProps = {
  date: string; // YYYY-MM-DD
  isCurrentMonth: boolean;
  isSelected: boolean;
  hasFlight: boolean;
  hasReturnFlight: boolean;
  destination?: string | null;
  onPress: (date: string) => void;
};

/**
 * Individual calendar day component
 */
export function CalendarDay({
  date,
  isCurrentMonth,
  isSelected,
  hasFlight,
  hasReturnFlight,
  destination,
  onPress,
}: CalendarDayProps) {
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];
  const dayIsToday = isToday(date);
  const dateObj = DateTime.fromISO(date);
  const dayNumber = dateObj.isValid ? dateObj.day : '';

  const flag = destination ? getCountryFlag(destination) : null;

  if (!isCurrentMonth) {
    return (
      <View className="w-[45px] h-[45px] items-center justify-center opacity-30">
        <ThemedText className="text-sm">{dayNumber}</ThemedText>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={() => onPress(date)}
      className={`w-[45px] h-[45px] rounded-lg items-center justify-center ${
        isSelected ? 'bg-[#800020] dark:bg-[#A0002A]' : ''
      } ${dayIsToday && !isSelected ? 'bg-[#800020]/20 dark:bg-[#A0002A]/20' : ''} ${
        hasFlight && !isSelected ? 'bg-[#800020]/10 dark:bg-[#A0002A]/10 border border-[#800020]/30 dark:border-[#A0002A]/30' : ''
      }`}>
      <ThemedText
        className={`text-sm font-semibold ${
          isSelected ? 'text-white' : dayIsToday ? 'text-[#800020] dark:text-[#A0002A]' : ''
        }`}>
        {dayNumber}
      </ThemedText>
      {hasFlight && (
        <View className="absolute bottom-1">
          <View className="w-1.5 h-1.5 rounded-full bg-[#800020] dark:bg-[#A0002A]" />
        </View>
      )}
      {hasReturnFlight && (
        <View className="absolute top-1 right-1">
          <Ionicons name="return-down-back" size={10} color={themeColors.tint} />
        </View>
      )}
      {flag && (
        <View className="absolute top-0.5 left-0.5">
          <ThemedText className="text-xs">{flag}</ThemedText>
        </View>
      )}
    </TouchableOpacity>
  );
}

