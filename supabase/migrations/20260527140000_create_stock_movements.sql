-- ──────────────────────────────────────────────────────────────────────────────
-- Table : stock_movements
-- Audit trail de tous les mouvements de stock (réceptions, ventes, ajustements,
-- sorties manuelles, inventaires physiques).
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stock_movements (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Produit
  medication_id     uuid,                       -- nullable (produit supprimé ?)
  medication_name   text        NOT NULL,       -- snapshot du nom au moment du mouvement
  dosage            text,

  -- Mouvement
  movement_type     text        NOT NULL
    CHECK (movement_type IN (
      'reception_bl',     -- Réception bon de livraison
      'vente',            -- Vente (créé automatiquement par Sales)
      'retour_client',    -- Retour / avoir client
      'inventaire',       -- Ajustement inventaire physique
      'perte',            -- Perte (vol, erreur…)
      'peremption',       -- Retrait pour péremption
      'casse'             -- Casse / dommage
    )),

  quantity_before   integer     NOT NULL DEFAULT 0,
  quantity_change   integer     NOT NULL,        -- >0 entrée, <0 sortie
  quantity_after    integer     NOT NULL DEFAULT 0,

  -- Références
  reference         text,        -- N° BL, N° vente, N° inventaire…
  supplier          text,        -- Fournisseur (réceptions)
  unit_cost         numeric,     -- Coût unitaire (réceptions)

  -- Meta
  notes             text,
  seller_id         uuid,
  seller_name       text,

  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_stock_movements_user     ON stock_movements(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_med      ON stock_movements(medication_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type     ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created  ON stock_movements(created_at DESC);

-- RLS
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own movements" ON stock_movements;
CREATE POLICY "Users manage own movements"
  ON stock_movements
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Signal PostgREST pour recharger le schéma
NOTIFY pgrst, 'reload schema';
