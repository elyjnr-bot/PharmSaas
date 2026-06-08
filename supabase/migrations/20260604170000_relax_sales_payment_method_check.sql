/*
  # Relax sales.payment_method CHECK constraint

  Context:
  - The CHECK constraint on `sales.payment_method` only allowed a fixed set
    (Espèces / Especes / Carte Bancaire / MTN Mobile Money / Airtel Money).
  - Real-world payment labels are dynamic: "Assurance CNSS", "Assurance CAMU",
    "Mutuelle X", "Crédit", "Mixte"... Any of these violated the constraint and
    made the ENTIRE cloud sync of a sale fail (sales + sale_items + sales_journal),
    so insurance/credit sales never reached the reporting table sales_journal.

  Changes:
  - Drop the brittle CHECK constraint entirely. payment_method stays `text`.
    The reporting source of truth (sales_journal) already has no such constraint.

  Notes:
  - Idempotent: IF EXISTS before dropping. Removing a CHECK never invalidates rows.
*/

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;

NOTIFY pgrst, 'reload schema';
