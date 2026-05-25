/*
  # Fix barcodes table RLS for import

  ## Problem
  Same as stock_entries: the INSERT policy on barcodes requires manager role
  in JWT, but the JWT path check was silently failing during import.
  This caused barcodes to never be registered, breaking scan lookups.

  ## Changes
  - Drop manager-only INSERT policy and replace with authenticated-user policy
  - Keep DELETE/UPDATE restricted to managers to protect barcode integrity
*/

DROP POLICY IF EXISTS "Managers can insert barcodes" ON barcodes;

CREATE POLICY "Authenticated users can insert barcodes"
  ON barcodes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
