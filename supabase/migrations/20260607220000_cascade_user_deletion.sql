/*
  # Suppression en cascade — quand un user est supprimé, ses données partent avec
  ─────────────────────────────────────────────────────────────────────────────
  Configure les foreign keys pour que la suppression d'un user (auth.users)
  supprime AUTOMATIQUEMENT toutes ses données dans les tables liées.

  Sans ça, supprimer un user via le dashboard Supabase échoue avec :
    "Database error deleting user" (foreign key constraint violation)

  Avec ON DELETE CASCADE :
    1. L'admin supprime un user dans Authentication → Users
    2. PostgreSQL supprime automatiquement TOUTES ses données
    3. Pas d'orphelin, pas d'erreur
*/

DO $$
DECLARE
  tbl text;
  fk_constraint_name text;
  tables text[] := ARRAY[
    'medications', 'sales_journal', 'expenses', 'credits',
    'inventory_units', 'barcodes', 'stock_movements',
    'purchase_orders', 'purchase_order_items', 'supplier_reps',
    'medication_batches', 'medication_aliases',
    'sales', 'sale_items', 'stock_entries', 'daily_reports',
    'user_settings', 'sellers',
    'patients', 'ordonnances', 'ordonnance_items', 'patient_purchases'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=tbl) THEN

      -- Trouver le nom de la FK existante sur user_id pointant vers auth.users
      SELECT tc.constraint_name INTO fk_constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = tbl
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'user_id'
      LIMIT 1;

      -- Si une FK existe, la droper et la recréer avec CASCADE
      IF fk_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', tbl, fk_constraint_name);
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',
          tbl, fk_constraint_name
        );
      ELSE
        -- Pas de FK existante : la créer directement avec CASCADE
        -- (cas où la colonne user_id existe mais n'a pas de contrainte)
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name=tbl AND column_name='user_id'
        ) THEN
          EXECUTE format(
            'ALTER TABLE public.%I ADD CONSTRAINT %I_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',
            tbl, tbl
          );
        END IF;
      END IF;

      fk_constraint_name := NULL; -- reset pour la prochaine boucle
    END IF;
  END LOOP;
END $$;

-- Cas particulier : user_profiles (clé = id, pas user_id)
DO $$
DECLARE
  fk_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='user_profiles') THEN

    SELECT tc.constraint_name INTO fk_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'user_profiles'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'id'
    LIMIT 1;

    IF fk_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.user_profiles DROP CONSTRAINT %I', fk_name);
    END IF;

    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
