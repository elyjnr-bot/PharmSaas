const CACHE_KEY = 'pharma_barcode_cache';

type BarcodeCache = Record<string, string>;

function readCache(): BarcodeCache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCache(cache: BarcodeCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota errors
  }
}

export const barcodeCache = {
  get(barcode: string): string | null {
    return readCache()[barcode.trim()] ?? null;
  },

  set(barcode: string, medicationId: string): void {
    const cache = readCache();
    cache[barcode.trim()] = medicationId;
    writeCache(cache);
  },

  setMultiple(entries: Array<{ barcode: string; medicationId: string }>): void {
    const cache = readCache();
    for (const { barcode, medicationId } of entries) {
      cache[barcode.trim()] = medicationId;
    }
    writeCache(cache);
  },
};
