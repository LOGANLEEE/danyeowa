# 🔍 Roaster Me - Comprehensive Audit & Improvement Plan

## 📋 Executive Summary

**App Purpose**: Cabin crew can add rosters and invite family/friends to stay connected. Sub-users receive notifications about flights (hours until landing, status updates, etc.) to maintain deeper connections.

**Current State**: Basic roster management app with single-user functionality. Missing all social/invitation features and notification system.

---

## 🖥️ Screen-by-Screen Analysis

### 1. **Auth Flow** (`app/auth/`)
#### Current Implementation ✅
- ✅ OTP-based authentication
- ✅ Biometric authentication support
- ✅ Welcome screen
- ✅ Login screen
- ✅ Signup screen
- ✅ Verify OTP screen
- ✅ Secure session storage

#### Issues & Gaps ❌
- ❌ No social login (intentional per rules, but may need reconsideration for family members)
- ❌ No invitation code system for family/friends
- ❌ No role distinction (cabin crew vs. family member)

**Status**: ✅ **Functional** - No critical issues, but missing invitation flow

---

### 2. **Onboarding** (`app/onboarding/`)
#### Current Implementation ✅
- ✅ Welcome screen
- ✅ Feature tour
- ✅ Profile setup

#### Issues & Gaps ❌
- ❌ No invitation acceptance flow
- ❌ No role selection (cabin crew vs. family member)
- ❌ No connection to existing user's roster

**Status**: ✅ **Functional** - Works for main users, missing sub-user flow

---

### 3. **Home Screen** (`app/(tabs)/home.tsx`)
#### Current Implementation ✅
- ✅ Shows upcoming flight
- ✅ Weather display (mock data)
- ✅ Quick info cards (next flight, monthly flights, timezone)
- ✅ Recent activity placeholder

#### Issues & Gaps ❌
- ❌ **CRITICAL**: Only shows user's own rosters (no shared rosters)
- ❌ Weather is mock data (not real API)
- ❌ No countdown timer for "hours until landing"
- ❌ No real-time flight status updates
- ❌ No notifications badge/indicator
- ❌ Recent activity is placeholder (no actual data)
- ❌ No way to see which family members are tracking this flight

**Status**: ⚠️ **Partially Functional** - Missing core social features

---

### 4. **Schedule Screen** (`app/(tabs)/schedule.tsx`)
#### Current Implementation ✅
- ✅ Calendar view with rosters
- ✅ Double-tap to add flight
- ✅ Monthly roster addition screen
- ✅ Flight code prefix customization
- ✅ Visual indicators for flights
- ✅ Flight details display

#### Issues & Gaps ❌
- ❌ **CRITICAL**: Only shows user's own rosters
- ❌ No way to share roster with family members
- ❌ No indication of who can see each roster
- ❌ No real-time updates when rosters change
- ❌ No notification when family member adds/updates roster
- ❌ No bulk sharing options

**Status**: ⚠️ **Partially Functional** - Missing sharing capabilities

---

### 5. **Profile Screen** (`app/(tabs)/profile.tsx`)
#### Current Implementation ✅
- ✅ Profile display
- ✅ Edit profile modal
- ✅ Settings section (placeholders)
- ✅ Sign out functionality

#### Issues & Gaps ❌
- ❌ **CRITICAL**: No "My Connections" or "Family Members" section
- ❌ No invitation management (send invites, view pending)
- ❌ No notification preferences (settings are placeholders)
- ❌ No privacy settings
- ❌ No way to see who's tracking your rosters
- ❌ No role indicator (cabin crew vs. family member)

**Status**: ⚠️ **Partially Functional** - Missing all social features

---

## 🗄️ Database Schema Gaps

### Current Tables
1. ✅ `profiles` - User profiles
2. ✅ `rosters` - Flight rosters (user_id only)

### Missing Tables (Required for Social Features)

