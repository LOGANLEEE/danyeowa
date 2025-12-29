# ✈️ Roaster Me

A React Native application for cabin crew to manage flight rosters and stay connected with family and friends. Share your schedule, receive notifications, and keep loved ones informed about your flights.

## 🎯 Overview

**Roaster Me** helps cabin crew members:
- 📅 Manage flight rosters and schedules
- 👥 Share rosters with family and friends
- 🔔 Receive timely notifications about flights
- 📊 Track upcoming flights with countdown timers
- 🌍 Handle timezone conversions automatically

**Family and friends can:**
- 👀 View shared rosters
- 🔔 Get notified about flight departures and arrivals
- ⏰ See countdown timers for upcoming flights
- 📱 Stay connected with real-time updates

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and Yarn 4.12.0
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator
- Supabase account and project

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd roaster-me

# Install dependencies
yarn install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials
```

### Environment Variables

Create a `.env` file in the root directory:

```env
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
EXPO_PUBLIC_PROJECT_ID=your-expo-project-id
```

### Running the App

```bash
# Start development server
yarn start

# Run on iOS
yarn ios

# Run on Android
yarn android

# Run on web
yarn web
```

## 📁 Project Structure

```
roaster-me/
├── app/                    # Expo Router pages
│   ├── (tabs)/            # Tab navigation screens
│   ├── auth/              # Authentication screens
│   └── onboarding/        # Onboarding flow
├── components/            # Reusable UI components
│   ├── ui/                # Base UI components
│   └── ThemedText.tsx     # Themed components
├── stores/                # Zustand state stores
│   ├── use-auth-store.ts
│   ├── use-rosters-store.ts
│   ├── use-connections-store.ts
│   ├── use-shared-rosters-store.ts
│   └── use-notifications-store.ts
├── lib/                   # Utilities and configurations
│   ├── supabase/         # Supabase client and types
│   └── secure-storage.ts  # Secure storage utilities
├── hooks/                 # Custom React hooks
├── utils/                 # Helper functions
├── services/              # Business logic services
├── constants/             # App constants
└── supabase/
    └── migrations/        # Database migrations
```

## 🗄️ Database Setup

### Apply Migrations

The easiest way to apply migrations is through the Supabase Dashboard:

1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open `supabase/migrations/APPLY_ALL_MIGRATIONS.sql`
4. Copy and paste the entire file
5. Click **Run**

For detailed migration instructions, see [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md).

### Database Schema

The app uses the following main tables:
- `profiles` - User profiles
- `rosters` - Flight rosters
- `connections` - User relationships
- `shared_rosters` - Roster sharing permissions
- `notifications` - Notification history
- `notification_preferences` - User notification settings

All tables have Row Level Security (RLS) enabled for security.

## 🔐 Authentication

The app supports two authentication methods:

1. **OTP Verification** - Email-based one-time password
2. **Biometric Authentication** - Face ID / Touch ID / Fingerprint

See `.cursor/rules/project-rules.mdc` for detailed authentication rules.

## 🧪 Testing

```bash
# Run all tests
yarn test

# Run tests with coverage
yarn test:coverage

# Run tests in watch mode
yarn test --watch
```

## 📝 Code Quality

```bash
# Run linter
yarn lint

# Check production readiness
yarn check:production
```

## 🛠️ Development

### Key Technologies

- **React Native** - Mobile framework
- **Expo** - Development platform (SDK 54.0.30)
- **Expo Router** - File-based routing
- **TypeScript** - Type safety
- **Zustand** - State management
- **Supabase** - Backend (database, auth)
- **NativeWind** - Tailwind CSS for React Native
- **Expo Notifications** - Push notifications

### Code Style

- TypeScript strict mode enabled
- Functional components with hooks
- NativeWind for styling
- Path aliases (`@/`) for imports
- Comprehensive error handling

See `.cursor/rules/` for detailed coding standards.

## 📚 Documentation

- [Migration Guide](./MIGRATION_GUIDE.md) - Database migration instructions
- [Production Checklist](./PRODUCTION_CHECKLIST.md) - Pre-launch checklist
- [Project Assessment](./PROJECT_ASSESSMENT.md) - Project status and metrics
- [Production Todo](./TODO_PRODUCTION_READY.md) - Production improvement tasks

## 🚢 Production

Before deploying to production:

1. ✅ Apply all database migrations
2. ✅ Set up error tracking (Sentry recommended)
3. ✅ Add error boundaries
4. ✅ Increase test coverage
5. ✅ Review security settings
6. ✅ Set up monitoring

See [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) for the complete checklist.

## 📄 License

Private project - All rights reserved

## 👥 Contributing

This is a private project. For questions or issues, please contact the project maintainer.

---

**Version**: 1.0.0  
**Expo SDK**: 54.0.30  
**Status**: 🟢 Production Ready (with monitoring recommendations)

