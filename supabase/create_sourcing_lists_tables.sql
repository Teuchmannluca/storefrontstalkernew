-- Create sourcing lists feature tables
-- This allows users to save arbitrage opportunities from Recent Scans and A2A EU into organized lists

-- Main sourcing lists table
CREATE TABLE IF NOT EXISTS sourcing_lists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_favorite BOOLEAN DEFAULT false,
    item_count INTEGER DEFAULT 0,
    total_profit DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Individual items in sourcing lists
CREATE TABLE IF NOT EXISTS sourcing_list_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sourcing_list_id UUID REFERENCES sourcing_lists(id) ON DELETE CASCADE NOT NULL,
    asin VARCHAR(10) NOT NULL,
    product_name TEXT NOT NULL,
    product_image TEXT,
    uk_price DECIMAL(10,2) NOT NULL,
    source_marketplace VARCHAR(10) NOT NULL,
    source_price_gbp DECIMAL(10,2) NOT NULL,
    profit DECIMAL(10,2) NOT NULL,
    roi DECIMAL(5,2) NOT NULL,
    profit_margin DECIMAL(5,2) NOT NULL,
    sales_per_month INTEGER,
    storefront_name TEXT,
    added_from VARCHAR(50) NOT NULL, -- 'recent_scans' or 'a2a_eu'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    UNIQUE(sourcing_list_id, asin, source_marketplace)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sourcing_lists_user_id ON sourcing_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_lists_user_favorite ON sourcing_lists(user_id, is_favorite DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sourcing_list_items_list_id ON sourcing_list_items(sourcing_list_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_list_items_asin ON sourcing_list_items(asin);

-- Row Level Security (RLS) policies
ALTER TABLE sourcing_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE sourcing_list_items ENABLE ROW LEVEL SECURITY;

-- Users can only access their own sourcing lists
CREATE POLICY "Users can view their own sourcing lists" ON sourcing_lists
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sourcing lists" ON sourcing_lists
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sourcing lists" ON sourcing_lists
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sourcing lists" ON sourcing_lists
    FOR DELETE USING (auth.uid() = user_id);

-- Users can only access items from their own sourcing lists
CREATE POLICY "Users can view their own sourcing list items" ON sourcing_list_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sourcing_lists 
            WHERE sourcing_lists.id = sourcing_list_items.sourcing_list_id 
            AND sourcing_lists.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert items to their own sourcing lists" ON sourcing_list_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sourcing_lists 
            WHERE sourcing_lists.id = sourcing_list_items.sourcing_list_id 
            AND sourcing_lists.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update items in their own sourcing lists" ON sourcing_list_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sourcing_lists 
            WHERE sourcing_lists.id = sourcing_list_items.sourcing_list_id 
            AND sourcing_lists.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete items from their own sourcing lists" ON sourcing_list_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sourcing_lists 
            WHERE sourcing_lists.id = sourcing_list_items.sourcing_list_id 
            AND sourcing_lists.user_id = auth.uid()
        )
    );

-- Function to update list totals when items are added/removed
CREATE OR REPLACE FUNCTION update_sourcing_list_totals()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the sourcing list totals
    UPDATE sourcing_lists SET
        item_count = (
            SELECT COUNT(*) 
            FROM sourcing_list_items 
            WHERE sourcing_list_id = COALESCE(NEW.sourcing_list_id, OLD.sourcing_list_id)
        ),
        total_profit = (
            SELECT COALESCE(SUM(profit), 0) 
            FROM sourcing_list_items 
            WHERE sourcing_list_id = COALESCE(NEW.sourcing_list_id, OLD.sourcing_list_id)
        ),
        updated_at = timezone('utc', now())
    WHERE id = COALESCE(NEW.sourcing_list_id, OLD.sourcing_list_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Triggers to automatically update totals
CREATE TRIGGER trigger_update_sourcing_list_totals_insert
    AFTER INSERT ON sourcing_list_items
    FOR EACH ROW EXECUTE FUNCTION update_sourcing_list_totals();

CREATE TRIGGER trigger_update_sourcing_list_totals_update
    AFTER UPDATE ON sourcing_list_items
    FOR EACH ROW EXECUTE FUNCTION update_sourcing_list_totals();

CREATE TRIGGER trigger_update_sourcing_list_totals_delete
    AFTER DELETE ON sourcing_list_items
    FOR EACH ROW EXECUTE FUNCTION update_sourcing_list_totals();