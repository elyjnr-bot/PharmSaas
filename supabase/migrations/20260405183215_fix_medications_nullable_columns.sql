/*
  # Fix medications table nullable columns and add minimum_stock alias

  ## Changes
  1. Makes batch_number and expiry_date nullable in medications table
     - These fields are often unknown at time of entry
  2. Adds minimum_stock column as integer with default 0
     - The existing min_stock column is kept for compatibility
     - New code will use minimum_stock

  ## Notes
  - No data is lost, only column constraints are relaxed
  - Safe to apply on a live database
*/

ALTER TABLE medications
  ALTER COLUMN batch_number DROP NOT NULL,
  ALTER COLUMN expiry_date DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medications' AND column_name = 'minimum_stock'
  ) THEN
    ALTER TABLE medications ADD COLUMN minimum_stock integer DEFAULT 0;
  END IF;
END $$;
