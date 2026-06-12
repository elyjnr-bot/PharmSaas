/*
  # RLS Final Seal — 2026-06-12
  ─────────────────────────────────────────────────────────────────────────────
  Garantit que toutes les tables avec colonne user_id ont :
    • RLS ENABLED + FORCE (même pour le propriétaire de la DB)
    • 4 politiques strictes : SELECT / INSERT / UPDATE / DELETE

  Idempotent : peut être rejouée sans erreur.
  Couvre les tables ajoutées après la migration 20260606000000.
*/

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    -- Core métier
    'medications', 'sales_journal', 'expenses', 'credits',
    'inventory_units', 'barcodes', 'stock_movements',
    -- Achats
    'purchase_orders', 'purchase_order_items', 'supplier_reps',
    -- Historique / lots
    'medication_batches', 'medication_aliases', 'stock_entries', 'daily_reports',
    -- CRM Patients
    'patients', 'patient_purchases', 'ordonnances', 'ordonnance_items',
    -- Ventes legacy
    'sales', 'sale_items',
    -- Paramètres
    'user_settings', 'api_keys'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    );

    -- Activer RLS (y compris FORCE pour le superuser)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;',  tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;',   tbl);

    -- Supprimer les anciennes politiques pour reset propre
    EXECUTE format('DROP POLICY IF EXISTS "User can read own data"    ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "User can insert own data"  ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "User can update own data"  ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "User can delete own data"  ON public.%I;', tbl);
    -- Anciens noms alternatifs
    EXECUTE format('DROP POLICY IF EXISTS "Users manage own movements" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "owner_%s"                   ON public.%I;', tbl, tbl);

    -- SELECT
    EXECUTE format($p$
      CREATE POLICY "User can read own data"
      ON public.%I FOR SELECT TO authenticated
      USING (user_id = auth.uid());
    $p$, tbl);

    -- INSERT
    EXECUTE format($p$
      CREATE POLICY "User can insert own data"
      ON public.%I FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
    $p$, tbl);

    -- UPDATE
    EXECUTE format($p$
      CREATE POLICY "User can update own data"
      ON public.%I FOR UPDATE TO authenticated
      USING  (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
    $p$, tbl);

    -- DELETE
    EXECUTE format($p$
      CREATE POLICY "User can delete own data"
      ON public.%I FOR DELETE TO authenticated
      USING (user_id = auth.uid());
    $p$, tbl);

    RAISE NOTICE 'RLS sealed: %', tbl;
  END LOOP;
END $$;

-- user_profiles : clé primaire = id (pas user_id)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "User can read own profile"   ON public.user_profiles;
    DROP POLICY IF EXISTS "User can update own profile" ON public.user_profiles;
    DROP POLICY IF EXISTS "User can insert own profile" ON public.user_profiles;

    CREATE POLICY "User can read own profile"
      ON public.user_profiles FOR SELECT TO authenticated USING (id = auth.uid());
    CREATE POLICY "User can update own profile"
      ON public.user_profiles FOR UPDATE TO authenticated
      USING (id = auth.uid()) WITH CHECK (id = auth.uid());
    CREATE POLICY "User can insert own profile"
      ON public.user_profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
  END IF;
END $$;

-- Forcer PostgREST à recharger le schéma
NOTIFY pgrst, 'reload schema';
