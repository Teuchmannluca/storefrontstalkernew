-- Add missing columns to storefronts table for tracking product changes
ALTER TABLE storefronts
ADD COLUMN IF NOT EXISTS new_products_last_scan INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS removed_products_last_scan INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS products_added_total INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS products_removed_total INTEGER DEFAULT 0;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_storefronts_user_id ON storefronts(user_id);
CREATE INDEX IF NOT EXISTS idx_storefronts_seller_id ON storefronts(seller_id);

-- Comments for documentation
COMMENT ON COLUMN storefronts.new_products_last_scan IS 'Number of new products added in the last scan';
COMMENT ON COLUMN storefronts.removed_products_last_scan IS 'Number of products removed in the last scan';
COMMENT ON COLUMN storefronts.products_added_total IS 'Total number of products added over time';
COMMENT ON COLUMN storefronts.products_removed_total IS 'Total number of products removed over time';