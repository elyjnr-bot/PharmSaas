/*
  # Consolidate duplicate medications with null code_produit

  ## Problem
  The old CSV import in Stock.tsx used bare INSERT statements without any deduplication,
  creating multiple rows for the same medication name (different lots/batches).
  All these rows have code_produit = NULL.

  ## What this migration does
  1. For each medication name that appears multiple times with null code_produit:
     - Sums all quantities into the earliest-created row (the "keeper")
     - Deletes the duplicate rows
  2. Assigns a stable AUTO-generated code_produit to all remaining null-code_produit rows
     using the pattern AUTO-{normalized_name_prefix}-{id_suffix} to ensure uniqueness

  ## Result
  - No more duplicate medication names in the inventory list
  - Every medication has a code_produit for future upsert deduplication
  - Total stock quantities are preserved (summed, not lost)
*/

DO $$
DECLARE
  r RECORD;
  total_qty INTEGER;
  keeper_id UUID;
BEGIN
  -- Step 1: For each name with multiple null-code_produit rows, consolidate into one
  FOR r IN
    SELECT name
    FROM medications
    WHERE code_produit IS NULL
    GROUP BY name
    HAVING COUNT(*) > 1
  LOOP
    -- Sum all quantities for this name
    SELECT SUM(quantity) INTO total_qty
    FROM medications
    WHERE code_produit IS NULL AND name = r.name;

    -- Pick the keeper: earliest created_at
    SELECT id INTO keeper_id
    FROM medications
    WHERE code_produit IS NULL AND name = r.name
    ORDER BY created_at ASC
    LIMIT 1;

    -- Update keeper with summed quantity
    UPDATE medications
    SET quantity = total_qty
    WHERE id = keeper_id;

    -- Remove all other duplicate rows for this name
    DELETE FROM medications
    WHERE code_produit IS NULL
      AND name = r.name
      AND id <> keeper_id;
  END LOOP;

  -- Step 2: Assign stable auto code_produit to all remaining null rows
  UPDATE medications
  SET code_produit = 'AUTO-' || UPPER(REGEXP_REPLACE(SUBSTR(name, 1, 6), '[^A-Za-z0-9]', '', 'g'))
                    || '-' || UPPER(SUBSTR(id::TEXT, 1, 6))
  WHERE code_produit IS NULL;
END $$;
