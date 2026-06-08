/*
  # Create patients, patient_purchases, ordonnances & ordonnance_items tables

  ## Purpose
  Replaces the localStorage-only storage for the CRM Patients and Ordonnances tabs
  with proper Supabase tables. Each table is scoped to a user via user_id RLS.

  ## New Tables

  ### patients
  Full CRM patient record: identity, contact, medical profile (allergies, therapeutic profile).

  ### patient_purchases
  Manual purchase records linked to a patient (separate from POS sales_journal).
  FK → patients(id) with CASCADE delete.

  ### ordonnances
  Prescription header: patient ref, doctor, date, status lifecycle (en_attente → partielle → terminee).
  Optional FK → patients(id) for linked CRM records.

  ### ordonnance_items
  Individual line items for a prescription.
  FK → ordonnances(id) with CASCADE delete.

  ## Security
  RLS enabled on all four tables. Strict per-user isolation via user_id = auth.uid().
  SELECT / INSERT / UPDATE / DELETE policies for authenticated users.

  ## Indexes
  Covering indexes on user_id, name, status, date for fast filtering.
*/

-- ─── patients ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS patients (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                text        NOT NULL,
  phone               text,
  email               text,
  address             text,
  dob                 date,
  gender              text        CHECK (gender IN ('M', 'F', 'autre', NULL)),
  blood_type          text,
  allergies           text[]      NOT NULL DEFAULT '{}',
  therapeutic_profile text[]      NOT NULL DEFAULT '{}',
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patients_select" ON patients
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "patients_insert" ON patients
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "patients_update" ON patients
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "patients_delete" ON patients
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS patients_user_id_idx  ON patients(user_id);
CREATE INDEX IF NOT EXISTS patients_name_idx     ON patients(user_id, lower(name));


-- ─── patient_purchases ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS patient_purchases (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     uuid        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date           timestamptz NOT NULL DEFAULT now(),
  ticket         text,
  items          jsonb       NOT NULL DEFAULT '[]',
  total          numeric     NOT NULL DEFAULT 0,
  payment_method text        DEFAULT 'espèces',
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE patient_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_purchases_select" ON patient_purchases
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "patient_purchases_insert" ON patient_purchases
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "patient_purchases_update" ON patient_purchases
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "patient_purchases_delete" ON patient_purchases
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS patient_purchases_patient_id_idx ON patient_purchases(patient_id);
CREATE INDEX IF NOT EXISTS patient_purchases_date_idx       ON patient_purchases(date DESC);


-- ─── ordonnances ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ordonnances (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ref           text        NOT NULL,
  patient_id    uuid        REFERENCES patients(id) ON DELETE SET NULL,
  patient_name  text        NOT NULL,
  patient_phone text,
  medecin       text,
  date          date        NOT NULL DEFAULT CURRENT_DATE,
  status        text        NOT NULL DEFAULT 'en_attente'
                            CHECK (status IN ('en_attente', 'partielle', 'terminee')),
  notes         text,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ordonnances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ordonnances_select" ON ordonnances
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "ordonnances_insert" ON ordonnances
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "ordonnances_update" ON ordonnances
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "ordonnances_delete" ON ordonnances
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS ordonnances_user_id_idx    ON ordonnances(user_id);
CREATE INDEX IF NOT EXISTS ordonnances_patient_id_idx ON ordonnances(patient_id);
CREATE INDEX IF NOT EXISTS ordonnances_status_idx     ON ordonnances(user_id, status);
CREATE INDEX IF NOT EXISTS ordonnances_date_idx       ON ordonnances(date DESC);


-- ─── ordonnance_items ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ordonnance_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ordonnance_id   uuid        NOT NULL REFERENCES ordonnances(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  dci             text        NOT NULL DEFAULT '',
  dosage          text        NOT NULL DEFAULT '',
  qty             integer     NOT NULL DEFAULT 1 CHECK (qty > 0),
  qty_delivered   integer     NOT NULL DEFAULT 0,
  stock_available integer     NOT NULL DEFAULT 0,
  status          text        NOT NULL DEFAULT 'disponible'
                              CHECK (status IN ('disponible', 'rupture')),
  alternative     text,
  sort_order      smallint    DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ordonnance_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ord_items_select" ON ordonnance_items
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "ord_items_insert" ON ordonnance_items
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "ord_items_update" ON ordonnance_items
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "ord_items_delete" ON ordonnance_items
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS ord_items_ordonnance_id_idx ON ordonnance_items(ordonnance_id);
CREATE INDEX IF NOT EXISTS ord_items_sort_idx          ON ordonnance_items(ordonnance_id, sort_order);
