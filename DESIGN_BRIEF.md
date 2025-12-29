# 🎨 Roaster Me - Design Brief

## 📱 App Overview

**Roaster Me** is a React Native mobile application designed for cabin crew members to manage their flight rosters and stay connected with family and friends. The app enables users to track flights, share schedules, receive notifications, and keep loved ones informed about their travel plans.

### Target Users
- **Primary**: Cabin crew members (flight attendants, pilots, etc.)
- **Secondary**: Family members and friends who want to track their loved ones' flights

### Core Features
- Flight roster management (CRUD operations)
- Calendar view with visual flight indicators
- Social connections (family/friends/colleagues)
- Roster sharing (single/week/month/all future flights)
- Push notifications for flight departures/arrivals
- Biometric authentication (Face ID/Touch ID/Fingerprint)
- OTP email verification
- Offline support with sync
- Dark mode support

---

## 🎨 Design System

### Color Palette

#### Primary Colors (Burgundy Theme)
- **Burgundy Primary (Light)**: `#800020`
- **Burgundy Dark**: `#5C0015`
- **Burgundy Light**: `#A0002A`
- **Burgundy Accent**: `#B80035`
- **Burgundy Deep**: `#4A0010`

#### Light Mode
- **Text**: `#11181C`
- **Background**: `#FFFFFF`
- **Tint/Accent**: `#800020` (Burgundy Primary)
- **Icon**: `#687076`
- **Tab Icon Default**: `#687076`
- **Tab Icon Selected**: `#800020`

#### Dark Mode
- **Text**: `#ECEDEE`
- **Background**: `#2A2A2A`
- **Tint/Accent**: `#A0002A` (Burgundy Light)
- **Icon**: `#9BA1A6`
- **Tab Icon Default**: `#9BA1A6`
- **Tab Icon Selected**: `#A0002A`

#### Status Colors
- **Scheduled**: Blue (`#3B82F6` / `#2563EB`)
- **Confirmed**: Burgundy (theme tint)
- **Delayed**: Amber (`#F59E0B` / `#D97706`)
- **Cancelled**: Red (`#EF4444` / `#DC2626`)
- **Completed**: Green (`#10B981` / `#059669`)

### Typography
- **System Font**: iOS uses system-ui, Android uses Roboto
- **Title**: Bold, 3xl-5xl (24-48px)
- **Subtitle**: Medium, base-lg (16-18px)
- **Body**: Regular, base (16px)
- **Caption**: Regular, sm-xs (12-14px)

### Spacing
- **Padding**: 6 (24px) standard, 8 (32px) for headers
- **Margin**: 4 (16px) between sections, 6 (24px) for major sections
- **Border Radius**: 
  - Small: 10-12px (rounded-xl)
  - Medium: 16px (rounded-2xl)
  - Large: 24px (rounded-3xl)
  - Full: 50% (circular)

### Shadows & Elevation
- **Cards**: Subtle shadow with elevation 2-4
- **Buttons**: Shadow-lg with elevation 4-6
- **Modals**: Backdrop blur with semi-transparent overlay

---

## 📱 Screen-by-Screen Design Specifications

### 1. Welcome Screen (`/app/index.tsx`)

**Purpose**: First screen users see when opening the app (if not authenticated)

**Layout**:
- Full-screen animated gradient background (burgundy theme)
- Centered content with vertical spacing
- Fixed action button at bottom

**Components**:
- **AnimatedWelcomeBackground**: Full-screen gradient with animated elements (clouds, plane, coffee beans, particles, waves)
- **Logo/Icon**: 80x80px circular container with white/transparent background, border, backdrop blur
  - Emoji: ✈️ (5xl size)
- **Title**: "Roaster Me" - 4xl, bold, white text with drop shadow
- **Subtitle**: "Your flight roster, perfectly managed" - base size, white with 90% opacity, drop shadow
- **Action Button**: "Start Roaster" - Primary variant, full width, fixed at bottom

