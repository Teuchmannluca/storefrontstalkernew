-- Create storefronts table with unique constraint on seller_id per user
CREATE TABLE IF NOT EXISTS storefronts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  storefront_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Ensure each user can only add a seller_id once
  CONSTRAINT unique_user_seller_id UNIQUE(user_id, seller_id)
);

-- Create indexes for faster lookups
CREATE INDEX idx_storefronts_user_id ON storefronts(user_id);
CREATE INDEX idx_storefronts_seller_id ON storefronts(seller_id);

-- Enable Row Level Security (RLS)
ALTER TABLE storefronts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own storefronts" ON storefronts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own storefronts" ON storefronts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own storefronts" ON storefronts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own storefronts" ON storefronts
  FOR DELETE USING (auth.uid() = user_id);

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT unique_user_seller_id ON storefronts IS 
  'Ensures each user can only add a seller ID once to prevent duplicate storefronts';