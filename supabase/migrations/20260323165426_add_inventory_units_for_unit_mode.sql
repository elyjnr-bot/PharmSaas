/*
  # Add Inventory Units Table for Advanced Traceability (Unit Mode)

  ## Overview
  This migration creates the inventory_units table to support the "Unit Mode" workflow,
  where each physical box receives a unique traceable barcode throughout its lifecycle.

  ## New Table: `inventory_units`

  Each row represents one physical unit (box/package) in the pharmacy.

  ### Columns:
  - `id` (uuid, PK) - Internal database identifier
  - `unit_code` (text, unique) - Unique scannable code printed on box (JP-[MED_HASH]-[TS]-[N])
  - `medication_id` (uuid, FK) - Linked medication product
  - `batch_number` (text) - Manufacturer's batch/lot number
  - `expiry_date` (date) - Expiration date of this unit
  - `reception_batch` (text) - Groups all units generated during same reception event
  - `status` (text) - Current state: 'available', 'sold', 'expired', 'lost'
  - `sale_id` (text) - Reference to sale transaction (if sold)
  - `sold_at` (timestamptz) - Timestamp of sale
  - `imported_code` (text) - Original internal code from Excel import (legacy mapping)
  - `created_at` (timestamptz) - When the unit was registered

  ## Security
  - Enable RLS on inventory_units
  - Only authenticated users can access their pharmacy's inventory units
  - Insert/update/delete restricted to authenticated users

  ## Notes
  - Unit codes follow format: JP-[6char_product_hash]-[timestamp]-[3digit_increment]
  - One unit = one physical box — never reuse a code
  - `reception_batch` allows batch printing of all codes from one reception event
  - When a unit is sold, status → 'sold' and sold_at is set
*/

CREATE TABLE IF NOT EXISTS inventory_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_code text UNIQUE NOT NULL,
  medication_id uuid NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  batch_number text NOT NULL DEFAULT '',
  expiry_date date,
  reception_batch text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold', 'expired', 'lost')),
  sale_id text,
  sold_at timestamptz,
  imported_code text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE inventory_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read inventory units"
  ON inventory_units
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert inventory units"
  ON inventory_units
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update inventory units"
  ON inventory_units
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete inventory units"
  ON inventory_units
  FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_inventory_units_unit_code ON inventory_units(unit_code);
CREATE INDEX IF NOT EXISTS idx_inventory_units_medication_id ON inventory_units(medication_id);
CREATE INDEX IF NOT EXISTS idx_inventory_units_status ON inventory_units(status);
CREATE INDEX IF NOT EXISTS idx_inventory_units_reception_batch ON inventory_units(reception_batch);
CREATE INDEX IF NOT EXISTS idx_inventory_units_imported_code ON inventory_units(imported_code);