**Design Notes**:
- Overlay variant for text (white with shadows for readability)
- Smooth entrance animations
- Background animations run continuously

---

### 2. Login Screen (`/app/auth/login.tsx`)

**Purpose**: User authentication entry point

**Layout**:
- Full-screen animated gradient background
- Scrollable content with keyboard avoidance
- Header at top, form in center

**Components**:
- **AnimatedWelcomeBackground**: Full-screen burgundy gradient
- **ThemedHeader**: 
  - Title: "Welcome Back" (if biometric available) or "Get Started"
  - Subtitle: Contextual message about authentication methods
  - Variant: overlay (white text with shadows)
- **Biometric Login Section** (if available):
  - Section label: "Method 1: Biometric Authentication" (uppercase, tracking-wide)
  - Card: Rounded-xl, border-2 white/30, bg-white/20, backdrop-blur
  - Button: Full-width, flex-row, centered content
    - Icon: Lock-closed (24px, white)
    - Text: "Sign in with [Face ID/Touch ID/Fingerprint]"
    - Email: Smaller text below (80% opacity)
  - Divider: "OR" with horizontal lines
- **OTP Login Section**:
  - Section label: "Method 2: OTP Verification" or "OTP Verification"
  - Label: "Email" (uppercase, tracking-wide)
  - **ThemedInput**: 
    - Placeholder: "your.email@example.com"
    - Border animates on focus (gray → burgundy)
    - Error state: Red border and text
  - Helper text: Small, white 80% opacity
- **ThemedButton**: "Send OTP Code" - Primary variant, full width

**Design Notes**:
- Staggered entrance animations (50ms delays)
- Loading states with activity indicators
- Error states with red text
- Keyboard-aware scrolling

---

### 3. Verify OTP Screen (`/app/auth/verify-otp.tsx`)

**Purpose**: Verify 6-digit OTP code sent via email

**Layout**:
- Full-screen animated gradient background
- Scrollable content
- Header, OTP input, buttons, footer

**Components**:
- **AnimatedWelcomeBackground**: Full-screen burgundy gradient
- **ThemedHeader**:
  - Title: "Verify Code"
  - Subtitle: "We've sent a 6-digit code to"
  - Variant: overlay
- **Email Display**: Base size, semibold, white with shadow
- **OTP Input Grid**:
  - 6 individual input boxes in flex-row
  - Each box: flex-1, h-16, rounded-xl, border-2
  - Border color: White 50% (default), White 100% (filled), Red (error)
  - Background: White 20% (filled), White 10% (empty)
  - Text: 2xl, bold, centered, white
  - Auto-focus and auto-submit on 6 digits
- **Error Message**: Red text with shadow (if invalid code)
- **ThemedButton**: "Verify" - Primary variant, full width
- **Biometric Enable Toggle**:
  - Card: Rounded-xl, border-2 white/30, bg-white/20, backdrop-blur
  - Flex-row layout
  - Text: "Enable [Face ID/Touch ID]" with description
  - Switch: White track, burgundy thumb when enabled
- **Footer**:
  - Text: "Didn't receive the code?"
  - Button: "Resend Code" - Outline variant

**Design Notes**:
- OTP inputs animate in sequence (50ms stagger)
- Auto-submit after 6 digits entered
- Smooth transitions between states

---

### 4. Onboarding Welcome Screen (`/app/onboarding/welcome.tsx`)

**Purpose**: Welcome new users after first login

**Layout**:
- Full-screen animated gradient background
- Centered content
- Action button at bottom

**Components**:
- **AnimatedWelcomeBackground**: Full-screen burgundy gradient
- **Icon Container**: 96x96px (w-24 h-24), circular, bg-white/20, border-2 white/30, backdrop-blur
  - Emoji: ✈️ (6xl)
- **Title**: "Welcome to Roaster Me" - 4xl, bold, white with shadow
- **Description**: Large text, centered, white 90% opacity, with shadow
- **ThemedButton**: "Get Started" - Primary variant, full width

