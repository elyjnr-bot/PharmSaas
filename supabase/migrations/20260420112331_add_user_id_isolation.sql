/*
  # Add User ID Isolation

  1. Multi-user Support
    - Add user_id column to all shared tables to enable per-user data isolation
    - Each user will have separate medications, sales, inventory, reports

  2. New Columns
    - medications: user_id (uuid, foreign key to auth.users)
    - sales: user_id (uuid, foreign key to auth.users)
    - sale_items: user_id (uuid, foreign key to auth.users)
    - expenses: user_id (uuid, foreign key to auth.users)
    - barcodes: user_id (uuid, foreign key to auth.users)
    - stock_entries: user_id (uuid, foreign key to auth.users)
    - sales_journal: user_id (uuid, already exists)
    - daily_reports: user_id (uuid, foreign key to auth.users)
    - medication_batches: user_id (uuid, foreign key to auth.users)
    - medication_aliases: user_id (uuid, foreign key to auth.users)
    - inventory_units: user_id (uuid, foreign key to auth.users)

  3. Security
    - Update all RLS policies to include user_id checks
    - Ensure each user can only access their own data
    - All SELECT, INSERT, UPDATE, DELETE operations scoped to user_id
*/

DO $$
BEGIN
  -- Add user_id to medications
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medications' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE medications ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Add user_id to sales
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE sales ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Add user_id to sale_items
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Add user_id to expenses
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE expenses ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Add user_id to barcodes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'barcodes' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE barcodes ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Add user_id to stock_entries
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_entries' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE stock_entries ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Add user_id to daily_reports (may already exist)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_reports' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE daily_reports ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Add user_id to medication_batches
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medication_batches' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE medication_batches ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Add user_id to medication_aliases
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medication_aliases' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE medication_aliases ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Add user_id to inventory_units
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_units' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE inventory_units ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

END $$;

-- Drop existing overly permissive policies and create user-scoped ones
DROP POLICY IF EXISTS "Authenticated users can select medications" ON medications;
DROP POLICY IF EXISTS "Authenticated users can insert medications" ON medications;
DROP POLICY IF EXISTS "Authenticated users can update medications" ON medications;
DROP POLICY IF EXISTS "Authenticated users can delete medications" ON medications;

CREATE POLICY "Users can view own medications"
  ON medications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own medications"
  ON medications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own medications"
  ON medications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own medications"
  ON medications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Update sales policies
DROP POLICY IF EXISTS "Authenticated users can select sales" ON sales;
DROP POLICY IF EXISTS "Authenticated users can insert sales" ON sales;
DROP POLICY IF EXISTS "Authenticated users can update sales" ON sales;
DROP POLICY IF EXISTS "Authenticated users can delete sales" ON sales;

CREATE POLICY "Users can view own sales"
  ON sales FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own sales"
  ON sales FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own sales"
  ON sales FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own sales"
  ON sales FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Update sale_items policies
DROP POLICY IF EXISTS "Authenticated users can select sale items" ON sale_items;
DROP POLICY IF EXISTS "Authenticated users can insert sale items" ON sale_items;
DROP POLICY IF EXISTS "Authenticated users can update sale items" ON sale_items;
DROP POLICY IF EXISTS "Authenticated users can delete sale items" ON sale_items;

CREATE POLICY "Users can view own sale items"
  ON sale_items FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own sale items"
  ON sale_items FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own sale items"
  ON sale_items FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own sale items"
  ON sale_items FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Update expenses policies
DROP POLICY IF EXISTS "Authenticated users can select expenses" ON expenses;
DROP POLICY IF EXISTS "Authenticated users can insert expenses" ON expenses;
DROP POLICY IF EXISTS "Authenticated users can update expenses" ON expenses;
DROP POLICY IF EXISTS "Authenticated users can delete expenses" ON expenses;

CREATE POLICY "Users can view own expenses"
  ON expenses FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own expenses"
  ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own expenses"
  ON expenses FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own expenses"
  ON expenses FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Update barcodes policies
DROP POLICY IF EXISTS "Authenticated users can select barcodes" ON barcodes;
DROP POLICY IF EXISTS "Authenticated users can insert barcodes" ON barcodes;
DROP POLICY IF EXISTS "Managers can update barcodes" ON barcodes;
DROP POLICY IF EXISTS "Managers can delete barcodes" ON barcodes;

CREATE POLICY "Users can view own barcodes"
  ON barcodes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own barcodes"
  ON barcodes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own barcodes"
  ON barcodes FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own barcodes"
  ON barcodes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Update stock_entries policies
DROP POLICY IF EXISTS "Authenticated users can select stock entries" ON stock_entries;
DROP POLICY IF EXISTS "Authenticated users can insert stock entries" ON stock_entries;
DROP POLICY IF EXISTS "Managers can update stock entries" ON stock_entries;
DROP POLICY IF EXISTS "Can delete unsold stock entries" ON stock_entries;

CREATE POLICY "Users can view own stock entries"
  ON stock_entries FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own stock entries"
  ON stock_entries FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own stock entries"
  ON stock_entries FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND (is_sold = false OR is_sold IS NULL))
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own unsold stock entries"
  ON stock_entries FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND (is_sold = false OR is_sold IS NULL));

-- Update daily_reports policies
DROP POLICY IF EXISTS "Authenticated users can select daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Authenticated users can insert daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Can update unlocked daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Can delete unlocked daily reports" ON daily_reports;

CREATE POLICY "Users can view own daily reports"
  ON daily_reports FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own daily reports"
  ON daily_reports FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own unlocked reports"
  ON daily_reports FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND is_locked = false)
  WITH CHECK (user_id = auth.uid() AND is_locked = false);

CREATE POLICY "Users can delete own unlocked reports"
  ON daily_reports FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND is_locked = false);

-- Update medication_batches policies
DROP POLICY IF EXISTS "Authenticated users can select medication batches" ON medication_batches;
DROP POLICY IF EXISTS "Authenticated users can insert medication batches" ON medication_batches;
DROP POLICY IF EXISTS "Authenticated users can update medication batches" ON medication_batches;
DROP POLICY IF EXISTS "Authenticated users can delete medication batches" ON medication_batches;

CREATE POLICY "Users can view own medication batches"
  ON medication_batches FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own medication batches"
  ON medication_batches FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own medication batches"
  ON medication_batches FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own medication batches"
  ON medication_batches FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Update medication_aliases policies
DROP POLICY IF EXISTS "Authenticated users can select medication aliases" ON medication_aliases;
DROP POLICY IF EXISTS "Authenticated users can insert medication aliases" ON medication_aliases;
DROP POLICY IF EXISTS "Managers can update medication aliases" ON medication_aliases;
DROP POLICY IF EXISTS "Managers can delete medication aliases" ON medication_aliases;

CREATE POLICY "Users can view own medication aliases"
  ON medication_aliases FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own medication aliases"
  ON medication_aliases FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own medication aliases"
  ON medication_aliases FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own medication aliases"
  ON medication_aliases FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Update inventory_units policies
DROP POLICY IF EXISTS "Authenticated users can select inventory units" ON inventory_units;
DROP POLICY IF EXISTS "Authenticated users can insert inventory units" ON inventory_units;
DROP POLICY IF EXISTS "Authenticated users can update inventory units" ON inventory_units;
DROP POLICY IF EXISTS "Authenticated users can delete inventory units" ON inventory_units;

CREATE POLICY "Users can view own inventory units"
  ON inventory_units FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own inventory units"
  ON inventory_units FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own inventory units"
  ON inventory_units FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own inventory units"
  ON inventory_units FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
