/**
 * Utility functions for country flags and city-to-country mapping
 */

// Common city/country mappings for flight destinations
const cityToCountry: Record<string, string> = {
  // Major cities
  'London': '🇬🇧',
  'LHR': '🇬🇧',
  'LGW': '🇬🇧',
  'STN': '🇬🇧',
  'New York': '🇺🇸',
  'NYC': '🇺🇸',
  'JFK': '🇺🇸',
  'LAX': '🇺🇸',
  'Los Angeles': '🇺🇸',
  'Dubai': '🇦🇪',
  'DXB': '🇦🇪',
  'Singapore': '🇸🇬',
  'SIN': '🇸🇬',
  'Tokyo': '🇯🇵',
  'NRT': '🇯🇵',
  'HND': '🇯🇵',
  'Paris': '🇫🇷',
  'CDG': '🇫🇷',
  'Frankfurt': '🇩🇪',
  'FRA': '🇩🇪',
  'Amsterdam': '🇳🇱',
  'AMS': '🇳🇱',
  'Sydney': '🇦🇺',
  'SYD': '🇦🇺',
  'Melbourne': '🇦🇺',
  'MEL': '🇦🇺',
  'Bangkok': '🇹🇭',
  'BKK': '🇹🇭',
  'Hong Kong': '🇭🇰',
  'HKG': '🇭🇰',
  'Seoul': '🇰🇷',
  'ICN': '🇰🇷',
  'Taipei': '🇹🇼',
  'TPE': '🇹🇼',
  'Mumbai': '🇮🇳',
  'BOM': '🇮🇳',
  'Delhi': '🇮🇳',
  'DEL': '🇮🇳',
  'Istanbul': '🇹🇷',
  'IST': '🇹🇷',
  'Rome': '🇮🇹',
  'FCO': '🇮🇹',
  'Madrid': '🇪🇸',
  'MAD': '🇪🇸',
  'Barcelona': '🇪🇸',
  'BCN': '🇪🇸',
  'Zurich': '🇨🇭',
  'ZRH': '🇨🇭',
  'Vienna': '🇦🇹',
  'VIE': '🇦🇹',
  'Brussels': '🇧🇪',
  'BRU': '🇧🇪',
  'Copenhagen': '🇩🇰',
  'CPH': '🇩🇰',
  'Stockholm': '🇸🇪',
  'ARN': '🇸🇪',
  'Oslo': '🇳🇴',
  'OSL': '🇳🇴',
  'Helsinki': '🇫🇮',
  'HEL': '🇫🇮',
  'Dublin': '🇮🇪',
  'DUB': '🇮🇪',
  'Lisbon': '🇵🇹',
  'LIS': '🇵🇹',
  'Athens': '🇬🇷',
  'ATH': '🇬🇷',
  'Warsaw': '🇵🇱',
  'WAW': '🇵🇱',
  'Prague': '🇨🇿',
  'PRG': '🇨🇿',
  'Budapest': '🇭🇺',
  'BUD': '🇭🇺',
  'Cairo': '🇪🇬',
  'CAI': '🇪🇬',
  'Johannesburg': '🇿🇦',
  'JNB': '🇿🇦',
  'Cape Town': '🇿🇦',
  'CPT': '🇿🇦',
  'Nairobi': '🇰🇪',
  'NBO': '🇰🇪',
  'Casablanca': '🇲🇦',
  'CMN': '🇲🇦',
  'Lagos': '🇳🇬',
  'LOS': '🇳🇬',
  'São Paulo': '🇧🇷',
  'GRU': '🇧🇷',
  'Rio de Janeiro': '🇧🇷',
  'GIG': '🇧🇷',
  'Buenos Aires': '🇦🇷',
  'EZE': '🇦🇷',
  'Santiago': '🇨🇱',
  'SCL': '🇨🇱',
  'Lima': '🇵🇪',
  'LIM': '🇵🇪',
  'Bogotá': '🇨🇴',
  'BOG': '🇨🇴',
  'Panama City': '🇵🇦',
  'PTY': '🇵🇦',
  'Mexico City': '🇲🇽',
  'MEX': '🇲🇽',
  'Toronto': '🇨🇦',
  'YYZ': '🇨🇦',
  'Vancouver': '🇨🇦',
  'YVR': '🇨🇦',
  'Montreal': '🇨🇦',
  'YUL': '🇨🇦',
  'Beijing': '🇨🇳',
  'PEK': '🇨🇳',
  'Shanghai': '🇨🇳',
  'PVG': '🇨🇳',
  'Guangzhou': '🇨🇳',
  'CAN': '🇨🇳',
  'Manila': '🇵🇭',
  'MNL': '🇵🇭',
  'Jakarta': '🇮🇩',
  'CGK': '🇮🇩',
  'Kuala Lumpur': '🇲🇾',
  'KUL': '🇲🇾',
  'Ho Chi Minh City': '🇻🇳',
  'SGN': '🇻🇳',
  'Hanoi': '🇻🇳',
  'HAN': '🇻🇳',
  'Dhaka': '🇧🇩',
  'DAC': '🇧🇩',
  'Colombo': '🇱🇰',
  'CMB': '🇱🇰',
  'Karachi': '🇵🇰',
  'KHI': '🇵🇰',
  'Islamabad': '🇵🇰',
  'ISB': '🇵🇰',
  'Lahore': '🇵🇰',
  'LHE': '🇵🇰',
  'Tehran': '🇮🇷',
  'IKA': '🇮🇷',
  'Riyadh': '🇸🇦',
  'RUH': '🇸🇦',
  'Jeddah': '🇸🇦',
  'JED': '🇸🇦',
  'Doha': '🇶🇦',
  'DOH': '🇶🇦',
  'Kuwait': '🇰🇼',
  'KWI': '🇰🇼',
  'Kuwait City': '🇰🇼',
  'Bahrain': '🇧🇭',
  'BAH': '🇧🇭',
  'Manama': '🇧🇭',
  'Abu Dhabi': '🇦🇪',
  'AUH': '🇦🇪',
  'Muscat': '🇴🇲',
  'MCT': '🇴🇲',
  'Tel Aviv': '🇮🇱',
  'TLV': '🇮🇱',
  'Beirut': '🇱🇧',
  'BEY': '🇱🇧',
  'Amman': '🇯🇴',
  'AMM': '🇯🇴',
  'Baghdad': '🇮🇶',
  'BGW': '🇮🇶',
  'Damascus': '🇸🇾',
  'DAM': '🇸🇾',
};

