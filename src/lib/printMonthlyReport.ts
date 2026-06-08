/**
 * printMonthlyReport
 * Génère un rapport mensuel complet en HTML/CSS et l'imprime dans une nouvelle fenêtre.
 * Fonctionne entièrement à partir du journal local (offline-first).
 */

import { offlineStorage, SalesJournalEntry } from './offlineStorage';

const MONTH_FR = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];

export async function printMonthlyReport(year: number, month: number, pharmacyName = 'JunglePharm'): Promise<void> {
  // ── Collecte des données ──────────────────────────────────────────────────
  const allJournal = offlineStorage.getSalesJournal();
  const entries: SalesJournalEntry[] = allJournal.filter(e => {
    const d = new Date(e.sale_date);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const allExpenses = offlineStorage.getCachedExpenses();
  const expenses = allExpenses.filter((e: any) => {
    const d = new Date(e.expense_date || e.created_at || '');
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const credits = offlineStorage.getCachedCredits().filter((c: any) => {
    const d = new Date(c.sale_date || c.created_at || '');
    return d.getFullYear() === year && d.getMonth() === month;
  });

  // ── Calculs globaux ───────────────────────────────────────────────────────
  const totalSales    = entries.reduce((s, e) => s + e.total_price, 0);
  const totalExpenses = expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);
  const netAmount     = totalSales - totalExpenses;
  const totalItems    = entries.reduce((s, e) => s + Math.max(0, e.quantity_sold), 0);
  const transactions  = entries.filter(e => e.quantity_sold > 0).length;

  // Par mode de paiement
  const byPM: Record<string, number> = {};
  for (const e of entries) {
    if (e.total_price > 0) byPM[e.payment_method] = (byPM[e.payment_method] || 0) + e.total_price;
  }

  // Top produits
  const byProduct: Record<string, { units: number; revenue: number }> = {};
  for (const e of entries) {
    if (e.quantity_sold > 0) {
      if (!byProduct[e.medication_name]) byProduct[e.medication_name] = { units: 0, revenue: 0 };
      byProduct[e.medication_name].units   += e.quantity_sold;
      byProduct[e.medication_name].revenue += e.total_price;
    }
  }
  const topProducts = Object.entries(byProduct)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10);

  // Tableau journalier
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dailyData: { day: number; sales: number; expenses: number; transactions: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const daySales = entries
      .filter(e => e.sale_date.startsWith(dayStr) && e.total_price > 0)
      .reduce((s, e) => s + e.total_price, 0);
    const dayExp = expenses
      .filter((e: any) => (e.expense_date || e.created_at || '').startsWith(dayStr))
      .reduce((s: number, e: any) => s + (e.amount || 0), 0);
    const dayTx = entries.filter(e => e.sale_date.startsWith(dayStr) && e.quantity_sold > 0).length;
    dailyData.push({ day: d, sales: daySales, expenses: dayExp, transactions: dayTx });
  }

  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
  const monthLabel = `${MONTH_FR[month]} ${year}`;
  const printDate  = new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });

  // ── HTML ──────────────────────────────────────────────────────────────────
  const pmRows = Object.entries(byPM)
    .sort((a, b) => b[1] - a[1])
    .map(([pm, amt]) => `
      <tr>
        <td>${pm}</td>
        <td style="text-align:right">${fmt(amt)} FCFA</td>
        <td style="text-align:right">${totalSales > 0 ? ((amt / totalSales) * 100).toFixed(1) : '0'}%</td>
      </tr>
    `).join('');

  const topRows = topProducts.map(([name, { units, revenue }], i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${name}</td>
      <td style="text-align:right">${units}</td>
      <td style="text-align:right">${fmt(revenue)} FCFA</td>
    </tr>
  `).join('');

  const dailyRows = dailyData
    .filter(d => d.sales > 0 || d.expenses > 0)
    .map(d => `
      <tr>
        <td>${String(d.day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}</td>
        <td style="text-align:right">${d.transactions}</td>
        <td style="text-align:right; color:#059669">${fmt(d.sales)} F</td>
        <td style="text-align:right; color:#dc2626">${d.expenses > 0 ? fmt(d.expenses) + ' F' : '—'}</td>
        <td style="text-align:right; font-weight:600; color:${d.sales - d.expenses >= 0 ? '#059669' : '#dc2626'}">${fmt(d.sales - d.expenses)} F</td>
      </tr>
    `).join('');

  const creditRows = credits.slice(0, 20).map((c: any) => `
    <tr>
      <td>${c.client_name}</td>
      <td style="text-align:right">${fmt(c.total_amount)} F</td>
      <td style="text-align:right">${fmt(c.amount_paid || 0)} F</td>
      <td style="text-align:right; color:${c.status === 'paid' ? '#059669' : '#dc2626'}; font-weight:600">
        ${c.status === 'paid' ? '✓ Soldé' : fmt(c.total_amount - (c.amount_paid || 0)) + ' F'}
      </td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Rapport — ${monthLabel}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      font-size: 12px; color: #1a1a2e; background: #fff;
      padding: 20mm 18mm;
    }
    h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 4px; }
    h2 { font-size: 14px; font-weight: 700; color: #10785a; margin: 20px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #10785a; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
    .header-left .subtitle { font-size: 13px; color: #6b7280; margin-top: 4px; }
    .header-right { text-align: right; font-size: 11px; color: #6b7280; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .kpi { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
    .kpi .label { font-size: 10px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .kpi .value { font-size: 20px; font-weight: 700; letter-spacing: -0.03em; }
    .kpi .unit { font-size: 11px; color: #6b7280; font-weight: 500; }
    .kpi.green .value { color: #059669; }
    .kpi.red   .value { color: #dc2626; }
    .kpi.blue  .value { color: #2563eb; }
    table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-bottom: 8px; }
    th { background: #f3f4f6; padding: 7px 10px; text-align: left; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #fafafa; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10.5px; color: #9ca3af; display: flex; justify-content: space-between; }
    @media print {
      @page { size: A4; margin: 15mm; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>${pharmacyName}</h1>
      <div class="subtitle">Rapport mensuel — ${monthLabel}</div>
    </div>
    <div class="header-right">
      Imprimé le ${printDate}<br>
      Données : journal local + Supabase
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi green">
      <div class="label">Chiffre d'affaires</div>
      <div class="value">${fmt(totalSales)}</div>
      <div class="unit">FCFA</div>
    </div>
    <div class="kpi red">
      <div class="label">Dépenses</div>
      <div class="value">${fmt(totalExpenses)}</div>
      <div class="unit">FCFA</div>
    </div>
    <div class="kpi ${netAmount >= 0 ? 'green' : 'red'}">
      <div class="label">Résultat net</div>
      <div class="value">${fmt(netAmount)}</div>
      <div class="unit">FCFA</div>
    </div>
    <div class="kpi blue">
      <div class="label">Transactions</div>
      <div class="value">${transactions}</div>
      <div class="unit">${totalItems} unités vendues</div>
    </div>
  </div>

  <h2>Ventilation par mode de paiement</h2>
  <table>
    <thead><tr><th>Mode</th><th style="text-align:right">Montant</th><th style="text-align:right">Part</th></tr></thead>
    <tbody>${pmRows || '<tr><td colspan="3" style="text-align:center;color:#9ca3af">Aucune donnée</td></tr>'}</tbody>
  </table>

  <h2>Top 10 produits</h2>
  <table>
    <thead><tr><th>#</th><th>Produit</th><th style="text-align:right">Unités</th><th style="text-align:right">CA</th></tr></thead>
    <tbody>${topRows || '<tr><td colspan="4" style="text-align:center;color:#9ca3af">Aucune vente</td></tr>'}</tbody>
  </table>

  <h2>Détail journalier</h2>
  <table>
    <thead><tr><th>Date</th><th style="text-align:right">Transactions</th><th style="text-align:right">Ventes</th><th style="text-align:right">Dépenses</th><th style="text-align:right">Net</th></tr></thead>
    <tbody>${dailyRows || '<tr><td colspan="5" style="text-align:center;color:#9ca3af">Aucune activité</td></tr>'}</tbody>
  </table>

  ${credits.length > 0 ? `
  <h2>Crédits clients (${credits.length})</h2>
  <table>
    <thead><tr><th>Client</th><th style="text-align:right">Total dû</th><th style="text-align:right">Payé</th><th style="text-align:right">Solde</th></tr></thead>
    <tbody>${creditRows}</tbody>
  </table>
  ` : ''}

  <div class="footer">
    <span>${pharmacyName} — Rapport ${monthLabel}</span>
    <span>Généré par JunglePharm • Confidentiel</span>
  </div>


</body>
</html>`;

  const { printHtml } = await import('./printHelper');
  printHtml(html);
}
