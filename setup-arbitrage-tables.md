# Setup Arbitrage Scan Tables

## ⚠️ Important: Migration Required

You have an existing `arbitrage_opportunities` table with a different structure. You need to run the migration script first.

## Instructions

1. Go to your Supabase dashboard
2. Navigate to the SQL Editor
3. **FIRST**: Copy and paste the entire contents of `supabase/migrate_arbitrage_tables.sql`
4. Click "Run" to execute the migration
   - This will backup your old table as `arbitrage_opportunities_old_backup`
   - Create the new tables with scan functionality
5. Check the output to confirm all tables were created successfully

This will create:
- `arbitrage_scans` table - for storing scan metadata
- `arbitrage_opportunities` table - for storing profitable opportunities
- All necessary indexes and RLS policies

## Alternative: Using Supabase CLI

If you have the Supabase CLI installed, you can run:

```bash
supabase db push
```

This will apply all migrations in the `supabase/migrations` folder.

## Verify Tables Were Created

After running the SQL, you can verify the tables exist by running this query:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('arbitrage_scans', 'arbitrage_opportunities');
```

You should see both tables listed.