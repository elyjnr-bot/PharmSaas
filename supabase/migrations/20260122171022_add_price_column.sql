/*
  # Add price column to medications table

  ## Overview
  This migration adds a sale price column to the medications table to support
  pricing information for inventory management and CSV import functionality.

  ## Changes
  
  ### Modifications to `medications` table
  - Add `price` (numeric) - Sale price of the medication (can be null for items without pricing)

  ## Notes
  - Using DO block to safely add the column only if it doesn't exist
  - No data migration needed as this is a new optional field
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medications' AND column_name = 'price'
  ) THEN
    ALTER TABLE medications ADD COLUMN price numeric(10, 2);
  END IF;
END $$;
