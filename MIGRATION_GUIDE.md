# 🗄️ Database Migration Guide

Complete guide for managing Supabase database migrations in the Roaster Me project.

## 🎯 Quick Start (Recommended for First Time)

**Fastest Method: Supabase Dashboard**

1. Open your Supabase project dashboard
2. Navigate to **SQL Editor** → **New query**
3. Open `supabase/migrations/APPLY_ALL_MIGRATIONS.sql`
4. Copy the entire file contents
5. Paste into SQL Editor and click **Run**

**Done!** ✅ Your database is ready.

---

## 📋 Migration Files

All migration files are located in `supabase/migrations/`:

- `001_create_user_profiles.sql` - User profiles table
- `002_add_flight_type_to_rosters.sql` - Flight type support
- `003_create_connections.sql` - User relationships
- `004_create_shared_rosters.sql` - Roster sharing
- `005_create_notifications.sql` - Notification history
- `006_create_notification_preferences.sql` - User preferences
- `007_add_connection_limits.sql` - Connection limits (5 max)
- `008_update_rosters_rls_for_sharing.sql` - RLS policies for sharing
- `APPLY_ALL_MIGRATIONS.sql` - Combined file for easy application

---

## 🚀 Recommended Approach: Supabase CLI

The Supabase CLI is the industry-standard way to manage migrations. It provides:
- ✅ Version control integration
- ✅ Automatic migration tracking
- ✅ Local development environment
- ✅ Safe production deployments
- ✅ Type generation from schema
- ✅ Rollback capabilities

### Setup Supabase CLI

```bash
# Install globally
npm install -g supabase

# Or use npx (recommended)
npx supabase --version

# Link to your project
supabase link --project-ref your-project-ref
```

### Creating Migrations

```bash
# Create a new migration
supabase migration new create_notifications_table

# This creates: supabase/migrations/YYYYMMDDHHMMSS_create_notifications_table.sql
```

### Applying Migrations

```bash
# Push all new migrations to production
supabase db push

# Or apply locally first
supabase db reset  # Resets and applies all migrations
```

### Generating TypeScript Types

```bash
# Generate types from local database
supabase gen types typescript --local > lib/supabase/types.ts

# Or from remote
supabase gen types typescript --project-id your-project-id > lib/supabase/types.ts
```

---

## 📝 Migration File Naming

### Standard Format (Recommended)

Supabase CLI uses **timestamp-based naming**:

```
YYYYMMDDHHMMSS_description.sql
```

**Example:**
```
20240115143000_create_connections.sql
20240115143001_add_indexes_to_connections.sql
```

### Why Timestamps?

- ✅ **Chronological ordering** - Migrations run in order
- ✅ **No conflicts** - Multiple developers can create migrations simultaneously
- ✅ **Clear history** - Easy to see when changes were made
- ✅ **Automatic tracking** - Supabase tracks applied migrations

### Current Files

Your existing migrations use sequential numbering (`001_`, `002_`, etc.), which is fine. For **new migrations**, use timestamp format:

```bash
supabase migration new my_feature
# Creates: 20240115143000_my_feature.sql
```

---

## 🛡️ Migration Safety Practices

### 1. Always Use IF NOT EXISTS / IF EXISTS

Prevent errors on re-runs:

```sql
-- ✅ Good
CREATE TABLE IF NOT EXISTS public.example (...);
CREATE INDEX IF NOT EXISTS example_user_id_idx ON public.example(user_id);

-- ❌ Bad
CREATE TABLE public.example (...);
```

### 2. Use Transactions

Wrap migrations in transactions when possible:

```sql
BEGIN;

-- Your migration SQL here
CREATE TABLE IF NOT EXISTS public.example (...);

COMMIT;
```

### 3. Test Locally First

```bash
# Always test locally before production
supabase db reset  # Resets to clean state
supabase migration up  # Apply all migrations
```

### 4. Never Edit Applied Migrations

**⚠️ CRITICAL:** Once a migration is applied to production, **never edit it**.

