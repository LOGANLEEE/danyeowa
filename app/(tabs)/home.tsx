import { CoffeeIcon } from '@/components/CoffeeIcon';
import { ThemedLoader } from '@/components/ThemedLoader';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Roster } from '@/lib/supabase/types';
import { useAuthStore } from '@/stores/use-auth-store';
import { useRostersStore } from '@/stores/use-rosters-store';
import { calculateFlightTimeInfo, getFlightStatusColor } from '@/utils/flight-calculations';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { DateTime } from 'luxon';
import { useEffect, useMemo } from 'react';
import { Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2 - 8;

// Mock weather data - will be replaced with real weather API later
const mockWeather = {
  location: 'London, UK',
  temperature: 8,
  condition: 'Cloudy',
  humidity: 75,
  windSpeed: 12,
};

// Get weather icon name for Ionicons
const getWeatherIcon = (condition: string): keyof typeof Ionicons.glyphMap => {
  const conditionLower = condition.toLowerCase();
  if (conditionLower.includes('sunny') || conditionLower.includes('clear')) {
    return 'sunny-outline';
  } else if (conditionLower.includes('cloudy') || conditionLower.includes('overcast')) {
    return 'cloudy-outline';
  } else if (conditionLower.includes('rain') || conditionLower.includes('drizzle')) {
    return 'rainy-outline';
  } else if (conditionLower.includes('snow')) {
    return 'snow-outline';
  } else if (conditionLower.includes('storm') || conditionLower.includes('thunder')) {
    return 'thunderstorm-outline';
  }
  return 'partly-sunny-outline';
};

// Helper function to calculate days until next flight
const getDaysUntilNextFlight = (roster: Roster | null): string => {
  if (!roster) return 'N/A';

  const today = DateTime.now().startOf('day');
  const flightDate = DateTime.fromISO(roster.flight_date).startOf('day');
  const diff = flightDate.diff(today, 'days').days;

  if (diff < 0) return 'Past';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `${Math.floor(diff)} days`;
};

// Helper function to count flights this month
const getFlightsThisMonth = (rosters: Roster[]): number => {
  const today = DateTime.now();
  const startOfMonth = today.startOf('month').toISODate();
  const endOfMonth = today.endOf('month').toISODate();

  if (!startOfMonth || !endOfMonth) return 0;

  return rosters.filter((roster) => {
    return roster.flight_date >= startOfMonth && roster.flight_date <= endOfMonth;
  }).length;
};

// Helper function to count flights this week
const getFlightsThisWeek = (rosters: Roster[]): number => {
  const today = DateTime.now();
  const startOfWeek = today.startOf('week').toISODate();
  const endOfWeek = today.endOf('week').toISODate();

  if (!startOfWeek || !endOfWeek) return 0;

  return rosters.filter((roster) => {
    return roster.flight_date >= startOfWeek && roster.flight_date <= endOfWeek;
  }).length;
};

// Helper function to count upcoming flights
const getUpcomingFlightsCount = (rosters: Roster[]): number => {
  const today = DateTime.now().toISODate();
  if (!today) return 0;

  return rosters.filter((roster) => {
    return roster.flight_date >= today && roster.status !== 'Cancelled';
  }).length;
};

// Helper function to get status breakdown
const getStatusBreakdown = (rosters: Roster[]) => {
  const today = DateTime.now().toISODate();
  if (!today) return {scheduled: 0, confirmed: 0, completed: 0};

  const upcoming = rosters.filter((r) => r.flight_date >= today);

  return {
    scheduled: upcoming.filter((r) => r.status === 'Scheduled').length,
    confirmed: upcoming.filter((r) => r.status === 'Confirmed').length,
    completed: rosters.filter((r) => r.flight_date < today || r.status === 'Completed').length,
  };
};

// Format arrival time with +1 if next day
const formatArrivalTime = (roster: Roster): string => {
  const departureDate = DateTime.fromISO(`${roster.flight_date}T${roster.departure_time}`);
  const arrivalDate = DateTime.fromISO(`${roster.flight_date}T${roster.arrival_time}`);

  if (arrivalDate < departureDate || roster.arrival_time < roster.departure_time) {
    return `${roster.arrival_time}+1`;
  }
  return roster.arrival_time;
};

// Circular Progress Component (Simplified Visual)
type CircularProgressProps = {
  progress: number; // 0-1
  size?: number;
  strokeWidth?: number;
  color: string;
  backgroundColor?: string;
  delay?: number;
};

function CircularProgress({
  progress,
  size = 60,
  strokeWidth = 6,
  color,
  backgroundColor = '#E5E7EB',
  delay = 0,
}: CircularProgressProps) {
  const animatedProgress = useSharedValue(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const timer = setTimeout(() => {
      animatedProgress.value = withSpring(progress, {damping: 15, stiffness: 100});
    }, delay);
    return () => clearTimeout(timer);
  }, [progress, delay]);

  return (
    <View style={{width: size, height: size, justifyContent: 'center', alignItems: 'center'}}>
      <Svg width={size} height={size} style={{transform: [{rotate: '-90deg'}]}}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeLinecap="round"
          strokeDashoffset={circumference * (1 - progress)}
        />
      </Svg>
      {/* Center percentage */}
      <View style={{position: 'absolute', justifyContent: 'center', alignItems: 'center'}}>
        <ThemedText className="text-xs font-bold" style={{color, fontSize: size * 0.15}}>
          {Math.round(progress * 100)}%
        </ThemedText>
      </View>
    </View>
  );
}

