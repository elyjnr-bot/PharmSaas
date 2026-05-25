/*
  # Add partial payment support to credits table

  1. Changes
    - `credits` table: add `amount_paid` column (numeric, default 0)
      Tracks cumulative amount collected from the client.
      Remaining = total_amount - amount_paid.
      When amount_paid >= total_amount, status is set to 'paid'.

  2. Notes
    - Existing rows default to 0 (no payment recorded yet)
    - Already-paid rows are untouched (their status is already 'paid')
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'credits' AND column_name = 'amount_paid'
  ) THEN
    ALTER TABLE credits ADD COLUMN amount_paid numeric NOT NULL DEFAULT 0;
  END IF;
END $$;
