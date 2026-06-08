/*
  # Garantir l'isolation des données par utilisateur (RLS)
  ─────────────────────────────────────────────────────────────────────────────
  Active la Row Level Security et crée des policies strictes sur toutes les
  tables contenant des données utilisateur.

  Chaque utilisateur peut UNIQUEMENT lire/écrire ses propres données.
*/

-- Liste des tables à sécuriser
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'medications', 'sales_journal', 'expenses', 'credits',
    'inventory_units', 'barcodes', 'stock_movements',
    'purchase_orders', 'purchase_order_items', 'supplier_reps',
    'medication_batches', 'medication_aliases',
    'sales', 'sale_items', 'stock_entries', 'daily_reports',
    'user_settings'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Skip si la table n'existe pas (selon les déploiements)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', tbl);

      -- Drop existing policies pour reset propre
      EXECUTE format('DROP POLICY IF EXISTS "User can read own data" ON public.%I;', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "User can insert own data" ON public.%I;', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "User can update own data" ON public.%I;', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "User can delete own data" ON public.%I;', tbl);

      -- SELECT : user voit uniquement ses lignes
      EXECUTE format($p$
        CREATE POLICY "User can read own data"
        ON public.%I
        FOR SELECT TO authenticated
        USING (user_id = auth.uid());
      $p$, tbl);

      -- INSERT : user ne peut insérer qu'avec son propre user_id
      EXECUTE format($p$
        CREATE POLICY "User can insert own data"
        ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (user_id = auth.uid());
      $p$, tbl);

      -- UPDATE : user modifie uniquement ses lignes
      EXECUTE format($p$
        CREATE POLICY "User can update own data"
        ON public.%I
        FOR UPDATE TO authenticated
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid());
      $p$, tbl);

      -- DELETE : user supprime uniquement ses lignes
      EXECUTE format($p$
        CREATE POLICY "User can delete own data"
        ON public.%I
        FOR DELETE TO authenticated
        USING (user_id = auth.uid());
      $p$, tbl);
    END IF;
  END LOOP;
END $$;

-- Cas particulier : user_profiles (clé = id, pas user_id)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_profiles') THEN
    ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "User can read own profile" ON public.user_profiles;
    DROP POLICY IF EXISTS "User can update own profile" ON public.user_profiles;
    DROP POLICY IF EXISTS "User can insert own profile" ON public.user_profiles;

    CREATE POLICY "User can read own profile"
      ON public.user_profiles FOR SELECT TO authenticated
      USING (id = auth.uid());

    CREATE POLICY "User can update own profile"
      ON public.user_profiles FOR UPDATE TO authenticated
      USING (id = auth.uid()) WITH CHECK (id = auth.uid());

    CREATE POLICY "User can insert own profile"
      ON public.user_profiles FOR INSERT TO authenticated
      WITH CHECK (id = auth.uid());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
