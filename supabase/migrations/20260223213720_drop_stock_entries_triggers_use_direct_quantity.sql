/*
  # Drop stock_entries triggers — switch to direct quantity tracking

  ## Overview
  This migration removes automatic triggers that updated medications.quantity
  from stock_entries count. Quantity will now be tracked directly in the
  medications.quantity column.

  ## Changes

  1. Drop the three triggers on stock_entries table:
     - trigger_update_quantity_on_insert
     - trigger_update_quantity_on_update
     - trigger_update_quantity_on_delete

  2. Drop the trigger function update_medication_quantity()

  ## Reason
  The new architecture tracks quantity directly:
  - CSV import sets quantity = number of rows per CodeProduit
  - ScanPage "Entrée de Stock" increments medications.quantity by 1
  - ScanPage "Vente Client" decrements medications.quantity by sold qty
  - stock_entries table is kept for historical/traceability records only
*/

DROP TRIGGER IF EXISTS trigger_update_quantity_on_insert ON stock_entries;
DROP TRIGGER IF EXISTS trigger_update_quantity_on_update ON stock_entries;
DROP TRIGGER IF EXISTS trigger_update_quantity_on_delete ON stock_entries;

DROP FUNCTION IF EXISTS update_medication_quantity();