**Design Notes**:
- Similar to welcome screen but with onboarding-specific messaging
- Smooth entrance animations

---

### 5. Profile Setup Screen (`/app/onboarding/profile-setup.tsx`)

**Purpose**: Collect user's name for personalization

**Layout**:
- Full-screen animated gradient background
- Scrollable form
- Header, input, buttons

**Components**:
- **AnimatedWelcomeBackground**: Full-screen burgundy gradient
- **ThemedHeader**:
  - Title: "Let's set up your profile"
  - Subtitle: "Tell us your name so we can personalize your experience"
  - Variant: overlay
- **Form**:
  - Label: "Full Name" (uppercase, tracking-wide, white 90% opacity)
  - **ThemedInput**: 
    - Placeholder: "Enter your full name"
    - Auto-capitalize words
    - Error state support
  - **ThemedButton**: "Continue" - Primary variant, full width
  - **ThemedButton**: "Skip for now" - Outline variant, full width

**Design Notes**:
- Optional step (can be skipped)
- Validation with error messages

---

### 6. Feature Tour Screen (`/app/onboarding/feature-tour.tsx`)

**Purpose**: Introduce key features to new users

**Layout**:
- Full-screen animated gradient background
- Scrollable content
- Feature cards, action button

**Components**:
- **AnimatedWelcomeBackground**: Full-screen burgundy gradient
- **ThemedHeader**:
  - Title: "Discover Roaster Me"
  - Subtitle: "Here's what you can do with Roaster Me"
  - Variant: overlay
- **Feature Cards** (3 cards):
  - Layout: Rounded-xl, border-2 white/30, bg-white/20, backdrop-blur, p-6
  - Flex-row layout with icon and text
  - Icon: Emoji (4xl size)
  - Title: xl, bold, white with shadow
  - Description: base size, white 90% opacity
  - Features:
    1. 📅 "Manage Your Schedule" - "View and organize all your flight rosters in one place"
    2. ✈️ "Track Your Flights" - "Keep track of routes, departure times, and flight status"
    3. 🔔 "Stay Updated" - "Get notified about schedule changes and important updates"
- **ThemedButton**: "Start Using Roaster Me" - Primary variant, full width

**Design Notes**:
- Cards animate in sequence (100ms stagger)
- Clear, concise feature descriptions

---

### 7. Home Screen (`/app/(tabs)/home.tsx`)

**Purpose**: Main dashboard showing flight overview and statistics

**Layout**:
- Scrollable vertical layout
- Header section, hero card, statistics grid, charts

**Components**:

#### Header Section
- **Greeting**: 
  - Label: "Good Morning/Afternoon/Evening" (xs, semibold, uppercase, tracking-wide, gray-500)
  - Title: User's first name (5xl, font-black, leading-none, tracking-tight)
- **User Avatar**:
  - 64x64px circular container
  - Background: Theme tint color
  - Shadow: Tint color with opacity 0.4
  - Content: User initials (xl, font-black, white) or emoji 🦃
  - Online indicator: 16x16px green circle, bottom-right, with border and shadow

#### Hero Flight Card
- **Container**: Rounded-3xl, border, overflow-hidden
- **Background**: Linear gradient (burgundy colors)
- **Weather Badge**: Top-right, rounded-full, bg-white/20, backdrop-blur
  - Icon: Weather icon (16px, white)
  - Temperature: xs, semibold, white
- **Status Badge**: 
  - Rounded-full, colored background with 40% opacity
  - Text: xs, semibold, colored text
  - Statuses: "Departing Soon", "In Flight", "Landing Soon", "Landed", "Cancelled", "Upcoming"
- **Flight Code**: 4xl, bold, white
- **Route**: lg, white 90% opacity
- **Location**: Flex-row with location icon, sm, white 80% opacity
- **Countdown Timer**:
  - Container: Rounded-2xl, bg-white/10, backdrop-blur, p-4
  - Label: xs, medium, white 70% opacity
  - Time: 2xl, bold, white
