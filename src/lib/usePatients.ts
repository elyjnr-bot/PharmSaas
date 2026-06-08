import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

// ── Types (source of truth — imported by Patients.tsx) ────────────────────────
export type PatientType = 'occasionnel' | 'récurrent' | 'fidèle';

export interface PatientPurchase {
  id: string;
  date: string;           // ISO timestamp
  ticket: string;
  items: string[];        // product names
  total: number;
  payment_method?: string;
}

export interface Patient {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  dob: string;            // YYYY-MM-DD
  type: PatientType;
  allergies: string[];
  therapeutic_profile: string[];
  notes: string;
  created_at: string;
  purchases: PatientPurchase[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function computePatientType(visits: number): PatientType {
  if (visits >= 5) return 'fidèle';
  if (visits >= 2) return 'récurrent';
  return 'occasionnel';
}

const CACHE_KEY  = 'jp_patients_cache_v2';
const LEGACY_KEY = 'jp_patients_v1';
const MIGRATED   = 'jp_patients_migrated';

function cacheGet(): Patient[] {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
}
function cacheSet(list: Patient[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch { /* quota */ }
}

function rowToPatient(row: any): Patient {
  const purchases: PatientPurchase[] = (row.patient_purchases || [])
    .slice()
    .sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''))
    .map((p: any): PatientPurchase => ({
      id:             p.id,
      date:           p.date,
      ticket:         p.ticket || '',
      items:          Array.isArray(p.items) ? p.items : [],
      total:          Number(p.total),
      payment_method: p.payment_method || undefined,
    }));

  return {
    id:                  row.id,
    name:                row.name,
    phone:               row.phone || '',
    email:               row.email || '',
    address:             row.address || '',
    dob:                 row.dob || '',
    type:                computePatientType(purchases.length),
    allergies:           row.allergies || [],
    therapeutic_profile: row.therapeutic_profile || [],
    notes:               row.notes || '',
    created_at:          row.created_at,
    purchases,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function usePatients() {
  const [patients, setPatients] = useState<Patient[]>(() => cacheGet());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('patients')
        .select('*, patient_purchases(*)')
        .order('name', { ascending: true });

      if (err) throw err;

      let mapped: Patient[] = (data || []).map(rowToPatient);

      // ── One-time migration from localStorage (jp_patients_v1) ─────────────
      if (mapped.length === 0 && !localStorage.getItem(MIGRATED)) {
        const legacy: Patient[] = (() => {
          try { return JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]'); } catch { return []; }
        })();

        if (legacy.length > 0) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            for (const p of legacy) {
              try {
                const { data: ins } = await supabase
                  .from('patients')
                  .insert({
                    user_id:             user.id,
                    name:                p.name,
                    phone:               p.phone  || null,
                    email:               p.email  || null,
                    address:             p.address || null,
                    dob:                 p.dob    || null,
                    allergies:           p.allergies           || [],
                    therapeutic_profile: p.therapeutic_profile || [],
                    notes:               p.notes  || null,
                    created_at:          p.created_at,
                  })
                  .select()
                  .single();

                if (ins && p.purchases?.length) {
                  await supabase.from('patient_purchases').insert(
                    p.purchases.map(pur => ({
                      patient_id:     ins.id,
                      user_id:        user.id,
                      date:           pur.date,
                      ticket:         pur.ticket   || null,
                      items:          pur.items    || [],
                      total:          pur.total,
                      payment_method: pur.payment_method || 'espèces',
                    }))
                  );
                }
              } catch { /* skip failed records */ }
            }
          }
        }

        localStorage.setItem(MIGRATED, '1');

        // Reload after migration
        const { data: fresh } = await supabase
          .from('patients')
          .select('*, patient_purchases(*)')
          .order('name', { ascending: true });
        mapped = (fresh || []).map(rowToPatient);
      }

      setPatients(mapped);
      cacheSet(mapped);
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
      // Fallback to cache so UI is not empty offline
      const cached = cacheGet();
      if (cached.length > 0) setPatients(cached);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── addPatient ───────────────────────────────────────────────────────────────
  const addPatient = useCallback(async (data: {
    name: string; phone: string; email: string; address: string;
    dob: string; allergies: string[]; therapeutic_profile: string[]; notes: string;
  }): Promise<Patient> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Non authentifié');

    const { data: ins, error: err } = await supabase
      .from('patients')
      .insert({
        user_id:             user.id,
        name:                data.name,
        phone:               data.phone   || null,
        email:               data.email   || null,
        address:             data.address || null,
        dob:                 data.dob     || null,
        allergies:           data.allergies,
        therapeutic_profile: data.therapeutic_profile,
        notes:               data.notes   || null,
      })
      .select()
      .single();

    if (err) throw err;

    const p = rowToPatient({ ...ins, patient_purchases: [] });
    setPatients(prev => {
      const next = [...prev, p].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      cacheSet(next);
      return next;
    });
    return p;
  }, []);

  // ── updatePatient ────────────────────────────────────────────────────────────
  const updatePatient = useCallback(async (id: string, data: {
    name: string; phone: string; email: string; address: string;
    dob: string; allergies: string[]; therapeutic_profile: string[]; notes: string;
  }): Promise<void> => {
    const { error: err } = await supabase
      .from('patients')
      .update({
        name:                data.name,
        phone:               data.phone   || null,
        email:               data.email   || null,
        address:             data.address || null,
        dob:                 data.dob     || null,
        allergies:           data.allergies,
        therapeutic_profile: data.therapeutic_profile,
        notes:               data.notes   || null,
        updated_at:          new Date().toISOString(),
      })
      .eq('id', id);

    if (err) throw err;

    setPatients(prev => {
      const next = prev.map(p =>
        p.id !== id ? p : { ...p, ...data, type: computePatientType(p.purchases.length) }
      ).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      cacheSet(next);
      return next;
    });
  }, []);

  // ── deletePatient ────────────────────────────────────────────────────────────
  const deletePatient = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase.from('patients').delete().eq('id', id);
    if (err) throw err;

    setPatients(prev => {
      const next = prev.filter(p => p.id !== id);
      cacheSet(next);
      return next;
    });
  }, []);

  // ── addPurchase ──────────────────────────────────────────────────────────────
  const addPurchase = useCallback(async (
    patientId: string,
    purchase: { date: string; ticket: string; items: string[]; total: number; payment_method?: string }
  ): Promise<PatientPurchase> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Non authentifié');

    const { data: ins, error: err } = await supabase
      .from('patient_purchases')
      .insert({
        patient_id:     patientId,
        user_id:        user.id,
        date:           purchase.date,
        ticket:         purchase.ticket        || null,
        items:          purchase.items         || [],
        total:          purchase.total,
        payment_method: purchase.payment_method || 'espèces',
      })
      .select()
      .single();

    if (err) throw err;

    const newPur: PatientPurchase = {
      id:             ins.id,
      date:           ins.date,
      ticket:         ins.ticket         || '',
      items:          ins.items          || [],
      total:          Number(ins.total),
      payment_method: ins.payment_method || undefined,
    };

    setPatients(prev => {
      const next = prev.map(p => {
        if (p.id !== patientId) return p;
        const purchases = [newPur, ...p.purchases];
        return { ...p, purchases, type: computePatientType(purchases.length) };
      });
      cacheSet(next);
      return next;
    });

    return newPur;
  }, []);

  return {
    patients,
    isLoading,
    error,
    reload: load,
    addPatient,
    updatePatient,
    deletePatient,
    addPurchase,
  };
}
