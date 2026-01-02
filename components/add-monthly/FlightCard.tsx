import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { FlightTypeToggle } from '@/components/ui/FlightTypeToggle';
import { ThemedInput } from '@/components/ui/ThemedInput';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatDateForDisplay, type FlightEntry } from '@/utils/add-monthly.utils';

type FlightCardProps = {
  flight: FlightEntry;
  index: number;
  isEditing: boolean;
  prefix: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUpdateField: <K extends keyof FlightEntry>(field: K, value: FlightEntry[K]) => void;
};

/**
 * Individual flight card component
 */
export function FlightCard({
  flight,
  index,
  isEditing,
  prefix,
  onEdit,
  onDelete,
  onDuplicate,
  onUpdateField,
}: FlightCardProps) {
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];

  return (
    <ThemedView
      key={flight.id}
      animated
      delay={index * 50}
      className={`rounded-xl p-4 border-2 ${
        isEditing
          ? 'border-[#800020] dark:border-[#A0002A] bg-[#800020]/10 dark:bg-[#A0002A]/20'
          : 'border-[#800020]/30 dark:border-[#A0002A]/40 bg-[#800020]/5 dark:bg-[#A0002A]/10'
      } shadow-sm`}>
      {/* Header */}
      <View className="flex-row items-start justify-between mb-3">
        <View className="flex-1">
          <ThemedText className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">
            {formatDateForDisplay(flight.date)}
          </ThemedText>
          <View className="flex-row items-center gap-2 flex-wrap">
            <ThemedText className="text-xl font-bold" style={{color: themeColors.tint}}>
              {prefix ? `${prefix} ` : ''}
              {flight.flightNumber || '___'}
            </ThemedText>
            <View
              className="px-2 py-1 rounded-full"
              style={{backgroundColor: themeColors.tint + '20'}}>
              <ThemedText className="text-xs font-semibold" style={{color: themeColors.tint}}>
                {flight.flightType}
              </ThemedText>
            </View>
          </View>
        </View>
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={onDuplicate}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
            <Ionicons
              name="copy-outline"
              size={18}
              color={colorScheme === 'dark' ? '#9BA1A6' : '#687076'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDelete}
            className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Editing Fields */}
      {isEditing && (
        <View className="gap-3 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          {/* Flight Number */}
          <View>
            <ThemedText className="text-sm font-semibold mb-2">Flight Number</ThemedText>
            <ThemedInput
              value={flight.flightNumber || ''}
              onChangeText={(text) => onUpdateField('flightNumber', text)}
              placeholder="Enter flight number"
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>

          {/* Flight Type Toggle */}
          <View>
            <ThemedText className="text-sm font-semibold mb-2">Flight Type</ThemedText>
            <FlightTypeToggle
              value={flight.flightType}
              onChange={(value) => onUpdateField('flightType', value)}
            />
          </View>

          {/* Times */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <ThemedText className="text-sm font-semibold mb-2">Departure</ThemedText>
              <ThemedInput
                value={flight.departureTime}
                onChangeText={(text) => onUpdateField('departureTime', text)}
                placeholder="08:00"
                keyboardType="numeric"
              />
            </View>
            <View className="flex-1">
              <ThemedText className="text-sm font-semibold mb-2">Arrival</ThemedText>
              <ThemedInput
                value={flight.arrivalTime}
                onChangeText={(text) => onUpdateField('arrivalTime', text)}
                placeholder="14:00"
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Return Flight (only for Depart flights) */}
          {flight.flightType === 'Depart' && (
            <View className="mt-2 pt-3 border-t border-gray-200 dark:border-gray-700">
              <ThemedText className="text-sm font-semibold mb-2">
                Return Flight (Optional)
              </ThemedText>
              {flight.returnDate ? (
                <View className="gap-3">
                  <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                    Return Date: {formatDateForDisplay(flight.returnDate)}
                  </ThemedText>
                  <View>
                    <ThemedText className="text-sm font-semibold mb-2">
                      Return Flight Number
                    </ThemedText>
                    <ThemedInput
                      value={flight.returnFlightNumber || ''}
                      onChangeText={(text) => onUpdateField('returnFlightNumber', text)}
                      placeholder="Enter return flight number"
                      keyboardType="number-pad"
                      maxLength={10}
                    />
                  </View>
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <ThemedText className="text-sm font-semibold mb-2">
                        Return Departure
                      </ThemedText>
                      <ThemedInput
                        value={flight.returnDepartureTime || '08:00'}
                        onChangeText={(text) => onUpdateField('returnDepartureTime', text)}
                        placeholder="08:00"
                        keyboardType="numeric"
                      />
                    </View>
                    <View className="flex-1">
                      <ThemedText className="text-sm font-semibold mb-2">Return Arrival</ThemedText>
                      <ThemedInput
                        value={flight.returnArrivalTime || '14:00'}
                        onChangeText={(text) => onUpdateField('returnArrivalTime', text)}
                        placeholder="14:00"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      onUpdateField('returnDate', null);
                      onUpdateField('returnFlightNumber', null);
                      onUpdateField('returnDepartureTime', null);
                      onUpdateField('returnArrivalTime', null);
                    }}
                    className="self-start px-3 py-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                    <ThemedText className="text-sm font-semibold text-red-600 dark:text-red-400">
                      Remove Return Flight
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              ) : (
                <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Tap a calendar date after the depart date to set return flight
                </ThemedText>
              )}
            </View>
          )}
        </View>
      )}

      {/* View Mode (not editing) */}
      {!isEditing && (
        <TouchableOpacity
          onPress={onEdit}
          className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <ThemedText
            className="text-sm font-semibold text-center"
            style={{color: themeColors.tint}}>
            Tap to Edit
          </ThemedText>
        </TouchableOpacity>
      )}
    </ThemedView>
  );
}