- **Flight Details Grid**:
  - Flex-row, justify-between
  - Departure/Arrival times with labels
  - Airplane icon in center
- **Additional Info**:
  - Border-top white/20
  - Aircraft type and date with icons

#### Statistics Grid
- **Section Title**: "Quick Stats" - xl, bold
- **Stat Cards** (2x2 grid):
  - Width: (screen width - 48) / 2 - 8
  - Container: Rounded-2xl, p-4, border gray-200/50, bg-white/80, backdrop-blur
  - Icon Container: 40x40px, rounded-xl, colored background 15% opacity
  - Icon: 20px, colored
  - Label: xs, medium, gray-500
  - Value: 2xl, bold, colored
  - Optional: Circular progress indicator (40px) or bar chart
  - Cards:
    1. "This Week" - Shows weekly trend bar chart
    2. "This Month" - Shows circular progress
    3. "Upcoming" - Shows circular progress (green)
    4. "Completed" - Shows circular progress (gray)

#### Weekly Activity Chart
- **Section Title**: "Weekly Activity" - xl, bold
- **Container**: Rounded-2xl, p-5, border, bg-white/80, backdrop-blur
- **Bar Chart**: 
  - Height: 120px
  - Bars: Colored, rounded-4, animated
  - Labels: Day abbreviations below bars
- **Summary Stats**: 
  - Border-top separator
  - Flex-row, justify-between
  - "Total Flights" and "Average/Day" with values

#### Status Overview
- **Section Title**: "Status Overview" - xl, bold
- **Status Cards**:
  - Rounded-2xl, p-4, border colored, bg colored/50
  - Flex-row header with colored dot, label, and count
  - Progress bar below (8px height, colored, animated)

#### Performance Metrics
- **Section Title**: "Performance Metrics" - xl, bold
- **Container**: Rounded-2xl, p-5, border, bg-white/80, backdrop-blur
- **Completion Rate**:
  - Circular progress (60px) with percentage
  - Progress bar below
- **Timezone Info**:
  - Border-top separator
  - Flex-row with icon, timezone name, and current time

**Design Notes**:
- Staggered animations (50-100ms delays)
- Smooth spring animations for charts and progress indicators
- Empty state: Centered icon, message, and call-to-action

---

### 8. Schedule Screen (`/app/(tabs)/schedule.tsx`)

**Purpose**: Calendar view for managing flight rosters

**Layout**:
- Scrollable vertical layout
- Header, calendar, flight list, input modal

**Components**:

#### Header
- **ThemedHeader**:
  - Title: "Schedule"
  - Subtitle: "Tap to view, double tap to add flights 🐔"
  - Right: Calendar icon button (rounded-full, bg-gray-200, p-2)

#### Calendar Container
- **Container**: Rounded-3xl, p-6, border-2 burgundy/30, gradient background, shadow-lg
- **Month Navigation**:
  - Flex-row, justify-between
  - Previous/Next buttons: Rounded-full, bg-white, shadow-sm, p-2
  - Center: Month/Year (xl, bold) with "Today" link below
- **Calendar Component**:
  - Single month view
  - Day cells: 50px height
  - Today: Border-2.5, tint color, shadow
  - Selected: Background tint color, white text
  - Days with flights: Subtle background tint 10%, border tint 40%
  - Active ranges: Highlighted dates

#### Flight Code Input Modal
- **Overlay**: Black 50% opacity
- **Container**: Rounded-t-3xl, p-6, pb-8, themed background
- **Header**:
  - Title: "Add Flight" - xl, semibold
  - Date: sm, gray-500
  - Close button: Top-right
