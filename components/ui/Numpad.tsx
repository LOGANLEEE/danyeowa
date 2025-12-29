import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, View } from 'react-native';

type NumpadProps = {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
};

export function Numpad({value, onChange, maxLength = 10, disabled = false}: NumpadProps) {
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];

  const handleNumberPress = (num: string) => {
    if (disabled) return;
    if (value.length >= maxLength) return;
    onChange(value + num);
  };

  const handleBackspace = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  const handleClear = () => {
    if (disabled) return;
    onChange('');
  };

  const numpadButtons = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', ''],
  ];

  return (
    <ThemedView className="rounded-lg p-2 border border-gray-200 dark:border-gray-700">
      {/* Display */}
      <ThemedView className="rounded-lg p-2 mb-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 min-h-[40px] items-center justify-center">
        <ThemedText className="text-lg font-bold" style={{color: themeColors.tint}}>
          {value || '0'}
        </ThemedText>
      </ThemedView>

      {/* Numpad Grid */}
      <View className="gap-1">
        {numpadButtons.map((row, rowIndex) => (
          <View key={rowIndex} className="flex-row gap-1 justify-center">
            {row.map((num, colIndex) => {
              if (num === '') {
                // Empty cell for spacing
                return <View key={`${rowIndex}-${colIndex}`} className="w-[45px] h-[45px]" />;
              }

              if (rowIndex === 3 && colIndex === 0) {
                // Clear button
                return (
                  <TouchableOpacity
                    key={`${rowIndex}-${colIndex}`}
                    onPress={handleClear}
                    disabled={disabled || !value}
                    className="w-[45px] h-[45px] rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 items-center justify-center active:opacity-70"
                    style={{
                      opacity: disabled || !value ? 0.5 : 1,
                    }}>
                    <Ionicons
                      name="close-circle-outline"
                      size={18}
                      color={colorScheme === 'dark' ? '#9BA1A6' : '#687076'}
                    />
                  </TouchableOpacity>
                );
              }

              if (rowIndex === 3 && colIndex === 2) {
                // Backspace button
                return (
                  <TouchableOpacity
                    key={`${rowIndex}-${colIndex}`}
                    onPress={handleBackspace}
                    disabled={disabled || !value}
                    className="w-[45px] h-[45px] rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 items-center justify-center active:opacity-70"
                    style={{
                      opacity: disabled || !value ? 0.5 : 1,
                    }}>
                    <Ionicons
                      name="backspace-outline"
                      size={18}
                      color={colorScheme === 'dark' ? '#9BA1A6' : '#687076'}
                    />
                  </TouchableOpacity>
                );
              }

              // Number button
              return (
                <TouchableOpacity
                  key={`${rowIndex}-${colIndex}`}
                  onPress={() => handleNumberPress(num)}
                  disabled={disabled || value.length >= maxLength}
                  className="w-[45px] h-[45px] rounded-lg border items-center justify-center active:opacity-70"
                  style={{
                    borderColor: themeColors.tint,
                    backgroundColor: `${themeColors.tint}20`,
                    opacity: disabled || value.length >= maxLength ? 0.5 : 1,
                  }}>
                  <ThemedText className="text-lg font-bold" style={{color: themeColors.tint}}>
                    {num}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </ThemedView>
  );
}

