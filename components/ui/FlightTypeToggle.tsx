import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, View } from 'react-native';

type FlightType = 'Depart' | 'Return';

type FlightTypeToggleProps = {
  value: FlightType;
  onChange: (value: FlightType) => void;
  disabled?: boolean;
};

export function FlightTypeToggle({ value, onChange, disabled = false }: FlightTypeToggleProps) {
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];

  return (
    <View className="flex-row gap-3">
      <TouchableOpacity
        onPress={() => onChange('Depart')}
        disabled={disabled}
        className={`flex-1 py-3 px-4 rounded-xl border-2 ${
          value === 'Depart'
            ? 'border-[#800020] dark:border-[#A0002A] bg-[#800020]/10 dark:bg-[#A0002A]/20'
            : 'border-gray-300 dark:border-gray-600 bg-transparent'
        }`}>
        <View className="flex-row items-center justify-center gap-2">
          <Ionicons
            name="airplane-outline"
            size={20}
            color={
              value === 'Depart'
                ? themeColors.tint
                : colorScheme === 'dark'
                  ? '#9BA1A6'
                  : '#687076'
            }
          />
          <ThemedText
            className={`font-semibold ${
              value === 'Depart' ? '' : 'text-gray-500 dark:text-gray-400'
            }`}
            style={value === 'Depart' ? { color: themeColors.tint } : undefined}>
            Depart
          </ThemedText>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onChange('Return')}
        disabled={disabled}
        className={`flex-1 py-3 px-4 rounded-xl border-2 ${
          value === 'Return'
            ? 'border-[#800020] dark:border-[#A0002A] bg-[#800020]/10 dark:bg-[#A0002A]/20'
            : 'border-gray-300 dark:border-gray-600 bg-transparent'
        }`}>
        <View className="flex-row items-center justify-center gap-2">
          <Ionicons
            name="airplane"
            size={20}
            color={
              value === 'Return'
                ? themeColors.tint
                : colorScheme === 'dark'
                  ? '#9BA1A6'
                  : '#687076'
            }
          />
          <ThemedText
            className={`font-semibold ${
              value === 'Return' ? '' : 'text-gray-500 dark:text-gray-400'
            }`}
            style={value === 'Return' ? { color: themeColors.tint } : undefined}>
            Return
          </ThemedText>
        </View>
      </TouchableOpacity>
    </View>
  );
}

