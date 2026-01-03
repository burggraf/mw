-- Add platform column to displays table for device/OS information
-- This helps identify what type of device each display is running on

ALTER TABLE public.displays
ADD COLUMN IF NOT EXISTS platform TEXT;

-- Add a comment explaining the field
COMMENT ON COLUMN public.displays.platform IS 'Platform/OS information (e.g., "Fire OS 7", "Android 11", "macOS 14")';
