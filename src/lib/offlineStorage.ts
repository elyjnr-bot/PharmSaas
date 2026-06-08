const OFFLINE_QUEUE_KEY = 'pharma_offline_queue';
const OFFLINE_MEDICATIONS_KEY = 'pharma_offline_medications';
const OFFLINE_SALES_KEY = 'pharma_offline_sales';
const OFFLINE_EXPENSES_KEY = 'pharma_offline_expenses';
const SALES_JOURNAL_KEY = 'pharma_sales_journal';
const OFFLINE_CREDITS_KEY = 'pharma_offline_credits';
const FOND_CAISSE_KEY = 'pharma_fond_caisse';
const STUPEFIANT_REGISTRE_KEY = 'pharma_stupefiant_registre';

export interface StupefiantEntry {
  id: string;
  date: string;
  medication_id: string;
  medication_name: string;
  quantity: number;
  unit_price: number;
  patient_name: string;
  doctor_name: string;
  ordonnance_number: string;
  notes?: string;
}

export type OfflineTable =
  | 'medications'
  | 'sales'
  | 'expenses'
  | 'inventory_units'
  | 'medication_batches'
  | 'stock_entries'
  | 'credits'
  | 'sales_journal';

export interface OfflineOperation {
  id: string;
  type: 'insert' | 'update' | 'delete';
  table: OfflineTable;
  data: any;
  timestamp: number;
}

export interface SalesJournalEntry {
  id: string;
  sale_date: string;
  medication_id: string;
  medication_name: string;
  quantity_sold: number;
  unit_price: number;
  total_price: number;
  payment_method: string;
  stock_after_sale: number;
  seller_name?: string;
  synced: boolean;
  /** true pour un retour/avoir (quantité et montant négatifs). */
  is_return?: boolean;
  /** Motif du retour (local, non synchronisé en base). */
  reason?: string;
  /** ── Champs assurance / mutuelle (ventes prises en charge) ── */
  insurance_name?: string | null;
  insurance_card?: string | null;
  insurance_rate?: number | null;
  insurance_amount?: number | null;
  patient_amount?: number | null;
}