- **Form**:
  - **ThemedInput**: "Flight Code" label
    - Placeholder: "e.g., SQ 321 or full code"
    - Helper text: Tip about prefix (if available)
  - **Flight Type Toggle**:
    - Flex-row, gap-3
    - Two buttons: "Depart" and "Return"
    - Selected: Border-2 burgundy, bg-burgundy/10
    - Icons: Airplane-outline (Depart), Airplane (Return)
  - **Buttons**: Cancel (secondary) and Save (primary), flex-row

#### Selected Date Rosters
- **Section Header**:
  - Title: "[X] Flight(s)" or "No Flights" - lg, semibold
  - Date: sm, gray-500
- **Flight Cards**:
  - Container: Rounded-xl, p-4, border-2 burgundy/30, shadow-sm, bg-burgundy/5
  - Header:
    - Flight code: 2xl, bold, tint color
    - Badges: Flight type and status (rounded-full, colored backgrounds)
  - Route: base size
  - Aircraft type: sm, gray-500 (if available)
  - Details Grid:
    - Border-top separator
    - Flex-row, justify-between
    - Departure/Arrival with times and locations
    - Icons: Time-outline

**Design Notes**:
- Double-tap detection (300ms window)
- Smooth month navigation
- Modal slides up from bottom
- Empty state: Centered icon and message

---

### 9. Connections Screen (`/app/(tabs)/connections.tsx`)

**Purpose**: Manage family and friend connections

**Layout**:
- Scrollable vertical layout
- Header, connection sections, empty state

**Components**:

#### Header
- **ThemedHeader**:
  - Title: "Connections"
  - Subtitle: "Manage your family and friends"
  - Right: Person-add icon button

#### Accepted Connections Section
- **Section Title**: "Connected ([X]/5)" - lg, semibold
- **Connection Cards**:
  - Container: Rounded-xl, p-4, border-2 burgundy/30, shadow-sm, bg-burgundy/5
  - Layout: Flex-row, items-center, justify-between
  - Avatar: 48x48px, rounded-full, bg-gray-200, icon (people/person)
  - Info:
    - Name: base, semibold
    - Role: sm, gray-500
  - Action: Trash icon (20px, red)

#### Pending Invitations Section
- **Section Title**: "Pending Invitations" - lg, semibold
- **Invitation Cards**:
  - Similar to connection cards
  - Avatar: Amber background, time icon
  - Status: "Invitation Sent" / "Waiting for acceptance"

#### Received Invitations Section
- **Section Title**: "Invitation Requests" - lg, semibold
- **Request Cards**:
  - Similar layout
  - Avatar: Blue background, mail icon
  - Status: "New Connection Request"
  - Actions: Accept (primary) and Decline (secondary) buttons, flex-row

#### Empty State
- **Container**: Rounded-2xl, p-6, border-2 burgundy/20, bg-burgundy/5
- **Content**: Centered
  - Icon: People-outline (48px, tint color)
  - Message: sm, gray-500, centered
  - Button: "Send Invitation" - Primary variant

**Design Notes**:
- Staggered card animations (50ms delays)
- Color-coded sections (amber for pending, blue for requests)
- Max 5 connections limit indicated

---

### 10. Invite Screen (`/app/(tabs)/connections/invite.tsx`)

**Purpose**: Send connection invitations

**Layout**:
- Scrollable form
- Header with back button, form fields, action button

**Components**:

#### Header
- **ThemedHeader**:
  - Title: "Send Invitation"
  - Subtitle: "Invite family or friends to track your flights"
  - Left: Back button (arrow-back icon, rounded-full, bg-gray-200, p-2)

#### Connection Type Selection
- **Label**: "Connection Type" - sm, semibold
- **Buttons**: Flex-row, gap-3
  - Three options: "Family", "Friend", "Colleague"
  - Selected: Border-2 tint, bg-tint/10
  - Unselected: Border gray, transparent bg

#### Invitation Method Selection
- **Label**: "Invitation Method" - sm, semibold
- **Buttons**: Flex-row, flex-wrap, gap-3
  - Four options: "Email", "SMS", "In-App", "Link"
  - Smaller buttons (py-2, px-4, rounded-lg)
  - Selected: Border tint, bg-tint/10

