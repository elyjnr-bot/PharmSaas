/*
  # Create credits table (Carnet de Crédit)

  ## Purpose
  Manages credit sales where clients take products and pay later.
  Each credit record stores full purchase details and payment status.

  ## New Tables

  ### credits
  - `id` (uuid, PK) — unique identifier
  - `user_id` (uuid, FK → auth.users) — owner, enforces multi-tenant isolation
  - `client_name` (text, NOT NULL) — debtor name
  - `client_phone` (text, nullable) — optional contact
  - `due_date` (date, nullable) — optional repayment deadline
  - `total_amount` (numeric, NOT NULL) — total amount owed
  - `status` (text, DEFAULT 'unpaid') — 'unpaid' | 'paid'
  - `sale_date` (timestamptz, DEFAULT now()) — when the credit sale occurred
  - `paid_at` (timestamptz, nullable) — when payment was received
  - `payment_method` (text, nullable) — method used when paid
  - `items` (jsonb, NOT NULL) — snapshot of cart items [{medication_id, medication_name, quantity, unit_price, subtotal}]
  - `notes` (text, nullable) — optional notes

  ## Security
  - RLS enabled, per-user isolation via user_id = auth.uid()
  - SELECT, INSERT, UPDATE policies — no DELETE (keep audit trail)

  ## Indexes
  - status index for fast filtering by unpaid/paid
  - user_id + status composite index for dashboard queries
*/

CREATE TABLE IF NOT EXISTS credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  client_name text NOT NULL,
  client_phone text,
  due_date date,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid',
  sale_date timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  payment_method text,
  items jsonb NOT NULL DEFAULT '[]',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credits"
  ON credits FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own credits"
  ON credits FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own credits"
  ON credits FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS credits_user_id_status_idx ON credits(user_id, status);
CREATE INDEX IF NOT EXISTS credits_sale_date_idx ON credits(sale_date DESC);
