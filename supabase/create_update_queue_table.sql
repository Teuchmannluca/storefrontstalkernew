-- Create storefront update queue and tracking tables
-- This migration adds persistent tracking for storefront updates

-- Create update queue table to track storefront update progress
CREATE TABLE IF NOT EXISTS storefront_update_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storefront_id UUID NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 0,
  keepa_tokens_used INTEGER DEFAULT 0,
  products_added INTEGER DEFAULT 0,
  products_removed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Ensure only one active update per storefront
  CONSTRAINT unique_active_storefront_update UNIQUE(storefront_id) DEFERRABLE INITIALLY DEFERRED
);

-- Create partial unique index to allow only one active update per storefront
CREATE UNIQUE INDEX IF NOT EXISTS idx_storefront_update_queue_active
ON storefront_update_queue(storefront_id)
WHERE status IN ('pending', 'processing');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_storefront_update_queue_user_id ON storefront_update_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_storefront_update_queue_status ON storefront_update_queue(status);
CREATE INDEX IF NOT EXISTS idx_storefront_update_queue_created_at ON storefront_update_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_storefront_update_queue_priority ON storefront_update_queue(priority DESC);

-- Add columns to storefronts table for tracking sync metadata
ALTER TABLE storefronts 
ADD COLUMN IF NOT EXISTS last_sync_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_sync_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_sync_status VARCHAR(20) DEFAULT 'never' CHECK (last_sync_status IN ('never', 'pending', 'processing', 'completed', 'error')),
ADD COLUMN IF NOT EXISTS total_products_synced INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS keepa_tokens_consumed INTEGER DEFAULT 0;

-- Create table to track Keepa API token usage and limits
CREATE TABLE IF NOT EXISTS keepa_token_tracker (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  available_tokens INTEGER NOT NULL DEFAULT 0,
  max_tokens INTEGER NOT NULL DEFAULT 0,
  tokens_per_minute INTEGER NOT NULL DEFAULT 22,
  last_refill_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- One token tracker per user
  CONSTRAINT unique_user_token_tracker UNIQUE(user_id)
);

-- Enable Row Level Security on new tables
ALTER TABLE storefront_update_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE keepa_token_tracker ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for storefront_update_queue
CREATE POLICY "Users can view their own update queue" ON storefront_update_queue
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own update queue items" ON storefront_update_queue
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own update queue items" ON storefront_update_queue
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own update queue items" ON storefront_update_queue
  FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for keepa_token_tracker
CREATE POLICY "Users can view their own token tracker" ON keepa_token_tracker
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own token tracker" ON keepa_token_tracker
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own token tracker" ON keepa_token_tracker
  FOR UPDATE USING (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic updated_at updates
CREATE TRIGGER update_storefront_update_queue_updated_at
    BEFORE UPDATE ON storefront_update_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_keepa_token_tracker_updated_at
    BEFORE UPDATE ON keepa_token_tracker
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments explaining the tables
COMMENT ON TABLE storefront_update_queue IS 'Tracks the progress of storefront update operations with Keepa API integration';
COMMENT ON TABLE keepa_token_tracker IS 'Tracks Keepa API token consumption and availability per user';
COMMENT ON COLUMN storefront_update_queue.keepa_tokens_used IS 'Number of Keepa API tokens consumed during this update';
COMMENT ON COLUMN storefront_update_queue.products_added IS 'Number of new products discovered and added';
COMMENT ON COLUMN storefront_update_queue.products_removed IS 'Number of products removed (no longer in storefront)';