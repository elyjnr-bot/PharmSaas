import { supabase } from './supabase';

const TABLES_WITH_USER_ID = [
  'medications',
  'sales',
  'sale_items',
  'expenses',
  'barcodes',
  'stock_entries',
  'daily_reports',
  'medication_batches',
  'medication_aliases',
  'inventory_units',
  'sales_journal',
  'credits',
  'stock_movements',
  'purchase_orders',
  'purchase_order_items',
  'supplier_reps',
];

export async function getCurrentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user.id;
}

export async function insertWithUserId(
  table: string,
  data: any
) {
  if (!TABLES_WITH_USER_ID.includes(table)) {
    return supabase.from(table).insert(data);
  }

  const userId = await getCurrentUserId();
  const dataWithUserId = Array.isArray(data)
    ? data.map(item => ({ ...item, user_id: userId }))
    : { ...data, user_id: userId };

  return supabase.from(table).insert(dataWithUserId);
}

export async function updateWithUserId(
  table: string,
  data: any,
  match?: Record<string, any>
) {
  if (!TABLES_WITH_USER_ID.includes(table)) {
    return supabase.from(table).update(data).match(match || {});
  }

  const userId = await getCurrentUserId();
  let query = supabase.from(table).update(data);

  if (match) {
    query = query.match(match);
  }
  query = query.eq('user_id', userId);

  return query;
}

export async function upsertWithUserId(
  table: string,
  data: any,
  options?: any
) {
  if (!TABLES_WITH_USER_ID.includes(table)) {
    return supabase.from(table).upsert(data, options);
  }

  const userId = await getCurrentUserId();
  const dataWithUserId = Array.isArray(data)
    ? data.map(item => ({ ...item, user_id: userId }))
    : { ...data, user_id: userId };

  return supabase.from(table).upsert(dataWithUserId, options);
}

export async function deleteWithUserId(
  table: string,
  match: Record<string, any>
) {
  if (!TABLES_WITH_USER_ID.includes(table)) {
    return supabase.from(table).delete().match(match);
  }

  const userId = await getCurrentUserId();
  return supabase
    .from(table)
    .delete()
    .match({ ...match, user_id: userId });
}
