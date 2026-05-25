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
