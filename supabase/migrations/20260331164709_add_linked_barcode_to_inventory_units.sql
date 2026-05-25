/*
  # Add linked barcode column to inventory_units

  1. Changes
    - Add `linked_barcode` column to `inventory_units` table
    - This allows linking original EAN/DataMatrix barcodes to JP- unit codes
    - The scanner can then recognize both the JP- code and the original barcode

  2. Notes
    - Column is nullable since not all units will have a linked barcode
    - No unique constraint as multiple units from same product may share same original barcode
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_units' AND column_name = 'linked_barcode'
  ) THEN
    ALTER TABLE inventory_units ADD COLUMN linked_barcode text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_units_linked_barcode
  ON inventory_units(linked_barcode)
  WHERE linked_barcode IS NOT NULL;
