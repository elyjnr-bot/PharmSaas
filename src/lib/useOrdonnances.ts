import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

// ── Types (source of truth — imported by Ordonnances.tsx) ─────────────────────
export type OrdStatus = 'en_attente' | 'partielle' | 'terminee';

export interface OrdonnanceItem {
  id: string;
  medication_id?: string;   // FK vers medications.id (disponible si sélectionné via autocomplete)
  name: string;
  dci: string;
  dosage: string;
  qty: number;
  qty_delivered: number;
  stock_available: number;
  status: 'disponible' | 'rupture';
  alternative?: string;
}

export interface Ordonnance {
  id: string;
  ref: string;
  patient_id?: string | null;  // FK → patients.id (optional)
  patient_name: string;
  patient_phone: string;
  medecin: string;
  date: string;           // YYYY-MM-DD
  status: OrdStatus;
  items: OrdonnanceItem[];
  total: number;
  notes: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function genOrdRef(): string {
  return `ORD-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
}

const CACHE_KEY  = 'jp_ordonnances_cache_v2';
const LEGACY_KEY = 'jp_ordonnances_v1';
const MIGRATED   = 'jp_ordonnances_migrated';

function cacheGet(): Ordonnance[] {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
}
function cacheSet(list: Ordonnance[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch { /* quota */ }
}

function rowToOrd(row: any): Ordonnance {
  const items: OrdonnanceItem[] = (row.ordonnance_items || [])
    .slice()
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((i: any): OrdonnanceItem => ({
      id:              i.id,
      name:            i.name,
      dci:             i.dci     || '',
      dosage:          i.dosage  || '',
      qty:             Number(i.qty),
      qty_delivered:   Number(i.qty_delivered),
      stock_available: Number(i.stock_available),
      status:          i.status  || 'disponible',
      alternative:     i.alternative || undefined,
    }));

  return {
    id:            row.id,
    ref:           row.ref,
    patient_id:    row.patient_id    || null,
    patient_name:  row.patient_name,
    patient_phone: row.patient_phone || '',
    medecin:       row.medecin       || '',
    date:          row.date,
    status:        row.status as OrdStatus,
    items,
    total:         Number(row.total ?? 0),
    notes:         row.notes    || '',
    created_at:    row.created_at,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useOrdonnances() {
  const [ords, setOrds] = useState<Ordonnance[]>(() => cacheGet());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('ordonnances')
        .select('*, ordonnance_items(*)')
        .order('created_at', { ascending: false });

      if (err) throw err;

      let mapped: Ordonnance[] = (data || []).map(rowToOrd);

      // ── One-time migration from localStorage (jp_ordonnances_v1) ──────────
      if (mapped.length === 0 && !localStorage.getItem(MIGRATED)) {
        const legacy: Ordonnance[] = (() => {
          try { return JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]'); } catch { return []; }
        })();

        if (legacy.length > 0) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            for (const o of legacy) {
              try {
                const { data: ins } = await supabase
                  .from('ordonnances')
                  .insert({
                    user_id:       user.id,
                    ref:           o.ref,
                    patient_name:  o.patient_name,
                    patient_phone: o.patient_phone || null,
                    medecin:       o.medecin       || null,
                    date:          o.date,
                    status:        o.status,
                    notes:         o.notes         || null,
                    created_at:    o.created_at,
                  })
                  .select()
                  .single();

                if (ins && o.items?.length) {
                  await supabase.from('ordonnance_items').insert(
                    o.items.map((item, idx) => ({
                      ordonnance_id:   ins.id,
                      user_id:         user.id,
                      name:            item.name,
                      dci:             item.dci            || '',
                      dosage:          item.dosage         || '',
                      qty:             item.qty,
                      qty_delivered:   item.qty_delivered,
                      stock_available: item.stock_available,
                      status:          item.status,
                      alternative:     item.alternative    || null,
                      sort_order:      idx,
                    }))
                  );
                }
              } catch { /* skip failed records */ }
            }
          }
        }

        localStorage.setItem(MIGRATED, '1');

        const { data: fresh } = await supabase
          .from('ordonnances')
          .select('*, ordonnance_items(*)')
          .order('created_at', { ascending: false });
        mapped = (fresh || []).map(rowToOrd);
      }

      setOrds(mapped);
      cacheSet(mapped);
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
      const cached = cacheGet();
      if (cached.length > 0) setOrds(cached);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── saveOrdonnance (upsert) ──────────────────────────────────────────────────
  // Returns the saved ordonnance with its real DB id (important for new records).
  const saveOrdonnance = useCallback(async (ord: Ordonnance): Promise<Ordonnance> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Non authentifié');

    const isExisting = ords.some(o => o.id === ord.id);
    let savedId: string;

    if (!isExisting) {
      // ── INSERT ──
      const { data: ins, error: err } = await supabase
        .from('ordonnances')
        .insert({
          user_id:       user.id,
          ref:           ord.ref,
          patient_id:    ord.patient_id    || null,
          patient_name:  ord.patient_name,
          patient_phone: ord.patient_phone || null,
          medecin:       ord.medecin       || null,
          date:          ord.date,
          status:        ord.status,
          notes:         ord.notes         || null,
        })
        .select()
        .single();

      if (err) throw err;
      savedId = ins.id;
    } else {
      // ── UPDATE header ──
      const { error: err } = await supabase
        .from('ordonnances')
        .update({
          patient_id:    ord.patient_id    || null,
          patient_name:  ord.patient_name,
          patient_phone: ord.patient_phone || null,
          medecin:       ord.medecin       || null,
          date:          ord.date,
          status:        ord.status,
          notes:         ord.notes         || null,
          updated_at:    new Date().toISOString(),
        })
        .eq('id', ord.id);

      if (err) throw err;
      savedId = ord.id;

      // Delete existing items then re-insert (simpler than diffing)
      await supabase.from('ordonnance_items').delete().eq('ordonnance_id', savedId);
    }

    // ── INSERT items ──
    if (ord.items.length > 0) {
      const { error: err } = await supabase
        .from('ordonnance_items')
        .insert(
          ord.items.map((item, idx) => ({
            ordonnance_id:   savedId,
            user_id:         user.id,
            name:            item.name,
            dci:             item.dci            || '',
            dosage:          item.dosage         || '',
            qty:             item.qty,
            qty_delivered:   item.qty_delivered,
            stock_available: item.stock_available,
            status:          item.status,
            alternative:     item.alternative    || null,
            sort_order:      idx,
          }))
        );
      if (err) throw err;
    }

    // Reload the saved record with its items
    const { data: fresh, error: ferr } = await supabase
      .from('ordonnances')
      .select('*, ordonnance_items(*)')
      .eq('id', savedId)
      .single();

    if (ferr) throw ferr;

    const saved = rowToOrd(fresh);

    setOrds(prev => {
      const idx = prev.findIndex(o => o.id === ord.id);
      let next: Ordonnance[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = saved;
      } else {
        next = [saved, ...prev];
      }
      cacheSet(next);
      return next;
    });

    return saved;
  }, [ords]);

  // ── deleteOrdonnance ─────────────────────────────────────────────────────────
  const deleteOrdonnance = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase.from('ordonnances').delete().eq('id', id);
    if (err) throw err;

    setOrds(prev => {
      const next = prev.filter(o => o.id !== id);
      cacheSet(next);
      return next;
    });
  }, []);

  // ── changeStatus ─────────────────────────────────────────────────────────────
  const changeStatus = useCallback(async (id: string, status: OrdStatus): Promise<void> => {
    const { error: err } = await supabase
      .from('ordonnances')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (err) throw err;

    // If terminée, also mark all items as fully delivered in DB
    if (status === 'terminee') {
      const ord = ords.find(o => o.id === id);
      if (ord) {
        for (const item of ord.items) {
          await supabase
            .from('ordonnance_items')
            .update({ qty_delivered: item.qty })
            .eq('id', item.id);
        }
      }
    }

    setOrds(prev => {
      const next = prev.map(o => {
        if (o.id !== id) return o;
        const items = status === 'terminee'
          ? o.items.map(i => ({ ...i, qty_delivered: i.qty }))
          : o.items;
        return { ...o, status, items };
      });
      cacheSet(next);
      return next;
    });
  }, [ords]);

  return {
    ords,
    isLoading,
    error,
    reload: load,
    saveOrdonnance,
    deleteOrdonnance,
    changeStatus,
  };
}
