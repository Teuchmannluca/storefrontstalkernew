-- Add created_at column to products table if it doesn't exist
-- This helps track when products were first discovered
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index for efficient querying of recent products
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_storefront_created ON products(storefront_id, created_at DESC);

-- Update existing products to have a created_at value based on last_updated
-- (This is a one-time update for existing data)
UPDATE products 
SET created_at = COALESCE(last_updated, NOW())
WHERE created_at IS NULL;