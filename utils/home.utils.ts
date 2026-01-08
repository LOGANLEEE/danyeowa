import { Roster } from '@/lib/supabase/types';
import { Ionicons } from '@expo/vector-icons';
import { DateTime } from 'luxon';

// Mock weather data - will be replaced with real weather API later
export const mockWeather = {
  location: 'London, UK',
  temperature: 8,
  condition: 'Cloudy',
  humidity: 75,
  windSpeed: 12,
};

// Get weather icon name for Ionicons
export function getWeatherIcon(condition: string): keyof typeof Ionicons.glyphMap {
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
}

// Helper function to calculate days until next flight
export function getDaysUntilNextFlight(roster: Roster | null): string {
  if (!roster) return 'N/A';

  const today = DateTime.now().startOf('day');
  const flightDate = DateTime.fromISO(roster.flight_date).startOf('day');
  const diff = flightDate.diff(today, 'days').days;

  if (diff < 0) return 'Past';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `${Math.floor(diff)} days`;
}

// Helper function to count flights this month
export function getFlightsThisMonth(rosters: Roster[]): number {
  const today = DateTime.now();
  const startOfMonth = today.startOf('month').toISODate();
  const endOfMonth = today.endOf('month').toISODate();

  if (!startOfMonth || !endOfMonth) return 0;

  return rosters.filter((roster) => {
    return roster.flight_date >= startOfMonth && roster.flight_date <= endOfMonth;
  }).length;
}

// Helper function to count flights this week
export function getFlightsThisWeek(rosters: Roster[]): number {
  const today = DateTime.now();
  const startOfWeek = today.startOf('week').toISODate();
  const endOfWeek = today.endOf('week').toISODate();

  if (!startOfWeek || !endOfWeek) return 0;

  return rosters.filter((roster) => {
    return roster.flight_date >= startOfWeek && roster.flight_date <= endOfWeek;
  }).length;
}

// Helper function to count upcoming flights
export function getUpcomingFlightsCount(rosters: Roster[]): number {
  const today = DateTime.now().toISODate();
  if (!today) return 0;

  return rosters.filter((roster) => {
    return roster.flight_date >= today && roster.status !== 'Cancelled';
  }).length;
}

// Helper function to get status breakdown
export function getStatusBreakdown(rosters: Roster[]) {
  const today = DateTime.now().toISODate();
  if (!today) return {scheduled: 0, confirmed: 0, completed: 0};

  const upcoming = rosters.filter((r) => r.flight_date >= today);

  return {
    scheduled: upcoming.filter((r) => r.status === 'Scheduled').length,
    confirmed: upcoming.filter((r) => r.status === 'Confirmed').length,
    completed: rosters.filter((r) => r.flight_date < today || r.status === 'Completed').length,
  };
}

// Format arrival time with +1 if next day
export function formatArrivalTime(roster: Roster): string {
  const departureDate = DateTime.fromISO(`${roster.flight_date}T${roster.departure_time}`);
  const arrivalDate = DateTime.fromISO(`${roster.flight_date}T${roster.arrival_time}`);

  if (arrivalDate < departureDate || roster.arrival_time < roster.departure_time) {
    return `${roster.arrival_time}+1`;
  }
  return roster.arrival_time;
}

// Get greeting based on time of day
export function getGreeting(): string {
  const hour = DateTime.now().hour;
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

// Get user display name
export function getUserDisplayName(profile: {full_name?: string; email?: string} | null): string {
  if (profile?.full_name) {
    // Get first name only for a more personal touch
    const firstName = profile.full_name.split(' ')[0];
    return firstName;
  }
  if (profile?.email) {
    return profile.email.split('@')[0];
  }
  return 'There';
}

// Get user initials for avatar
export function getUserInitials(profile: {full_name?: string; email?: string} | null): string {
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
}