- ✅ Create a new migration to fix issues
- ❌ Never modify existing migration files

---

## ✅ Verification Checklist

After applying migrations, verify:

### Tables Created
- [ ] `connections` table exists
- [ ] `shared_rosters` table exists
- [ ] `notifications` table exists
- [ ] `notification_preferences` table exists

### RLS Policies
- [ ] RLS enabled on all new tables
- [ ] Policies created for connections
- [ ] Policies created for shared_rosters
- [ ] Policies created for notifications
- [ ] Policies created for notification_preferences
- [ ] Rosters RLS policy updated

### Functions & Triggers
- [ ] `check_connection_limit()` function exists
- [ ] `mark_notification_read()` function exists
- [ ] `mark_all_notifications_read()` function exists
- [ ] `create_default_notification_preferences()` function exists
- [ ] All triggers are active

### Indexes
- [ ] Indexes created on all foreign keys
- [ ] Indexes created on frequently queried columns

---

## 🧪 Test Queries

Run these in SQL Editor to verify everything works:

### Test 1: Check Tables Exist
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('connections', 'shared_rosters', 'notifications', 'notification_preferences');
```

### Test 2: Check RLS Policies
```sql
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('connections', 'shared_rosters', 'notifications', 'notification_preferences');
```

### Test 3: Check Functions
```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN (
    'check_connection_limit',
    'mark_notification_read',
    'mark_all_notifications_read',
    'create_default_notification_preferences'
  );
```

---

## 🔄 CI/CD Integration

For automatic migrations on push to main:

```yaml
# .github/workflows/deploy-migrations.yml
name: Deploy Migrations

on:
  push:
    branches: [main]
    paths:
      - 'supabase/migrations/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      
      - run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      
      - run: supabase db push
```

---

## 🐛 Troubleshooting

### Error: "relation already exists"
- **Cause**: Migration was already applied
- **Solution**: Skip that migration or drop the table first (if safe)

### Error: "permission denied"
- **Cause**: RLS policy blocking operation
- **Solution**: Verify you're authenticated and policies are correct

### Error: "function does not exist"
- **Cause**: Function wasn't created
- **Solution**: Re-run the migration that creates the function

### Migration Already Applied
```bash
# Check migration status
supabase migration list

# If out of sync, repair
supabase migration repair --status applied --version TIMESTAMP
```

### Schema Drift
If local and remote schemas differ:

```bash
# Pull remote changes
supabase db pull

# Review generated migration
# Apply if correct
supabase migration up
```

---

## 📊 Migration Order

Migrations must be applied in this order:

1. ✅ `001_create_user_profiles.sql` (already applied)
2. ✅ `002_add_flight_type_to_rosters.sql` (already applied)
3. ⬇️ `003_create_connections.sql` (NEW)
4. ⬇️ `004_create_shared_rosters.sql` (NEW - depends on rosters table)
5. ⬇️ `005_create_notifications.sql` (NEW)
6. ⬇️ `006_create_notification_preferences.sql` (NEW - depends on profiles)
7. ⬇️ `007_add_connection_limits.sql` (NEW - depends on connections)
8. ⬇️ `008_update_rosters_rls_for_sharing.sql` (NEW - depends on shared_rosters)

---

## 🚀 After Migration

Once migrations are applied:

1. **Update TypeScript Types**:
   ```bash
   npx supabase gen types typescript --project-id your-project-id > lib/supabase/types.ts
   ```

2. **Test the App**:
   - Test invitation flow
   - Test roster sharing
   - Test notifications
   - Verify connection limits

3. **Monitor**:
   - Check Supabase logs for any errors
   - Monitor database performance
   - Verify RLS policies are working

---

## 📚 Additional Resources

- [Supabase CLI Documentation](https://supabase.com/docs/reference/cli/introduction)
- [Database Migrations Guide](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [Local Development Guide](https://supabase.com/docs/guides/cli/local-development)
- [Production Best Practices](https://supabase.com/docs/guides/deployment/maturity-model)

---

**Last Updated**: 2024  
**Status**: ✅ Ready to use
