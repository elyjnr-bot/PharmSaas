import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

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
  while (true) {
    const { data, error } = await supabase
      .from('medications')
      .select('*')
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
