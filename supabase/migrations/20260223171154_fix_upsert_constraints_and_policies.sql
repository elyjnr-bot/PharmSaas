/*
  # Fix Upsert Constraints and RLS Policies

  ## Overview
  This migration fixes issues preventing CSV import operations from working correctly.

  ## Changes

  1. **Medications Table**
     - Add UNIQUE constraint on `code_produit` column to enable upsert operations
     - This allows the CSV import to update existing medications by code_produit

  2. **Barcodes Table - RLS Policy Updates**
     - Simplify INSERT policy to use JWT metadata instead of auth.users table query
     - Simplify UPDATE policy to avoid permission errors
     - Simplify DELETE policy to avoid permission errors
     - These changes fix "permission denied for table users" errors during upsert

  ## Security Notes
  - RLS remains enabled on all tables
  - Only managers and admins can insert/update/delete barcodes
  - All authenticated users can still read barcodes
  - Policies now use auth.jwt() which is more efficient and avoids permission issues
*/

-- Add UNIQUE constraint to medications.code_produit for upsert operations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'medications_code_produit_unique'
  ) THEN
    ALTER TABLE medications ADD CONSTRAINT medications_code_produit_unique UNIQUE (code_produit);
  END IF;
END $$;

-- Drop existing barcode policies
DROP POLICY IF EXISTS "Managers can insert barcodes" ON barcodes;
DROP POLICY IF EXISTS "Managers can update barcodes" ON barcodes;
DROP POLICY IF EXISTS "Managers can delete barcodes" ON barcodes;

-- Create new simplified policies using JWT metadata
CREATE POLICY "Managers can insert barcodes"
  ON barcodes FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt()->>'role')::text IN ('manager', 'admin')
    OR 
    (auth.jwt()->'user_metadata'->>'role')::text IN ('manager', 'admin')
    OR
    (auth.jwt()->'raw_user_meta_data'->>'role')::text IN ('manager', 'admin')
  );

CREATE POLICY "Managers can update barcodes"
  ON barcodes FOR UPDATE
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

CREATE POLICY "Managers can delete barcodes"
  ON barcodes FOR DELETE
  TO authenticated
  USING (
    (auth.jwt()->>'role')::text IN ('manager', 'admin')
    OR 
    (auth.jwt()->'user_metadata'->>'role')::text IN ('manager', 'admin')
    OR
    (auth.jwt()->'raw_user_meta_data'->>'role')::text IN ('manager', 'admin')
  );
