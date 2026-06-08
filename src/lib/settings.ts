const SETTINGS_KEY = 'jungle_pharm_settings';

interface AppSettings {
  pharmacy_name:        string;
  pharmacy_address:     string;
  pharmacy_phone:       string;
  last_supplier:        string;
  minimum_stock_default: number;  // seuil rupture quand minimum_stock non configuré
}

const DEFAULT_SETTINGS: AppSettings = {
  pharmacy_name:        'JUNGLE PHARM',
  pharmacy_address:     '',
  pharmacy_phone:       '',
  last_supplier:        '',
  minimum_stock_default: 5,
};

export function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: Partial<AppSettings>): void {
  try {
    const current = loadSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

export function getPharmacyName(): string {
  return loadSettings().pharmacy_name;
}

export function setPharmacyName(name: string): void {
  saveSettings({ pharmacy_name: name });
}

export function getLastSupplier(): string {
  return loadSettings().last_supplier;
}

export function setLastSupplier(supplier: string): void {
  saveSettings({ last_supplier: supplier });
}

export function getMinimumStockDefault(): number {
  return loadSettings().minimum_stock_default ?? 5;
}

/**
 * Taux de TVA configuré (Settings). Source unique pour toutes les caisses.
 * Stocké dans localStorage['tax_rate']. Défaut : 0 (pas de TVA) — adapté
 * aux officines où les prix de rayon sont déjà TTC.
 */
export const TAX_RATE_KEY = 'tax_rate';

export function getTaxRate(): number {
  if (typeof localStorage === 'undefined') return 0;
  const raw = localStorage.getItem(TAX_RATE_KEY);
  const n = raw != null ? parseFloat(raw) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MÉTHODE DE CALCUL DE LA MARGE
 * ═══════════════════════════════════════════════════════════════════════════
 * Deux conventions co-existent dans le métier pharmaceutique :
 *
 *  • "on_sale" — Marge sur prix de vente : (PV − PA) / PV × 100
 *      → réponse à la question "Quelle fraction de mes ventes est de la marge ?"
 *      → utilisé en comptabilité / reporting CA
 *      → ex : Achat 700, Vente 1000 → marge 30 %
 *
 *  • "on_cost" — Marge sur coût d'achat : (PV − PA) / PA × 100
 *      → réponse à la question "De combien je majore le prix d'achat ?"
 *      → utilisé par la majorité des pharmaciens (logique commerciale)
 *      → ex : Achat 700, Vente 1000 → marge 42.86 %
 *
 * Par défaut : 'on_cost' (plus parlant pour les pharmaciens d'Afrique centrale).
 */
export type MarginMethod = 'on_sale' | 'on_cost';
export const MARGIN_METHOD_KEY = 'jp_margin_method';

export function getMarginMethod(): MarginMethod {
  if (typeof localStorage === 'undefined') return 'on_cost';
  const raw = localStorage.getItem(MARGIN_METHOD_KEY) as MarginMethod | null;
  return raw === 'on_sale' || raw === 'on_cost' ? raw : 'on_cost';
}

export function setMarginMethod(method: MarginMethod): void {
  try {
    localStorage.setItem(MARGIN_METHOD_KEY, method);
    window.dispatchEvent(new Event('junglepharm:margin_method_updated'));
  } catch {}
}

/**
 * Calcule la marge en % selon la méthode active.
 * Retourne `null` si les prix sont absents ou invalides.
 */
export function computeMargin(
  sellingPrice: number | null | undefined,
  buyingPrice: number | null | undefined,
  method: MarginMethod = getMarginMethod(),
): number | null {
  if (!sellingPrice || !buyingPrice) return null;
  if (sellingPrice <= 0 || buyingPrice <= 0) return null;
  if (method === 'on_sale') {
    return Math.round((sellingPrice - buyingPrice) / sellingPrice * 100);
  }
  // on_cost
  return Math.round((sellingPrice - buyingPrice) / buyingPrice * 100);
}

/** Libellé court pour l'UI (utile pour expliquer le %) */
export function getMarginMethodLabel(method: MarginMethod = getMarginMethod()): string {
  return method === 'on_sale' ? 'sur vente' : 'sur coût';
}
