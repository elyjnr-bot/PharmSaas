const SETTINGS_KEY = 'jungle_pharm_settings';

interface AppSettings {
  pharmacy_name: string;
  last_supplier: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  pharmacy_name: 'JUNGLE PHARM',
  last_supplier: '',
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
