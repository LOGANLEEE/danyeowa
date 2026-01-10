import { DateTime } from 'luxon';
import { useState, useEffect } from 'react';
import { View, Switch, Alert } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedInput } from '@/components/ui/ThemedInput';
import { ThemedButton } from '@/components/ui/ThemedButton';
import { ModalContainer } from '@/components/ui/ModalContainer';
import { formatDateForDisplay } from '@/utils/add-monthly.utils';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type QuickFlightInputProps = {
  visible: boolean;
  date: string | null; // YYYY-MM-DD
  prefix: string | null;
  defaultFlightNumber?: string;
  defaultDepartureTime?: string;
  defaultArrivalTime?: string;
  onSave: (data: {
    flightNumber: string;
    departureTime: string;
    arrivalTime: string;
    addReturn: boolean;
    returnFlightNumber?: string;
    returnDepartureTime?: string;
    returnArrivalTime?: string;
  }) => Promise<void>;
  onClose: () => void;
};

/**
 * Quick flight input bottom sheet
 * Simplified form for adding flights with auto-save
 */
export function QuickFlightInput({
  visible,
  date,
  prefix,
  defaultFlightNumber = '',
  defaultDepartureTime = '08:00',
  defaultArrivalTime = '14:00',
  onSave,
  onClose,
}: QuickFlightInputProps) {
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];

  const [flightNumber, setFlightNumber] = useState(defaultFlightNumber);
  const [departureTime, setDepartureTime] = useState(defaultDepartureTime);
  const [arrivalTime, setArrivalTime] = useState(defaultArrivalTime);
  const [addReturn, setAddReturn] = useState(false);
  const [returnFlightNumber, setReturnFlightNumber] = useState('');
  const [returnDepartureTime, setReturnDepartureTime] = useState('10:00');
  const [returnArrivalTime, setReturnArrivalTime] = useState('16:00');
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when date changes
  useEffect(() => {
    if (visible && date) {
      setFlightNumber(defaultFlightNumber);
      setDepartureTime(defaultDepartureTime);
      setArrivalTime(defaultArrivalTime);
      setAddReturn(false);
      setReturnFlightNumber('');
      setReturnDepartureTime('10:00');
      setReturnArrivalTime('16:00');
    }
  }, [visible, date, defaultFlightNumber, defaultDepartureTime, defaultArrivalTime]);

  const handleSave = async () => {
    if (!date) return;

    // Validate flight number
    if (!flightNumber.trim()) {
      Alert.alert('Validation Error', 'Please enter a flight number');
      return;
    }

    // Validate times
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(departureTime)) {
      Alert.alert('Validation Error', 'Please enter a valid departure time (HH:mm)');
      return;
    }
    if (!timeRegex.test(arrivalTime)) {
      Alert.alert('Validation Error', 'Please enter a valid arrival time (HH:mm)');
      return;
    }

    // Validate return flight if enabled
    if (addReturn) {
      if (!returnFlightNumber.trim()) {
        Alert.alert('Validation Error', 'Please enter a return flight number');
        return;
      }
      if (!timeRegex.test(returnDepartureTime)) {
        Alert.alert('Validation Error', 'Please enter a valid return departure time (HH:mm)');
        return;
      }
      if (!timeRegex.test(returnArrivalTime)) {
        Alert.alert('Validation Error', 'Please enter a valid return arrival time (HH:mm)');
        return;
      }
    }

    setIsSaving(true);
    try {
      await onSave({
        flightNumber: flightNumber.trim(),
        departureTime,
        arrivalTime,
        addReturn,
        returnFlightNumber: addReturn ? returnFlightNumber.trim() : undefined,
        returnDepartureTime: addReturn ? returnDepartureTime : undefined,
        returnArrivalTime: addReturn ? returnArrivalTime : undefined,
      });
      onClose();
    } catch (error) {
      console.error('[QuickFlightInput] Error saving:', error);
      Alert.alert('Error', 'Failed to save flight. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!date) return null;

  const dateDisplay = formatDateForDisplay(date);

  return (
    <ModalContainer
      visible={visible}
      onClose={onClose}
      title="Add Flight"
      subtitle={dateDisplay}
      showCloseButton={!isSaving}>
      <View className="gap-4">
        {/* Flight Number */}
        <View>
          <ThemedText className="text-sm font-semibold mb-2">Flight Number</ThemedText>
          <View className="flex-row items-center gap-2">
            {prefix && (
              <ThemedView className="px-3 py-3 rounded-lg bg-gray-100 dark:bg-gray-700">
                <ThemedText className="text-base font-semibold">{prefix}</ThemedText>
              </ThemedView>
            )}
            <View className="flex-1">
              <ThemedInput
                value={flightNumber}
                onChangeText={setFlightNumber}
                placeholder="Enter flight number"
                keyboardType="number-pad"
                maxLength={10}
                autoFocus
              />
            </View>
          </View>
        </View>

        {/* Times */}
        <View className="flex-row gap-3">
          <View className="flex-1">
            <ThemedText className="text-sm font-semibold mb-2">Departure Time</ThemedText>
            <ThemedInput
              value={departureTime}
              onChangeText={setDepartureTime}
              placeholder="08:00"
              keyboardType="numeric"
            />
          </View>
          <View className="flex-1">
            <ThemedText className="text-sm font-semibold mb-2">Arrival Time</ThemedText>
            <ThemedInput
              value={arrivalTime}
              onChangeText={setArrivalTime}
              placeholder="14:00"
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Return Flight Toggle */}
        <View className="flex-row items-center justify-between py-2">
          <View className="flex-1">
            <ThemedText className="text-sm font-semibold">Also add return flight</ThemedText>
            <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Creates return flight for next day
            </ThemedText>
          </View>
          <Switch
            value={addReturn}
            onValueChange={setAddReturn}
            trackColor={{ false: '#767577', true: themeColors.tint }}
            thumbColor={colorScheme === 'dark' ? '#f4f3f4' : '#fff'}
          />
        </View>

        {/* Return Flight Fields */}
        {addReturn && (
          <View className="gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <ThemedText className="text-sm font-semibold mb-2">Return Flight</ThemedText>
            <View>
              <ThemedText className="text-sm font-semibold mb-2">Return Flight Number</ThemedText>
              <View className="flex-row items-center gap-2">
                {prefix && (
                  <ThemedView className="px-3 py-3 rounded-lg bg-gray-100 dark:bg-gray-700">
                    <ThemedText className="text-base font-semibold">{prefix}</ThemedText>
                  </ThemedView>
                )}
                <View className="flex-1">
                  <ThemedInput
                    value={returnFlightNumber}
                    onChangeText={setReturnFlightNumber}
                    placeholder="Enter return flight number"
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                </View>
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <ThemedText className="text-sm font-semibold mb-2">Return Departure</ThemedText>
                <ThemedInput
                  value={returnDepartureTime}
                  onChangeText={setReturnDepartureTime}
                  placeholder="10:00"
                  keyboardType="numeric"
                />
              </View>
              <View className="flex-1">
                <ThemedText className="text-sm font-semibold mb-2">Return Arrival</ThemedText>
                <ThemedInput
                  value={returnArrivalTime}
                  onChangeText={setReturnArrivalTime}
                  placeholder="16:00"
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>
        )}

        {/* Save Button */}
        <ThemedButton
          title={isSaving ? 'Saving...' : 'Save Flight'}
          onPress={handleSave}
          disabled={isSaving}
          isLoading={isSaving}
          fullWidth
        />
      </View>
    </ModalContainer>
  );
}
