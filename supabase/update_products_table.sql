-- Update products table to match current implementation
-- First, drop columns that don't exist in our implementation
ALTER TABLE products 
DROP COLUMN IF EXISTS title,
DROP COLUMN IF EXISTS main_image_url,
DROP COLUMN IF EXISTS sales_ranks,
DROP COLUMN IF EXISTS sync_status,
DROP COLUMN IF EXISTS sync_error,
DROP COLUMN IF EXISTS last_updated;

-- Add columns that are used in the application
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS seller_id VARCHAR(255) NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS product_name TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS brand VARCHAR(255),
ADD COLUMN IF NOT EXISTS image_link TEXT,
ADD COLUMN IF NOT EXISTS current_sales_rank INTEGER,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Ensure the foreign key constraint has CASCADE delete
ALTER TABLE products 
DROP CONSTRAINT IF EXISTS products_storefront_id_fkey;

ALTER TABLE products 
ADD CONSTRAINT products_storefront_id_fkey 
FOREIGN KEY (storefront_id) 
REFERENCES storefronts(id) 
ON DELETE CASCADE;

-- Create an index on seller_id for better performance
CREATE INDEX IF NOT EXISTS idx_products_seller_id ON products(seller_id);

-- Update the unique constraint to match our needs
ALTER TABLE products 
DROP CONSTRAINT IF EXISTS products_storefront_id_asin_key;

ALTER TABLE products 
ADD CONSTRAINT products_storefront_id_asin_unique 
UNIQUE(storefront_id, asin);