#### 1. **`connections` / `relationships`** ❌
```sql
-- Purpose: Track relationships between users
-- Fields needed:
- id (UUID, primary key)
- user_id (UUID, foreign key to profiles) -- The cabin crew member
- connected_user_id (UUID, foreign key to profiles) -- Family/friend
- status (TEXT: 'pending' | 'accepted' | 'blocked')
- role (TEXT: 'family' | 'friend' | 'colleague')
- invited_by (UUID, foreign key to profiles)
- invitation_token (TEXT, unique) -- For invite links
- created_at, updated_at (TIMESTAMPTZ)
```

#### 2. **`shared_rosters`** ❌
```sql
-- Purpose: Track which rosters are shared with which users
-- Fields needed:
- id (UUID, primary key)
- roster_id (UUID, foreign key to rosters)
- shared_with_user_id (UUID, foreign key to profiles)
- can_edit (BOOLEAN, default false) -- Family can view, but maybe not edit
- shared_at (TIMESTAMPTZ)
- created_at, updated_at (TIMESTAMPTZ)
```

#### 3. **`notifications`** ❌
```sql
-- Purpose: Store notification history and preferences
-- Fields needed:
- id (UUID, primary key)
- user_id (UUID, foreign key to profiles)
- type (TEXT: 'flight_departure' | 'flight_arrival' | 'roster_update' | 'connection_request' | etc.)
- title (TEXT)
- body (TEXT)
- data (JSONB) -- Additional notification data
- read (BOOLEAN, default false)
- created_at (TIMESTAMPTZ)
```

#### 4. **`notification_preferences`** ❌
```sql
-- Purpose: User preferences for notification types
-- Fields needed:
- id (UUID, primary key)
- user_id (UUID, foreign key to profiles, unique)
- flight_departure_enabled (BOOLEAN, default true)
- flight_arrival_enabled (BOOLEAN, default true)
- hours_before_departure (INTEGER, default 2) -- Notify 2 hours before
- hours_before_arrival (INTEGER, default 1) -- Notify 1 hour before landing
- roster_update_enabled (BOOLEAN, default true)
- connection_request_enabled (BOOLEAN, default true)
- push_token (TEXT) -- Expo push notification token
- created_at, updated_at (TIMESTAMPTZ)
```

#### 5. **`roster_updates` / `roster_history`** ❌ (Optional but recommended)
```sql
-- Purpose: Track changes to rosters for audit and notifications
-- Fields needed:
- id (UUID, primary key)
- roster_id (UUID, foreign key to rosters)
- changed_by (UUID, foreign key to profiles)
- change_type (TEXT: 'created' | 'updated' | 'deleted' | 'status_changed')
- old_values (JSONB)
- new_values (JSONB)
- created_at (TIMESTAMPTZ)
```

---

## 🔔 Notification System Gaps

### Current State ❌
- ❌ **NO notification system implemented**
- ❌ No `expo-notifications` package installed
- ❌ No push notification setup
- ❌ No background task scheduling
- ❌ No notification preferences UI
- ❌ No notification history

### Required Implementation

#### 1. **Package Installation** ❌
```bash
npx expo install expo-notifications
```

#### 2. **Notification Types Needed**
- ✅ Flight departure reminders (X hours before)
- ✅ Flight arrival notifications (X hours before landing)
- ✅ Real-time countdown ("Flight lands in 2 hours")
- ✅ Roster updates (when cabin crew adds/updates flight)
- ✅ Connection requests (when someone wants to track your rosters)
- ✅ Connection accepted (when invitation is accepted)

#### 3. **Background Tasks** ❌
- ❌ Calculate time until flight departure/arrival
- ❌ Schedule notifications based on flight times
- ❌ Update notification preferences
- ❌ Handle timezone conversions

#### 4. **Real-time Updates** ❌
- ❌ Supabase Realtime subscriptions for roster changes
- ❌ Push notifications when rosters are updated
- ❌ Live countdown timers

---

## 🔄 Real-time & Data Flow Gaps

### Current State ❌
- ❌ No Supabase Realtime subscriptions
- ❌ No live updates when rosters change
- ❌ No shared roster fetching logic
- ❌ All data is user-specific only

