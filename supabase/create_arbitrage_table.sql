-- Create arbitrage opportunities table
CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  storefront_id UUID NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
  asin VARCHAR(10) NOT NULL,
  product_name TEXT,
  product_image TEXT,
  
  -- Source marketplace (where to buy)
  source_marketplace VARCHAR(10) NOT NULL, -- 'DE', 'FR', 'IT', 'ES'
  source_price DECIMAL(10, 2) NOT NULL, -- Original price in EUR
  source_price_gbp DECIMAL(10, 2) NOT NULL, -- Converted to GBP
  source_currency VARCHAR(3) DEFAULT 'EUR',
  
  -- Target marketplace (UK - where to sell)
  target_price DECIMAL(10, 2) NOT NULL, -- UK Buy Box price in GBP
  target_currency VARCHAR(3) DEFAULT 'GBP',
  
  -- Competition data
  uk_competitors INTEGER DEFAULT 0,
  uk_lowest_price DECIMAL(10, 2),
  uk_sales_rank INTEGER,
  
  -- Fee calculations
  amazon_fees DECIMAL(10, 2) NOT NULL, -- Total Amazon fees
  referral_fee DECIMAL(10, 2),
  fba_fee DECIMAL(10, 2),
  
  -- Profit calculations
  total_cost DECIMAL(10, 2) NOT NULL, -- source_price_gbp + amazon_fees
  profit DECIMAL(10, 2) NOT NULL, -- target_price - total_cost
  profit_margin DECIMAL(5, 2), -- (profit / target_price) * 100
  roi DECIMAL(5, 2), -- (profit / total_cost) * 100
  
  -- Metadata
  exchange_rate DECIMAL(10, 6) NOT NULL, -- EUR to GBP rate used
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicates
  UNIQUE(storefront_id, asin, source_marketplace)
);

-- Create indexes for better query performance
CREATE INDEX idx_arbitrage_storefront ON arbitrage_opportunities(storefront_id);
CREATE INDEX idx_arbitrage_asin ON arbitrage_opportunities(asin);
CREATE INDEX idx_arbitrage_profit ON arbitrage_opportunities(profit DESC);
CREATE INDEX idx_arbitrage_roi ON arbitrage_opportunities(roi DESC);
CREATE INDEX idx_arbitrage_marketplace ON arbitrage_opportunities(source_marketplace);
CREATE INDEX idx_arbitrage_analyzed ON arbitrage_opportunities(analyzed_at DESC);

-- Enable RLS
ALTER TABLE arbitrage_opportunities ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own arbitrage opportunities" ON arbitrage_opportunities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM storefronts 
      WHERE storefronts.id = arbitrage_opportunities.storefront_id 
      AND storefronts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert arbitrage opportunities for their storefronts" ON arbitrage_opportunities
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM storefronts 
      WHERE storefronts.id = arbitrage_opportunities.storefront_id 
      AND storefronts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own arbitrage opportunities" ON arbitrage_opportunities
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM storefronts 
      WHERE storefronts.id = arbitrage_opportunities.storefront_id 
      AND storefronts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own arbitrage opportunities" ON arbitrage_opportunities
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM storefronts 
      WHERE storefronts.id = arbitrage_opportunities.storefront_id 
      AND storefronts.user_id = auth.uid()
    )
  );