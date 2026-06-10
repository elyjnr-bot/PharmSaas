/**
 * setup.ts — Mocks globaux pour tous les tests JunglePharm
 *
 * On neutralise les dépendances externes (Supabase, Dexie/IndexedDB, navigator.onLine)
 * pour que les tests tournent hors navigateur et sans réseau.
 */

import { vi } from 'vitest';

// ── 1. navigator.onLine = false par défaut (mode offline) ────────────────────
Object.defineProperty(navigator, 'onLine', { value: false, writable: true });

// ── 2. Stub crypto.randomUUID ────────────────────────────────────────────────
let _uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `test-uuid-${++_uuidCounter}`,
});

// ── 3. Mock Supabase (module entier) ─────────────────────────────────────────
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select:  vi.fn().mockReturnThis(),
      insert:  vi.fn().mockResolvedValue({ data: [], error: null }),
      update:  vi.fn().mockReturnThis(),
      delete:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      gte:     vi.fn().mockReturnThis(),
      lte:     vi.fn().mockReturnThis(),
      gt:      vi.fn().mockReturnThis(),
      not:     vi.fn().mockReturnThis(),
      order:   vi.fn().mockReturnThis(),
      limit:   vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single:  vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-test-1' } }, error: null }),
    },
  },
}));

// ── 4. Mock supabaseHelpers ───────────────────────────────────────────────────
vi.mock('../lib/supabaseHelpers', () => ({
  insertWithUserId: vi.fn().mockResolvedValue({ error: null }),
  updateWithUserId: vi.fn().mockResolvedValue({ error: null }),
  getCurrentUserId: vi.fn().mockResolvedValue('user-test-1'),
}));

// ── 5. Mock Dexie (db.ts) ─────────────────────────────────────────────────────
const _dexieStore: Record<string, Record<string, unknown>> = {};
vi.mock('../lib/db', () => ({
  db: {
    products: {
      get:    vi.fn(async (id: string) => _dexieStore['products']?.[id] ?? null),
      update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
        _dexieStore['products'] = _dexieStore['products'] ?? {};
        _dexieStore['products'][id] = { ...(_dexieStore['products'][id] ?? {}), ...patch };
      }),
      put:    vi.fn(async (record: Record<string, unknown>) => {
        const id = record['id'] as string;
        _dexieStore['products'] = _dexieStore['products'] ?? {};
        _dexieStore['products'][id] = record;
      }),
      toArray: vi.fn(async () => Object.values(_dexieStore['products'] ?? {})),
    },
  },
  // helper pour les tests : pré-remplir le store Dexie
  __seedDexie: (table: string, records: Record<string, unknown>[]) => {
    _dexieStore[table] = {};
    for (const r of records) {
      _dexieStore[table][r['id'] as string] = r;
    }
  },
  __dexieStore: _dexieStore,
}));

// ── 6. Mock offlineStorage (journal local) ────────────────────────────────────
let _salesJournal: unknown[] = [];
let _credits: Record<string, unknown> = {};
let _queue: unknown[] = [];

vi.mock('../lib/offlineStorage', () => ({
  offlineStorage: {
    getSalesJournal:    vi.fn(() => _salesJournal),
    addToSalesJournal:  vi.fn((entry: unknown) => { _salesJournal.push(entry); }),
    getCachedCredits:   vi.fn(() => Object.values(_credits)),
    addCachedCredit:    vi.fn((c: Record<string, unknown>) => { _credits[c['id'] as string] = c; }),
    updateCachedCredit: vi.fn((id: string, patch: Record<string, unknown>) => {
      if (_credits[id]) _credits[id] = { ..._credits[id], ...patch };
    }),
    getCachedMedications: vi.fn(() => []),
    addToQueue: vi.fn((item: unknown) => { _queue.push(item); }),
    getFondDeCaisse: vi.fn(() => 0),
    getJournalByDate: vi.fn(() => []),
  },
  // helpers reset pour les tests
  __resetJournal:  () => { _salesJournal = []; },
  __resetCredits:  () => { _credits = {}; },
  __resetQueue:    () => { _queue = []; },
  __getJournal:    () => _salesJournal,
  __getCredits:    () => _credits,
  __getQueue:      () => _queue,
}));
