import { supabase } from './supabase';
import type { Medication } from './db';

interface MedicationAlias {
  id: string;
  medication_id: string;
  alias: string;
  confidence: number;
}

let aliasCache: MedicationAlias[] | null = null;
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function loadAliases(): Promise<MedicationAlias[]> {
  const now = Date.now();
  if (aliasCache && now - lastFetch < CACHE_TTL) {
    return aliasCache;
  }

  try {
    const { data, error } = await supabase
      .from('medication_aliases')
      .select('*')
      .order('confidence', { ascending: false });

    if (error) throw error;

    aliasCache = data || [];
    lastFetch = now;
    return aliasCache;
  } catch (err) {
    console.error('Failed to load aliases:', err);
    return aliasCache || [];
  }
}

export function applyAliasMapping(text: string, aliases: MedicationAlias[]): string {
  const normalized = text.trim().toUpperCase();

  for (const alias of aliases) {
    if (alias.alias.toUpperCase() === normalized) {
      return alias.alias;
    }
  }

  for (const alias of aliases) {
    const aliasUpper = alias.alias.toUpperCase();
    if (normalized.includes(aliasUpper) || aliasUpper.includes(normalized)) {
      return alias.alias;
    }
  }

  return text;
}

export async function findMedicationByAlias(
  text: string,
  medications: Medication[]
): Promise<Medication | null> {
  const aliases = await loadAliases();
  const normalized = text.trim().toUpperCase();

  for (const alias of aliases) {
    if (alias.alias.toUpperCase() === normalized) {
      const medication = medications.find(m => m.id === alias.medication_id);
      if (medication) return medication;
    }
  }

  return null;
}

export async function createAlias(
  medicationId: string,
  aliasText: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('medication_aliases')
      .insert({
        medication_id: medicationId,
        alias: aliasText.trim(),
      });

    if (error) {
      if (error.code === '23505') {
        return true;
      }
      throw error;
    }

    aliasCache = null;
    return true;
  } catch (err) {
    console.error('Failed to create alias:', err);
    return false;
  }
}

export async function incrementAliasConfidence(aliasText: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('increment_alias_confidence', {
      alias_text: aliasText
    });

    if (error) console.error('Failed to increment alias confidence:', error);
  } catch (err) {
    console.error('Failed to increment alias confidence:', err);
  }
}