// Bar Chart Component
type BarChartProps = {
  data: number[];
  labels?: string[];
  color: string;
  maxValue?: number;
  height?: number;
  delay?: number;
};

function BarChart({data, labels, color, maxValue, height = 80, delay = 0}: BarChartProps) {
  const animatedHeights = useSharedValue(0);
  const max = maxValue || Math.max(...data, 1);
  const barWidth = (CARD_WIDTH - 32) / data.length - 4;

  useEffect(() => {
    const timer = setTimeout(() => {
      animatedHeights.value = withSpring(1, {damping: 15, stiffness: 100});
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, animatedHeights]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: animatedHeights.value,
  }));

  return (
    <Animated.View
      style={[
        {height, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between'},
        animatedStyle,
      ]}>
      {data.map((value, index) => {
        const barHeight = (value / max) * height;
        const animatedBarHeight = useSharedValue(0);

        useEffect(() => {
          const timer = setTimeout(
            () => {
              animatedBarHeight.value = withSpring(barHeight, {damping: 15, stiffness: 100});
            },
            delay + index * 50,
          );
          return () => clearTimeout(timer);
        }, [barHeight, delay, index, animatedBarHeight]);

        const barStyle = useAnimatedStyle(() => ({
          height: animatedBarHeight.value,
        }));

        return (
          <View key={index} style={{alignItems: 'center', flex: 1}}>
            <Animated.View
              style={[
                {
                  width: barWidth,
                  backgroundColor: color,
                  borderRadius: 4,
                  marginHorizontal: 2,
                },
                barStyle,
              ]}
            />
            {labels && labels[index] && (
              <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {labels[index]}
              </ThemedText>
            )}
          </View>
        );
      })}
    </Animated.View>
  );
}

// Progress Bar Component
type ProgressBarProps = {
  progress: number; // 0-1
  color: string;
  backgroundColor?: string;
  height?: number;
  delay?: number;
  showLabel?: boolean;
};

function ProgressBar({
  progress,
  color,
  backgroundColor = '#E5E7EB',
  height = 8,
  delay = 0,
  showLabel = false,
}: ProgressBarProps) {
  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      animatedProgress.value = withSpring(progress, {damping: 15, stiffness: 100});
    }, delay);
    return () => clearTimeout(timer);
  }, [progress, delay, animatedProgress]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value * 100}%`,
  }));

  return (
    <View>
      {showLabel && (
        <View className="flex-row justify-between mb-1">
          <ThemedText className="text-xs text-gray-500 dark:text-gray-400">Progress</ThemedText>
          <ThemedText className="text-xs font-semibold" style={{color}}>
            {Math.round(progress * 100)}%
          </ThemedText>
        </View>
      )}
      <View
        style={{
          height,
          backgroundColor,
          borderRadius: height / 2,
          overflow: 'hidden',
        }}>
        <Animated.View
          style={[
            {
              height: '100%',
              backgroundColor: color,
              borderRadius: height / 2,
            },
            animatedStyle,
          ]}
        />
      </View>
    </View>
  );
}

// Stat Card Component with Visualizations
type StatCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  color: string;
  delay?: number;
  onPress?: () => void;
  iconColor?: string;
  progress?: number;
  showChart?: boolean;
  chartData?: number[];
  chartLabels?: string[];
};

function StatCard({
  icon,
  label,
  value,
  color,
  delay = 0,
  onPress,
  iconColor,
  progress,
  showChart = false,
  chartData,
  chartLabels,
}: StatCardProps) {
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    const timer = setTimeout(() => {
      scale.value = withSpring(1, {damping: 15, stiffness: 150});
      opacity.value = withTiming(1, {duration: 300});
    }, delay);

    return () => clearTimeout(timer);
  }, [delay, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{scale: scale.value}],
    opacity: opacity.value,
  }));

  const content = (
    <Animated.View style={animatedStyle}>
      <ThemedView className="rounded-2xl p-4 border border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
        <View className="flex-row items-center justify-between mb-2">
          {iconColor ? (
            <LinearGradient
              colors={[`${iconColor}20`, `${iconColor}10`]}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 1}}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Ionicons name={icon} size={20} color={iconColor} />
            </LinearGradient>
          ) : (
            <View
              className="w-10 h-10 rounded-xl items-center justify-center"
              style={{backgroundColor: `${color}15`}}>
              <Ionicons name={icon} size={20} color={color} />
            </View>
          )}
          {progress !== undefined && (
            <CircularProgress
              progress={progress}
              size={40}
              strokeWidth={4}
              color={color}
              delay={delay + 100}
            />
          )}
          {onPress && (
            <Ionicons name="chevron-forward-outline" size={16} color={themeColors.icon} />
          )}
        </View>
        <ThemedText className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          {label}
        </ThemedText>
        <ThemedText className="text-2xl font-bold mb-2" style={{color}}>
          {value}
        </ThemedText>
        {showChart && chartData && (
          <View className="mt-3">
            <BarChart
              data={chartData}
              labels={chartLabels}
              color={color}
              height={50}
              delay={delay + 200}
            />
          </View>
        )}
      </ThemedView>
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const {rosters, isLoading, fetchRosters} = useRostersStore();
  const {profile} = useAuthStore();
  const weatherIcon = getWeatherIcon(mockWeather.condition);
  const themeColors = Colors[colorScheme ?? 'light'];

  // Fetch rosters on mount
  useEffect(() => {
    fetchRosters();
  }, [fetchRosters]);

  // Find upcoming or current roster based on today
  const upcomingRoster = useMemo(() => {
    const today = DateTime.now().toISODate();
    if (!today) return null;

    const upcomingRosters = rosters.filter((roster) => {
      const rosterDate = roster.flight_date;
      const isTodayOrFuture = rosterDate >= today;
      const isNotCancelled = roster.status !== 'Cancelled';
      return isTodayOrFuture && isNotCancelled;
    });

    if (upcomingRosters.length === 0) return null;

    return upcomingRosters.sort((a, b) => {
      if (a.flight_date !== b.flight_date) {
        return a.flight_date.localeCompare(b.flight_date);
      }
      return a.departure_time.localeCompare(b.departure_time);
    })[0];
  }, [rosters]);

  // Calculate flight time info for upcoming roster
  const flightTimeInfo = useMemo(() => {
    if (!upcomingRoster) return null;
    return calculateFlightTimeInfo(upcomingRoster);
  }, [upcomingRoster]);

  // Calculate statistics
  const stats = useMemo(() => {
    const statusBreakdown = getStatusBreakdown(rosters);
    const thisWeek = getFlightsThisWeek(rosters);
    const thisMonth = getFlightsThisMonth(rosters);
    const upcoming = getUpcomingFlightsCount(rosters);
    const completed = statusBreakdown.completed;
    const total = rosters.length;

    // Calculate weekly trend (last 7 days)
    const weeklyTrend = [];
    const today = DateTime.now();
    for (let i = 6; i >= 0; i--) {
      const date = today.minus({days: i}).toISODate();
      if (date) {
        weeklyTrend.push(rosters.filter((r) => r.flight_date === date).length);
      }
    }

    // Calculate monthly progress (flights this month vs target)
    const monthlyTarget = 20; // Example target
    const monthlyProgress = Math.min(thisMonth / monthlyTarget, 1);

    return {
      thisWeek,
      thisMonth,
      upcoming,
      scheduled: statusBreakdown.scheduled,
      confirmed: statusBreakdown.confirmed,
      completed,
      total,
      weeklyTrend,
      monthlyProgress,
      completionRate: total > 0 ? completed / total : 0,
    };
  }, [rosters]);

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = DateTime.now().hour;
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Get user display name
  const getUserDisplayName = () => {
    if (profile?.full_name) {
      // Get first name only for a more personal touch
      const firstName = profile.full_name.split(' ')[0];
      return firstName;
    }
    if (profile?.email) {
      return profile.email.split('@')[0];
    }
    return 'There';
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    if (profile?.full_name) {
      const names = profile.full_name.split(' ');
      if (names.length >= 2) {
        return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
      }
      return profile.full_name.substring(0, 2).toUpperCase();
    }
    if (profile?.email) {
      return profile.email.substring(0, 2).toUpperCase();
    }
    return 'U';
  };

  return (
    <SafeAreaView edges={[]} className="flex-1 bg-gray-50 dark:bg-gray-900">
      <ScrollView
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerStyle={styles.scrollContent}>
        {/* Modern Header Section - Spotify/Airbnb Style */}
        <ThemedView className="px-6 pt-8 pb-6">
          <Animated.View
            style={styles.modernHeader}
            className="flex-row items-center justify-between mb-6">
            {/* Left: Greeting & Title */}
            <View className="flex-1 mr-4">
              <ThemedText
                className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 tracking-wide uppercase"
                animated
                delay={0}>
                {getGreeting()}
              </ThemedText>
              <ThemedText
                type="title"
                className="text-5xl font-black leading-none tracking-tight"
                animated
                delay={50}
                style={{
                  letterSpacing: -1,
                }}>
                {getUserDisplayName()}
              </ThemedText>
            </View>

            {/* Right: User Avatar */}
            <View className="relative">
              <Animated.View
                className="w-16 h-16 rounded-full items-center justify-center overflow-hidden"
                style={[
                  styles.avatarContainer,
                  {
                    backgroundColor: themeColors.tint,
                    shadowColor: themeColors.tint,
                    shadowOffset: {width: 0, height: 6},
                    shadowOpacity: 0.4,
                    shadowRadius: 12,
                    elevation: 10,
                  },
                ]}>
                {profile?.avatar_url ? (
                  <ThemedText className="text-2xl">🦃</ThemedText>
                ) : (
                  <ThemedText className="text-xl font-black" style={{color: '#FFFFFF'}}>
                    {getUserInitials()}
                  </ThemedText>
                )}
              </Animated.View>
              {/* Online indicator with pulse effect */}
              <Animated.View
                className="absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white dark:border-gray-900"
                style={{
                  backgroundColor: '#10B981',
                  shadowColor: '#10B981',
                  shadowOffset: {width: 0, height: 2},
                  shadowOpacity: 0.8,
                  shadowRadius: 4,
                  elevation: 4,
                }}
              />
            </View>
          </Animated.View>

          {/* Subtitle with modern typography */}
          <ThemedText
            className="text-base text-gray-600 dark:text-gray-400 leading-6 font-medium"
            animated
            delay={100}>
            Here's your flight roster overview
          </ThemedText>
        </ThemedView>

        {/* Hero Flight Card */}
        {isLoading && rosters.length === 0 ? (
          <ThemedView className="mx-6 mb-6 rounded-3xl p-6 border border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80">
            <ThemedLoader size="small" message="Loading your roster..." />
          </ThemedView>
        ) : upcomingRoster ? (
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
                  {upcomingRoster.flight_code}
                </ThemedText>
                <ThemedText className="text-lg mb-2" style={{color: 'rgba(255, 255, 255, 0.9)'}}>
                  {upcomingRoster.route}
                </ThemedText>
                <View className="flex-row items-center">
                  <Ionicons name="location-outline" size={16} color="rgba(255, 255, 255, 0.8)" />
                  <ThemedText className="text-sm ml-1" style={{color: 'rgba(255, 255, 255, 0.8)'}}>
                    {upcomingRoster.destination}
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
                    {upcomingRoster.departure_time}
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
                    {formatArrivalTime(upcomingRoster)}
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
                    {upcomingRoster.aircraft_type || 'Aircraft TBD'}
                  </ThemedText>
                </View>
                <View className="flex-row items-center">
                  <Ionicons name="calendar-outline" size={14} color="rgba(255, 255, 255, 0.7)" />
                  <ThemedText
                    className="text-xs ml-1.5"
                    style={{color: 'rgba(255, 255, 255, 0.7)'}}>
                    {DateTime.fromISO(upcomingRoster.flight_date).toFormat('MMM d, yyyy')}
                  </ThemedText>
                </View>
              </View>
            </LinearGradient>
          </ThemedView>
        ) : (
          <ThemedView
            animated
            delay={100}
            className="mx-6 mb-6 rounded-3xl p-8 border border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80 items-center">
            <View className="flex-row items-center justify-center mb-4">
              <View
                className="w-20 h-20 rounded-full items-center justify-center mr-3"
                style={{backgroundColor: `${themeColors.tint}15`}}>
                <Ionicons name="airplane-outline" size={40} color={themeColors.tint} />
              </View>
              <CoffeeIcon size={32} color={themeColors.coffeeMedium} animated />
            </View>
            <ThemedText animated delay={200} type="subtitle" className="text-center mb-2">
              No upcoming flights
            </ThemedText>
            <ThemedText
              animated
              delay={300}
              className="text-sm text-center text-gray-500 dark:text-gray-400">
              No upcoming flights… maybe grab a ☕?
            </ThemedText>
          </ThemedView>
        )}

        {/* Statistics Grid with Visualizations */}
        <ThemedView className="px-6 mb-6">
          <ThemedText animated delay={200} type="subtitle" className="text-xl font-bold mb-4">
            Quick Stats
          </ThemedText>
          <View className="flex-row flex-wrap justify-between">
            <View style={{width: CARD_WIDTH, marginBottom: 16}}>
              <StatCard
                icon="calendar-outline"
                label="This Week"
                value={stats.thisWeek}
                color={themeColors.tint}
                delay={250}
                showChart={stats.weeklyTrend.length > 0}
                chartData={stats.weeklyTrend}
                chartLabels={['S', 'M', 'T', 'W', 'T', 'F', 'S']}
              />
            </View>
            <View style={{width: CARD_WIDTH, marginBottom: 16}}>
              <StatCard
                icon="calendar-number-outline"
                label="This Month"
                value={stats.thisMonth}
                color={themeColors.tint}
                delay={300}
                progress={stats.monthlyProgress}
                iconColor={themeColors.coffeeMedium}
              />
            </View>
            <View style={{width: CARD_WIDTH, marginBottom: 16}}>
              <StatCard
                icon="airplane-outline"
                label="Upcoming"
                value={stats.upcoming}
                color="#10B981"
                delay={350}
                progress={stats.total > 0 ? stats.upcoming / stats.total : 0}
                iconColor={themeColors.coffeeLatte}
              />
            </View>
            <View style={{width: CARD_WIDTH, marginBottom: 16}}>
              <StatCard
                icon="checkmark-circle-outline"
                label="Completed"
                value={stats.completed}
                color="#6B7280"
                delay={400}
                progress={stats.completionRate}
                iconColor={themeColors.coffeeMedium}
              />
            </View>
          </View>
        </ThemedView>

        {/* Flight Activity Chart */}
        {stats.weeklyTrend.length > 0 && (
          <ThemedView className="px-6 mb-6">
            <ThemedText animated delay={450} type="subtitle" className="text-xl font-bold mb-4">
              Weekly Activity
            </ThemedText>
            <ThemedView
              animated
              delay={500}
              className="rounded-2xl p-5 border border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80">
              <BarChart
                data={stats.weeklyTrend}
                labels={['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']}
                color={themeColors.tint}
                height={120}
                delay={550}
              />
              <View className="flex-row items-center justify-between mt-4 pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
                <View>
                  <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Total Flights
                  </ThemedText>
                  <ThemedText className="text-2xl font-bold" style={{color: themeColors.tint}}>
                    {stats.weeklyTrend.reduce((a, b) => a + b, 0)}
                  </ThemedText>
                </View>
                <View className="items-end">
                  <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Average/Day
                  </ThemedText>
                  <ThemedText className="text-2xl font-bold" style={{color: themeColors.tint}}>
                    {(stats.weeklyTrend.reduce((a, b) => a + b, 0) / 7).toFixed(1)}
                  </ThemedText>
                </View>
              </View>
            </ThemedView>
          </ThemedView>
        )}

        {/* Status Breakdown with Progress Bars */}
        {(stats.scheduled > 0 || stats.confirmed > 0) && (
          <ThemedView className="px-6 mb-6">
            <ThemedText animated delay={600} type="subtitle" className="text-xl font-bold mb-4">
              Status Overview
            </ThemedText>
            <View className="space-y-3">
              {stats.scheduled > 0 && (
                <ThemedView
                  animated
                  delay={650}
                  className="rounded-2xl p-4 border border-blue-200/50 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/20">
                  <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-row items-center">
                      <View className="w-3 h-3 rounded-full mr-2 bg-blue-500" />
                      <ThemedText className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                        Scheduled
                      </ThemedText>
                    </View>
                    <ThemedText className="text-xl font-bold text-blue-600 dark:text-blue-400">
                      {stats.scheduled}
                    </ThemedText>
                  </View>
                  <ProgressBar
                    progress={stats.total > 0 ? stats.scheduled / stats.total : 0}
                    color="#3B82F6"
                    height={8}
                    delay={700}
                  />
                </ThemedView>
              )}
              {stats.confirmed > 0 && (
                <ThemedView
                  animated
                  delay={750}
                  className="rounded-2xl p-4 border border-green-200/50 dark:border-green-800/50 bg-green-50/50 dark:bg-green-900/20">
                  <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-row items-center">
                      <View className="w-3 h-3 rounded-full mr-2 bg-green-500" />
                      <ThemedText className="text-sm font-semibold text-green-600 dark:text-green-400">
                        Confirmed
                      </ThemedText>
                    </View>
                    <ThemedText className="text-xl font-bold text-green-600 dark:text-green-400">
                      {stats.confirmed}
                    </ThemedText>
                  </View>
                  <ProgressBar
                    progress={stats.total > 0 ? stats.confirmed / stats.total : 0}
                    color="#10B981"
                    height={8}
                    delay={800}
                  />
                </ThemedView>
              )}
            </View>
          </ThemedView>
        )}

        {/* Performance Metrics with Visual Indicators */}
        <ThemedView className="px-6 mb-6">
          <ThemedText animated delay={850} type="subtitle" className="text-xl font-bold mb-4">
            Performance Metrics
          </ThemedText>
          <ThemedView
            animated
            delay={900}
            className="rounded-2xl p-5 border border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-1">
                <ThemedText className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Completion Rate
                </ThemedText>
                <View className="flex-row items-center">
                  <CircularProgress
                    progress={stats.completionRate}
                    size={60}
                    strokeWidth={6}
                    color={themeColors.tint}
                    delay={950}
                  />
                  <View className="ml-4 flex-1">
                    <ThemedText
                      className="text-2xl font-bold mb-1"
                      style={{color: themeColors.tint}}>
                      {Math.round(stats.completionRate * 100)}%
                    </ThemedText>
                    <ProgressBar
                      progress={stats.completionRate}
                      color={themeColors.tint}
                      height={6}
                      delay={1000}
                    />
                  </View>
                </View>
              </View>
            </View>
            <View className="mt-4 pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                    style={{backgroundColor: `${themeColors.tint}15`}}>
                    <Ionicons name="time-outline" size={20} color={themeColors.tint} />
                  </View>
                  <View>
                    <ThemedText className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">
                      Current Timezone
                    </ThemedText>
                    <ThemedText className="text-base font-semibold">
                      {DateTime.now().toFormat('ZZZZ')}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText className="text-lg font-bold" style={{color: themeColors.tint}}>
                  {DateTime.now().toFormat('h:mm a')}
                </ThemedText>
              </View>
            </View>
          </ThemedView>
        </ThemedView>

        {/* Bottom Spacing */}
        <View className="h-6" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  modernHeader: {
    minHeight: 60,
  },
  avatarContainer: {
    borderRadius: 32,
  },
});
