/*
  # Add medication aliases table for OCR error correction

  1. New Tables
    - `medication_aliases`
      - `id` (uuid, primary key) - Unique identifier for each alias
      - `medication_id` (uuid, foreign key) - Reference to the actual medication
      - `alias` (text) - The alternative name/OCR error that should map to this medication
      - `confidence` (integer) - How often this alias has been correct (for learning)
      - `created_at` (timestamptz) - When the alias was created
      - `created_by` (uuid) - User who created the alias (optional)
  
  2. Security
    - Enable RLS on `medication_aliases` table
    - Add policies for authenticated users to read aliases
    - Add policies for authenticated users to create aliases
    - Add policies for managers to update/delete aliases

  3. Indexes
    - Index on `alias` for fast lookup during OCR matching
    - Index on `medication_id` for reverse lookups

  4. Notes
    - Aliases are case-insensitive for matching
    - Multiple aliases can point to the same medication
    - System will use aliases before fuzzy matching
*/

CREATE TABLE IF NOT EXISTS medication_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  alias text NOT NULL,
  confidence integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(alias)
);

CREATE INDEX IF NOT EXISTS idx_medication_aliases_alias ON medication_aliases(LOWER(alias));
CREATE INDEX IF NOT EXISTS idx_medication_aliases_medication_id ON medication_aliases(medication_id);

ALTER TABLE medication_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read aliases"
  ON medication_aliases
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create aliases"
  ON medication_aliases
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Managers can update aliases"
  ON medication_aliases
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'manager'
    )
  );

CREATE POLICY "Managers can delete aliases"
  ON medication_aliases
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'manager'
    )
  );

INSERT INTO medication_aliases (medication_id, alias) 
SELECT id, 'PERVEX' FROM medications WHERE LOWER(name) = 'fervex'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO medication_aliases (medication_id, alias) 
SELECT id, 'FERVE' FROM medications WHERE LOWER(name) = 'fervex'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO medication_aliases (medication_id, alias) 
SELECT id, 'PFERV' FROM medications WHERE LOWER(name) = 'fervex'
ON CONFLICT (alias) DO NOTHING;