export const offlineStorage = {
  addToQueue: (operation: Omit<OfflineOperation, 'id' | 'timestamp'>): OfflineOperation => {
    const queue = offlineStorage.getQueue();
    const newOperation: OfflineOperation = {
      ...operation,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    queue.push(newOperation);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    return newOperation;
  },

  getQueue: (): OfflineOperation[] => {
    const data = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  },

  clearQueue: () => {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify([]));
  },

  removeFromQueue: (operationId: string) => {
    const queue = offlineStorage.getQueue();
    const filtered = queue.filter(op => op.id !== operationId);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filtered));
  },

  cacheMedications: (medications: any[]) => {
    localStorage.setItem(OFFLINE_MEDICATIONS_KEY, JSON.stringify(medications));
  },

  getCachedMedications: (): any[] => {
    const data = localStorage.getItem(OFFLINE_MEDICATIONS_KEY);
    return data ? JSON.parse(data) : [];
  },

  cacheSales: (sales: any[]) => {
    localStorage.setItem(OFFLINE_SALES_KEY, JSON.stringify(sales));
  },

  getCachedSales: (): any[] => {
    const data = localStorage.getItem(OFFLINE_SALES_KEY);
    return data ? JSON.parse(data) : [];
  },

  cacheExpenses: (expenses: any[]) => {
    localStorage.setItem(OFFLINE_EXPENSES_KEY, JSON.stringify(expenses));
  },

  getCachedExpenses: (): any[] => {
    const data = localStorage.getItem(OFFLINE_EXPENSES_KEY);
    return data ? JSON.parse(data) : [];
  },

  cacheCredits: (credits: any[]) => {
    localStorage.setItem(OFFLINE_CREDITS_KEY, JSON.stringify(credits));
  },

  getCachedCredits: (): any[] => {
    const data = localStorage.getItem(OFFLINE_CREDITS_KEY);
    return data ? JSON.parse(data) : [];
  },

  updateCachedCredit: (creditId: string, updates: Record<string, unknown>) => {
    const credits = offlineStorage.getCachedCredits();
    const updated = credits.map((c: any) => c.id === creditId ? { ...c, ...updates } : c);
    localStorage.setItem(OFFLINE_CREDITS_KEY, JSON.stringify(updated));
  },

  addCachedCredit: (credit: any) => {
    const credits = offlineStorage.getCachedCredits();
    credits.unshift(credit);
    localStorage.setItem(OFFLINE_CREDITS_KEY, JSON.stringify(credits));
  },

  isOnline: (): boolean => {
    return navigator.onLine;
  },

  addToSalesJournal: (entry: Omit<SalesJournalEntry, 'id'>) => {
    const journal = offlineStorage.getSalesJournal();
    const newEntry: SalesJournalEntry = {
      ...entry,
      id: crypto.randomUUID(),
    };
    journal.push(newEntry);
    localStorage.setItem(SALES_JOURNAL_KEY, JSON.stringify(journal));
    return newEntry;
  },

  getSalesJournal: (): SalesJournalEntry[] => {
    const data = localStorage.getItem(SALES_JOURNAL_KEY);
    return data ? JSON.parse(data) : [];
  },

  getTodaySalesJournal: (): SalesJournalEntry[] => {
    const journal = offlineStorage.getSalesJournal();
    const today = new Date().toDateString();
    return journal.filter(entry => new Date(entry.sale_date).toDateString() === today);
  },

  getJournalByDate: (date: Date): SalesJournalEntry[] => {
    const journal = offlineStorage.getSalesJournal();
    const targetDate = date.toDateString();
    return journal.filter(entry => new Date(entry.sale_date).toDateString() === targetDate);
  },

  markJournalEntrySynced: (entryId: string) => {
    const journal = offlineStorage.getSalesJournal();
    const updated = journal.map(entry =>
      entry.id === entryId ? { ...entry, synced: true } : entry
    );
    localStorage.setItem(SALES_JOURNAL_KEY, JSON.stringify(updated));
  },

  /** Marque comme synchronisées toutes les entrées d'une vente (par sale_date).
   *  Évite que syncOfflineJournal re-pousse une vente déjà envoyée par syncToCloud. */
  markJournalSyncedByDate: (saleDate: string) => {
    const journal = offlineStorage.getSalesJournal();
    const updated = journal.map(entry =>
      entry.sale_date === saleDate ? { ...entry, synced: true } : entry
    );
    localStorage.setItem(SALES_JOURNAL_KEY, JSON.stringify(updated));
  },

  getUnsyncedJournalEntries: (): SalesJournalEntry[] => {
    const journal = offlineStorage.getSalesJournal();
    return journal.filter(entry => !entry.synced);
  },

  clearOldJournalEntries: (daysToKeep: number = 30) => {
    const journal = offlineStorage.getSalesJournal();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const filtered = journal.filter(entry => new Date(entry.sale_date) >= cutoffDate);
    localStorage.setItem(SALES_JOURNAL_KEY, JSON.stringify(filtered));
  },

  getTodaySummary: () => {
    const todayEntries = offlineStorage.getTodaySalesJournal();
    const totalSales = todayEntries.reduce((sum, e) => sum + e.total_price, 0);
    const totalItems = todayEntries.reduce((sum, e) => sum + e.quantity_sold, 0);
    const byPaymentMethod = todayEntries.reduce((acc, e) => {
      acc[e.payment_method] = (acc[e.payment_method] || 0) + e.total_price;
      return acc;
    }, {} as Record<string, number>);
    return { totalSales, totalItems, transactionCount: todayEntries.length, byPaymentMethod };
  },

  // ── Fond de caisse ───────────────────────────────────────────────────────────
  // Utilise la date LOCALE (pas UTC) pour éviter les décalages horaires
  _localDateKey: (): string => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  getFondDeCaisse: (dateStr?: string): number => {
    const key = dateStr ?? offlineStorage._localDateKey();
    const data = localStorage.getItem(`${FOND_CAISSE_KEY}_${key}`);
    return data !== null ? parseFloat(data) : -1; // -1 = non saisi
  },

  setFondDeCaisse: (amount: number, dateStr?: string): void => {
    const key = dateStr ?? offlineStorage._localDateKey();
    localStorage.setItem(`${FOND_CAISSE_KEY}_${key}`, amount.toString());
  },

  hasFondDeCaisseToday: (): boolean => {
    const key = offlineStorage._localDateKey();
    return localStorage.getItem(`${FOND_CAISSE_KEY}_${key}`) !== null;
  },

  // ── Registre des stupéfiants ─────────────────────────────────────────────────
  addStupefiantEntry: (entry: Omit<StupefiantEntry, 'id'>): StupefiantEntry => {
    const registre = offlineStorage.getStupefiantRegistre();
    const newEntry: StupefiantEntry = { ...entry, id: crypto.randomUUID() };
    registre.unshift(newEntry);
    localStorage.setItem(STUPEFIANT_REGISTRE_KEY, JSON.stringify(registre));
    return newEntry;
  },

  getStupefiantRegistre: (): StupefiantEntry[] => {
    const data = localStorage.getItem(STUPEFIANT_REGISTRE_KEY);
    return data ? JSON.parse(data) : [];
  },

  getStupefiantByMonth: (year: number, month: number): StupefiantEntry[] => {
    const all = offlineStorage.getStupefiantRegistre();
    return all.filter(e => {
      const d = new Date(e.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  },
};

export const initOfflineMode = () => {
  window.addEventListener('online', () => {
    console.log('Connection restored. Syncing offline data...');
    const event = new CustomEvent('online-sync-required');
    window.dispatchEvent(event);
  });

  window.addEventListener('offline', () => {
    console.log('Connection lost. Entering offline mode...');
    const event = new CustomEvent('offline-mode-active');
    window.dispatchEvent(event);
  });
};
