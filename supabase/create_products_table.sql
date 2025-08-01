-- Create products table linked to storefronts
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  storefront_id UUID NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
  asin VARCHAR(10) NOT NULL,
  title TEXT,
  brand VARCHAR(255),
  main_image_url TEXT,
  sales_ranks JSONB DEFAULT '[]'::jsonb,
  sync_status VARCHAR(50) DEFAULT 'pending', -- pending, syncing, success, error
  sync_error TEXT,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(storefront_id, asin)
);

-- Create index for faster lookups
CREATE INDEX idx_products_storefront_id ON products(storefront_id);
CREATE INDEX idx_products_asin ON products(asin);

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own storefront products" ON products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM storefronts 
      WHERE storefronts.id = products.storefront_id 
      AND storefronts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert products to their own storefronts" ON products
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM storefronts 
      WHERE storefronts.id = products.storefront_id 
      AND storefronts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own storefront products" ON products
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM storefronts 
      WHERE storefronts.id = products.storefront_id 
      AND storefronts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own storefront products" ON products
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM storefronts 
      WHERE storefronts.id = products.storefront_id 
      AND storefronts.user_id = auth.uid()
    )
  );