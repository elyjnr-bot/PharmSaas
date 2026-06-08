/*
  # Commandes fournisseurs (purchase orders)
  Tables : purchase_orders + purchase_order_items
  RLS    : isolées par user_id = auth.uid()
*/

CREATE TABLE IF NOT EXISTS purchase_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_date    date NOT NULL DEFAULT CURRENT_DATE,
  supplier      text,
  status        text NOT NULL DEFAULT 'brouillon'  -- brouillon | envoyée | reçue | annulée
                  CHECK (status IN ('brouillon','envoyée','reçue','annulée')),
  notes         text,
  received_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id  uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medication_id      uuid REFERENCES medications(id) ON DELETE SET NULL,
  medication_name    text NOT NULL,
  dosage             text,
  quantity_ordered   integer NOT NULL DEFAULT 1,
  quantity_received  integer DEFAULT 0,
  unit_cost          numeric,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE purchase_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'purchase_orders' AND policyname = 'owner_purchase_orders'
  ) THEN
    CREATE POLICY owner_purchase_orders ON purchase_orders
      FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'purchase_order_items' AND policyname = 'owner_purchase_order_items'
  ) THEN
    CREATE POLICY owner_purchase_order_items ON purchase_order_items
      FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
