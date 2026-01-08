import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Roster } from '@/lib/supabase/types';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { calculateFlightTimeInfo, getFlightStatusColor } from '@/utils/flight-calculations';
import { formatArrivalTime, getWeatherIcon, mockWeather } from '@/utils/home.utils';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { DateTime } from 'luxon';
import { View } from 'react-native';

type HeroFlightCardProps = {
  roster: Roster;
};

export function HeroFlightCard({roster}: HeroFlightCardProps) {
  const colorScheme = useColorScheme();
  const weatherIcon = getWeatherIcon(mockWeather.condition);
  const flightTimeInfo = calculateFlightTimeInfo(roster);

  return (
    <ThemedView
      animated
      delay={100}
      className="mx-6 mb-6 rounded-3xl overflow-hidden border border-gray-200/50 dark:border-gray-700/50">
      <LinearGradient
        colors={
          colorScheme === 'dark'
            ? ['#A0002A', '#800020', '#5C0015']
            : ['#800020', '#A0002A', '#B80035']
        }
        start={{x: 0, y: 0}}
        end={{x: 1, y: 1}}
        style={{padding: 24}}>
        {/* Coffee-bean pattern overlay (subtle, 5-10% opacity) */}
        <View className="absolute inset-0 opacity-[0.08] dark:opacity-[0.05]">
          <View className="flex-row flex-wrap justify-center items-center h-full">
            {Array.from({length: 20}).map((_, i) => (
              <ThemedText
                key={i}
                className="text-2xl"
                style={{
                  color: '#FFFFFF',
                  transform: [{rotate: `${(i * 15) % 360}deg`}],
                  margin: 8,
                }}>
                ☕
              </ThemedText>
            ))}
          </View>
        </View>

        {/* Weather Badge */}
        <View className="absolute top-4 right-4 flex-row items-center bg-white/20 dark:bg-black/20 rounded-full px-3 py-1.5 backdrop-blur-sm z-10">
          <Ionicons name={weatherIcon} size={16} color="#FFFFFF" />
          <ThemedText className="text-xs font-semibold ml-1.5" style={{color: '#FFFFFF'}}>
            {mockWeather.temperature}°C
          </ThemedText>
        </View>

        {/* Status Badge */}
        {flightTimeInfo && (
          <View className="flex-row items-center mb-4">
            <View
              className="px-3 py-1 rounded-full"
              style={{backgroundColor: `${getFlightStatusColor(flightTimeInfo.status)}40`}}>
              <ThemedText
                className="text-xs font-semibold"
                style={{color: getFlightStatusColor(flightTimeInfo.status)}}>
                {flightTimeInfo.status === 'departing_soon'
                  ? 'Departing Soon'
                  : flightTimeInfo.status === 'in_flight'
                    ? 'In Flight'
                    : flightTimeInfo.status === 'landing_soon'
                      ? 'Landing Soon'
                      : flightTimeInfo.status === 'landed'
                        ? 'Landed'
                        : flightTimeInfo.status === 'cancelled'
                          ? 'Cancelled'
                          : 'Upcoming'}
              </ThemedText>
            </View>
          </View>
        )}

        {/* Flight Code & Route */}
        <View className="mb-4">
          <ThemedText className="text-4xl font-bold mb-2" style={{color: '#FFFFFF'}}>
            {roster.flight_code}
          </ThemedText>
          <ThemedText className="text-lg mb-2" style={{color: 'rgba(255, 255, 255, 0.9)'}}>
            {roster.route}
          </ThemedText>
          <View className="flex-row items-center">
            <Ionicons name="location-outline" size={16} color="rgba(255, 255, 255, 0.8)" />
            <ThemedText className="text-sm ml-1" style={{color: 'rgba(255, 255, 255, 0.8)'}}>
              {roster.destination}
            </ThemedText>
          </View>
        </View>

        {/* Countdown Timer */}
        {flightTimeInfo && flightTimeInfo.formattedTimeRemaining && (
          <View className="mb-4 p-4 rounded-2xl bg-white/10 dark:bg-black/10 backdrop-blur-sm">
            <ThemedText
              className="text-xs font-medium mb-1"
              style={{color: 'rgba(255, 255, 255, 0.7)'}}>
              {flightTimeInfo.status === 'in_flight' ? 'Arriving in' : 'Departing in'}
            </ThemedText>
            <ThemedText className="text-2xl font-bold" style={{color: '#FFFFFF'}}>
              {flightTimeInfo.status === 'in_flight'
                ? flightTimeInfo.formattedArrivalTimeRemaining || 'N/A'
                : flightTimeInfo.formattedTimeRemaining}
            </ThemedText>
          </View>
        )}

        {/* Flight Details Grid */}
        <View className="flex-row justify-between">
          <View className="flex-1">
            <ThemedText
              className="text-xs font-medium mb-1"
              style={{color: 'rgba(255, 255, 255, 0.7)'}}>
              Departure
            </ThemedText>
            <ThemedText className="text-lg font-semibold" style={{color: '#FFFFFF'}}>
              {roster.departure_time}
            </ThemedText>
          </View>
          <View className="flex-1 items-center">
            <Ionicons name="airplane" size={20} color="rgba(255, 255, 255, 0.6)" />
          </View>
          <View className="flex-1 items-end">
            <ThemedText
              className="text-xs font-medium mb-1"
              style={{color: 'rgba(255, 255, 255, 0.7)'}}>
              Arrival
            </ThemedText>
            <ThemedText className="text-lg font-semibold" style={{color: '#FFFFFF'}}>
              {formatArrivalTime(roster)}
            </ThemedText>
          </View>
        </View>

        {/* Additional Info */}
        <View className="mt-4 pt-4 border-t border-white/20 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Ionicons name="airplane-outline" size={14} color="rgba(255, 255, 255, 0.7)" />
            <ThemedText
              className="text-xs ml-1.5"
              style={{color: 'rgba(255, 255, 255, 0.7)'}}>
              {roster.aircraft_type || 'Aircraft TBD'}
            </ThemedText>
          </View>
          <View className="flex-row items-center">
            <Ionicons name="calendar-outline" size={14} color="rgba(255, 255, 255, 0.7)" />
            <ThemedText
              className="text-xs ml-1.5"
              style={{color: 'rgba(255, 255, 255, 0.7)'}}>
              {DateTime.fromISO(roster.flight_date).toFormat('MMM d, yyyy')}
            </ThemedText>
          </View>
        </View>
      </LinearGradient>
    </ThemedView>
  );
}