/**
 * Get country flag emoji from destination string
 * @param destination - City name, airport code, or country name
 * @returns Flag emoji or ✈️ as fallback
 */
export function getCountryFlag(destination: string | null | undefined): string {
  if (!destination) return '✈️';
  
  const normalized = destination.trim();
  
  // Direct match
  if (cityToCountry[normalized]) {
    return cityToCountry[normalized];
  }
  
  // Case-insensitive match
  const lowerNormalized = normalized.toLowerCase();
  for (const [key, flag] of Object.entries(cityToCountry)) {
    if (key.toLowerCase() === lowerNormalized) {
      return flag;
    }
  }
  
  // Partial match (e.g., "London, UK" -> "London")
  for (const [key, flag] of Object.entries(cityToCountry)) {
    if (normalized.toLowerCase().includes(key.toLowerCase()) || 
        key.toLowerCase().includes(normalized.toLowerCase())) {
      return flag;
    }
  }
  
  // Default fallback
  return '✈️';
}

/**
 * Get multiple flags for a date (if multiple destinations)
 * @param destinations - Array of destination strings
 * @returns Array of unique flags
 */
export function getFlagsForDestinations(destinations: (string | null | undefined)[]): string[] {
  const flags = destinations
    .map((dest) => getCountryFlag(dest))
    .filter((flag) => flag !== '✈️');
  
  // Return unique flags
  return Array.from(new Set(flags));
}





