import { db } from './db';
import { supabase } from './supabase';
import { insertWithUserId, updateWithUserId, getCurrentUserId } from './supabaseHelpers';
import { offlineStorage } from './offlineStorage';

// ── JP-XXXXX Offline Counter ─────────────────────────────────────────────────

const UNIT_COUNTER_KEY = 'jp_unit_counter';

async function fetchRemoteCounter(): Promise<number> {
  try {
    const { data } = await supabase
      .from('inventory_units')
      .select('unit_code')
      .like('unit_code', 'JP-%')
      .order('unit_code', { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      const match = data[0].unit_code.match(/JP-(\d+)/);
      if (match) return parseInt(match[1], 10) + 1;
    }
  } catch {}
  return 0;
}

export async function reserveUnitCodes(count: number): Promise<number> {
  let stored = await db.settings.get(UNIT_COUNTER_KEY);

  if (!stored) {
    const remote = await fetchRemoteCounter();
    stored = { key: UNIT_COUNTER_KEY, value: remote.toString() };
  }

  const start = parseInt(stored.value, 10) || 0;
  await db.settings.put({ key: UNIT_COUNTER_KEY, value: (start + count).toString() });
  return start;
}

export function formatUnitCode(counter: number): string {
  return `JP-${String(counter).padStart(5, '0')}`;
}

export async function syncUnitCounterFromRemote(): Promise<void> {
  const remote = await fetchRemoteCounter();
  const stored = await db.settings.get(UNIT_COUNTER_KEY);
  const local = stored ? parseInt(stored.value, 10) || 0 : 0;
  if (remote > local) {
    await db.settings.put({ key: UNIT_COUNTER_KEY, value: remote.toString() });
  }
}

// ── Offline-First Medication Writes ──────────────────────────────────────────

export interface OfflineMedication {
  id?: string;
  name: string;
  dosage?: string;
  quantity: number;
  minimum_stock?: number;
  price: number;
  wholesale_price?: number;
  batch_number?: string | null;
  expiry_date?: string | null;
  supplier?: string | null;
  forme_produit?: string;
  name_rayon?: string;
  code_produit?: string;
}

export async function offlineSafeInsertMedication(
  data: OfflineMedication
): Promise<{ id: string; code_produit?: string }> {
  const id = data.id || crypto.randomUUID();
  const now = new Date().toISOString();

  await db.products.put({
    id,
    name: data.name,
    dosage: data.dosage || '',
    price: data.price || 0,
    wholesale_price: data.wholesale_price,
    quantity: data.quantity || 0,
    minimum_stock: data.minimum_stock ?? 10,
    batch_number: data.batch_number ?? undefined,
    expiry_date: data.expiry_date || '',
    forme_produit: data.forme_produit,
    name_rayon: data.name_rayon,
    code_produit: data.code_produit,
    updated_at: now,
  });

  if (navigator.onLine) {
    try {
      const userId = await getCurrentUserId();
      const { error } = await supabase
        .from('medications')
        .insert([{ id, ...data, user_id: userId }]);
      if (!error) return { id };
    } catch {}
  }

  offlineStorage.addToQueue({ type: 'insert', table: 'medications', data: { id, ...data } });
  return { id };
}

export async function offlineSafeUpdateMedication(
  medicationId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const now = new Date().toISOString();

  const current = await db.products.get(medicationId);
  if (current) {
    await db.products.update(medicationId, { ...fields, updated_at: now });
  }

  if (navigator.onLine) {
    try {
      const { error } = await updateWithUserId('medications', fields, { id: medicationId });
      if (!error) return;
    } catch {}
  }

  offlineStorage.addToQueue({
    type: 'update',
    table: 'medications',
    data: { id: medicationId, ...fields },
  });
}

// ── Offline-First Inventory Unit Writes ──────────────────────────────────────

export interface OfflineInventoryUnit {
  id?: string;
  medication_id: string;
  unit_code: string;
  batch_number: string;
  expiry_date: string | null;
  entry_date?: string;
  supplier?: string;
  reception_batch?: string;
  status?: string;
}

export interface CreatedUnit {
  id: string;
  unit_code: string;
  batch_number: string;
  expiry_date: string | null;
}

export async function offlineSafeInsertInventoryUnits(
  units: OfflineInventoryUnit[]
): Promise<CreatedUnit[]> {
  const unitsWithIds = units.map(u => ({
    ...u,
    id: u.id || crypto.randomUUID(),
    status: u.status || 'available',
  }));

  if (navigator.onLine) {
    try {
      const userId = await getCurrentUserId();
      const toInsert = unitsWithIds.map(u => ({ ...u, user_id: userId }));
      const { error } = await supabase.from('inventory_units').insert(toInsert);
      if (!error) {
        return unitsWithIds.map(u => ({
          id: u.id as string,
          unit_code: u.unit_code,
          batch_number: u.batch_number,
          expiry_date: u.expiry_date,
        }));
      }
    } catch {}
  }

  for (const unit of unitsWithIds) {
    offlineStorage.addToQueue({ type: 'insert', table: 'inventory_units', data: unit });
  }

  return unitsWithIds.map(u => ({
    id: u.id as string,
    unit_code: u.unit_code,
    batch_number: u.batch_number,
    expiry_date: u.expiry_date,
  }));
}

// ── Offline-Safe Stock Entry Writes ──────────────────────────────────────────

export interface OfflineStockEntry {
  medication_id: string;
  entry_date: string;
  batch_number?: string | null;
  expiry_date?: string | null;
  is_sold?: boolean;
}

export async function offlineSafeInsertStockEntries(
  entries: OfflineStockEntry[]
): Promise<void> {
  if (navigator.onLine) {
    try {
      const userId = await getCurrentUserId();
      const toInsert = entries.map(e => ({ ...e, user_id: userId }));
      const { error } = await supabase.from('stock_entries').insert(toInsert);
      if (!error) return;
    } catch {}
  }

  for (const entry of entries) {
    offlineStorage.addToQueue({ type: 'insert', table: 'stock_entries', data: entry });
  }
}

// ── Offline-Safe Credit Writes ────────────────────────────────────────────────

export interface CreditItem {
  medication_id: string;
  medication_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface OfflineCredit {
  id?: string;
  client_name: string;
  client_phone?: string;
  due_date?: string | null;
  total_amount: number;
  items: CreditItem[];
  notes?: string;
}

export async function offlineSafeInsertCredit(
  data: OfflineCredit
): Promise<{ id: string }> {
  const id = data.id || crypto.randomUUID();
  const now = new Date().toISOString();

  const creditRecord = {
    id,
    client_name: data.client_name,
    client_phone: data.client_phone || null,
    due_date: data.due_date || null,
    total_amount: data.total_amount,
    items: data.items,
    notes: data.notes || null,
    status: 'unpaid',
    sale_date: now,
    paid_at: null,
    payment_method: null,
  };

  offlineStorage.addCachedCredit({ ...creditRecord, created_at: now, updated_at: now });

  if (navigator.onLine) {
    try {
      const userId = await getCurrentUserId();
      const { error } = await supabase
        .from('credits')
        .insert([{ ...creditRecord, user_id: userId }]);
      if (!error) return { id };
    } catch {}
  }

  offlineStorage.addToQueue({ type: 'insert', table: 'credits', data: creditRecord });
  return { id };
}

export async function offlineSafePayCredit(
  credit: { id: string; total_amount: number; amount_paid: number },
  paymentAmount: number,
  paymentMethod: string
): Promise<{ status: 'paid' | 'unpaid'; newAmountPaid: number; remaining: number }> {
  const now = new Date().toISOString();
  const newAmountPaid = (credit.amount_paid || 0) + paymentAmount;
  const remaining = Math.max(0, credit.total_amount - newAmountPaid);
  const isPaid = remaining <= 0;

  const updates: Record<string, unknown> = {
    amount_paid: newAmountPaid,
    updated_at: now,
    payment_method: paymentMethod,
  };
  if (isPaid) {
    updates.status = 'paid';
    updates.paid_at = now;
  }

  offlineStorage.updateCachedCredit(credit.id, updates);

  if (navigator.onLine) {
    try {
      const { error } = await updateWithUserId('credits', updates, { id: credit.id });
      if (!error) return { status: isPaid ? 'paid' : 'unpaid', newAmountPaid, remaining };
    } catch {}
  }

  offlineStorage.addToQueue({
    type: 'update',
    table: 'credits',
    data: { id: credit.id, ...updates },
  });

  return { status: isPaid ? 'paid' : 'unpaid', newAmountPaid, remaining };
}
