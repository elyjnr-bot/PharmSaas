/*
  # User Settings & Offline Architecture

  1. New Tables
    - `user_settings`
      - `user_id` (uuid, primary key, FK to auth.users)
      - `pharmacy_name` (text, default 'Ma Pharmacie')
      - `default_supplier` (text, default '')
      - `print_config` (jsonb, for label printing preferences)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on user_settings
    - Users can only read/write their own settings

  3. RLS Fixes
    - Add missing user_id to sales_journal inserts
    - Verify suppliers table has user_id

  4. Notes
    - user_settings uses user_id as PK (one row per user)
    - Upsert pattern for safe creation/update
*/

CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pharmacy_name text NOT NULL DEFAULT 'Ma Pharmacie',
  default_supplier text NOT NULL DEFAULT '',
  print_config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own settings"
  ON user_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add user_id to sales_journal if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_journal' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE sales_journal ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update RLS policies for sales_journal
DROP POLICY IF EXISTS "Authenticated users can select sales journal" ON sales_journal;
DROP POLICY IF EXISTS "Authenticated users can insert sales journal" ON sales_journal;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sales_journal' AND policyname = 'Users can view own sales journal'
  ) THEN
    EXECUTE '
      CREATE POLICY "Users can view own sales journal"
        ON sales_journal FOR SELECT
        TO authenticated
        USING (user_id = auth.uid())
    ';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sales_journal' AND policyname = 'Users can create own sales journal'
  ) THEN
    EXECUTE '
      CREATE POLICY "Users can create own sales journal"
        ON sales_journal FOR INSERT
        TO authenticated
        WITH CHECK (user_id = auth.uid())
    ';
  END IF;
END $$;

-- Add user_id to suppliers if the table exists and is missing the column
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'suppliers') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'suppliers' AND column_name = 'user_id'
    ) THEN
      ALTER TABLE suppliers ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;
