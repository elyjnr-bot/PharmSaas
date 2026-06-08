import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

export interface UserSettings {
  pharmacy_name: string;
  default_supplier: string;
  print_config: Record<string, unknown>;
}

const DEFAULT_SETTINGS: UserSettings = {
  pharmacy_name: '', // Vide par défaut → l'utilisateur saisit son vrai nom
  default_supplier: '',
  print_config: {},
};

const CACHE_KEY_PREFIX = 'pharma_user_settings_';

function getCacheKey(userId: string) {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

export function getCachedSettings(userId: string): UserSettings {
  try {
    const raw = localStorage.getItem(getCacheKey(userId));
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function setCachedSettings(userId: string, settings: UserSettings) {
  try {
    localStorage.setItem(getCacheKey(userId), JSON.stringify(settings));
  } catch {}
}

export async function loadUserSettings(userId: string): Promise<UserSettings> {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('pharmacy_name, default_supplier, print_config')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      const settings: UserSettings = {
        pharmacy_name: data.pharmacy_name || DEFAULT_SETTINGS.pharmacy_name,
        default_supplier: data.default_supplier || DEFAULT_SETTINGS.default_supplier,
        print_config: (data.print_config as Record<string, unknown>) || {},
      };
      setCachedSettings(userId, settings);
      return settings;
    }
  } catch {}
  return getCachedSettings(userId);
}

export async function saveUserSettings(
  userId: string,
  updates: Partial<UserSettings>
): Promise<void> {
  const current = getCachedSettings(userId);
  const merged = { ...current, ...updates };
  setCachedSettings(userId, merged);

  try {
    await supabase.from('user_settings').upsert(
      {
        user_id: userId,
        pharmacy_name: merged.pharmacy_name,
        default_supplier: merged.default_supplier,
        print_config: merged.print_config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } catch {}
}

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted || !user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);
      const cached = getCachedSettings(user.id);
      setSettings(cached);
      setLoading(false);

      const remote = await loadUserSettings(user.id);
      if (mounted) setSettings(remote);
    };

    init();
    return () => { mounted = false; };
  }, []);

  const update = useCallback(async (updates: Partial<UserSettings>) => {
    if (!userId) return;
    const next = { ...settings, ...updates };
    setSettings(next);
    await saveUserSettings(userId, updates);
  }, [userId, settings]);

  return { settings, loading, update };
}
