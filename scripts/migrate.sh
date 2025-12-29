#!/bin/bash

# Supabase Migration Script
# Applies all migrations to Supabase project

set -e

echo "🚀 Supabase Migration Script"
echo "============================"
echo ""

# Check if Supabase CLI is installed
if command -v supabase &> /dev/null; then
    echo "✅ Supabase CLI found"
    
    # Check if project is linked
    if [ -f ".supabase/config.toml" ]; then
        echo "✅ Supabase project linked"
        echo ""
        echo "Applying migrations..."
        supabase db push
        echo ""
        echo "✅ Migrations applied successfully!"
    else
        echo "⚠️  Project not linked. Linking now..."
        echo "Please provide your project reference:"
        read -p "Project Ref: " project_ref
        supabase link --project-ref "$project_ref"
        supabase db push
    fi
else
    echo "⚠️  Supabase CLI not found"
    echo ""
    echo "📝 Manual Migration Instructions:"
    echo "================================"
    echo ""
    echo "1. Open Supabase Dashboard → SQL Editor"
    echo "2. Open: supabase/migrations/APPLY_ALL_MIGRATIONS.sql"
    echo "3. Copy and paste the entire file"
    echo "4. Click 'Run'"
    echo ""
    echo "Or install Supabase CLI:"
    echo "  npm install -g supabase"
    echo ""
    echo "See MIGRATION_GUIDE.md for detailed instructions."
fi

