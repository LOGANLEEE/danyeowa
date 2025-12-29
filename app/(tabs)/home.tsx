import { EmptyStateCard } from '@/components/home/EmptyStateCard';
import { HeroFlightCard } from '@/components/home/HeroFlightCard';
import { HomeHeader } from '@/components/home/HomeHeader';
import { ProfileMenu } from '@/components/ProfileMenu';
import { ThemedLoader } from '@/components/ThemedLoader';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { BarChart } from '@/components/ui/BarChart';
import { Card } from '@/components/ui/Card';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/stores/use-auth-store';
import { useRostersStore } from '@/stores/use-rosters-store';
import {
  getFlightsThisMonth,
  getFlightsThisWeek,
  getStatusBreakdown,
  getUpcomingFlightsCount,
} from '@/utils/home.utils';
import { Ionicons } from '@expo/vector-icons';
import { DateTime } from 'luxon';
import { useEffect, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2 - 8;

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const {rosters, isLoading, fetchRosters} = useRostersStore();
  const {profile} = useAuthStore();
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

  return (
    <>
      <ScreenContainer
        edges={[]}
        className="bg-gray-50 dark:bg-gray-900"
        contentContainerStyle={styles.scrollContent}>
        {/* Modern Header Section */}
        <HomeHeader
          profile={{
            full_name: profile?.full_name ?? '',
            email: profile?.email ?? '',
            avatar_url: profile?.avatar_url ?? '',
          }}
          onProfilePress={() => setProfileMenuVisible(true)}
        />

        {/* Hero Flight Card */}
        {isLoading && rosters.length === 0 ? (
          <ThemedView className="mx-6 mb-6 rounded-3xl p-6 border border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80">
            <ThemedLoader size="small" message="Loading your roster..." />
          </ThemedView>
        ) : upcomingRoster ? (
          <HeroFlightCard roster={upcomingRoster} />
        ) : (
          <EmptyStateCard />
        )}

        {/* Statistics Grid with Visualizations */}
        <ThemedView className="px-6 mb-6">
          <SectionHeader title="Quick Stats" animated delay={200} />
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
                iconColor={themeColors.primary}
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
                iconColor={themeColors.primary}
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
                iconColor={themeColors.primary}
              />
            </View>
          </View>
        </ThemedView>

        {/* Flight Activity Chart */}
        {stats.weeklyTrend.length > 0 && (
          <ThemedView className="px-6 mb-6">
            <SectionHeader title="Weekly Activity" animated delay={450} />
            <Card variant="default" animated delay={500} className="p-5">
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
            </Card>
          </ThemedView>
        )}

        {/* Status Breakdown with Progress Bars */}
        {(stats.scheduled > 0 || stats.confirmed > 0) && (
          <ThemedView className="px-6 mb-6">
            <SectionHeader title="Status Overview" animated delay={600} />
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
          <SectionHeader title="Performance Metrics" animated delay={850} />
          <Card variant="default" animated delay={900} className="p-5">
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
          </Card>
        </ThemedView>

        {/* Bottom Spacing */}
        <View className="h-6" />
      </ScreenContainer>

      <ProfileMenu visible={profileMenuVisible} onClose={() => setProfileMenuVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
});
