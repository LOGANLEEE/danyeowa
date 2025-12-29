import * as Notifications from 'expo-notifications';
import { Roster } from '@/lib/supabase/types';
import { NotificationPreferences } from '@/lib/supabase/types';
import { calculateFlightTimeInfo, shouldSendNotification } from '@/utils/flight-calculations';
import { DateTime } from 'luxon';

/**
 * Schedule notifications for a roster based on user preferences
 */
export async function scheduleRosterNotifications(
  roster: Roster,
  preferences: NotificationPreferences,
  pushToken: string | null
): Promise<{ scheduledIds: string[]; error: Error | null }> {
  const scheduledIds: string[] = [];

  try {
    if (!pushToken || !preferences.push_enabled) {
      return { scheduledIds: [], error: null };
    }

    const flightInfo = calculateFlightTimeInfo(roster);
    const now = DateTime.now();

    // Schedule departure notifications
    if (
      preferences.flight_departure_enabled &&
      flightInfo.hoursUntilDeparture !== null &&
      flightInfo.hoursUntilDeparture > 0
    ) {
      for (const hoursBefore of preferences.hours_before_departure) {
        if (shouldSendNotification(flightInfo.hoursUntilDeparture, [hoursBefore])) {
          const notificationTime = flightInfo.departureDateTime.minus({ hours: hoursBefore });
          
          if (notificationTime > now) {
            const notificationId = await Notifications.scheduleNotificationAsync({
              content: {
                title: `Flight Departure Reminder`,
                body: `${roster.flight_code} departs in ${hoursBefore} hour${hoursBefore > 1 ? 's' : ''}`,
                data: {
                  type: 'flight_departure',
                  rosterId: roster.id,
                  flightCode: roster.flight_code,
                },
                sound: true,
              },
              trigger: notificationTime.toJSDate(),
            });
            scheduledIds.push(notificationId);
          }
        }
      }
    }

    // Schedule arrival notifications
    if (
      preferences.flight_arrival_enabled &&
      flightInfo.hoursUntilArrival !== null &&
      flightInfo.hoursUntilArrival > 0
    ) {
      for (const hoursBefore of preferences.hours_before_arrival) {
        if (shouldSendNotification(flightInfo.hoursUntilArrival, [hoursBefore])) {
          const notificationTime = flightInfo.arrivalDateTime.minus({ hours: hoursBefore });
          
          if (notificationTime > now) {
            const notificationId = await Notifications.scheduleNotificationAsync({
              content: {
                title: `Flight Arrival Reminder`,
                body: `${roster.flight_code} lands in ${hoursBefore} hour${hoursBefore > 1 ? 's' : ''}`,
                data: {
                  type: 'flight_arrival',
                  rosterId: roster.id,
                  flightCode: roster.flight_code,
                },
                sound: true,
              },
              trigger: notificationTime.toJSDate(),
            });
            scheduledIds.push(notificationId);
          }
        }
      }
    }

    // Schedule countdown notifications (every X hours for active flights)
    if (
      preferences.flight_countdown_enabled &&
      flightInfo.hoursUntilArrival !== null &&
      flightInfo.hoursUntilArrival > 0 &&
      flightInfo.status === 'in_flight'
    ) {
      const intervalHours = preferences.countdown_interval_hours || 3;
      let hoursRemaining = flightInfo.hoursUntilArrival;

      while (hoursRemaining > 0) {
        const notificationTime = flightInfo.arrivalDateTime.minus({ hours: hoursRemaining });
        
        if (notificationTime > now) {
          const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
              title: `Flight Countdown`,
              body: `${roster.flight_code} lands in ${Math.floor(hoursRemaining)} hour${Math.floor(hoursRemaining) > 1 ? 's' : ''}`,
              data: {
                type: 'flight_countdown',
                rosterId: roster.id,
                flightCode: roster.flight_code,
                hoursRemaining: Math.floor(hoursRemaining),
              },
              sound: true,
            },
            trigger: notificationTime.toJSDate(),
          });
          scheduledIds.push(notificationId);
        }

        hoursRemaining -= intervalHours;
      }
    }

    return { scheduledIds, error: null };
  } catch (error) {
    console.error('[NotificationScheduler] Error scheduling notifications:', error);
    return {
      scheduledIds,
      error: error instanceof Error ? error : new Error('Failed to schedule notifications'),
    };
  }
}

/**
 * Cancel all scheduled notifications for a roster
 */
export async function cancelRosterNotifications(notificationIds: string[]): Promise<void> {
  try {
    for (const id of notificationIds) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
  } catch (error) {
    console.error('[NotificationScheduler] Error canceling notifications:', error);
  }
}

/**
 * Schedule notifications for all user rosters
 */
export async function scheduleAllRosterNotifications(
  rosters: Roster[],
  preferences: NotificationPreferences,
  pushToken: string | null
): Promise<{ totalScheduled: number; errors: Error[] }> {
  const errors: Error[] = [];
  let totalScheduled = 0;

  for (const roster of rosters) {
    const { scheduledIds, error } = await scheduleRosterNotifications(roster, preferences, pushToken);
    
    if (error) {
      errors.push(error);
    } else {
      totalScheduled += scheduledIds.length;
    }
  }

  return { totalScheduled, errors };
}

