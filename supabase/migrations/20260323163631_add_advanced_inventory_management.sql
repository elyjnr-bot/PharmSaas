/*
  # Add Advanced Inventory Management System

  ## Overview
  This migration enhances the medications table with professional inventory tracking features:
  - Stock location tracking (shelf/drawer)
  - Category management
  - Minimum stock thresholds
  - Batch/lot management with separate table

  ## Changes to `medications` table
  - Add `category` (text) - Product category (e.g., Antibiotique, Antalgique)
  - Add `location` (text) - Physical storage location (shelf, drawer, cabinet)
  - Rename `minimum_stock` to `min_stock` for consistency
  - Add `code_interne` (text) - Internal product code for quick lookup
  - Add indexes for search optimization

  ## New Table: `medication_batches`
  - `id` (uuid, primary key) - Unique identifier
  - `medication_id` (uuid, foreign key) - Reference to parent medication
  - `batch_number` (text) - Manufacturing batch/lot number
  - `quantity` (integer) - Quantity in this batch
  - `expiry_date` (date) - Expiration date for this batch
  - `received_date` (date) - Date batch was received
  - `cost_price` (numeric) - Purchase cost per unit
  - `created_at` (timestamptz) - Timestamp of record creation
  - `updated_at` (timestamptz) - Timestamp of last update

  ## Security
  - Enable RLS on medication_batches table
  - Add policies for authenticated users to manage batches
  - Maintain referential integrity with foreign keys

  ## Notes
  - Existing batch_number and expiry_date in medications table will be deprecated
  - New batches should be managed through medication_batches table
  - Total stock = sum of all batch quantities for a medication
*/

-- Add new columns to medications table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medications' AND column_name = 'category'
  ) THEN
    ALTER TABLE medications ADD COLUMN category text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medications' AND column_name = 'location'
  ) THEN
    ALTER TABLE medications ADD COLUMN location text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medications' AND column_name = 'code_interne'
  ) THEN
    ALTER TABLE medications ADD COLUMN code_interne text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medications' AND column_name = 'min_stock'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'medications' AND column_name = 'minimum_stock'
    ) THEN
      ALTER TABLE medications RENAME COLUMN minimum_stock TO min_stock;
    ELSE
      ALTER TABLE medications ADD COLUMN min_stock integer DEFAULT 100;
    END IF;
  END IF;
END $$;

-- Create medication_batches table
CREATE TABLE IF NOT EXISTS medication_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  batch_number text NOT NULL,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  expiry_date date NOT NULL,
  received_date date DEFAULT CURRENT_DATE,
  cost_price numeric(12, 2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security on medication_batches
ALTER TABLE medication_batches ENABLE ROW LEVEL SECURITY;

-- Create policies for medication_batches
CREATE POLICY "Authenticated users can read medication batches"
  ON medication_batches
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert medication batches"
  ON medication_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update medication batches"
  ON medication_batches
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete medication batches"
  ON medication_batches
  FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_medications_category ON medications(category);
CREATE INDEX IF NOT EXISTS idx_medications_location ON medications(location);
CREATE INDEX IF NOT EXISTS idx_medications_code_interne ON medications(code_interne);
CREATE INDEX IF NOT EXISTS idx_medication_batches_medication_id ON medication_batches(medication_id);
CREATE INDEX IF NOT EXISTS idx_medication_batches_expiry ON medication_batches(expiry_date);

-- Create function to automatically update medication total quantity from batches
CREATE OR REPLACE FUNCTION update_medication_quantity_from_batches()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE medications
  SET quantity = (
    SELECT COALESCE(SUM(quantity), 0)
    FROM medication_batches
    WHERE medication_id = COALESCE(NEW.medication_id, OLD.medication_id)
  ),
  updated_at = now()
  WHERE id = COALESCE(NEW.medication_id, OLD.medication_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers to update medication quantity when batches change
DROP TRIGGER IF EXISTS trg_update_med_qty_after_batch_insert ON medication_batches;
CREATE TRIGGER trg_update_med_qty_after_batch_insert
  AFTER INSERT ON medication_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_medication_quantity_from_batches();

DROP TRIGGER IF EXISTS trg_update_med_qty_after_batch_update ON medication_batches;
CREATE TRIGGER trg_update_med_qty_after_batch_update
  AFTER UPDATE ON medication_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_medication_quantity_from_batches();

DROP TRIGGER IF EXISTS trg_update_med_qty_after_batch_delete ON medication_batches;
CREATE TRIGGER trg_update_med_qty_after_batch_delete
  AFTER DELETE ON medication_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_medication_quantity_from_batches();
