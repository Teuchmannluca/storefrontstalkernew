-- Create table for arbitrage scans (if not exists)
CREATE TABLE IF NOT EXISTS arbitrage_scans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_type VARCHAR(50) NOT NULL DEFAULT 'a2a_eu', -- 'a2a_eu', 'single_storefront', 'all_storefronts'
  storefront_id UUID REFERENCES storefronts(id) ON DELETE SET NULL, -- NULL for all_storefronts scan
  storefront_name VARCHAR(255), -- Store name at time of scan
  status VARCHAR(50) NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  total_products INTEGER DEFAULT 0,
  unique_asins INTEGER DEFAULT 0,
  opportunities_found INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional scan info (exchange rates, etc)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create table for scan opportunities/results (if not exists)
CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES arbitrage_scans(id) ON DELETE CASCADE,
  asin VARCHAR(10) NOT NULL,
  product_name TEXT,
  product_image TEXT,
  target_price DECIMAL(10, 2), -- UK selling price
  amazon_fees DECIMAL(10, 2),
  referral_fee DECIMAL(10, 2),
  digital_services_fee DECIMAL(10, 2),
  uk_competitors INTEGER,
  uk_sales_rank INTEGER,
  best_source_marketplace VARCHAR(10), -- 'DE', 'FR', 'IT', 'ES'
  best_source_price DECIMAL(10, 2), -- Price in EUR
  best_source_price_gbp DECIMAL(10, 2), -- Converted to GBP
  best_profit DECIMAL(10, 2),
  best_roi DECIMAL(5, 2), -- ROI percentage
  all_marketplace_prices JSONB DEFAULT '{}'::jsonb, -- All EU marketplace data
  storefronts JSONB DEFAULT '[]'::jsonb, -- Which storefronts have this ASIN
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes only if they don't exist
CREATE INDEX IF NOT EXISTS idx_arbitrage_scans_user_id ON arbitrage_scans(user_id);
CREATE INDEX IF NOT EXISTS idx_arbitrage_scans_status ON arbitrage_scans(status);
CREATE INDEX IF NOT EXISTS idx_arbitrage_scans_started_at ON arbitrage_scans(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_arbitrage_opportunities_scan_id ON arbitrage_opportunities(scan_id);
CREATE INDEX IF NOT EXISTS idx_arbitrage_opportunities_asin ON arbitrage_opportunities(asin);
CREATE INDEX IF NOT EXISTS idx_arbitrage_opportunities_roi ON arbitrage_opportunities(best_roi DESC);

-- Enable RLS (safe to run multiple times)
ALTER TABLE arbitrage_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE arbitrage_opportunities ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Users can view their own scans" ON arbitrage_scans;
DROP POLICY IF EXISTS "Users can insert their own scans" ON arbitrage_scans;
DROP POLICY IF EXISTS "Users can update their own scans" ON arbitrage_scans;
DROP POLICY IF EXISTS "Users can delete their own scans" ON arbitrage_scans;

-- RLS policies for arbitrage_scans
CREATE POLICY "Users can view their own scans" ON arbitrage_scans
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own scans" ON arbitrage_scans
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scans" ON arbitrage_scans
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scans" ON arbitrage_scans
  FOR DELETE USING (auth.uid() = user_id);

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Users can view opportunities from their scans" ON arbitrage_opportunities;
DROP POLICY IF EXISTS "Users can insert opportunities to their scans" ON arbitrage_opportunities;
DROP POLICY IF EXISTS "Users can update opportunities in their scans" ON arbitrage_opportunities;
DROP POLICY IF EXISTS "Users can delete opportunities from their scans" ON arbitrage_opportunities;

-- RLS policies for arbitrage_opportunities
CREATE POLICY "Users can view opportunities from their scans" ON arbitrage_opportunities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM arbitrage_scans 
      WHERE arbitrage_scans.id = arbitrage_opportunities.scan_id 
      AND arbitrage_scans.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert opportunities to their scans" ON arbitrage_opportunities
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM arbitrage_scans 
      WHERE arbitrage_scans.id = arbitrage_opportunities.scan_id 
      AND arbitrage_scans.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update opportunities in their scans" ON arbitrage_opportunities
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM arbitrage_scans 
      WHERE arbitrage_scans.id = arbitrage_opportunities.scan_id 
      AND arbitrage_scans.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete opportunities from their scans" ON arbitrage_opportunities
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM arbitrage_scans 
      WHERE arbitrage_scans.id = arbitrage_opportunities.scan_id 
      AND arbitrage_scans.user_id = auth.uid()
    )
  );

-- Create or replace function to clean up old scans (optional, can be called periodically)
CREATE OR REPLACE FUNCTION cleanup_old_scans(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM arbitrage_scans 
  WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep
  AND status = 'completed';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON TABLE arbitrage_scans IS 'Stores arbitrage scan history and status';
COMMENT ON TABLE arbitrage_opportunities IS 'Stores profitable opportunities found during scans';
COMMENT ON COLUMN arbitrage_scans.scan_type IS 'Type of scan: a2a_eu, single_storefront, or all_storefronts';
COMMENT ON COLUMN arbitrage_scans.status IS 'Current status: running, completed, or failed';
COMMENT ON COLUMN arbitrage_opportunities.best_roi IS 'Return on investment percentage for the best source marketplace';

-- Verify tables were created
SELECT 'arbitrage_scans table exists: ' || 
  CASE WHEN EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'arbitrage_scans'
  ) THEN 'YES' ELSE 'NO' END AS status
UNION ALL
SELECT 'arbitrage_opportunities table exists: ' || 
  CASE WHEN EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'arbitrage_opportunities'
  ) THEN 'YES' ELSE 'NO' END AS status;