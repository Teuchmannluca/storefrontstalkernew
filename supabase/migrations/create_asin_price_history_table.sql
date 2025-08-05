-- Create asin_asin_price_history table to track historical price changes
CREATE TABLE IF NOT EXISTS asin_asin_price_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asin VARCHAR(20) NOT NULL,
  marketplace VARCHAR(10) NOT NULL, -- UK, DE, FR, IT, ES
  old_price DECIMAL(10, 2),
  new_price DECIMAL(10, 2) NOT NULL,
  old_price_currency VARCHAR(3), -- GBP, EUR
  new_price_currency VARCHAR(3) NOT NULL, -- GBP, EUR
  price_change_amount DECIMAL(10, 2), -- Absolute change
  price_change_percentage DECIMAL(6, 2), -- Percentage change
  product_name TEXT,
  change_detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  scan_id UUID REFERENCES arbitrage_scans(id) ON DELETE SET NULL,
  is_first_check BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_asin_price_history_asin ON asin_price_history(asin);
CREATE INDEX IF NOT EXISTS idx_asin_price_history_user_asin ON asin_price_history(user_id, asin);
CREATE INDEX IF NOT EXISTS idx_asin_price_history_marketplace ON asin_price_history(marketplace);
CREATE INDEX IF NOT EXISTS idx_asin_price_history_detected_at ON asin_price_history(change_detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_asin_price_history_scan ON asin_price_history(scan_id);

-- Create view for latest prices per ASIN/marketplace
CREATE OR REPLACE VIEW latest_asin_price_history AS
SELECT DISTINCT ON (user_id, asin, marketplace)
  *
FROM asin_price_history
ORDER BY user_id, asin, marketplace, change_detected_at DESC;

-- Create view for significant price drops (more than 10% decrease)
CREATE OR REPLACE VIEW significant_price_drops AS
SELECT *
FROM asin_price_history
WHERE price_change_percentage < -10
  AND NOT is_first_check
ORDER BY change_detected_at DESC;

-- RLS policies
ALTER TABLE asin_price_history ENABLE ROW LEVEL SECURITY;

-- Users can only see their own price history
CREATE POLICY "Users can view their own price history"
  ON asin_price_history FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own price history
CREATE POLICY "Users can insert their own price history"
  ON asin_price_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own price history
CREATE POLICY "Users can update their own price history"
  ON asin_price_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own price history
CREATE POLICY "Users can delete their own price history"
  ON asin_price_history FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger to calculate price change fields
CREATE OR REPLACE FUNCTION calculate_price_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate price change amount and percentage
  IF NEW.old_price IS NOT NULL AND NEW.old_price > 0 THEN
    NEW.price_change_amount := NEW.new_price - NEW.old_price;
    NEW.price_change_percentage := ((NEW.new_price - NEW.old_price) / NEW.old_price) * 100;
  ELSE
    NEW.price_change_amount := NULL;
    NEW.price_change_percentage := NULL;
    NEW.is_first_check := TRUE;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_price_change
BEFORE INSERT OR UPDATE ON asin_price_history
FOR EACH ROW
EXECUTE FUNCTION calculate_price_change();

-- Function to get price history summary for an ASIN
CREATE OR REPLACE FUNCTION get_asin_price_history_summary(p_user_id UUID, p_asin VARCHAR)
RETURNS TABLE (
  marketplace VARCHAR,
  current_price DECIMAL,
  previous_price DECIMAL,
  lowest_price DECIMAL,
  highest_price DECIMAL,
  avg_price DECIMAL,
  price_volatility DECIMAL,
  last_checked TIMESTAMP WITH TIME ZONE,
  total_checks INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ph.marketplace,
    (SELECT new_price FROM asin_price_history WHERE user_id = p_user_id AND asin = p_asin AND marketplace = ph.marketplace ORDER BY change_detected_at DESC LIMIT 1) as current_price,
    (SELECT old_price FROM asin_price_history WHERE user_id = p_user_id AND asin = p_asin AND marketplace = ph.marketplace AND old_price IS NOT NULL ORDER BY change_detected_at DESC LIMIT 1) as previous_price,
    MIN(ph.new_price) as lowest_price,
    MAX(ph.new_price) as highest_price,
    AVG(ph.new_price) as avg_price,
    STDDEV(ph.new_price) as price_volatility,
    MAX(ph.change_detected_at) as last_checked,
    COUNT(*)::INTEGER as total_checks
  FROM asin_price_history ph
  WHERE ph.user_id = p_user_id 
    AND ph.asin = p_asin
  GROUP BY ph.marketplace;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;