#### Input Fields
- **Email Input** (if method is email):
  - **ThemedInput**: "Email Address" label
    - Placeholder: "friend@example.com"
- **Phone Input** (if method is SMS):
  - **ThemedInput**: "Phone Number" label
    - Placeholder: "+1234567890"
- **Info Card** (if method is in-app or link):
  - Rounded-xl, p-4, border gray
  - Description text: sm, gray-500

#### Error Message
- **Container**: Rounded-xl, p-4, border red, bg-red-50
- **Text**: sm, red-600

#### Action Button
- **ThemedButton**: "Send Invitation" - Primary variant, full width

**Design Notes**:
- Dynamic form based on selected method
- Validation with error messages
- Success alert with invitation code/link

---

## 🧩 Reusable Components

### ThemedHeader
**Purpose**: Consistent header across screens

**Variants**:
- **Default**: Regular screens with standard background
- **Overlay**: Screens with gradient background (white text with shadows)

**Props**:
- `title`: Main header text
- `subtitle`: Optional description
- `variant`: 'default' | 'overlay'
- `left`: Optional left component (back button, etc.)
- `right`: Optional right component (action button, etc.)
- `center`: Optional center component (overrides title/subtitle)

**Styling**:
- Default: Standard text colors
- Overlay: White text with drop shadows
- Animations: Staggered entrance (80ms delays)

---

### ThemedButton
**Purpose**: Primary action buttons

**Variants**:
- **Primary**: Burgundy background, white text, shadow-lg
- **Secondary**: Gray background, dark text
- **Outline**: Transparent, burgundy border, burgundy text

**Props**:
- `title`: Button text
- `variant`: 'primary' | 'secondary' | 'outline'
- `isLoading`: Shows activity indicator
- `fullWidth`: Full width button
- `disabled`: Disabled state

**Styling**:
- Min height: 60px
- Padding: px-8 py-6
- Border radius: rounded-xl
- Font: Bold, lg, tracking-wide

---

### ThemedInput
**Purpose**: Text input fields with theming

**Props**:
- `label`: Optional label (uppercase, tracking-wide)
- `error`: Error message text
- `animated`: Entrance animation
- `delay`: Animation delay

**Styling**:
- Border: 2px, animates from gray to tint on focus
- Border radius: rounded-xl
- Background: White (light) / Gray-800 (dark)
- Min height: 60px
- Padding: px-5 py-4
- Text: lg, medium

**States**:
- Default: Gray border
- Focused: Tint color border, scale animation
- Error: Red border and text

---

### ThemedLoader
**Purpose**: Loading indicators

**Variants**:
- **Full Screen**: Modal overlay with backdrop
- **Inline**: Small indicator in container

**Props**:
- `fullScreen`: Full screen overlay
- `size`: 'small' | 'large'
- `message`: Optional loading message

**Styling**:
- Colors: Burgundy theme
- Animations: Smooth rotation
- Backdrop: Semi-transparent overlay (if fullScreen)

---

### StatCard
**Purpose**: Display statistics with visualizations

**Layout**:
- Container: Rounded-2xl, p-4, border, bg-white/80, backdrop-blur
- Header: Flex-row, justify-between
  - Icon container: 40x40px, rounded-xl, colored bg 15% opacity
  - Optional: Circular progress or chevron icon
- Label: xs, medium, gray-500
- Value: 2xl, bold, colored
- Optional: Bar chart or progress indicator

**Visualizations**:
- **Circular Progress**: Animated SVG circle with percentage
- **Bar Chart**: Animated bars with labels
- **Progress Bar**: Horizontal animated bar

---

### Flight Card
**Purpose**: Display flight roster information

**Layout**:
- Container: Rounded-xl, p-4, border-2 burgundy/30, shadow-sm, bg-burgundy/5
- Header:
  - Flight code: 2xl, bold, tint color
  - Badges: Flight type and status (rounded-full)
