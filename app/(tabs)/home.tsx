import { AnimatedWelcomeBackground } from '@/components/AnimatedWelcomeBackground';
import { EmptyStateCard } from '@/components/home/EmptyStateCard';
import { HeroFlightCard } from '@/components/home/HeroFlightCard';
import { HomeHeader } from '@/components/home/HomeHeader';
import { ProfileMenu } from '@/components/ProfileMenu';
import { ThemedLoader } from '@/components/ThemedLoader';
import { BarChart } from '@/components/ui/BarChart';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatCard } from '@/components/ui/StatCard';
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
import { Card, Surface, Text, useTheme } from 'react-native-paper';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2 - 8;

export default function HomeScreen() {
  const theme = useTheme();
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const {rosters, isLoading, fetchRosters} = useRostersStore();
  const {profile} = useAuthStore();

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
        contentContainerStyle={[styles.scrollContent, {backgroundColor: theme.colors.background}]}>
        {/* Modern Header Section */}
        <AnimatedWelcomeBackground />
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
          <Surface style={styles.loadingCard} elevation={1}>
            <ThemedLoader size="small" message="Loading your roster..." />
          </Surface>
        ) : upcomingRoster ? (
          <HeroFlightCard roster={upcomingRoster} />
        ) : (
          <EmptyStateCard />
        )}

        {/* Statistics Grid with Visualizations */}
        <View style={styles.sectionContainer}>
          <SectionHeader title="Quick Stats" animated delay={200} />
          <View style={styles.statsGrid}>
            <View style={[styles.statCardWrapper, {width: CARD_WIDTH}]}>
              <StatCard
                icon="calendar-outline"
                label="This Week"
                value={stats.thisWeek}
                color={theme.colors.primary}
                delay={250}
                showChart={stats.weeklyTrend.length > 0}
                chartData={stats.weeklyTrend}
                chartLabels={['S', 'M', 'T', 'W', 'T', 'F', 'S']}
              />
            </View>
            <View style={[styles.statCardWrapper, {width: CARD_WIDTH}]}>
              <StatCard
                icon="calendar-number-outline"
                label="This Month"
                value={stats.thisMonth}
                color={theme.colors.primary}
                delay={300}
                progress={stats.monthlyProgress}
                iconColor={theme.colors.primary}
              />
            </View>
            <View style={[styles.statCardWrapper, {width: CARD_WIDTH}]}>
              <StatCard
                icon="airplane-outline"
                label="Upcoming"
                value={stats.upcoming}
                color="#10B981"
                delay={350}
                progress={stats.total > 0 ? stats.upcoming / stats.total : 0}
                iconColor={theme.colors.primary}
              />
            </View>
            <View style={[styles.statCardWrapper, {width: CARD_WIDTH}]}>
              <StatCard
                icon="checkmark-circle-outline"
                label="Completed"
                value={stats.completed}
                color="#6B7280"
                delay={400}
                progress={stats.completionRate}
                iconColor={theme.colors.primary}
              />
            </View>
          </View>
        </View>

        {/* Flight Activity Chart */}
        {stats.weeklyTrend.length > 0 && (
          <View style={styles.sectionContainer}>
            <SectionHeader title="Weekly Activity" animated delay={450} />
            <Card style={styles.chartCard} mode="outlined">
              <Card.Content style={styles.chartCardContent}>
                <BarChart
                  data={stats.weeklyTrend}
                  labels={['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']}
                  color={theme.colors.primary}
                  height={120}
                  delay={550}
                />
                <View style={[styles.chartFooter, {borderTopColor: theme.colors.outline}]}>
                  <View>
                    <Text
                      variant="bodySmall"
                      style={[styles.chartLabel, {color: theme.colors.onSurface}]}>
                      Total Flights
                    </Text>
                    <Text
                      variant="headlineSmall"
                      style={[styles.chartValue, {color: theme.colors.primary}]}>
                      {stats.weeklyTrend.reduce((a, b) => a + b, 0)}
                    </Text>
                  </View>
                  <View style={styles.chartFooterRight}>
                    <Text
                      variant="bodySmall"
                      style={[styles.chartLabel, {color: theme.colors.onSurface}]}>
                      Average/Day
                    </Text>
                    <Text
                      variant="headlineSmall"
                      style={[styles.chartValue, {color: theme.colors.primary}]}>
                      {(stats.weeklyTrend.reduce((a, b) => a + b, 0) / 7).toFixed(1)}
                    </Text>
                  </View>
                </View>
              </Card.Content>
            </Card>
          </View>
        )}

        {/* Status Breakdown with Progress Bars */}
        {(stats.scheduled > 0 || stats.confirmed > 0) && (
          <View style={styles.sectionContainer}>
            <SectionHeader title="Status Overview" animated delay={600} />
            <View style={styles.statusContainer}>
              {stats.scheduled > 0 && (
                <Surface
                  style={[styles.statusCard, {borderColor: theme.colors.outline}]}
                  elevation={1}>
                  <View style={styles.statusHeader}>
                    <View style={styles.statusLabelContainer}>
                      <View style={[styles.statusIndicator, {backgroundColor: '#3B82F6'}]} />
                      <Text variant="labelLarge" style={styles.statusLabelScheduled}>
                        Scheduled
                      </Text>
                    </View>
                    <Text variant="headlineSmall" style={styles.statusValueScheduled}>
                      {stats.scheduled}
                    </Text>
                  </View>
                  <ProgressBar
                    progress={stats.total > 0 ? stats.scheduled / stats.total : 0}
                    color="#3B82F6"
                    height={8}
                    delay={700}
                  />
                </Surface>
              )}
              {stats.confirmed > 0 && (
                <Surface
                  style={[styles.statusCard, {borderColor: theme.colors.outline}]}
                  elevation={1}>
                  <View style={styles.statusHeader}>
                    <View style={styles.statusLabelContainer}>
                      <View style={[styles.statusIndicator, {backgroundColor: '#10B981'}]} />
                      <Text variant="labelLarge" style={styles.statusLabelConfirmed}>
                        Confirmed
                      </Text>
                    </View>
                    <Text variant="headlineSmall" style={styles.statusValueConfirmed}>
                      {stats.confirmed}
                    </Text>
                  </View>
                  <ProgressBar
                    progress={stats.total > 0 ? stats.confirmed / stats.total : 0}
                    color="#10B981"
                    height={8}
                    delay={800}
                  />
                </Surface>
              )}
            </View>
          </View>
        )}

        {/* Performance Metrics with Visual Indicators */}
        <View style={styles.sectionContainer}>
          <SectionHeader title="Performance Metrics" animated delay={850} />
          <Card style={styles.metricsCard} mode="outlined">
            <Card.Content>
              <View style={styles.metricsContent}>
                <View style={styles.metricsSection}>
                  <Text
                    variant="bodySmall"
                    style={[styles.metricsLabel, {color: theme.colors.onSurface}]}>
                    Completion Rate
                  </Text>
                  <View style={styles.completionRow}>
                    <CircularProgress
                      progress={stats.completionRate}
                      size={60}
                      strokeWidth={6}
                      color={theme.colors.primary}
                      delay={950}
                    />
                    <View style={styles.completionDetails}>
                      <Text
                        variant="headlineSmall"
                        style={[styles.completionPercentage, {color: theme.colors.primary}]}>
                        {Math.round(stats.completionRate * 100)}%
                      </Text>
                      <ProgressBar
                        progress={stats.completionRate}
                        color={theme.colors.primary}
                        height={6}
                        delay={1000}
                      />
                    </View>
                  </View>
                </View>
              </View>
              <View style={[styles.timezoneSection, {borderTopColor: theme.colors.outline}]}>
                <View style={styles.timezoneRow}>
                  <View style={styles.timezoneLeft}>
                    <Surface
                      style={[
                        styles.timezoneIconContainer,
                        {backgroundColor: `${theme.colors.primary}15`},
                      ]}
                      elevation={0}>
                      <Ionicons name="time-outline" size={20} color={theme.colors.primary} />
                    </Surface>
                    <View>
                      <Text
                        variant="bodySmall"
                        style={[styles.timezoneLabel, {color: theme.colors.onSurface}]}>
                        Current Timezone
                      </Text>
                      <Text
                        variant="bodyLarge"
                        style={[styles.timezoneValue, {color: theme.colors.onSurface}]}>
                        {DateTime.now().toFormat('ZZZZ')}
                      </Text>
                    </View>
                  </View>
                  <Text
                    variant="titleMedium"
                    style={[styles.timezoneTime, {color: theme.colors.primary}]}>
                    {DateTime.now().toFormat('h:mm a')}
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        </View>

        {/* Bottom Spacing */}
        <View style={styles.bottomSpacing} />
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
  loadingCard: {
    marginHorizontal: 24,
    marginBottom: 24,
    borderRadius: 24,
    padding: 24,
  },
  sectionContainer: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCardWrapper: {
    marginBottom: 16,
  },
  chartCard: {
    borderRadius: 16,
  },
  chartCardContent: {
    padding: 20,
  },
  chartFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  chartFooterRight: {
    alignItems: 'flex-end',
  },
  chartLabel: {
    marginBottom: 4,
    opacity: 0.7,
  } as const,
  chartValue: {
    fontWeight: 'bold',
  },
  statusContainer: {
    gap: 12,
  },
  statusCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statusLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusLabelScheduled: {
    fontWeight: '600',
    color: '#3B82F6',
  },
  statusValueScheduled: {
    fontWeight: 'bold',
    color: '#3B82F6',
  },
  statusLabelConfirmed: {
    fontWeight: '600',
    color: '#10B981',
  },
  statusValueConfirmed: {
    fontWeight: 'bold',
    color: '#10B981',
  },
  metricsCard: {
    borderRadius: 16,
  },
  metricsContent: {
    marginBottom: 16,
  },
  metricsSection: {
    flex: 1,
  },
  metricsLabel: {
    marginBottom: 8,
    opacity: 0.7,
    fontWeight: '500',
  } as const,
  completionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  completionDetails: {
    marginLeft: 16,
    flex: 1,
  },
  completionPercentage: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  timezoneSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  timezoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timezoneLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timezoneIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  timezoneLabel: {
    marginBottom: 2,
    opacity: 0.7,
    fontWeight: '500',
  } as const,
  timezoneValue: {
    fontWeight: '600',
  },
  timezoneTime: {
    fontWeight: 'bold',
  },
  bottomSpacing: {
    height: 24,
  },
});
