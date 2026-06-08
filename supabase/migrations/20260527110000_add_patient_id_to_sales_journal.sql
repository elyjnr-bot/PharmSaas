/*
  # Add patient_id to sales_journal

  Links each sale line to a patient record (optional FK).
  Used when a cashier selects a patient at checkout — the sale then
  appears automatically in the patient's purchase history CRM.

  The column is nullable so all existing rows stay valid.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_journal' AND column_name = 'patient_id'
  ) THEN
    ALTER TABLE sales_journal
      ADD COLUMN patient_id uuid REFERENCES patients(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sales_journal_patient_id_idx ON sales_journal(patient_id)
  WHERE patient_id IS NOT NULL;
