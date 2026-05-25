/*
  # Add Sellers Table and Seller Tracking in Sales Journal

  1. New Tables
    - `sellers`
      - `id` (uuid, primary key)
      - `name` (text) - seller display name
      - `pin_code` (text) - 4-digit PIN for quick login
      - `user_id` (uuid) - FK to auth.users (pharmacy account owner)
      - `created_at` (timestamptz)

  2. Modified Tables
    - `sales_journal`: Add `seller_name` column (text, nullable) to track which seller made each sale
    - `sales`: Add `seller_name` column (text, nullable)

  3. Security
    - Enable RLS on `sellers` table
    - Users can only manage their own sellers
*/

CREATE TABLE IF NOT EXISTS sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pin_code text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sellers"
  ON sellers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sellers"
  ON sellers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sellers"
  ON sellers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sellers"
  ON sellers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_journal' AND column_name = 'seller_name'
  ) THEN
    ALTER TABLE sales_journal ADD COLUMN seller_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'seller_name'
  ) THEN
    ALTER TABLE sales ADD COLUMN seller_name text;
  END IF;
END $$;
