/*
  # Add FormeProduit and NameRayon columns to medications

  1. Changes
    - `forme_produit` (text, nullable) — pharmaceutical form (e.g. Comprimé, Sirop, Gélule…)
    - `name_rayon` (text, nullable) — shelf/department name (e.g. Antibiotiques, Vitamines…)

  2. Notes
    - Both columns are nullable so existing rows are unaffected
    - No default values — populated during CSV import or manual edit
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medications' AND column_name = 'forme_produit'
  ) THEN
    ALTER TABLE medications ADD COLUMN forme_produit text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medications' AND column_name = 'name_rayon'
  ) THEN
    ALTER TABLE medications ADD COLUMN name_rayon text;
  END IF;
END $$;
