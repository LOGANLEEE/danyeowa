#!/usr/bin/env node

/**
 * Production Readiness Checker
 * 
 * This script checks the current state of production readiness items
 * and prompts you when it's time to work on them.
 * 
 * Usage:
 *   node scripts/check-production-readiness.js
 */

const fs = require('fs');
const path = require('path');

const HIGH_PRIORITY_ITEMS = [
  'Error Boundaries',
  'Error Tracking',
  'Tests for Connections Store',
  'Tests for Shared Rosters Store',
  'Tests for Notification Scheduler',
  'Tests for Flight Calculations',
];

const MEDIUM_PRIORITY_ITEMS = [
  'Realtime Subscriptions for Rosters',
  'Realtime Subscriptions for Notifications',
  'Optimistic Updates',
  'Offline Caching',
  'Offline Queue',
  'Sync on Reconnect',
  'Performance Audit',
  'Optimize Calendar Re-renders',
];

function checkFileExists(filePath) {
  return fs.existsSync(path.join(process.cwd(), filePath));
}

function checkProductionReadiness() {
  console.log('🔍 Checking Production Readiness...\n');

  const checks = {
    errorBoundaries: checkFileExists('components/ErrorBoundary.tsx'),
    errorTracking: checkFileExists('.sentryrc.json') || 
                   process.env.SENTRY_DSN || 
                   process.env.BUGSNAG_API_KEY,
    testsConnections: checkFileExists('__tests__/stores/use-connections-store.test.ts'),
    testsSharedRosters: checkFileExists('__tests__/stores/use-shared-rosters-store.test.ts'),
    testsNotificationScheduler: checkFileExists('__tests__/services/notification-scheduler.test.ts'),
    testsFlightCalculations: checkFileExists('__tests__/utils/flight-calculations.test.ts'),
  };

  console.log('📊 High Priority Items Status:\n');
  
  let highPriorityComplete = 0;
  HIGH_PRIORITY_ITEMS.forEach((item, index) => {
    const key = Object.keys(checks)[index];
    const status = checks[key] ? '✅' : '❌';
    if (checks[key]) highPriorityComplete++;
    console.log(`  ${status} ${item}`);
  });

  console.log(`\n📈 Progress: ${highPriorityComplete}/${HIGH_PRIORITY_ITEMS.length} high priority items complete\n`);

  if (highPriorityComplete < HIGH_PRIORITY_ITEMS.length) {
    console.log('⚠️  High priority items remaining!');
    console.log('💡 Say "Let\'s do high priority items" to start working on them.\n');
  } else {
    console.log('🎉 All high priority items complete!');
    console.log('💡 Ready to work on medium priority items? Say "Let\'s do medium priority items"\n');
  }

  // Check for realtime subscriptions
  const hasRealtime = fs.readFileSync('stores/use-rosters-store.ts', 'utf8').includes('subscribe') ||
                      fs.readFileSync('stores/use-notifications-store.ts', 'utf8').includes('subscribe');

  if (!hasRealtime) {
    console.log('💡 Tip: Realtime subscriptions would improve UX significantly!');
    console.log('   Say "Let\'s add realtime" to get started.\n');
  }

  // Check for error boundaries
  if (!checks.errorBoundaries) {
    console.log('⚠️  Error boundaries missing - app could crash on errors!');
    console.log('   Say "Let\'s add error boundaries" to implement them.\n');
  }

  // Check for error tracking
  if (!checks.errorTracking) {
    console.log('⚠️  Error tracking not set up - no production monitoring!');
    console.log('   Say "Let\'s set up error tracking" to add Sentry/Bugsnag.\n');
  }

  return {
    highPriorityComplete,
    totalHighPriority: HIGH_PRIORITY_ITEMS.length,
    readyForProduction: highPriorityComplete >= 4, // At least 4/6 critical items
  };
}

// Run check
const result = checkProductionReadiness();

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Production Readiness: ${result.readyForProduction ? '🟢 Ready' : '🟡 Needs Work'}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (!result.readyForProduction) {
  console.log('📋 Next Steps:');
  console.log('   1. Add error boundaries');
  console.log('   2. Set up error tracking');
  console.log('   3. Add critical tests');
  console.log('\n💬 Just say "Let\'s do high priority items" and I\'ll help!');
}

process.exit(result.readyForProduction ? 0 : 1);