### Required Implementation

#### 1. **Supabase Realtime Subscriptions** ❌
```typescript
// Need to add to rosters store:
- subscribeToRosters() - Listen for roster changes
- subscribeToSharedRosters() - Listen for shared roster updates
- subscribeToNotifications() - Listen for new notifications
```

#### 2. **Shared Roster Fetching** ❌
```typescript
// Need to modify fetchRosters to include:
- User's own rosters
- Rosters shared with user (from shared_rosters table)
- Filter and merge logic
```

#### 3. **Flight Status Calculation** ❌
```typescript
// Need utility functions:
- calculateHoursUntilDeparture(roster)
- calculateHoursUntilArrival(roster)
- getFlightStatus(roster) // 'upcoming' | 'in-flight' | 'landed'
- formatTimeRemaining(hours, minutes)
```

---

## 🎯 Critical Missing Features

### 1. **Invitation System** ❌
- ❌ Send invitation (email/SMS)
- ❌ Invitation token/code system
- ❌ Accept invitation flow
- ❌ View pending invitations
- ❌ Resend/cancel invitations

### 2. **Connection Management** ❌
- ❌ View connected users (family/friends)
- ❌ Remove connections
- ❌ Block users
- ❌ Connection status (pending/accepted)

### 3. **Roster Sharing** ❌
- ❌ Share specific roster with specific users
- ❌ Share all rosters with connection
- ❌ Unshare rosters
- ❌ View who can see each roster

### 4. **Role System** ❌
- ❌ Distinguish cabin crew (main user) vs. family/friend (sub-user)
- ❌ Different permissions (family can view, not edit)
- ❌ Role-based UI differences

### 5. **Flight Tracking & Notifications** ❌
- ❌ Real-time countdown timers
- ❌ Background notification scheduling
- ❌ "Hours until landing" calculations
- ❌ Flight status updates (departed, in-flight, landed)
- ❌ Timezone handling for international flights

---

## 📱 UI/UX Improvements Needed

### 1. **Home Screen**
- ❌ Add "Shared Rosters" section
- ❌ Add countdown timer widget
- ❌ Add notification badge
- ❌ Show which family members are tracking flights
- ❌ Real weather API integration

### 2. **Schedule Screen**
- ❌ Add "Share" button on each roster
- ❌ Show sharing status (who can see this)
- ❌ Add "Shared Rosters" filter/view

### 3. **Profile Screen**
- ❌ Add "Connections" tab/section
- ❌ Add "Send Invitation" button
- ❌ Add notification preferences screen
- ❌ Show role (Cabin Crew / Family Member)

### 4. **New Screens Needed**
- ❌ `app/(tabs)/connections.tsx` - Manage connections
- ❌ `app/(tabs)/notifications.tsx` - Notification center
- ❌ `app/connections/invite.tsx` - Send invitation
- ❌ `app/connections/accept.tsx` - Accept invitation (deep link)
- ❌ `app/settings/notifications.tsx` - Notification preferences

---

## 🐛 Bugs & Issues Found

### 1. **Data Isolation** ⚠️
- **Issue**: RLS policies only allow users to see their own rosters
- **Impact**: Cannot implement sharing without schema changes
- **Fix**: Need new RLS policies for shared rosters

### 2. **No Error Boundaries** ⚠️
- **Issue**: No error boundaries for graceful error handling
- **Impact**: App crashes on unexpected errors
- **Fix**: Add React error boundaries

### 3. **Mock Data** ⚠️
- **Issue**: Weather data is hardcoded
- **Impact**: Not useful for real users
- **Fix**: Integrate real weather API (OpenWeatherMap, etc.)

### 4. **No Offline Support** ⚠️
- **Issue**: App requires internet connection
- **Impact**: Poor UX when offline
- **Fix**: Add offline caching with AsyncStorage

### 5. **No Loading States** ⚠️
- **Issue**: Some operations don't show loading indicators
- **Impact**: Users don't know if action is processing
- **Fix**: Add loading states to all async operations

