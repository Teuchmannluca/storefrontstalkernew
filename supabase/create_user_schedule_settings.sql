-- Create user schedule settings table for automatic storefront updates
CREATE TABLE IF NOT EXISTS user_schedule_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  frequency VARCHAR(20) DEFAULT 'daily' CHECK (frequency IN ('daily', 'every_2_days', 'weekly')),
  time_of_day TIME DEFAULT '02:00',
  timezone VARCHAR(50) DEFAULT 'UTC',
  days_of_week INTEGER[] DEFAULT ARRAY[1,2,3,4,5,6,7], -- 1=Monday, 7=Sunday
  last_run TIMESTAMP WITH TIME ZONE,
  next_run TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one schedule per user
  UNIQUE(user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_schedule_settings_user_id ON user_schedule_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_schedule_settings_enabled ON user_schedule_settings(enabled);
CREATE INDEX IF NOT EXISTS idx_user_schedule_settings_next_run ON user_schedule_settings(next_run);

-- Row Level Security (RLS) policies
ALTER TABLE user_schedule_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own schedule settings" ON user_schedule_settings;
DROP POLICY IF EXISTS "Users can insert own schedule settings" ON user_schedule_settings;
DROP POLICY IF EXISTS "Users can update own schedule settings" ON user_schedule_settings;
DROP POLICY IF EXISTS "Users can delete own schedule settings" ON user_schedule_settings;
DROP POLICY IF EXISTS "Service role can access all schedule settings" ON user_schedule_settings;

-- Users can only access their own schedule settings
CREATE POLICY "Users can view own schedule settings" ON user_schedule_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own schedule settings" ON user_schedule_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own schedule settings" ON user_schedule_settings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own schedule settings" ON user_schedule_settings
  FOR DELETE USING (auth.uid() = user_id);

-- Service role can read/write all schedule settings (for cron job)
CREATE POLICY "Service role can access all schedule settings" ON user_schedule_settings
  FOR ALL USING (auth.role() = 'service_role');

-- Function to calculate next run time based on frequency and settings
CREATE OR REPLACE FUNCTION calculate_next_run(
  p_frequency VARCHAR(20),
  p_time_of_day TIME,
  p_timezone VARCHAR(50),
  p_days_of_week INTEGER[],
  p_last_run TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
AS $$
DECLARE
  next_run TIMESTAMP WITH TIME ZONE;
  current_ts TIMESTAMP WITH TIME ZONE;
  base_date DATE;
  target_time TIMESTAMP WITH TIME ZONE;
  day_of_week INTEGER;
  days_to_add INTEGER;
BEGIN
  -- Get current time in the user's timezone
  current_ts := NOW() AT TIME ZONE p_timezone;
  
  -- Start from today
  base_date := current_ts::DATE;
  
  -- Create target datetime for today
  target_time := (base_date || ' ' || p_time_of_day)::TIMESTAMP AT TIME ZONE p_timezone;
  
  -- If time has already passed today, start from tomorrow
  IF target_time <= current_ts THEN
    base_date := base_date + INTERVAL '1 day';
    target_time := (base_date || ' ' || p_time_of_day)::TIMESTAMP AT TIME ZONE p_timezone;
  END IF;
  
  -- Handle different frequencies
  CASE p_frequency
    WHEN 'daily' THEN
      next_run := target_time;
      
    WHEN 'every_2_days' THEN
      -- If we have a last run, add 2 days to it, otherwise use today
      IF p_last_run IS NOT NULL THEN
        next_run := p_last_run + INTERVAL '2 days';
        next_run := (next_run::DATE || ' ' || p_time_of_day)::TIMESTAMP AT TIME ZONE p_timezone;
      ELSE
        next_run := target_time;
      END IF;
      
    WHEN 'weekly' THEN
      -- Find next occurrence of one of the selected days
      day_of_week := EXTRACT(DOW FROM base_date); -- 0=Sunday, 6=Saturday
      day_of_week := CASE WHEN day_of_week = 0 THEN 7 ELSE day_of_week END; -- Convert to 1=Monday, 7=Sunday
      
      -- Find the minimum days to add to reach a selected day
      days_to_add := 7; -- Default to next week
      FOR i IN 1..array_length(p_days_of_week, 1) LOOP
        IF p_days_of_week[i] >= day_of_week THEN
          days_to_add := LEAST(days_to_add, p_days_of_week[i] - day_of_week);
        END IF;
      END LOOP;
      
      -- If no day found this week, find the minimum day next week  
      IF days_to_add = 7 THEN
        SELECT MIN(day) INTO days_to_add FROM unnest(p_days_of_week) AS day;
        days_to_add := days_to_add + 7 - day_of_week;
      END IF;
      
      next_run := target_time + (days_to_add || ' days')::INTERVAL;
      
    ELSE
      -- Default to daily
      next_run := target_time;
  END CASE;
  
  RETURN next_run;
END;
$$;

-- Trigger to automatically update next_run when settings change
CREATE OR REPLACE FUNCTION update_next_run_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only calculate next_run if enabled
  IF NEW.enabled THEN
    NEW.next_run := calculate_next_run(
      NEW.frequency,
      NEW.time_of_day,
      NEW.timezone,
      NEW.days_of_week,
      NEW.last_run
    );
  ELSE
    NEW.next_run := NULL;
  END IF;
  
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_next_run ON user_schedule_settings;
CREATE TRIGGER trigger_update_next_run
  BEFORE INSERT OR UPDATE ON user_schedule_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_next_run_trigger();

-- Create a view for easier querying of schedules due for execution
CREATE OR REPLACE VIEW schedules_due_for_execution AS
SELECT 
  uss.*,
  u.email
FROM user_schedule_settings uss
JOIN auth.users u ON uss.user_id = u.id
WHERE 
  uss.enabled = true 
  AND uss.next_run IS NOT NULL 
  AND uss.next_run <= NOW()
ORDER BY uss.next_run ASC;

-- Grant access to the view for service role
GRANT SELECT ON schedules_due_for_execution TO service_role;