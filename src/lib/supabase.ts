import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  || 'https://psuqzlcxwuqnkssgasts.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzdXF6bGN4d3Vxbmtzc2dhc3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Mzc0NDYsImV4cCI6MjA5NTMxMzQ0Nn0.jHFOLKgqH_K4zGkJtAVdHPLFMY51B0InvMraz_dCGlM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: 'pharma_auth_session',
    storage: window.localStorage,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export async function fetchAllMedications(orderBy: string = 'name'): Promise<Medication[]> {
  const PAGE_SIZE = 1000;
  let all: Medication[] = [];
  let from = 0;
  // ── Defense in depth : filtrer explicitement par user_id côté client
  //    pour garantir l'isolation même si la RLS Supabase venait à mal fonctionner.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return []; // pas de user → pas de données
  while (true) {
    const { data, error } = await supabase
      .from('medications')
      .select('*')
      .eq('user_id', user.id)        // ⚠ filtre explicite
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  quantity: number;
  batch_number: string;
  expiry_date: string;
  minimum_stock?: number;
  min_stock?: number;
  price?: number;
  wholesale_price?: number;
  code_produit?: string;
  code_interne?: string;
  gtin?: string;
  supplier?: string;
  requires_verification?: boolean;
  forme_produit?: string;
  name_rayon?: string;
  category?: string;
  location?: string;
  created_at: string;
  updated_at: string;
}

export interface MedicationBatch {
  id: string;
  medication_id: string;
  batch_number: string;
  quantity: number;
  expiry_date: string;
  received_date: string;
  cost_price?: number;
  created_at: string;
  updated_at: string;
}

export interface Barcode {
  id: string;
  barcode: string;
  code_produit: string;
  medication_id?: string;
  created_at: string;
}

export interface Sale {
  id: string;
  sale_date: string;
  total_amount: number;
  tax_amount: number;
  grand_total: number;
  payment_method: 'Espèces' | 'Carte Bancaire' | 'MTN Mobile Money';
  customer_name?: string;
  notes?: string;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  medication_id?: string;
  medication_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
}

export interface Expense {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  payment_method: string;
  notes?: string;
  created_at: string;
}
