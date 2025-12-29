# Add Monthly Flights Feature - Requirements & Functionality Summary

## Purpose
The "Add Monthly Flights" feature allows cabin crew members to efficiently add multiple flight rosters for an entire month at once using a calendar-based interface. This streamlines the process of entering monthly schedules instead of adding flights one by one.

## Core Functionalities

### 1. **Month Selection & Navigation**
- Display calendar grid for selected month
- Navigate between months (previous/next)
- Jump to current month ("Today" button)
- Visual month/year display

### 2. **Flight Code Prefix Management**
- Input field for airline code prefix (e.g., "EK", "SQ", "CX")
- Auto-save prefix preference to secure storage
- Auto-load saved prefix on screen open
- Prefix is prepended to flight numbers when saving (e.g., "EK 321")
- Visual indicator when prefix is set

### 3. **Calendar-Based Flight Entry**
- **Calendar Grid**: Visual representation of month with clickable days
- **Date Selection**: Tap dates to add/edit flights
- **Visual Indicators**:
  - Days with flights highlighted
  - Days with return flights highlighted differently
  - Today's date highlighted
  - Selected date highlighted
  - Country flags for destinations
  - Multiple flights indicator

### 4. **Flight Entry Management**
- **Add Flights**: 
  - Tap calendar dates to create new flight entries
  - "Add Row" button to quickly add flight with default date
- **Edit Flights**:
  - Tap existing flight date to edit
  - Inline editing of flight numbers
  - Toggle between Depart/Return flight types
- **Remove Flights**: Delete button on each flight row
- **Duplicate Flights**: Copy flight to next day

### 5. **Flight Data Structure**
Each flight entry contains:
- **Date**: Flight date (YYYY-MM-DD)
- **Flight Number**: Numeric part (e.g., "321")
- **Flight Type**: Depart or Return
- **Departure Time**: Default "08:00"
- **Arrival Time**: Default "14:00"
- **Return Flight** (optional, for Depart flights only):
  - Return date (must be after depart date)
  - Return flight number
  - Return departure/arrival times

### 6. **Date Conflict Prevention**
- Only one flight per day allowed
- Validation prevents:
  - Multiple flights on same date
  - Return date conflicts
  - Invalid date selections
- Alert messages for conflicts

### 7. **Return Flight Handling**
- For "Depart" flights, optional return flight can be added
- Return date must be after depart date
- Tap calendar date after depart date to set return
- Visual indicator for valid return date ranges

### 8. **Bulk Save Functionality**
- Save all flights at once
- Converts flight entries to roster format
- Uses `createMultipleRosters` from rosters store
- Handles partial success (some flights saved, some failed)
- Success/error feedback with counts
- Auto-refresh rosters after save
- Navigate back on success

### 9. **Existing Roster Loading**
- Auto-load existing rosters for selected month
- Convert rosters to flight entries for editing
- Visual animation for newly loaded flights
- Pre-fill flight data from existing rosters

### 10. **Keyboard & Input Handling**
- Keyboard-aware scrolling
- Auto-scroll to focused input
- Input position tracking
- Platform-specific keyboard behavior (iOS/Android)
- Number pad for flight number inputs

### 11. **UI/UX Features**
- Dark mode support
- Themed components (ThemedView, ThemedText, ThemedInput)
- Loading states
- Error messages
- Empty states
- Validation feedback
- Accessibility labels

## Technical Implementation

### Files Structure
- **Screen**: `app/schedule/add-monthly.tsx` (main component)
- **Components**: `components/add-monthly.components.tsx`
  - `MonthSelector`: Month navigation UI
  - `PrefixInput`: Airline code prefix input
  - `CalendarDay`: Individual calendar day component
- **Hooks**: `hooks/add-monthly.hooks.ts`
  - `useFlightPrefix`: Manages prefix state and persistence
  - `useRostersLoader`: Loads existing rosters for month
- **Utils**: `utils/add-monthly.utils.ts`
  - Flight entry type definitions
  - Date validation and conversion
  - Flight entry creation and management
  - Roster conversion utilities
- **Layout**: `app/schedule/_layout.tsx` (route configuration)
- **Tests**: `__tests__/app/(tabs)/schedule/add-monthly.test.tsx`

### Data Flow
1. User opens screen → Load saved prefix → Load rosters for month
2. User selects month → Load rosters for that month
3. User taps date → Create/edit flight entry
4. User enters flight data → Update flight entry state
5. User saves → Convert flights to rosters → Bulk create → Refresh → Navigate back

### State Management
- Local state for flights array
- Local state for selected month
- Local state for editing/flags
- Zustand store for rosters operations
- Secure storage for prefix preference

### Integration Points
- **Rosters Store**: `useRostersStore()` for CRUD operations
- **Secure Storage**: Prefix persistence
- **Navigation**: Expo Router for screen navigation
- **Date Handling**: Luxon for date operations
- **Country Flags**: `getFlagsForDestinations` utility

## User Flow
1. Navigate to "Add Monthly" screen (from Schedule tab header button)
2. Select month to add flights for
3. Enter/confirm airline code prefix
4. Tap calendar dates or use "Add Row" to create flights
5. Enter flight numbers for each flight
6. Optionally add return flights for depart flights
7. Review all flights in list
8. Click "Save X Flights" button
9. Confirm success message
10. Automatically navigate back to schedule

## Edge Cases Handled
- Date conflicts (multiple flights same day)
- Invalid date selections
- Return date before depart date
- Empty flight entries
- Partial save failures
- Component unmounting during async operations
- Keyboard visibility and scrolling
- Month boundary navigation
- Existing roster loading and conversion

