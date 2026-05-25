import Dexie, { Table } from 'dexie';

export interface LocalProduct {
  id: string;
  name: string;
  dosage: string;
  price: number;
  wholesale_price?: number;
  quantity: number;
  minimum_stock?: number;
  barcode?: string;
  code_produit?: string;
  batch_number?: string;
  expiry_date: string;
  forme_produit?: string;
  name_rayon?: string;
  updated_at: string;
}

export interface LocalSale {
  id: string;
  medication_id: string;
  medication_name: string;
  quantity_sold: number;
  unit_price: number;
  total_price: number;
  payment_method: string;
  seller_id?: string;
  seller_name?: string;
  sale_date: string;
  synced: boolean;
  created_at: string;
}

export interface LocalSettings {
  key: string;
  value: string;
}

export interface CartUnitItem {
  id: string;
  unit_code: string;
  medication_id: string;
  batch_number: string;
  expiry_date: string | null;
  status: string;
  imported_code: string | null;
}

export interface CartItem {
  medication_id: string;
  medication_name: string;
  medication_dosage: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  units?: CartUnitItem[];
}

export interface LocalCart {
  id: string;
  items: CartItem[];
  updated_at: string;
}

export interface SyncQueue {
  id?: number;
  type: 'insert' | 'update' | 'delete';
  table: string;
  data: any;
  created_at: string;
  retries: number;
}

export interface BarcodeLink {
  barcode: string;
  product_id: string;
  product_name: string;
  match_score: number;
  created_at: string;
  synced: boolean;
}

class JunglePharmDB extends Dexie {
  products!: Table<LocalProduct, string>;
  sales!: Table<LocalSale, string>;
  settings!: Table<LocalSettings, string>;
  cart!: Table<LocalCart, string>;
  syncQueue!: Table<SyncQueue, number>;
  barcodeLinks!: Table<BarcodeLink, string>;

  constructor() {
    super('JunglePharmDB');

    this.version(1).stores({
      products: 'id, barcode, code_produit, name, expiry_date',
      sales: 'id, medication_id, sale_date, synced',
      settings: 'key',
      cart: 'id',
      syncQueue: '++id, table, created_at',
    });

    this.version(2).stores({
      products: 'id, barcode, code_produit, name, expiry_date',
      sales: 'id, medication_id, sale_date, synced',
      settings: 'key',
      cart: 'id',
      syncQueue: '++id, table, created_at',
      barcodeLinks: 'barcode, product_id, synced',
    });
  }
}

export const db = new JunglePharmDB();

export async function clearAllLocalData() {
  await db.products.clear();
  await db.sales.clear();
  await db.cart.clear();
  await db.syncQueue.clear();
  await db.barcodeLinks.clear();
  await db.settings.clear();
}

export async function clearAllData() {
  await clearAllLocalData();
}

export async function getUnsyncedSalesCount(): Promise<number> {
  return await db.sales.where('synced').equals(false).count();
}

export async function getQueuedOperationsCount(): Promise<number> {
  return await db.syncQueue.count();
}

export async function saveCart(items: CartItem[]): Promise<void> {
  await db.cart.put({
    id: 'current',
    items,
    updated_at: new Date().toISOString(),
  });
}

export async function loadCart(): Promise<CartItem[]> {
  const cart = await db.cart.get('current');
  return cart?.items || [];
}

export async function clearCart(): Promise<void> {
  await db.cart.delete('current');
}

export async function getSetting(key: string): Promise<string | undefined> {
  const setting = await db.settings.get(key);
  return setting?.value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}

export async function addToSyncQueue(
  type: 'insert' | 'update' | 'delete',
  table: string,
  data: any
): Promise<void> {
  await db.syncQueue.add({
    type,
    table,
    data,
    created_at: new Date().toISOString(),
    retries: 0,
  });
}

export async function processSyncQueue(): Promise<void> {
  const queue = await db.syncQueue.toArray();

  for (const item of queue) {
    try {
      console.log('Processing sync queue item:', item);
      if (item.id) {
        await db.syncQueue.delete(item.id);
      }
    } catch (error) {
      console.error('Error processing sync queue item:', error);
      if (item.id) {
        await db.syncQueue.update(item.id, {
          retries: (item.retries || 0) + 1,
        });
      }
    }
  }
}

export async function linkBarcodeToProduct(
  barcode: string,
  productId: string,
  productName: string,
  matchScore: number
): Promise<void> {
  await db.barcodeLinks.put({
    barcode,
    product_id: productId,
    product_name: productName,
    match_score: matchScore,
    created_at: new Date().toISOString(),
    synced: false,
  });

  await addToSyncQueue('insert', 'barcodes', {
    barcode,
    medication_id: productId,
    code_produit: '',
  });
}

export async function getProductByBarcode(barcode: string): Promise<LocalProduct | undefined> {
  const link = await db.barcodeLinks.get(barcode);
  if (link) {
    return await db.products.get(link.product_id);
  }
  return undefined;
}

export async function searchProductsByName(query: string, limit = 10): Promise<LocalProduct[]> {
  const lowerQuery = query.toLowerCase();

  const results = await db.products
    .filter((product) => {
      return product.name.toLowerCase().includes(lowerQuery);
    })
    .limit(limit)
    .toArray();

  return results;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

export async function findProductByNameFuzzy(
  query: string,
  threshold = 0.8
): Promise<{ product: LocalProduct; score: number }[]> {
  const lowerQuery = query.toLowerCase();

  const allProducts = await db.products.toArray();

  const results = allProducts.map((product) => {
    const lowerName = product.name.toLowerCase();

    if (lowerName === lowerQuery) {
      return { product, score: 1.0 };
    }

    if (lowerName.includes(lowerQuery)) {
      const score = 0.85 + 0.15 * (lowerQuery.length / lowerName.length);
      return { product, score };
    }

    const distance = levenshteinDistance(lowerQuery, lowerName);
    const maxLen = Math.max(lowerQuery.length, lowerName.length);
    if (maxLen === 0) return { product, score: 0 };

    const normalizedDist = distance / maxLen;
    const score = 1 - normalizedDist;

    return { product, score };
  });

  return results
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
