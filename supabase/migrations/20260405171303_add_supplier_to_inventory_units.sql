/*
  # Add Supplier Column to Inventory Units

  ## Overview
  Adds a `supplier` column to inventory_units so that each physical unit
  can store its own supplier information from Excel import.

  ## Changes
  1. New column on `inventory_units`:
     - `supplier` (text, default '') - The supplier/distributor for this unit

  ## Notes
  - Existing units get empty string by default
  - Import will populate this from the Excel "Fournisseur" column
  - This allows per-unit supplier tracking, independent of the medication record
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_units' AND column_name = 'supplier'
  ) THEN
    ALTER TABLE inventory_units ADD COLUMN supplier text NOT NULL DEFAULT '';
  END IF;
END $$;
