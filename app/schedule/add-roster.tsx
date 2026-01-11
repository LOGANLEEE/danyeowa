import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { DateTime } from 'luxon';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Button,
  Card,
  Dialog,
  IconButton,
  Portal,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { ThemedLoader } from '@/components/ThemedLoader';
import { useRostersStore } from '@/stores/use-rosters-store';

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 48;
const CARD_HEIGHT = 320;

type FlightDay = {
  date: DateTime;
  flightCode?: string;
  isReturn?: boolean;
  skipped?: boolean;
};

interface AddRosterScreenProps {}

const AddRosterScreen: React.FC<AddRosterScreenProps> = () => {
  const {targetMonth} = useLocalSearchParams<{targetMonth: string}>();
  const theme = useTheme();
  const month = targetMonth ? DateTime.fromISO(targetMonth) : DateTime.now();
  const year = month.year;
  const monthNumber = month.month;

  const daysInMonth = month.daysInMonth || 31;
  const initialDays: FlightDay[] = Array.from({length: daysInMonth}, (_, i) => ({
    date: DateTime.fromObject({year, month: monthNumber, day: i + 1}),
  }));

  const [flightDays, setFlightDays] = useState<FlightDay[]>(initialDays);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flightInput, setFlightInput] = useState('');
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<any>(null);

  const {fetchRostersByDateRange, createMultipleRosters, updateMultipleRosters, rosters} =
    useRostersStore();

  // Animation values for slot machine effect
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const completionAnim = useRef(new Animated.Value(0)).current;

  // Calculate completed days
  const completedDays = flightDays.filter((day) => day.flightCode || day.skipped).length;

  // Fetch existing rosters for the month on mount
  useEffect(() => {
    const loadExistingRosters = async () => {
      setIsLoading(true);
      try {
        const startDate = month.startOf('month').toISODate();
        const endDate = month.endOf('month').toISODate();

        if (!startDate || !endDate) {
          setIsLoading(false);
          return;
        }

        const {error} = await fetchRostersByDateRange(startDate, endDate);

        if (error) {
          console.error('[AddRosterScreen] Error fetching rosters:', error);
          // Continue with empty state if fetch fails
        }

        // Get the latest rosters from the store after fetch
        const currentRosters = useRostersStore.getState().rosters;

        // Map existing rosters to FlightDay format
        const existingRostersMap = new Map<string, {flightCode: string; isReturn: boolean}>();
        currentRosters.forEach((roster) => {
          const dateKey = roster.flight_date;
          if (!existingRostersMap.has(dateKey)) {
            existingRostersMap.set(dateKey, {
              flightCode: roster.flight_code,
              isReturn: roster.flight_type === 'Return',
            });
          }
        });

        // Populate flightDays with existing data
        setFlightDays((prev) =>
          prev.map((day) => {
            const dateKey = day.date.toISODate();
            if (!dateKey) return day;

            const existing = existingRostersMap.get(dateKey);
            if (existing) {
              return {
                ...day,
                flightCode: existing.flightCode,
                isReturn: existing.isReturn,
              };
            }
            return day;
          }),
        );
      } catch (error) {
        console.error('[AddRosterScreen] Exception loading rosters:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadExistingRosters();
  }, [month, fetchRostersByDateRange]);

  // Reset input and trigger animation when index changes
  useEffect(() => {
    const currentDay = flightDays[currentIndex];
    setFlightInput(currentDay?.flightCode || '');

    // Reset animations
    slideAnim.setValue(0);
    scaleAnim.setValue(0.8);
    fadeAnim.setValue(0);

    // Animate card entrance (slot machine effect)
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-focus input after animation
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 400);

    return () => clearTimeout(timer);
  }, [currentIndex, flightDays]);

  const handleNext = async (update: Partial<FlightDay> = {}) => {
    // Update current day
    const updatedDays = [...flightDays];
    updatedDays[currentIndex] = {...updatedDays[currentIndex], ...update};
    setFlightDays(updatedDays);

    // Save the current day's roster immediately
    await saveSingleRoster(updatedDays[currentIndex]);

    // Trigger completion animation
    completionAnim.setValue(0);
    Animated.sequence([
      Animated.timing(completionAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(completionAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    Keyboard.dismiss();
    setFlightInput('');

    // Move to next day or show completion alert
    if (currentIndex < flightDays.length - 1) {
      setTimeout(() => {
        setCurrentIndex(currentIndex + 1);
      }, 300);
    } else {
      // Last day completed
      setTimeout(() => {
        Alert.alert(
          'Monthly Roster Completed! 🎉',
          `You've completed all ${daysInMonth} days for ${month.toLocaleString({
            month: 'long',
            year: 'numeric',
          })}.`,
          [
            {
              text: 'OK',
              onPress: () => {
                // Go back to schedule screen after roster completion
                router.replace('/(tabs)/calendar');
              },
            },
          ],
        );
      }, 500);
    }
  };

  const saveSingleRoster = async (day: FlightDay) => {
    const dateKey = day.date.toISODate();
    if (!dateKey) {
      return;
    }

    // For skipped days, we don't create a roster entry
    if (day.skipped) {
      return;
    }

    // Skip days without flight codes
    if (!day.flightCode) {
      return;
    }

    try {
      // Get the latest rosters from the store
      const currentRosters = useRostersStore.getState().rosters;

      // Check if roster already exists for this date
      const existingRoster = currentRosters.find((r) => r.flight_date === dateKey);

      const flightType: 'Depart' | 'Return' = day.isReturn ? 'Return' : 'Depart';
      const route = day.flightCode;
      const destination = day.flightCode;

      if (existingRoster) {
        // Update existing roster
        await updateMultipleRosters([
          {
            id: existingRoster.id,
            flight_code: day.flightCode,
            route,
            destination,
            flight_date: dateKey,
            departure_time: '00:00:00',
            arrival_time: '00:00:00',
            flight_type: flightType,
            status: 'Scheduled',
          },
        ]);
      } else {
        // Create new roster
        await createMultipleRosters([
          {
            flight_code: day.flightCode,
            route,
            destination,
            flight_date: dateKey,
            departure_time: '00:00:00',
            arrival_time: '00:00:00',
            flight_type: flightType,
            status: 'Scheduled',
          },
        ]);
      }
    } catch (error) {
      console.error('[AddRosterScreen] Error saving single roster:', error);
      // Don't show alert for individual saves to avoid interrupting user flow
    }
  };

  const handleSave = () => {
    if (flightInput.trim()) {
      handleNext({flightCode: flightInput.trim()});
    }
  };

  const handleReturn = () => {
    if (flightInput.trim()) {
      handleNext({flightCode: flightInput.trim(), isReturn: true});
    }
  };

  const handleSkip = () => {
    handleNext({skipped: true});
  };

  const handleDateSelect = (index: number) => {
    setCurrentIndex(index);
    setShowDatePickerModal(false);
    Keyboard.dismiss();
  };

  useEffect(() => {
    if (showDatePickerModal) {
      Keyboard.dismiss();
    }
  }, [showDatePickerModal]);

  const currentDay = flightDays[currentIndex];
  const formattedDate = currentDay.date.toLocaleString({
    day: 'numeric',
    month: 'short',
  });
  const formattedWeekday = currentDay.date.toLocaleString({
    weekday: 'long',
  });

  // Animation interpolations for slot machine effect
  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [100, 0],
  });

  const cardScale = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });

  const cardOpacity = fadeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  // Completion animation
  const completionScale = completionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.05],
  });

  // Get status color for progress dots
  const getStatusColor = (day: FlightDay, index: number): string => {
    if (index < currentIndex) {
      if (day.skipped) return theme.colors.outline;
      if (day.isReturn) return theme.colors.secondary;
      if (day.flightCode) return theme.colors.tertiary;
    }
    if (index === currentIndex) {
      return theme.colors.primary;
    }
    return theme.colors.surfaceVariant;
  };

  // Render stacked cards behind the main card
  const renderStackedCards = () => {
    const remainingCards = Math.min(3, flightDays.length - currentIndex - 1);
    return Array.from({length: remainingCards}).map((_, i) => {
      const stackIndex = i + 1;
      const offset = stackIndex * 8;
      const scale = 1 - stackIndex * 0.05;
      const opacity = 1 - stackIndex * 0.3;

      return (
        <Card
          key={`stack-${stackIndex}`}
          style={[
            styles.stackedCard,
            {
              transform: [{scale}],
              opacity,
              marginTop: offset,
              marginLeft: offset * 0.5,
            },
            {backgroundColor: theme.colors.surface},
          ]}
          elevation={2}>
          <View />
        </Card>
      );
    });
  };

  // Show loader while fetching initial data
  if (isLoading) {
    return <ThemedLoader fullScreen size="large" message="Loading rosters..." />;
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, {backgroundColor: theme.colors.background}]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Top Section: Monthly Progress Indicator */}
        <TouchableOpacity
          style={styles.progressSection}
          onPress={() => setShowDatePickerModal(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Select month and date">
          <>
            <Text
              variant="titleMedium"
              style={[styles.monthTitle, {color: theme.colors.onBackground}]}>
              {month.toLocaleString({month: 'long', year: 'numeric'})}
            </Text>

            {/* Segmented Dots Progress Indicator */}
            <View style={styles.dotsContainer}>
              {flightDays.map((day, index) => {
                const isActive = index === currentIndex;
                const isCompleted = index < currentIndex && (day.flightCode || day.skipped);

                return (
                  <TouchableOpacity
                    key={index}
                    // onPress={() => handleDateSelect(index)}
                    activeOpacity={0.7}
                    style={[
                      styles.progressDot,
                      {
                        backgroundColor: getStatusColor(day, index),
                        width: isActive ? 10 : 8,
                        height: isActive ? 10 : 8,
                        opacity: isCompleted ? 1 : isActive ? 1 : 0.4,
                      },
                    ]}
                  />
                );
              })}
            </View>

            {/* Progress Text */}
            <View>
              <Text
                variant="bodySmall"
                style={[styles.progressText, {color: theme.colors.primary}]}>
                {completedDays} of {daysInMonth} days completed • Tap to select date
              </Text>
            </View>
          </>
        </TouchableOpacity>

        {/* Center Section: Card with Stacked Cards Behind */}
        <View style={styles.cardContainer}>
          {/* Stacked Cards */}
          <View style={styles.stackedCardsContainer}>{renderStackedCards()}</View>

          {/* Main Card */}
          <Animated.View
            style={[
              {
                transform: [{translateY}, {scale: Animated.multiply(cardScale, completionScale)}],
                opacity: cardOpacity,
              },
            ]}>
            <Card
              style={[
                styles.mainCard,
                {
                  backgroundColor: theme.colors.surface,
                  shadowColor: theme.colors.shadow,
                },
              ]}
              elevation={5}>
              <Card.Content style={styles.cardContent}>
                {/* Date and Weekday */}
                <View style={styles.dateSection}>
                  <Text
                    variant="headlineMedium"
                    style={[styles.dateText, {color: theme.colors.onSurface}]}>
                    {formattedDate}
                  </Text>
                  <Text
                    variant="titleLarge"
                    style={[styles.weekdayText, {color: theme.colors.onSurfaceVariant}]}>
                    {formattedWeekday}
                  </Text>
                </View>

                {/* Flight Code Input */}
                <TextInput
                  ref={inputRef}
                  label="Flight Code"
                  value={flightInput}
                  onChangeText={setFlightInput}
                  mode="outlined"
                  autoFocus
                  // returnKeyType="done"
                  onSubmitEditing={handleSave}
                  blurOnSubmit={false}
                  style={styles.input}
                  inputMode="numeric"
                  keyboardType="number-pad"
                  contentStyle={styles.inputContent}
                  right={
                    flightInput.trim() ? (
                      <TextInput.Icon icon="check-circle" color={theme.colors.tertiary} />
                    ) : undefined
                  }
                />
              </Card.Content>
              <Card.Actions style={styles.buttonsContainer}>
                <Button
                  mode="outlined"
                  onPress={handleSkip}
                  disabled={isSaving}
                  style={[styles.button, styles.skipButton]}
                  contentStyle={styles.buttonContent}
                  labelStyle={[styles.buttonLabel, {color: theme.colors.onSurfaceVariant}]}
                  accessibilityLabel="Skip day"
                  accessibilityRole="button">
                  Skip
                </Button>
                <Button
                  mode="contained"
                  onPress={handleSave}
                  disabled={!flightInput.trim() || isSaving}
                  loading={isSaving}
                  style={[styles.button, styles.saveButton]}
                  contentStyle={styles.buttonContent}
                  buttonColor={theme.colors.tertiary}
                  textColor={theme.colors.onTertiary}
                  accessibilityLabel="Save flight code"
                  accessibilityRole="button">
                  Save
                </Button>
                <Button
                  mode="contained"
                  onPress={handleReturn}
                  disabled={!flightInput.trim() || isSaving}
                  loading={isSaving}
                  style={[styles.button, styles.returnButton]}
                  contentStyle={styles.buttonContent}
                  buttonColor={theme.colors.secondary}
                  textColor={theme.colors.onSecondary}
                  accessibilityLabel="Save as return flight"
                  accessibilityRole="button">
                  Turn
                </Button>
              </Card.Actions>
            </Card>
            {/* Bottom Section: Action Buttons */}
          </Animated.View>
        </View>

        {/* Date Selection Modal */}
        <Portal>
          <Dialog
            visible={showDatePickerModal}
            onDismiss={() => setShowDatePickerModal(false)}
            style={styles.dialog}>
            <Dialog.Title>
              <View style={styles.dialogTitleContainer}>
                <Text variant="titleLarge">Select Date</Text>
                <IconButton
                  icon="close"
                  size={24}
                  iconColor={theme.colors.onSurfaceVariant}
                  onPress={() => setShowDatePickerModal(false)}
                />
              </View>
            </Dialog.Title>
            <Dialog.Content>
              <View style={styles.dateGridContainer}>
                <FlashList
                  data={flightDays}
                  renderItem={({item: day, index}) => {
                    const isActive = index === currentIndex;
                    const isCompleted = day.flightCode || day.skipped;
                    const dayNumber = day.date.day;
                    const isToday = day.date.hasSame(DateTime.now(), 'day');

                    return (
                      <TouchableOpacity
                        onPress={() => handleDateSelect(index)}
                        style={[
                          styles.dateGridItem,
                          {
                            backgroundColor: isActive
                              ? theme.colors.primaryContainer
                              : theme.colors.surface,
                            borderColor: isActive ? theme.colors.primary : theme.colors.outline,
                          },
                        ]}
                        activeOpacity={0.7}>
                        <Text
                          variant="bodyLarge"
                          style={[
                            styles.dateGridNumber,
                            {
                              color: isActive
                                ? theme.colors.onPrimaryContainer
                                : theme.colors.onSurface,
                              fontWeight: isActive || isToday ? '700' : '500',
                            },
                          ]}>
                          {dayNumber}
                        </Text>
                        {isCompleted && (
                          <View
                            style={[
                              styles.dateGridDot,
                              {
                                backgroundColor: day.skipped
                                  ? theme.colors.outline
                                  : day.isReturn
                                  ? theme.colors.secondary
                                  : theme.colors.tertiary,
                              },
                            ]}
                          />
                        )}
                        {isToday && !isActive && (
                          <View
                            style={[
                              styles.dateGridTodayDot,
                              {backgroundColor: theme.colors.primary},
                            ]}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  numColumns={7}
                  contentContainerStyle={styles.dateGridContent}
                  showsVerticalScrollIndicator={false}
                  keyExtractor={(_, index) => index.toString()}
                />
              </View>
            </Dialog.Content>
          </Dialog>
        </Portal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 32,
  },
  progressSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  monthTitle: {
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    maxWidth: SCREEN_WIDTH - 48,
  },
  progressDot: {
    borderRadius: 4,
    marginHorizontal: 2,
  },
  progressText: {
    fontSize: 12,
    textAlign: 'center',
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: CARD_HEIGHT + 100,
    position: 'relative',
  },
  stackedCardsContainer: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackedCard: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
  },
  mainCard: {
    width: CARD_WIDTH,
    minHeight: CARD_HEIGHT,
    borderRadius: 16,
    zIndex: 10,
  },
  cardContent: {
    padding: 24,
  },
  dateSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  dateText: {
    fontWeight: '700',
    marginBottom: 8,
  },
  weekdayText: {
    fontWeight: '400',
    opacity: 0.7,
  },
  input: {
    marginBottom: 8,
  },
  inputContent: {
    fontSize: 18,
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 32,
    paddingBottom: 16,
  },
  button: {
    flex: 1,
  },
  skipButton: {
    // Outlined button styling handled by theme
  },
  saveButton: {
    // Contained button with tertiary color
  },
  returnButton: {
    // Contained button with secondary color
  },
  buttonContent: {
    paddingVertical: 8,
  },
  buttonLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  dialog: {
    borderRadius: 24,
  },
  dialogTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateGridContainer: {
    height: 400,
  },
  dateGridContent: {
    paddingBottom: 8,
  },
  dateGridItem: {
    // width: SCREEN_WIDTH / 7,
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dateGridNumber: {
    fontSize: 16,
  },
  dateGridDot: {
    position: 'absolute',
    bottom: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dateGridTodayDot: {
    position: 'absolute',
    top: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

export default AddRosterScreen;
