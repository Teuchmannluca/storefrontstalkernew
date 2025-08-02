-- Add unique constraint to prevent duplicate seller_id per user
-- This ensures each user can only add a seller ID once

-- First, check if there are any existing duplicates
-- This query will help identify if we need to clean up data first
DO $$
BEGIN
    -- Check for duplicates
    IF EXISTS (
        SELECT user_id, seller_id, COUNT(*)
        FROM storefronts
        GROUP BY user_id, seller_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE NOTICE 'Warning: Duplicate seller_ids exist for some users. Please clean up before adding constraint.';
        -- Optionally, you can uncomment the following to see which duplicates exist:
        -- RAISE NOTICE 'Duplicates: %', (
        --     SELECT string_agg(user_id || ':' || seller_id, ', ')
        --     FROM (
        --         SELECT user_id, seller_id
        --         FROM storefronts
        --         GROUP BY user_id, seller_id
        --         HAVING COUNT(*) > 1
        --     ) AS dups
        -- );
    ELSE
        -- No duplicates found, safe to add constraint
        RAISE NOTICE 'No duplicates found. Adding unique constraint...';
        
        -- Create unique index on user_id and seller_id combination
        CREATE UNIQUE INDEX IF NOT EXISTS idx_storefronts_user_seller_unique 
        ON storefronts(user_id, seller_id);
        
        -- Add a constraint using the index
        ALTER TABLE storefronts 
        ADD CONSTRAINT unique_user_seller_id 
        UNIQUE USING INDEX idx_storefronts_user_seller_unique;
        
        RAISE NOTICE 'Unique constraint added successfully.';
    END IF;
END $$;

-- To remove duplicates if they exist (keeping the oldest entry):
-- DELETE FROM storefronts s1
-- WHERE EXISTS (
--     SELECT 1
--     FROM storefronts s2
--     WHERE s1.user_id = s2.user_id
--     AND s1.seller_id = s2.seller_id
--     AND s1.created_at > s2.created_at
-- );

-- To check current constraints:
-- SELECT conname, contype, conkey
-- FROM pg_constraint
-- WHERE conrelid = 'storefronts'::regclass;