---

## ❓ Questions for Clarification

### 1. **Invitation Flow**
- **Q**: How should invitations work?
  - Email invitation with link?
  - SMS with code?
  - In-app invitation code?
  - All of the above?
- **Recommendation**: Email + in-app code for flexibility

### 2. **Permissions & Roles**
- **Q**: What can family members do?
  - View rosters only?
  - Comment/react to rosters?
  - Edit rosters (if allowed)?
  - See all rosters or select which ones?
- **Recommendation**: View-only by default, optional edit permission

### 3. **Notification Timing**
- **Q**: When should notifications be sent?
  - How many hours before departure?
  - How many hours before arrival?
  - Real-time countdown updates?
  - Only for shared rosters or all rosters?
- **Recommendation**: 
  - 2 hours before departure
  - 1 hour before arrival
  - Real-time countdown for active flights
  - Configurable per user

### 4. **Roster Sharing Granularity**
- **Q**: How should sharing work?
  - Share all rosters automatically when connection is made?
  - Share individual rosters manually?
  - Share by date range?
  - Share future rosters only?
- **Recommendation**: Manual per-roster sharing with "share all future" option

### 5. **Connection Limits**
- **Q**: Should there be limits?
  - Max number of connections?
  - Max number of people who can track a roster?
  - Family vs. friend distinction?
- **Recommendation**: No hard limits, but distinguish family/friend roles

### 6. **Notification Frequency**
- **Q**: How often should countdown notifications update?
  - Every hour?
  - Every 30 minutes?
  - Only at specific milestones (24h, 12h, 6h, 2h, 1h)?
- **Recommendation**: Milestone-based (24h, 12h, 6h, 2h, 1h, 30min, landing)

### 7. **Timezone Handling**
- **Q**: How should timezones be handled?
  - Use user's local timezone?
  - Use flight origin/destination timezone?
  - Show both?
- **Recommendation**: User's local timezone with origin/destination shown

---

## 📊 Priority Matrix

### 🔴 **P0 - Critical (Must Have)**
1. Database schema for connections & shared rosters
2. Invitation system (send/accept)
3. Shared roster fetching logic
4. Basic notification system setup
5. RLS policies for shared data

### 🟠 **P1 - High Priority (Should Have)**
1. Notification preferences UI
2. Connection management screen
3. Roster sharing UI
4. Flight countdown calculations
5. Real-time roster updates

### 🟡 **P2 - Medium Priority (Nice to Have)**
1. Background notification scheduling
2. Notification history
3. Role-based UI differences
4. Weather API integration
5. Offline support

### 🟢 **P3 - Low Priority (Future)**
1. Roster comments/reactions
2. Flight status tracking (delayed, cancelled)
3. Analytics/insights
4. Export rosters
5. Calendar sync

---

## 🚀 Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
1. ✅ Create database migrations for connections & shared_rosters
2. ✅ Update RLS policies
3. ✅ Create notification_preferences table
4. ✅ Install expo-notifications
5. ✅ Set up basic notification infrastructure

### Phase 2: Social Features (Week 3-4)
1. ✅ Invitation system (send/accept)
2. ✅ Connection management
3. ✅ Shared roster fetching
4. ✅ Roster sharing UI
5. ✅ Connection management screen

### Phase 3: Notifications (Week 5-6)
1. ✅ Notification preferences
2. ✅ Flight countdown calculations
3. ✅ Background notification scheduling
4. ✅ Notification history
5. ✅ Real-time updates

### Phase 4: Polish (Week 7-8)
1. ✅ UI/UX improvements
2. ✅ Error handling
3. ✅ Testing
4. ✅ Performance optimization
5. ✅ Documentation

---

## 📝 Next Steps

1. **Answer clarification questions** (see Questions section above)
2. **Review and approve this plan**
3. **Start with Phase 1: Foundation**
4. **Iterate based on feedback**

---

**Last Updated**: 2024
**Status**: 🔴 **Needs Implementation** - Core social features missing

