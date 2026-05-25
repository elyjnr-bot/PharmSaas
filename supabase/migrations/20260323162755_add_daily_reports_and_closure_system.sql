/*
  # Add Daily Reports and Closure System

  ## Overview
  This migration adds a secure daily closure system to prevent fraud and maintain accurate accounting records.

  ## New Table

  ### `daily_reports`
  - `id` (uuid, primary key) - Unique identifier
  - `report_date` (date, unique) - Date of the closure (one report per day)
  - `total_sales` (numeric) - Total sales amount for the day in FCFA
  - `total_expenses` (numeric) - Total expenses for the day in FCFA
  - `net_amount` (numeric) - Net amount (sales - expenses) in FCFA
  - `transaction_count` (integer) - Number of sales transactions
  - `items_sold` (integer) - Total number of items sold
  - `closed_by` (text) - Name/ID of user who closed the day
  - `closed_at` (timestamptz) - When the report was closed
  - `notes` (text) - Additional notes
  - `is_locked` (boolean) - Prevents modifications once locked
  - `created_at` (timestamptz) - Timestamp of record creation

  ## Security
  - Enable RLS on daily_reports table
  - Only authenticated users can create reports
  - Once locked, reports cannot be modified or deleted
  - One report per date to prevent duplicates

  ## Notes
  - All monetary values are in FCFA
  - Report must be manually closed by a manager
  - Locking prevents any retroactive data manipulation
*/

-- Create daily_reports table
CREATE TABLE IF NOT EXISTS daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL UNIQUE,
  total_sales numeric(12, 2) NOT NULL DEFAULT 0,
  total_expenses numeric(12, 2) NOT NULL DEFAULT 0,
  net_amount numeric(12, 2) NOT NULL DEFAULT 0,
  transaction_count integer NOT NULL DEFAULT 0,
  items_sold integer NOT NULL DEFAULT 0,
  closed_by text,
  closed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  is_locked boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

-- Create policies for daily_reports
CREATE POLICY "Authenticated users can read daily reports"
  ON daily_reports
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert daily reports"
  ON daily_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Prevent updates to locked reports"
  ON daily_reports
  FOR UPDATE
  TO authenticated
  USING (is_locked = false)
  WITH CHECK (is_locked = false);

CREATE POLICY "Prevent deletion of locked reports"
  ON daily_reports
  FOR DELETE
  TO authenticated
  USING (is_locked = false);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_reports_locked ON daily_reports(is_locked);
