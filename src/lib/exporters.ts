import { supabase } from './supabase';

function downloadBlob(content: string, filename: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Exporte le journal des ventes (90 derniers jours) en CSV.
 * Source unique : sales_journal. Les retours apparaissent en négatif.
 */
export async function exportSalesJournalCsv(): Promise<void> {
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const { data, error } = await supabase
    .from('sales_journal')
    .select('sale_date, medication_name, quantity_sold, unit_price, total_price, payment_method, seller_name')
    .gte('sale_date', since.toISOString())
    .order('sale_date', { ascending: false });

  if (error) {
    alert("Échec de l'export des ventes.");
    return;
  }
  if (!data || data.length === 0) {
    alert('Aucune vente à exporter sur les 90 derniers jours.');
    return;
  }

  const headers = ['Date', 'Produit', 'Quantité', 'Prix unitaire', 'Total', 'Paiement', 'Vendeur'];
  const rows = data.map((r) => [
    new Date(r.sale_date).toLocaleString('fr-FR'),
    r.medication_name,
    r.quantity_sold,
    r.unit_price,
    r.total_price,
    r.payment_method,
    r.seller_name || '',
  ]);

  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\n');
  downloadBlob(csv, `ventes-${new Date().toISOString().split('T')[0]}.csv`);
}
