/*
  # Add Barcode and Enhanced Pricing System

  1. Changes to medications table
    - Add `code_produit` column (product code for linking with CSV imports)
    - Add `wholesale_price` column (PrixCession - purchase/wholesale price for managers)
    - Rename conceptually: existing `price` is retail price (PrixPublic)
    
  2. New Tables
    - `barcodes` table to store multiple barcodes per medication
      - `id` (uuid, primary key)
      - `barcode` (text, unique, the actual barcode value)
      - `code_produit` (text, product code to link with articles)
      - `medication_id` (uuid, foreign key to medications)
      - `created_at` (timestamp)
  
  3. Security
    - Enable RLS on `barcodes` table
    - Add policies for authenticated users to read barcodes
    - Add policies for managers to manage barcodes
    
  4. Indexes
    - Add index on barcode for fast lookup
    - Add index on code_produit for CSV import linking
*/

-- Add columns to medications table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medications' AND column_name = 'code_produit'
  ) THEN
    ALTER TABLE medications ADD COLUMN code_produit text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medications' AND column_name = 'wholesale_price'
  ) THEN
    ALTER TABLE medications ADD COLUMN wholesale_price decimal(10,2) DEFAULT 0;
  END IF;
END $$;

-- Create barcodes table
CREATE TABLE IF NOT EXISTS barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode text UNIQUE NOT NULL,
  code_produit text NOT NULL,
  medication_id uuid REFERENCES medications(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_barcodes_barcode ON barcodes(barcode);
CREATE INDEX IF NOT EXISTS idx_barcodes_code_produit ON barcodes(code_produit);
CREATE INDEX IF NOT EXISTS idx_medications_code_produit ON medications(code_produit);

-- Enable RLS
ALTER TABLE barcodes ENABLE ROW LEVEL SECURITY;

-- Policies for barcodes table
CREATE POLICY "Authenticated users can read barcodes"
  ON barcodes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers can insert barcodes"
  ON barcodes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'manager' 
           OR auth.users.raw_user_meta_data->>'role' = 'admin')
    )
  );

CREATE POLICY "Managers can update barcodes"
  ON barcodes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'manager' 
           OR auth.users.raw_user_meta_data->>'role' = 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'manager' 
           OR auth.users.raw_user_meta_data->>'role' = 'admin')
    )
  );

CREATE POLICY "Managers can delete barcodes"
  ON barcodes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'manager' 
           OR auth.users.raw_user_meta_data->>'role' = 'admin')
    )
  );
