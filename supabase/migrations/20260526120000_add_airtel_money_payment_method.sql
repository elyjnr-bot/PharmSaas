/*
  # Add 'Airtel Money' to allowed payment methods (Brazzaville pilot)

  Context:
  - The `sales.payment_method` column had a CHECK constraint allowing only
    'Espèces', 'Carte Bancaire', 'MTN Mobile Money'. In Congo-Brazzaville,
    Airtel Money is a dominant mobile-money provider; rejecting it loses sales.

  Changes:
  - Drop the old CHECK constraint and recreate it including 'Airtel Money'.
  - Also tolerate the unaccented 'Especes' variant, which the cart/checkout
    flow already produces, so existing data and inserts stay valid.

  Notes:
  - Safe and idempotent: uses IF EXISTS before dropping. Widening an IN(...)
    list never invalidates existing rows.
*/

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;

ALTER TABLE sales ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method IN (
    'Espèces',
    'Especes',
    'Carte Bancaire',
    'MTN Mobile Money',
    'Airtel Money'
  ));
