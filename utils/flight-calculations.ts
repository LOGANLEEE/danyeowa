import { Roster } from '@/lib/supabase/types';
import { DateTime } from 'luxon';

export type FlightStatus = 'upcoming' | 'departing_soon' | 'in_flight' | 'landing_soon' | 'landed' | 'cancelled';

export interface FlightTimeInfo {
  status: FlightStatus;
  hoursUntilDeparture: number | null;
  hoursUntilArrival: number | null;
  minutesUntilDeparture: number | null;
  minutesUntilArrival: number | null;
  isToday: boolean;
  isPast: boolean;
  departureDateTime: DateTime;
  arrivalDateTime: DateTime;
  formattedTimeRemaining: string | null;
  formattedArrivalTimeRemaining: string | null;
}

/**
 * Calculate flight time information including countdowns
 * Handles timezone conversions and calculates hours/minutes until departure/arrival
 */
export function calculateFlightTimeInfo(
  roster: Roster,
  userTimezone: string = 'local'
): FlightTimeInfo {
  const now = DateTime.now().setZone(userTimezone);
  
  // Parse flight date and times
  const departureDate = DateTime.fromISO(roster.flight_date).setZone(userTimezone);
  const departureTime = DateTime.fromISO(`${roster.flight_date}T${roster.departure_time}`).setZone(userTimezone);
  const arrivalTime = DateTime.fromISO(`${roster.flight_date}T${roster.arrival_time}`).setZone(userTimezone);
  
  // Handle next-day arrivals (if arrival time is earlier than departure time, it's next day)
  const arrivalDateTime = arrivalTime < departureTime 
    ? arrivalTime.plus({ days: 1 })
    : arrivalTime;
  
  const isToday = departureDate.hasSame(now, 'day');
  const isPast = arrivalDateTime < now;
  
  // Calculate time differences
  const departureDiff = departureTime.diff(now, ['hours', 'minutes']);
  const arrivalDiff = arrivalDateTime.diff(now, ['hours', 'minutes']);
  
  const hoursUntilDeparture = departureDiff.hours > 0 ? Math.floor(departureDiff.hours) : null;
  const minutesUntilDeparture = departureDiff.hours > 0 ? Math.floor(departureDiff.minutes % 60) : null;
  
  const hoursUntilArrival = arrivalDiff.hours > 0 ? Math.floor(arrivalDiff.hours) : null;
  const minutesUntilArrival = arrivalDiff.hours > 0 ? Math.floor(arrivalDiff.minutes % 60) : null;
  
  // Determine flight status
  let status: FlightStatus = 'upcoming';
  
  if (roster.status === 'Cancelled') {
    status = 'cancelled';
  } else if (isPast) {
    status = 'landed';
  } else if (hoursUntilArrival !== null && hoursUntilArrival <= 1) {
    status = 'landing_soon';
  } else if (hoursUntilDeparture !== null && hoursUntilDeparture <= 0 && hoursUntilArrival !== null && hoursUntilArrival > 0) {
    status = 'in_flight';
  } else if (hoursUntilDeparture !== null && hoursUntilDeparture <= 3) {
    status = 'departing_soon';
  }
  
  // Format time remaining strings
  const formattedTimeRemaining = formatTimeRemaining(hoursUntilDeparture, minutesUntilDeparture);
  const formattedArrivalTimeRemaining = formatTimeRemaining(hoursUntilArrival, minutesUntilArrival);
  
  return {
    status,
    hoursUntilDeparture,
    hoursUntilArrival,
    minutesUntilDeparture,
    minutesUntilArrival,
    isToday,
    isPast,
    departureDateTime: departureTime,
    arrivalDateTime,
    formattedTimeRemaining,
    formattedArrivalTimeRemaining,
  };
}

/**
 * Format time remaining as human-readable string
 */
export function formatTimeRemaining(
  hours: number | null,
  minutes: number | null
): string | null {
  if (hours === null || hours < 0) return null;
  
  if (hours === 0 && minutes !== null && minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  
  if (hours === 1 && minutes !== null && minutes > 0) {
    return `${hours} hour, ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  
  if (hours > 0 && minutes !== null && minutes > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  
  return `${hours} hour${hours !== 1 ? 's' : ''}`;
}

/**
 * Check if notification should be sent based on hours before event
 */
export function shouldSendNotification(
  hoursUntil: number | null,
  notificationHours: number[]
): boolean {
  if (hoursUntil === null || hoursUntil < 0) return false;
  
  // Check if we're within any of the notification hour thresholds
  return notificationHours.some((threshold) => {
    // Send notification when we're within 1 hour of the threshold
    // e.g., if threshold is 3 hours, send when hoursUntil is between 2 and 3
    return hoursUntil <= threshold && hoursUntil > threshold - 1;
  });
}

/**
 * Get next notification time for countdown updates
 * Returns hours until next countdown notification should be sent
 */
export function getNextCountdownNotificationTime(
  hoursUntilArrival: number | null,
  intervalHours: number = 3
): number | null {
  if (hoursUntilArrival === null || hoursUntilArrival <= 0) return null;
  
  // Calculate next notification time based on interval
  // e.g., if 10 hours until arrival and interval is 3, next notification is in 3 hours (at 7 hours remaining)
  const nextNotificationHours = Math.floor(hoursUntilArrival / intervalHours) * intervalHours;
  
  return nextNotificationHours > 0 ? nextNotificationHours : null;
}

/**
 * Format timezone-aware time string
 */
export function formatTimezoneTime(
  dateTime: DateTime,
  showTimezone: boolean = true
): string {
  const timeFormat = showTimezone ? 'h:mm a ZZZZ' : 'h:mm a';
  return dateTime.toFormat(timeFormat);
}

/**
 * Get timezone abbreviation for display
 */
export function getTimezoneAbbreviation(dateTime: DateTime): string {
  return dateTime.toFormat('ZZZZ');
}

/**
 * Convert flight time to user's local timezone
 */
export function convertToUserTimezone(
  date: string,
  time: string,
  userTimezone: string = 'local'
): DateTime {
  return DateTime.fromISO(`${date}T${time}`).setZone(userTimezone);
}

/**
 * Get flight status badge color
 */
export function getFlightStatusColor(status: FlightStatus): string {
  switch (status) {
    case 'upcoming':
      return '#3B82F6'; // Blue
    case 'departing_soon':
      return '#F59E0B'; // Amber
    case 'in_flight':
      return '#10B981'; // Green
    case 'landing_soon':
      return '#EF4444'; // Red
    case 'landed':
      return '#6B7280'; // Gray
    case 'cancelled':
      return '#DC2626'; // Red
    default:
      return '#6B7280';
  }
}

