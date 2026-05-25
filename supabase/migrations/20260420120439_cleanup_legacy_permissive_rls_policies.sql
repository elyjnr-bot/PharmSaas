/*
  # Clean up legacy permissive RLS policies

  Removes all old "Authenticated users can..." policies that use USING(true)
  or other overly-permissive conditions, leaving only the user-scoped policies
  that properly enforce data isolation with user_id = auth.uid().

  ## Tables cleaned:
  - barcodes: remove "Authenticated users can read barcodes"
  - daily_reports: remove permissive SELECT, old DELETE/UPDATE without user_id
  - expenses: remove "Authenticated users can read expenses"
  - inventory_units: remove "Authenticated users can read inventory units"
  - medication_aliases: remove "Authenticated users can create/read aliases"
  - medication_batches: remove "Authenticated users can read medication batches"
  - medications: remove "Authenticated users can read medications"
  - sale_items: remove all 4 old permissive policies
  - sales: remove "Authenticated users can read sales"
  - sales_journal: remove 2 permissive policies (auth.uid() IS NOT NULL)
  - stock_entries: remove permissive SELECT and old DELETE without user_id
*/

-- barcodes
DROP POLICY IF EXISTS "Authenticated users can read barcodes" ON barcodes;

-- daily_reports
DROP POLICY IF EXISTS "Authenticated users can read daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Prevent deletion of locked reports" ON daily_reports;
DROP POLICY IF EXISTS "Prevent updates to locked reports" ON daily_reports;

-- expenses
DROP POLICY IF EXISTS "Authenticated users can read expenses" ON expenses;

-- inventory_units
DROP POLICY IF EXISTS "Authenticated users can read inventory units" ON inventory_units;

-- medication_aliases
DROP POLICY IF EXISTS "Authenticated users can create aliases" ON medication_aliases;
DROP POLICY IF EXISTS "Authenticated users can read aliases" ON medication_aliases;
DROP POLICY IF EXISTS "Managers can delete aliases" ON medication_aliases;
DROP POLICY IF EXISTS "Managers can update aliases" ON medication_aliases;

-- medication_batches
DROP POLICY IF EXISTS "Authenticated users can read medication batches" ON medication_batches;

-- medications
DROP POLICY IF EXISTS "Authenticated users can read medications" ON medications;

-- sale_items: drop all old permissive policies
DROP POLICY IF EXISTS "Authenticated users can delete sale_items" ON sale_items;
DROP POLICY IF EXISTS "Authenticated users can insert sale_items" ON sale_items;
DROP POLICY IF EXISTS "Authenticated users can read sale_items" ON sale_items;
DROP POLICY IF EXISTS "Authenticated users can update sale_items" ON sale_items;

-- sales
DROP POLICY IF EXISTS "Authenticated users can read sales" ON sales;

-- sales_journal: remove overly permissive ones (allow any authenticated user)
DROP POLICY IF EXISTS "Users can read all sales journal entries" ON sales_journal;
DROP POLICY IF EXISTS "Users can insert sales journal entries" ON sales_journal;

-- stock_entries: remove permissive read and old delete without user_id
DROP POLICY IF EXISTS "Authenticated users can read stock entries" ON stock_entries;
DROP POLICY IF EXISTS "Authenticated users can delete unsold stock entries" ON stock_entries;
