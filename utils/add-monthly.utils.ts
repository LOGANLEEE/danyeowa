import { Roster } from '@/lib/supabase/types';
import { DateTime } from 'luxon';

/**
 * Flight entry type for the add monthly feature
 */
export type FlightEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  flightNumber: string; // Numeric part only (e.g., "321")
  flightType: 'Depart' | 'Return';
  departureTime: string; // HH:mm format
  arrivalTime: string; // HH:mm format
  returnDate?: string | null; // YYYY-MM-DD, only for Depart flights
  returnFlightNumber?: string | null; // Numeric part only
  returnDepartureTime?: string | null; // HH:mm format
  returnArrivalTime?: string | null; // HH:mm format
};

/**
 * Create a new flight entry with default values
 */
export function createFlightEntry(
  date: string,
  flightNumber: string = '',
  flightType: 'Depart' | 'Return' = 'Depart'
): FlightEntry {
  return {
    id: `flight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    date,
    flightNumber,
    flightType,
    departureTime: '08:00',
    arrivalTime: '14:00',
    returnDate: null,
    returnFlightNumber: null,
    returnDepartureTime: null,
    returnArrivalTime: null,
  };
}

/**
 * Validate flight entry
 */
export function validateFlightEntry(entry: FlightEntry): { valid: boolean; error?: string } {
  if (!entry.date) {
    return { valid: false, error: 'Date is required' };
  }

  if (!entry.flightNumber.trim()) {
    return { valid: false, error: 'Flight number is required' };
  }

  // Validate date format
  const dateObj = DateTime.fromISO(entry.date);
  if (!dateObj.isValid) {
    return { valid: false, error: 'Invalid date format' };
  }

  // Validate return date if present
  if (entry.returnDate) {
    const returnDateObj = DateTime.fromISO(entry.returnDate);
    if (!returnDateObj.isValid) {
      return { valid: false, error: 'Invalid return date format' };
    }
    if (returnDateObj <= dateObj) {
      return { valid: false, error: 'Return date must be after depart date' };
    }
  }

  // Validate time formats
  const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(entry.departureTime)) {
    return { valid: false, error: 'Invalid departure time format' };
  }
  if (!timeRegex.test(entry.arrivalTime)) {
    return { valid: false, error: 'Invalid arrival time format' };
  }

  if (entry.returnDate && entry.returnDepartureTime && !timeRegex.test(entry.returnDepartureTime)) {
    return { valid: false, error: 'Invalid return departure time format' };
  }
  if (entry.returnDate && entry.returnArrivalTime && !timeRegex.test(entry.returnArrivalTime)) {
    return { valid: false, error: 'Invalid return arrival time format' };
  }

  return { valid: true };
}

/**
 * Check if a date has a flight entry
 */
export function dateHasFlight(entries: FlightEntry[], date: string): boolean {
  return entries.some((entry) => entry.date === date);
}

/**
 * Check if a date has a return flight
 */
export function dateHasReturnFlight(entries: FlightEntry[], date: string): boolean {
  return entries.some((entry) => entry.returnDate === date);
}

/**
 * Get flight entry for a specific date
 */
export function getFlightEntryForDate(entries: FlightEntry[], date: string): FlightEntry | null {
  return entries.find((entry) => entry.date === date) || null;
}

/**
 * Check for date conflicts
 */
export function checkDateConflict(
  entries: FlightEntry[],
  date: string,
  excludeId?: string
): { hasConflict: boolean; error?: string } {
  // Check if date already has a flight (excluding current entry if editing)
  const existingEntry = entries.find(
    (entry) => entry.date === date && entry.id !== excludeId
  );
  if (existingEntry) {
    return { hasConflict: true, error: 'Only one flight per day is allowed' };
  }

  // Check if date is used as a return date
  const returnConflict = entries.find(
    (entry) => entry.returnDate === date && entry.id !== excludeId
  );
  if (returnConflict) {
    return { hasConflict: true, error: 'This date is already used as a return date' };
  }

  return { hasConflict: false };
}

/**
 * Convert flight entry to roster format
 */
export function flightEntryToRoster(
  entry: FlightEntry,
  prefix: string | null
): Array<{
  flight_code: string;
  route: string;
  destination: string;
  flight_date: string;
  departure_time: string;
  arrival_time: string;
  origin?: string | null;
  aircraft_type?: string | null;
  flight_type: 'Depart' | 'Return';
  status: Roster['status'];
}> {
  const rosters: Array<{
    flight_code: string;
    route: string;
    destination: string;
    flight_date: string;
    departure_time: string;
    arrival_time: string;
    origin?: string | null;
    aircraft_type?: string | null;
    flight_type: 'Depart' | 'Return';
    status: Roster['status'];
  }> = [];

  // Format flight code with prefix
  let flightCode = entry.flightNumber.trim();
  if (prefix && !flightCode.includes(' ')) {
    if (/^\d+$/.test(flightCode)) {
      flightCode = `${prefix} ${flightCode}`;
    }
  }

  // Main flight (depart or return)
  rosters.push({
    flight_code: flightCode.toUpperCase(),
    route: 'TBD', // To be determined - user can edit later
    destination: 'TBD', // To be determined - user can edit later
    flight_date: entry.date,
    departure_time: entry.departureTime,
    arrival_time: entry.arrivalTime,
    origin: null,
    aircraft_type: null,
    flight_type: entry.flightType,
    status: 'Scheduled',
  });

  // Return flight (if present and entry is Depart type)
  if (entry.flightType === 'Depart' && entry.returnDate && entry.returnFlightNumber) {
    let returnFlightCode = entry.returnFlightNumber.trim();
    if (prefix && !returnFlightCode.includes(' ')) {
      if (/^\d+$/.test(returnFlightCode)) {
        returnFlightCode = `${prefix} ${returnFlightCode}`;
      }
    }

    rosters.push({
      flight_code: returnFlightCode.toUpperCase(),
      route: 'TBD',
      destination: 'TBD',
      flight_date: entry.returnDate,
      departure_time: entry.returnDepartureTime || '08:00',
      arrival_time: entry.returnArrivalTime || '14:00',
      origin: null,
      aircraft_type: null,
      flight_type: 'Return',
      status: 'Scheduled',
    });
  }

  return rosters;
}

/**
 * Convert roster to flight entry
 */
export function rosterToFlightEntry(roster: Roster, prefix: string | null): FlightEntry | null {
  // Extract flight number (remove prefix if present)
  let flightNumber = roster.flight_code;
  if (prefix) {
    const prefixPattern = new RegExp(`^${prefix}\\s+`, 'i');
    flightNumber = flightNumber.replace(prefixPattern, '').trim();
  }

  // Find return flight if this is a depart flight
  // This would need to be done by the caller with access to all rosters
  // For now, just return the single flight entry

  return {
    id: `flight_${roster.id}`,
    date: roster.flight_date,
    flightNumber,
    flightType: roster.flight_type,
    departureTime: roster.departure_time,
    arrivalTime: roster.arrival_time,
    returnDate: null,
    returnFlightNumber: null,
    returnDepartureTime: null,
    returnArrivalTime: null,
  };
}

/**
 * Convert multiple rosters to flight entries (handles depart/return pairs)
 */
export function rostersToFlightEntries(rosters: Roster[], prefix: string | null): FlightEntry[] {
  const entries: FlightEntry[] = [];
  const processedRosterIds = new Set<string>();

  for (const roster of rosters) {
    if (processedRosterIds.has(roster.id)) continue;

    // Extract flight number
    let flightNumber = roster.flight_code;
    if (prefix) {
      const prefixPattern = new RegExp(`^${prefix}\\s+`, 'i');
      flightNumber = flightNumber.replace(prefixPattern, '').trim();
    }

    // Check if there's a return flight on the next day or within a few days
    let returnFlight: Roster | null = null;
    if (roster.flight_type === 'Depart') {
      const departDate = DateTime.fromISO(roster.flight_date);
      returnFlight = rosters.find((r) => {
        if (r.id === roster.id || processedRosterIds.has(r.id)) return false;
        if (r.flight_type !== 'Return') return false;
        const returnDate = DateTime.fromISO(r.flight_date);
        // Return flight should be within 7 days of depart
        const daysDiff = returnDate.diff(departDate, 'days').days;
        return daysDiff > 0 && daysDiff <= 7;
      }) || null;
    }

    const entry: FlightEntry = {
      id: `flight_${roster.id}`,
      date: roster.flight_date,
      flightNumber,
      flightType: roster.flight_type,
      departureTime: roster.departure_time,
      arrivalTime: roster.arrival_time,
      returnDate: null,
      returnFlightNumber: null,
      returnDepartureTime: null,
      returnArrivalTime: null,
    };

    if (returnFlight) {
      let returnFlightNumber = returnFlight.flight_code;
      if (prefix) {
        const prefixPattern = new RegExp(`^${prefix}\\s+`, 'i');
        returnFlightNumber = returnFlightNumber.replace(prefixPattern, '').trim();
      }

      entry.returnDate = returnFlight.flight_date;
      entry.returnFlightNumber = returnFlightNumber;
      entry.returnDepartureTime = returnFlight.departure_time;
      entry.returnArrivalTime = returnFlight.arrival_time;

      processedRosterIds.add(returnFlight.id);
    }

    entries.push(entry);
    processedRosterIds.add(roster.id);
  }

  return entries;
}

/**
 * Get month start and end dates
 */
export function getMonthDateRange(month: DateTime): { startDate: string; endDate: string } {
  const start = month.startOf('month');
  const end = month.endOf('month');
  return {
    startDate: start.toISODate() || '',
    endDate: end.toISODate() || '',
  };
}

/**
 * Format date for display
 */
export function formatDateForDisplay(date: string): string {
  const dateObj = DateTime.fromISO(date);
  if (!dateObj.isValid) return date;
  return dateObj.toFormat('EEE, MMM d');
}

/**
 * Check if date is today
 */
export function isToday(date: string): boolean {
  const dateObj = DateTime.fromISO(date);
  if (!dateObj.isValid) return false;
  return dateObj.hasSame(DateTime.now(), 'day');
}

/**
 * Check if date is in the past
 */
export function isPastDate(date: string): boolean {
  const dateObj = DateTime.fromISO(date);
  if (!dateObj.isValid) return false;
  return dateObj < DateTime.now().startOf('day');
}

/**
 * Get valid return date range for a depart date
 */
export function getValidReturnDateRange(departDate: string): { minDate: string; maxDate: string } {
  const depart = DateTime.fromISO(departDate);
  if (!depart.isValid) {
    const now = DateTime.now();
    return {
      minDate: now.plus({ days: 1 }).toISODate() || '',
      maxDate: now.plus({ days: 30 }).toISODate() || '',
    };
  }

  return {
    minDate: depart.plus({ days: 1 }).toISODate() || '',
    maxDate: depart.plus({ days: 30 }).toISODate() || '',
  };
}