- Route: base size
- Aircraft type: sm, gray-500 (optional)
- Details Grid:
  - Border-top separator
  - Flex-row, justify-between
  - Departure/Arrival with times and locations

**States**:
- Default: Standard styling
- Selected: Enhanced border/shadow
- Empty: Centered icon and message

---

## 🎭 Design Patterns

### Animations
- **Entrance**: Fade in + translate (opacity 0→1, translateY -10→0)
- **Stagger**: 50-100ms delays between elements
- **Spring**: Smooth spring animations for interactions
- **Charts**: Animated from 0 to target value with spring

### Empty States
- Centered layout
- Large icon (48px) in tint color
- Message text (sm, gray-500)
- Optional call-to-action button

### Loading States
- Activity indicators (burgundy color)
- Skeleton screens for content
- Full-screen overlay for major operations

### Error States
- Red border and text
- Error message below input
- Alert dialogs for critical errors

### Success States
- Green accents
- Confirmation messages
- Smooth transitions

---

## 📐 Layout Guidelines

### Safe Areas
- Use `SafeAreaView` for top and bottom edges
- Account for notches and home indicators

### Spacing
- Standard padding: 24px (px-6)
- Section spacing: 24px (mb-6)
- Card padding: 16px (p-4) or 24px (p-6)

### Grid System
- 2-column grid for statistics (with 8px gap)
- Full-width cards for hero content
- Consistent margins: 24px horizontal

### Typography Hierarchy
1. **Title**: 3xl-5xl, bold/black
2. **Subtitle**: xl-lg, semibold
3. **Body**: base, regular
4. **Caption**: sm-xs, regular

---

## 🌓 Dark Mode Considerations

### Backgrounds
- Light: White/light gray
- Dark: Dark gray (#2A2A2A)

### Text Contrast
- Light: Dark text on light background
- Dark: Light text on dark background

### Borders
- Light: Gray-200
- Dark: Gray-700

### Cards
- Light: White/80 with backdrop blur
- Dark: Gray-800/80 with backdrop blur

### Shadows
- Light: Subtle gray shadows
- Dark: Darker, more prominent shadows

---

## 🎯 Design Principles

1. **Clarity**: Clear hierarchy and readable text
2. **Consistency**: Reusable components and patterns
3. **Accessibility**: Proper contrast ratios and touch targets (min 44x44px)
4. **Performance**: Smooth animations (60fps)
5. **Feedback**: Visual feedback for all interactions
6. **Progressive Disclosure**: Show information progressively
7. **Error Prevention**: Clear validation and error messages

---

## 📱 Platform Considerations

### iOS
- Native feel with system fonts
- Rounded corners and shadows
- Haptic feedback on interactions
- Safe area insets

### Android
- Material Design principles
- Elevation instead of shadows
- Ripple effects on touch
- Back button handling

---

## 🎨 Brand Identity

### Personality
- Professional yet approachable
- Trustworthy and reliable
- Modern and clean
- Aviation-inspired

### Visual Language
- Burgundy color scheme (warm, professional)
- Smooth animations (premium feel)
- Clear typography (readability)
- Generous whitespace (breathing room)

---

## 📝 Notes for Designers

1. **Color Accuracy**: Use exact hex codes provided
2. **Spacing**: Follow Tailwind spacing scale (4px base unit)
3. **Animations**: Use spring animations for natural feel
4. **Icons**: Use Ionicons library (outline variants preferred)
5. **Images**: Use SVG or high-resolution assets
6. **Responsive**: Design for various screen sizes (iPhone SE to iPhone Pro Max)
7. **Accessibility**: Ensure WCAG AA contrast ratios
8. **Testing**: Test in both light and dark modes

---

**Last Updated**: 2024  
**Version**: 1.0.0  
**Design System**: NativeWind (Tailwind CSS for React Native)

