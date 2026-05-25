import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAllMedications, Medication } from './supabase';
import { db } from './db';
import { syncProductsToLocal } from './syncManager';

function localToMedication(p: any): Medication {
  const now = p.updated_at || new Date().toISOString();
  return {
    id: p.id,
    name: p.name,
    dosage: p.dosage || '',
    price: p.price,
    wholesale_price: p.wholesale_price,
    quantity: p.quantity,
    minimum_stock: p.minimum_stock ?? 10,
    code_produit: p.code_produit,
    batch_number: p.batch_number || '',
    expiry_date: p.expiry_date || '',
    forme_produit: p.forme_produit,
    name_rayon: p.name_rayon,
    created_at: now,
    updated_at: now,
  };
}

export function useMedications() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const bgSyncRef = useRef(false);

  const loadFromIndexedDB = useCallback(async (): Promise<Medication[]> => {
    const localProducts = await db.products.toArray();
    return localProducts.map(localToMedication);
  }, []);

  const backgroundSyncFromSupabase = useCallback(async () => {
    if (bgSyncRef.current || !navigator.onLine) return;
    bgSyncRef.current = true;
    try {
      const data = await fetchAllMedications();
      await syncProductsToLocal(data);
      setMedications(data);
    } catch {
    } finally {
      bgSyncRef.current = false;
    }
  }, []);

  const loadMedications = useCallback(async () => {
    const wasReset = localStorage.getItem('pharma_data_reset') === '1';
    if (wasReset) {
      localStorage.removeItem('pharma_data_reset');
      setMedications([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const local = await loadFromIndexedDB();

    if (local.length > 0) {
      setMedications(local);
      setIsLoading(false);
      backgroundSyncFromSupabase();
    } else {
      try {
        const data = await fetchAllMedications();
        await syncProductsToLocal(data);
        setMedications(data);
      } catch {
        setMedications([]);
      } finally {
        setIsLoading(false);
      }
    }
  }, [loadFromIndexedDB, backgroundSyncFromSupabase]);

  useEffect(() => {
    loadMedications();

    const handleOnline = () => {
      setIsOnline(true);
      backgroundSyncFromSupabase();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadMedications, backgroundSyncFromSupabase]);

  return {
    medications,
    isLoading,
    isOnline,
    reload: loadMedications,
  };
}
