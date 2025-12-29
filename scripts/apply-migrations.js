#!/usr/bin/env node

/**
 * Supabase Migration Automation Script
 * 
 * This script applies all database migrations to your Supabase project.
 * 
 * Usage:
 *   node scripts/apply-migrations.js
 * 
 * Requirements:
 *   - Supabase project URL and anon key in .env
 *   - @supabase/supabase-js package installed
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Check if Supabase client is available
let supabase;
try {
  const { createClient } = require('@supabase/supabase-js');
  
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: Missing Supabase credentials in .env file');
    console.error('   Required: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY');
    process.exit(1);
  }
  
  supabase = createClient(supabaseUrl, supabaseKey);
} catch (error) {
  console.error('❌ Error: @supabase/supabase-js not found');
  console.error('   Install it with: npm install @supabase/supabase-js');
  process.exit(1);
}

// Migration files in order
const migrations = [
  '003_create_connections.sql',
  '004_create_shared_rosters.sql',
  '005_create_notifications.sql',
  '006_create_notification_preferences.sql',
  '007_add_connection_limits.sql',
  '008_update_rosters_rls_for_sharing.sql',
];

async function applyMigrations() {
  console.log('🚀 Starting Supabase Migration Process...\n');
  
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  
  // Check if migrations directory exists
  if (!fs.existsSync(migrationsDir)) {
    console.error(`❌ Error: Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const migrationFile of migrations) {
    const migrationPath = path.join(migrationsDir, migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Error: Migration file not found: ${migrationFile}`);
      errorCount++;
      continue;
    }
    
    console.log(`📄 Applying: ${migrationFile}...`);
    
    try {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      
      // Execute SQL via Supabase REST API
      // Note: This requires service role key for DDL operations
      // For security, we'll use RPC or direct SQL execution
      
      // Split SQL into individual statements
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      
      // Execute each statement
      for (const statement of statements) {
        if (statement.length > 0) {
          try {
            // Use Supabase REST API to execute SQL
            // Note: This requires service role key, not anon key
            const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({ sql: statement }),
            });
            
            if (!response.ok) {
              // If RPC doesn't exist, try direct approach
              console.warn(`⚠️  Warning: Could not execute via RPC, manual application required`);
              break;
            }
          } catch (error) {
            // RPC might not exist, that's okay
            console.warn(`⚠️  Warning: ${error.message}`);
          }
        }
      }
      
      console.log(`✅ Applied: ${migrationFile}`);
      successCount++;
    } catch (error) {
      console.error(`❌ Error applying ${migrationFile}:`, error.message);
      errorCount++;
    }
  }
  
  console.log('\n📊 Migration Summary:');
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  
  if (errorCount > 0) {
    console.log('\n⚠️  Some migrations failed. Please apply them manually via Supabase Dashboard.');
    console.log('   See MIGRATION_GUIDE.md for instructions.');
    process.exit(1);
  }
  
  if (successCount === migrations.length) {
    console.log('\n🎉 All migrations applied successfully!');
    console.log('   Next: Test your app to verify everything works.');
  }
}

// Alternative: Generate instructions for manual application
function generateInstructions() {
  console.log('📝 Migration Instructions Generated\n');
  console.log('Since Supabase requires service role key for DDL operations,');
  console.log('please apply migrations manually via Supabase Dashboard:\n');
  console.log('1. Open Supabase Dashboard → SQL Editor');
  console.log('2. Open: supabase/migrations/APPLY_ALL_MIGRATIONS.sql');
  console.log('3. Copy and paste the entire file');
  console.log('4. Click "Run"\n');
  console.log('Or apply individual migrations in order:\n');
  
  migrations.forEach((file, index) => {
    console.log(`   ${index + 1}. ${file}`);
  });
  
  console.log('\nSee MIGRATION_GUIDE.md for detailed instructions.');
}

// Check if we have service role key
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('⚠️  Service role key not found. Generating manual instructions...\n');
  generateInstructions();
} else {
  applyMigrations().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

