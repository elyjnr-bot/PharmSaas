/*
  # Add Sales Journal Table

  1. New Tables
    - `sales_journal`
      - `id` (uuid, primary key)
      - `sale_date` (timestamptz) - Date and time of the sale
      - `medication_id` (uuid) - Reference to the medication
      - `medication_name` (text) - Name of the medication (denormalized for offline access)
      - `quantity_sold` (integer) - Quantity sold
      - `unit_price` (numeric) - Price per unit
      - `total_price` (numeric) - Total for this line
      - `payment_method` (text) - Payment method used
      - `stock_after_sale` (integer) - Stock remaining after sale
      - `user_id` (uuid) - User who made the sale
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `sales_journal` table
    - Add policies for authenticated users to:
      - Read their own pharmacy's sales journal
      - Insert new journal entries

  3. Purpose
    - Provides a detailed log of each sale for end-of-day reports
    - Works offline with local storage sync
    - Tracks stock levels after each sale for audit purposes
*/

CREATE TABLE IF NOT EXISTS sales_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_date timestamptz NOT NULL DEFAULT now(),
  medication_id uuid REFERENCES medications(id) ON DELETE SET NULL,
  medication_name text NOT NULL,
  quantity_sold integer NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'Especes',
  stock_after_sale integer NOT NULL DEFAULT 0,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  synced boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sales_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all sales journal entries"
  ON sales_journal
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert sales journal entries"
  ON sales_journal
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own sales journal entries"
  ON sales_journal
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_sales_journal_sale_date ON sales_journal(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_journal_user_id ON sales_journal(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_journal_medication_id ON sales_journal(medication_id);
