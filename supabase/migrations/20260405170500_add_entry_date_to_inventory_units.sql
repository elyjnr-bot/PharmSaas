/*
  # Add Entry Date to Inventory Units

  ## Overview
  Adds an entry_date column to inventory_units to track when each unit was received in stock.

  ## Changes
  1. New column on `inventory_units`:
     - `entry_date` (date) - Date when this unit entered stock, defaults to current date

  ## Notes
  - If Excel import has a date, it should be used
  - Otherwise defaults to the import/creation date
  - This date appears on printed labels as "Entree: DD/MM/YY"
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_units' AND column_name = 'entry_date'
  ) THEN
    ALTER TABLE inventory_units ADD COLUMN entry_date date DEFAULT CURRENT_DATE;
  END IF;
END $$;

UPDATE inventory_units
SET entry_date = created_at::date
WHERE entry_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_units_entry_date ON inventory_units(entry_date);
