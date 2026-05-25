/*
  # Create medications table

  ## Overview
  This migration creates the medications table for pharmaceutical inventory management.
  It stores essential information about each medication including name, dosage, quantity,
  batch number, and expiration date.

  ## New Tables
  
  ### `medications`
  - `id` (uuid, primary key) - Unique identifier for each medication entry
  - `name` (text, required) - Name of the medication (e.g., "Paracétamol")
  - `dosage` (text, required) - Dosage information (e.g., "500mg")
  - `quantity` (integer, required) - Current quantity in stock
  - `batch_number` (text, required) - Manufacturing batch/lot number
  - `expiry_date` (date, required) - Expiration date of the medication
  - `minimum_stock` (integer) - Minimum stock level for alerts (default: 100)
  - `created_at` (timestamptz) - Timestamp of record creation
  - `updated_at` (timestamptz) - Timestamp of last update

  ## Security
  
  - Enable RLS on `medications` table
  - Add policy for authenticated users to read all medications
  - Add policy for authenticated users to insert new medications
  - Add policy for authenticated users to update medications
  - Add policy for authenticated users to delete medications

  ## Sample Data
  
  Insert 5 example medications for demonstration purposes.
*/

-- Create medications table
CREATE TABLE IF NOT EXISTS medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  dosage text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  batch_number text NOT NULL,
  expiry_date date NOT NULL,
  minimum_stock integer DEFAULT 100,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Authenticated users can read medications"
  ON medications
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert medications"
  ON medications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update medications"
  ON medications
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete medications"
  ON medications
  FOR DELETE
  TO authenticated
  USING (true);

-- Create index for name search
CREATE INDEX IF NOT EXISTS idx_medications_name ON medications(name);

-- Insert sample data
INSERT INTO medications (name, dosage, quantity, batch_number, expiry_date, minimum_stock) VALUES
  ('Paracétamol', '500mg', 1250, 'LOT2024-001', '2025-12-31', 500),
  ('Amoxicilline', '250mg', 89, 'LOT2024-012', '2025-08-15', 100),
  ('Ibuprofène', '400mg', 0, 'LOT2023-088', '2025-06-20', 200),
  ('Vitamine C', '1000mg', 450, 'LOT2025-003', '2026-03-10', 150),
  ('Aspirine', '100mg', 320, 'LOT2024-055', '2025-02-28', 200)
ON CONFLICT DO NOTHING;
