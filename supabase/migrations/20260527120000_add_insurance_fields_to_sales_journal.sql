/*
  # Add insurance / mutuelle fields to sales_journal

  These columns track third-party payer (insurance / mutuelle) coverage
  for each sale line. All nullable so existing rows stay valid.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_journal' AND column_name='insurance_name') THEN
    ALTER TABLE sales_journal ADD COLUMN insurance_name    text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_journal' AND column_name='insurance_card') THEN
    ALTER TABLE sales_journal ADD COLUMN insurance_card    text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_journal' AND column_name='insurance_rate') THEN
    ALTER TABLE sales_journal ADD COLUMN insurance_rate    numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_journal' AND column_name='insurance_amount') THEN
    ALTER TABLE sales_journal ADD COLUMN insurance_amount  numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_journal' AND column_name='patient_amount') THEN
    ALTER TABLE sales_journal ADD COLUMN patient_amount    numeric;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
