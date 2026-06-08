/*
  # Annuaire des commerciaux fournisseurs
  ─────────────────────────────────────────────────────────────────────────────
  Table  : supplier_reps   — un commercial = une personne physique chez un fournisseur
  Ajout  : rep_id, rep_name, rep_phone sur purchase_orders (dénormalisé pour lecture rapide)
*/

CREATE TABLE IF NOT EXISTS supplier_reps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,          -- même valeur que purchase_orders.supplier
  name          text NOT NULL,
  phone         text,
  email         text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE supplier_reps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'supplier_reps' AND policyname = 'owner_supplier_reps'
  ) THEN
    CREATE POLICY owner_supplier_reps ON supplier_reps
      FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Colonnes commercial sur purchase_orders (idempotent)
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS rep_id    uuid REFERENCES supplier_reps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rep_name  text,
  ADD COLUMN IF NOT EXISTS rep_phone text;

NOTIFY pgrst, 'reload schema';
