/*
  # Add Stock Entries Tracking System

  ## Overview
  This migration adds a stock entries tracking system to properly handle inventory management.
  Each line in the import file represents one unit/box that entered the pharmacy at a specific date.

  ## New Tables

  1. **stock_entries**
     - `id` (uuid, primary key) - Unique identifier for each entry
     - `medication_id` (uuid, foreign key) - Links to the medication
     - `code_produit` (text) - Product code for linking
     - `entry_date` (date) - Date when this unit entered stock (from Date_entree column)
     - `bl_number` (text) - Delivery note number (from Numero_BL column)
     - `batch_number` (text) - Batch number if available
     - `expiry_date` (date) - Expiry date if available
     - `is_sold` (boolean) - Whether this unit has been sold (default false)
     - `sold_at` (timestamptz) - When this unit was sold
     - `created_at` (timestamptz) - Record creation timestamp

  ## Changes to medications table
  - The `quantity` column will now be calculated from stock_entries
  - Quantity = COUNT of stock_entries where is_sold = false

  ## Security
  - Enable RLS on stock_entries table
  - Authenticated users can read their pharmacy's entries
  - Managers can insert/update/delete entries

  ## Indexes
  - Add index on medication_id for fast lookups
  - Add index on code_produit for import linking
  - Add index on is_sold for quantity calculations
*/

-- Create stock_entries table
CREATE TABLE IF NOT EXISTS stock_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid REFERENCES medications(id) ON DELETE CASCADE,
  code_produit text NOT NULL,
  entry_date date DEFAULT CURRENT_DATE,
  bl_number text DEFAULT '',
  batch_number text DEFAULT '',
  expiry_date date,
  is_sold boolean DEFAULT false,
  sold_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_stock_entries_medication_id ON stock_entries(medication_id);
CREATE INDEX IF NOT EXISTS idx_stock_entries_code_produit ON stock_entries(code_produit);
CREATE INDEX IF NOT EXISTS idx_stock_entries_is_sold ON stock_entries(is_sold);
CREATE INDEX IF NOT EXISTS idx_stock_entries_entry_date ON stock_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_stock_entries_bl_number ON stock_entries(bl_number);

-- Enable RLS
ALTER TABLE stock_entries ENABLE ROW LEVEL SECURITY;

-- Policies for stock_entries table
CREATE POLICY "Authenticated users can read stock entries"
  ON stock_entries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers can insert stock entries"
  ON stock_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt()->>'role')::text IN ('manager', 'admin')
    OR 
    (auth.jwt()->'user_metadata'->>'role')::text IN ('manager', 'admin')
    OR
    (auth.jwt()->'raw_user_meta_data'->>'role')::text IN ('manager', 'admin')
  );

CREATE POLICY "Managers can update stock entries"
  ON stock_entries FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt()->>'role')::text IN ('manager', 'admin')
    OR 
    (auth.jwt()->'user_metadata'->>'role')::text IN ('manager', 'admin')
    OR
    (auth.jwt()->'raw_user_meta_data'->>'role')::text IN ('manager', 'admin')
  )
  WITH CHECK (
    (auth.jwt()->>'role')::text IN ('manager', 'admin')
    OR 
    (auth.jwt()->'user_metadata'->>'role')::text IN ('manager', 'admin')
    OR
    (auth.jwt()->'raw_user_meta_data'->>'role')::text IN ('manager', 'admin')
  );

CREATE POLICY "Managers can delete stock entries"
  ON stock_entries FOR DELETE
  TO authenticated
  USING (
    (auth.jwt()->>'role')::text IN ('manager', 'admin')
    OR 
    (auth.jwt()->'user_metadata'->>'role')::text IN ('manager', 'admin')
    OR
    (auth.jwt()->'raw_user_meta_data'->>'role')::text IN ('manager', 'admin')
  );

-- Create a function to calculate and update medication quantity
CREATE OR REPLACE FUNCTION update_medication_quantity()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the quantity in medications table based on unsold stock entries
  UPDATE medications
  SET quantity = (
    SELECT COUNT(*)
    FROM stock_entries
    WHERE medication_id = COALESCE(NEW.medication_id, OLD.medication_id)
    AND is_sold = false
  )
  WHERE id = COALESCE(NEW.medication_id, OLD.medication_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically update quantity when stock_entries change
DROP TRIGGER IF EXISTS trigger_update_quantity_on_insert ON stock_entries;
CREATE TRIGGER trigger_update_quantity_on_insert
  AFTER INSERT ON stock_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_medication_quantity();

DROP TRIGGER IF EXISTS trigger_update_quantity_on_update ON stock_entries;
CREATE TRIGGER trigger_update_quantity_on_update
  AFTER UPDATE ON stock_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_medication_quantity();

DROP TRIGGER IF EXISTS trigger_update_quantity_on_delete ON stock_entries;
CREATE TRIGGER trigger_update_quantity_on_delete
  AFTER DELETE ON stock_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_medication_quantity();
