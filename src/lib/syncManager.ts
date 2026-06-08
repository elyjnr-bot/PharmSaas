import { useState, useEffect, useCallback, useRef } from 'react';
import { db, getUnsyncedSalesCount, getQueuedOperationsCount } from './db';
import { offlineStorage } from './offlineStorage';
import { insertWithUserId, upsertWithUserId, updateWithUserId } from './supabaseHelpers';
import { syncUnitCounterFromRemote } from './writeService';

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'offline';

const SYNC_INTERVAL_MS = 30_000;

export function useSyncManager() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const syncLockRef = useRef(false);

  const checkSyncStatus = useCallback(async () => {
    if (!isOnline) {
      setSyncStatus('offline');
      return;
    }

    const unsyncedSales = await getUnsyncedSalesCount();
    const unsyncedLinks = await db.barcodeLinks.where('synced').equals(false).count();
    const queuedOps = await getQueuedOperationsCount();
    const offlineQueueSize = offlineStorage.getQueue().length;
    const unsyncedJournal = offlineStorage.getUnsyncedJournalEntries().length;
    const total = unsyncedSales + unsyncedLinks + queuedOps + offlineQueueSize + unsyncedJournal;

    setUnsyncedCount(total);
    setSyncStatus(total > 0 ? 'pending' : 'synced');
  }, [isOnline]);

  const syncToCloud = useCallback(async () => {
    if (!isOnline || syncLockRef.current) return;
    syncLockRef.current = true;
    setSyncStatus('syncing');

    try {
      await syncDexieSales();
      await syncBarcodeLinks();
      await syncOfflineJournal();
      await syncOfflineQueue();
      await syncUnitCounterFromRemote();
      await checkSyncStatus();
    } catch (err) {
      console.error('[SyncManager] sync error:', err);
      setSyncStatus('pending');
    } finally {
      syncLockRef.current = false;
    }
  }, [isOnline, checkSyncStatus]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncToCloud();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    checkSyncStatus();

    const interval = setInterval(async () => {
      if (navigator.onLine) {
        await checkSyncStatus();
        syncToCloud();
      }
    }, SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [syncToCloud, checkSyncStatus]);

  return {
    syncStatus,
    isOnline,
    unsyncedCount,
    syncNow: syncToCloud,
    checkStatus: checkSyncStatus,
  };
}

async function syncDexieSales() {
  const unsyncedSales = await db.sales.where('synced').equals(false).toArray();
  for (const sale of unsyncedSales) {
    try {
      const { error } = await insertWithUserId('sales_journal', [{
        medication_id: sale.medication_id,
        medication_name: sale.medication_name,
        quantity_sold: sale.quantity_sold,
        unit_price: sale.unit_price,
        total_price: sale.total_price,
        payment_method: sale.payment_method,
        seller_name: sale.seller_name || null,
        sale_date: sale.sale_date,
        stock_after_sale: 0,
        synced: true,
      }]);
      if (!error) await db.sales.update(sale.id, { synced: true });
    } catch {}
  }
}

async function syncBarcodeLinks() {
  const unsyncedLinks = await db.barcodeLinks.where('synced').equals(false).toArray();
  for (const link of unsyncedLinks) {
    try {
      const { error } = await upsertWithUserId('barcodes', {
        barcode: link.barcode,
        medication_id: link.product_id,
        code_produit: '',
      }, { onConflict: 'barcode', ignoreDuplicates: false });
      if (!error) await db.barcodeLinks.update(link.barcode, { synced: true });
    } catch {}
  }
}

async function syncOfflineJournal() {
  const entries = offlineStorage.getUnsyncedJournalEntries();
  for (const entry of entries) {
    try {
      const { error } = await insertWithUserId('sales_journal', [{
        medication_id: entry.medication_id,
        medication_name: entry.medication_name,
        quantity_sold: entry.quantity_sold,
        unit_price: entry.unit_price,
        total_price: entry.total_price,
        payment_method: entry.payment_method,
        stock_after_sale: entry.stock_after_sale,
        seller_name: entry.seller_name || null,
        sale_date: entry.sale_date,
        // ── Champs assurance (sinon perdus à la synchro) ──
        insurance_name:   entry.insurance_name ?? null,
        insurance_card:   entry.insurance_card ?? null,
        insurance_rate:   entry.insurance_rate ?? null,
        insurance_amount: entry.insurance_amount ?? null,
        patient_amount:   entry.patient_amount ?? null,
        synced: true,
      }]);
      if (!error) offlineStorage.markJournalEntrySynced(entry.id);
    } catch {}
  }
}

async function syncOfflineQueue() {
  const queue = offlineStorage.getQueue();
  for (const op of queue) {
    try {
      if (op.type === 'insert') {
        const { error } = await insertWithUserId(op.table, [op.data]);
        if (!error) offlineStorage.removeFromQueue(op.id);
      } else if (op.type === 'update') {
        const { id, ...fields } = op.data;
        if (!id) continue;
        const { error } = await updateWithUserId(op.table, fields, { id });
        if (!error) offlineStorage.removeFromQueue(op.id);
      }
    } catch {}
  }
}

export async function syncProductsToLocal(products: any[]) {
  // ── GARDE CRITIQUE : jamais effacer l'inventaire local si Supabase renvoie rien ──
  // Causes possibles : token en cours de refresh, RLS session expirée, erreur réseau.
  // On ne fait la synchro que si on reçoit AU MOINS autant de produits que l'on a en local,
  // ou si on en reçoit au minimum 1 (import initial).
  if (!products || products.length === 0) {
    console.warn('[syncProductsToLocal] Supabase a retourné 0 produits — synchro ignorée pour protéger l\'inventaire local.');
    return;
  }

  const localCount = await db.products.count();
  // Heuristique de sécurité : si Supabase renvoie beaucoup moins que le local (> 50% de différence),
  // c'est suspect → on ne touche pas à IndexedDB.
  if (localCount > 10 && products.length < localCount * 0.5) {
    console.warn(`[syncProductsToLocal] Supabase renvoie ${products.length} produits mais IndexedDB en contient ${localCount}. Synchro ignorée (protection anti-perte).`);
    return;
  }

  await db.products.clear();

  const localProducts = products.map((p) => ({
    id: p.id,
    name: p.name,
    dosage: p.dosage,
    price: p.price || 0,
    wholesale_price: p.wholesale_price,
    quantity: p.quantity || 0,
    minimum_stock: p.minimum_stock ?? 10,
    barcode: p.barcode,
    code_produit: p.code_produit,
    batch_number: p.batch_number,
    expiry_date: p.expiry_date,
    forme_produit: p.forme_produit,
    name_rayon: p.name_rayon,
    updated_at: new Date().toISOString(),
  }));

  await db.products.bulkPut(localProducts);
}

export async function searchProductsLocally(query: string, limit = 50) {
  const lowerQuery = query.toLowerCase();
  return db.products
    .filter((p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.dosage.toLowerCase().includes(lowerQuery) ||
      !!p.barcode?.toLowerCase().includes(lowerQuery) ||
      !!p.code_produit?.toLowerCase().includes(lowerQuery)
    )
    .limit(limit)
    .toArray();
}

export async function findProductByBarcode(barcode: string) {
  return db.products.where('barcode').equals(barcode).first();
}

export async function findProductByCode(code: string) {
  return db.products.where('code_produit').equals(code).first();
}
