/**
 * Rapports.tsx
 * Exports CSV/impression + Facturation assurance.
 * Chalk Premium design.
 */

import { useState, useEffect } from 'react';
import { Download, FileText, Shield, Calendar, BarChart2, Printer, Users, ClipboardList, Truck } from 'lucide-react';
import * as XLSX from 'xlsx';
import { offlineStorage } from '../lib/offlineStorage';
import { exportSalesJournalCsv } from '../lib/exporters';
import { printMonthlyReport } from '../lib/printMonthlyReport';
import { supabase } from '../lib/supabase';
import { useUserSettings } from '../lib/userSettings';

// ── Helpers ────────────────────────────────────────────────────────────────────
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadBlob(content: string, filename: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

// ── Sous-section : carte action ────────────────────────────────────────────────
function ActionCard({
  icon, title, description, badge, onClick, color = '#0a0e14', loading = false, isPrint = false,
}: {
  icon: React.ReactNode; title: string; description: string;
  badge?: string; onClick: () => void; color?: string; loading?: boolean; isPrint?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '16px',
        background: 'rgba(255,255,255,0.72)', border: '1.5px solid rgba(255,255,255,0.55)',
        borderRadius: 14, cursor: loading ? 'wait' : 'pointer', textAlign: 'left',
        backdropFilter: 'blur(12px)', transition: 'all 0.12s',
        opacity: loading ? 0.6 : 1,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
      onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; }}
    >
      <div style={{ width: 42, height: 42, borderRadius: 12, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 4px 12px ${color}44` }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0a0e14' }}>{title}</span>
          {badge && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(16,120,90,0.1)', color: '#10785a' }}>{badge}</span>}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{description}</div>
      </div>
      {loading
        ? <div style={{ width: 16, height: 16, border: '2px solid #e5e7eb', borderTopColor: color, borderRadius: 99, animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
        : isPrint
          ? <Printer style={{ width: 15, height: 15, color: '#9ca3af', flexShrink: 0 }} />
          : <Download style={{ width: 15, height: 15, color: '#9ca3af', flexShrink: 0 }} />
      }
    </button>
  );
}

// ── Facturation assurance ──────────────────────────────────────────────────────
interface InsuranceLine {
  insurance_name: string;
  count: number;
  total_price: number;
  insurance_amount: number;
  patient_amount: number;
  entries: any[];
}

function InsuranceBillingSection() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [lines, setLines] = useState<InsuranceLine[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [openOrg, setOpenOrg] = useState<string | null>(null);

  // ── Taux TVA pour calcul TTC parallèle au HT ─────────────────────────────────
  // Les montants assurance stockés sont en HT (cohérent avec sales_journal).
  // Le TTC = HT × (1 + taux). Affiché à côté pour double-vue.
  const taxRate = parseFloat(localStorage.getItem('tax_rate') || '0');
  const toTTC = (ht: number) => Math.round(ht * (1 + taxRate));

  const load = async () => {
    setLoading(true);
    setLines(null);
    try {
      const from = `${year}-${String(month + 1).padStart(2,'0')}-01`;
      const to   = new Date(year, month + 1, 0).toISOString().split('T')[0];
      const { data } = await supabase
        .from('sales_journal')
        .select('sale_date,medication_name,quantity_sold,unit_price,total_price,insurance_name,insurance_card,insurance_rate,insurance_amount,patient_amount,payment_method')
        .gte('sale_date', from)
        .lte('sale_date', to + 'T23:59:59')
        .not('insurance_name', 'is', null)
        .gt('quantity_sold', 0);           // exclure les retours (quantity_sold < 0)
      if (!data) { setLines([]); return; }
      const map: Record<string, InsuranceLine> = {};
      for (const row of data) {
        const org = row.insurance_name || 'Inconnu';
        if (!map[org]) map[org] = { insurance_name: org, count: 0, total_price: 0, insurance_amount: 0, patient_amount: 0, entries: [] };
        map[org].count++;
        map[org].total_price     += row.total_price || 0;
        map[org].insurance_amount += row.insurance_amount || 0;
        map[org].patient_amount   += row.patient_amount || 0;
        map[org].entries.push(row);
      }
      setLines(Object.values(map).sort((a, b) => b.insurance_amount - a.insurance_amount));
    } finally {
      setLoading(false);
    }
  };

  const printBordereau = (line: InsuranceLine) => {
    const monthLabel = `${MONTHS_FR[month]} ${year}`;
    const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
    const hasTax = taxRate > 0;
    const rows = line.entries.map(e => {
      const insHt  = e.insurance_amount ?? 0;
      const patHt  = e.patient_amount ?? 0;
      const totHt  = e.total_price ?? 0;
      const insTtc = toTTC(insHt);
      const patTtc = toTTC(patHt);
      const totTtc = toTTC(totHt);
      return `
        <tr>
          <td>${new Date(e.sale_date).toLocaleDateString('fr-FR')}</td>
          <td>${e.medication_name}</td>
          <td style="text-align:right">${e.quantity_sold}</td>
          <td style="text-align:right">${fmt(e.unit_price)} F</td>
          <td style="text-align:right">${fmt(totHt)} F</td>
          ${hasTax ? `<td style="text-align:right;color:#6b7280">${fmt(totTtc)} F</td>` : ''}
          <td style="text-align:right">${e.insurance_rate ?? '—'}%</td>
          <td style="text-align:right;font-weight:700;color:#4f46e5">${fmt(insHt)} F</td>
          ${hasTax ? `<td style="text-align:right;font-weight:700;color:#7c3aed">${fmt(insTtc)} F</td>` : ''}
          <td style="text-align:right">${fmt(patHt)} F</td>
          ${hasTax ? `<td style="text-align:right;color:#b45309">${fmt(patTtc)} F</td>` : ''}
          ${e.insurance_card ? `<td>${e.insurance_card}</td>` : '<td>—</td>'}
        </tr>
      `;
    }).join('');
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>Bordereau ${line.insurance_name} — ${monthLabel}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11.5px;color:#1a1a2e;padding:18mm}
      h1{font-size:20px;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px}
      h2{font-size:13px;font-weight:700;color:#4f46e5;margin:18px 0 8px;padding-bottom:5px;border-bottom:2px solid #4f46e5}
      .header{display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid #e5e7eb}
      .kpi-row{display:flex;gap:16px;margin-bottom:20px}
      .kpi{flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px}
      .kpi .lbl{font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px}
      .kpi .val{font-size:18px;font-weight:800;letter-spacing:-0.02em}
      .kpi.blue .val{color:#4f46e5}.kpi.green .val{color:#059669}
      table{width:100%;border-collapse:collapse}
      th{background:#f3f4f6;padding:6px 8px;text-align:left;font-size:9.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em}
      td{padding:6px 8px;border-bottom:1px solid #f3f4f6}
      tr:last-child td{border-bottom:none}
      .footer{margin-top:28px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between}
      @media print{@page{size:A4;margin:12mm}body{padding:0}}
    </style></head><body>
    <div class="header">
      <div>
        <h1>Bordereau de facturation</h1>
        <div style="font-size:13px;color:#4f46e5;font-weight:700;margin-top:4px">${line.insurance_name}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px">Période : ${monthLabel}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#6b7280">
        Émis le ${new Date().toLocaleDateString('fr-FR')}<br>JunglePharm
      </div>
    </div>
    <div class="kpi-row">
      <div class="kpi"><div class="lbl">Lignes</div><div class="val">${line.count}</div></div>
      <div class="kpi"><div class="lbl">CA total HT</div><div class="val" style="color:#374151">${fmt(line.total_price)} F</div></div>
      ${hasTax ? `<div class="kpi"><div class="lbl">CA total TTC</div><div class="val" style="color:#374151">${fmt(toTTC(line.total_price))} F</div></div>` : ''}
      <div class="kpi blue"><div class="lbl">Part assurance HT</div><div class="val">${fmt(line.insurance_amount)} F</div></div>
      ${hasTax ? `<div class="kpi" style="background:#f3f0ff;border-color:#ddd6fe"><div class="lbl">Part assurance TTC</div><div class="val" style="color:#7c3aed">${fmt(toTTC(line.insurance_amount))} F</div></div>` : ''}
      <div class="kpi green"><div class="lbl">Part patient HT</div><div class="val">${fmt(line.patient_amount)} F</div></div>
    </div>
    ${hasTax ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;margin-bottom:14px;font-size:10.5px;color:#6b7280">
      <strong style="color:#4f46e5">Note :</strong> les montants HT (Hors Taxes) sont stockés dans le système. Les montants TTC (Toutes Taxes Comprises) sont calculés avec le taux de TVA en vigueur : <strong>${(taxRate * 100).toFixed(1).replace('.0','')}%</strong>.
    </div>` : ''}
    <h2>Détail des prestations</h2>
    <table>
      <thead><tr>
        <th>Date</th><th>Produit</th>
        <th style="text-align:right">Qté</th>
        <th style="text-align:right">P.U.</th>
        <th style="text-align:right">Total HT</th>
        ${hasTax ? '<th style="text-align:right">Total TTC</th>' : ''}
        <th style="text-align:right">Taux</th>
        <th style="text-align:right">Part assu. HT</th>
        ${hasTax ? '<th style="text-align:right">Part assu. TTC</th>' : ''}
        <th style="text-align:right">Part pat. HT</th>
        ${hasTax ? '<th style="text-align:right">Part pat. TTC</th>' : ''}
        <th>N° carte</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">
      <span>${line.insurance_name} — Bordereau ${monthLabel}</span>
      <span>À retourner à la pharmacie pour remboursement • JunglePharm</span>
    </div>
    </body></html>`;
    import('../lib/printHelper').then(({ printHtml }) => printHtml(html));
  };

  const exportBordereau = (line: InsuranceLine) => {
    const hasTax = taxRate > 0;
    const headers = hasTax
      ? ['Date','Produit','Quantité','Prix unitaire','Total HT','Total TTC','Taux assurance','Part assurance HT','Part assurance TTC','Part patient HT','Part patient TTC','N° carte']
      : ['Date','Produit','Quantité','Prix unitaire','Total','Taux assurance','Part assurance','Part patient','N° carte'];
    const rows = line.entries.map(e => {
      const insHt = e.insurance_amount ?? 0;
      const patHt = e.patient_amount ?? 0;
      const totHt = e.total_price ?? 0;
      const base = [
        new Date(e.sale_date).toLocaleDateString('fr-FR'),
        e.medication_name, e.quantity_sold, e.unit_price, totHt,
      ];
      if (hasTax) base.push(toTTC(totHt));
      base.push((e.insurance_rate ?? '') + '%', insHt);
      if (hasTax) base.push(toTTC(insHt));
      base.push(patHt);
      if (hasTax) base.push(toTTC(patHt));
      base.push(e.insurance_card || '');
      return base;
    });
    downloadBlob([headers, ...rows].map(r => r.map(csvCell).join(';')).join('\n'),
      `bordereau-${line.insurance_name.replace(/\s+/g,'-')}-${year}-${String(month+1).padStart(2,'0')}.csv`);
  };

  return (
    <div>
      {/* Sélecteur de période */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
          style={{ padding: '8px 12px', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 10, fontSize: 13, background: 'rgba(255,255,255,0.8)', outline: 'none', fontWeight: 600 }}>
          {MONTHS_FR.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(parseInt(e.target.value))}
          style={{ padding: '8px 12px', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 10, fontSize: 13, background: 'rgba(255,255,255,0.8)', outline: 'none', fontWeight: 600 }}>
          {[now.getFullYear(), now.getFullYear() - 1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button
          onClick={load}
          disabled={loading}
          style={{ padding: '8px 18px', borderRadius: 10, background: '#4f46e5', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Chargement…' : 'Charger'}
        </button>
      </div>

      {lines === null && !loading && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af', fontSize: 13 }}>
          Sélectionnez une période et cliquez sur Charger
        </div>
      )}

      {lines !== null && lines.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af', fontSize: 13 }}>
          Aucune vente assurance sur cette période
        </div>
      )}

      {lines !== null && lines.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lines.map(line => (
            <div key={line.insurance_name} style={{ background: 'rgba(255,255,255,0.72)', border: '1.5px solid rgba(255,255,255,0.55)', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
              {/* Header organisme */}
              <div
                onClick={() => setOpenOrg(openOrg === line.insurance_name ? null : line.insurance_name)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(79,70,229,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Shield style={{ width: 16, height: 16, color: '#4f46e5' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0a0e14' }}>{line.insurance_name}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{line.count} ligne{line.count > 1 ? 's' : ''} · {Math.round(line.total_price).toLocaleString('fr-FR')} F CA</div>
                </div>
                <div style={{ textAlign: 'right', marginRight: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#4f46e5' }}>{Math.round(line.insurance_amount).toLocaleString('fr-FR')} F</div>
                  <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>Part assu. HT</div>
                  {taxRate > 0 && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginTop: 2 }}>{toTTC(line.insurance_amount).toLocaleString('fr-FR')} F</div>
                      <div style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600 }}>Part assu. TTC</div>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={e => { e.stopPropagation(); printBordereau(line); }}
                    title="Imprimer le bordereau"
                    style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(79,70,229,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  ><Printer style={{ width: 14, height: 14, color: '#4f46e5' }} /></button>
                  <button
                    onClick={e => { e.stopPropagation(); exportBordereau(line); }}
                    title="Exporter CSV"
                    style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(16,120,90,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  ><Download style={{ width: 14, height: 14, color: '#10785a' }} /></button>
                </div>
              </div>

              {/* Détail expandable */}
              {openOrg === line.insurance_name && (
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.05)', padding: '0 16px 12px' }}>
                  {/* KPI mini — HT et TTC côte à côte si TVA > 0 */}
                  <div style={{ display: 'grid', gridTemplateColumns: taxRate > 0 ? 'repeat(5, 1fr)' : 'repeat(3, 1fr)', gap: 8, margin: '12px 0' }}>
                    {[
                      { lbl: 'Part assu. HT', val: `${Math.round(line.insurance_amount).toLocaleString('fr-FR')} F`, color: '#4f46e5' },
                      ...(taxRate > 0 ? [{ lbl: 'Part assu. TTC', val: `${toTTC(line.insurance_amount).toLocaleString('fr-FR')} F`, color: '#7c3aed' }] : []),
                      { lbl: 'Part patient HT', val: `${Math.round(line.patient_amount).toLocaleString('fr-FR')} F`,   color: '#b45309' },
                      ...(taxRate > 0 ? [{ lbl: 'Part patient TTC', val: `${toTTC(line.patient_amount).toLocaleString('fr-FR')} F`, color: '#92400e' }] : []),
                      { lbl: 'Taux moyen', val: line.entries.length > 0 ? `${Math.round(line.entries.reduce((s, e) => s + (e.insurance_rate || 0), 0) / line.entries.length)}%` : '—', color: '#374151' },
                    ].map(k => (
                      <div key={k.lbl} style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 3 }}>{k.lbl}</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: k.color }}>{k.val}</div>
                      </div>
                    ))}
                  </div>
                  {/* Liste lignes (max 10) */}
                  <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 6 }}>
                    Détail ({line.entries.length} lignes) {line.entries.length > 10 ? '— 10 premières affichées' : ''}
                  </div>
                  {line.entries.slice(0, 10).map((e, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.04)', fontSize: 12 }}>
                      <div>
                        <span style={{ fontWeight: 600, color: '#0a0e14' }}>{e.medication_name}</span>
                        <span style={{ color: '#9ca3af', marginLeft: 6 }}>{new Date(e.sale_date).toLocaleDateString('fr-FR')}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <span style={{ color: '#4f46e5', fontWeight: 700 }}>{Math.round(e.insurance_amount || 0).toLocaleString('fr-FR')} F</span>
                        <span style={{ color: '#9ca3af' }}>{e.insurance_rate}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Export inventaire CSV ──────────────────────────────────────────────────────
async function exportInventaireCsv() {
  const meds = offlineStorage.getCachedMedications();
  if (!meds.length) { alert('Inventaire non chargé.'); return; }
  const headers = ['Nom','Dosage','Lot','Stock','Stock min','Prix vente','Prix achat','Fournisseur','Date expiration','Catégorie'];
  const rows = meds.map(m => [
    m.name, m.dosage, m.batch_number, m.quantity, m.minimum_stock ?? '',
    m.price ?? '', (m as any).wholesale_price ?? '', m.supplier ?? '',
    m.expiry_date || '', m.category ?? '',
  ]);
  downloadBlob([headers, ...rows].map(r => r.map(csvCell).join(';')).join('\n'),
    `inventaire-${new Date().toISOString().split('T')[0]}.csv`);
}

// ── Export péremptions CSV ─────────────────────────────────────────────────────
async function exportPeremptionsCsv() {
  const meds = offlineStorage.getCachedMedications().filter(m => !!m.expiry_date);
  if (!meds.length) { alert('Aucun médicament avec date d\'expiration.'); return; }
  const today = new Date(); today.setHours(0,0,0,0);
  const headers = ['Nom','Dosage','Lot','Stock','Date expiration','Jours restants','Statut','Fournisseur'];
  const rows = meds
    .map(m => {
      const exp = new Date(m.expiry_date);
      const days = Math.ceil((exp.getTime() - today.getTime()) / 86400000);
      const st = days < 0 ? 'Expiré' : days <= 30 ? 'Critique' : days <= 90 ? 'Attention' : 'OK';
      return { m, days, st };
    })
    .sort((a, b) => a.days - b.days)
    .map(({ m, days, st }) => [
      m.name, m.dosage, m.batch_number, m.quantity,
      new Date(m.expiry_date).toLocaleDateString('fr-FR'), days, st, m.supplier ?? '',
    ]);
  downloadBlob([headers, ...rows].map(r => r.map(csvCell).join(';')).join('\n'),
    `peremptions-${new Date().toISOString().split('T')[0]}.csv`);
}

// ── Export ventes assurance CSV enrichi ───────────────────────────────────────
async function exportVentesAssuranceCsv() {
  const { data, error } = await supabase
    .from('sales_journal')
    .select('sale_date,medication_name,quantity_sold,unit_price,total_price,payment_method,insurance_name,insurance_card,insurance_rate,insurance_amount,patient_amount,seller_name')
    .not('insurance_name', 'is', null)
    .order('sale_date', { ascending: false });
  if (error || !data?.length) { alert('Aucune vente assurance à exporter.'); return; }
  // Calcul TTC depuis HT (montants stockés) avec le taux TVA en vigueur
  const taxRate = parseFloat(localStorage.getItem('tax_rate') || '0');
  const hasTax = taxRate > 0;
  const toTTC = (ht: number) => Math.round(ht * (1 + taxRate));
  const headers = hasTax
    ? ['Date','Produit','Qté','P.U.','Total HT','Total TTC','Organisme','N° carte','Taux','Part assurance HT','Part assurance TTC','Part patient HT','Part patient TTC','Vendeur']
    : ['Date','Produit','Qté','P.U.','Total','Organisme','N° carte','Taux','Part assurance','Part patient','Vendeur'];
  const rows = data.map(r => {
    const insHt = r.insurance_amount ?? 0;
    const patHt = r.patient_amount ?? 0;
    const totHt = r.total_price ?? 0;
    const base: any[] = [new Date(r.sale_date).toLocaleString('fr-FR'), r.medication_name, r.quantity_sold, r.unit_price, totHt];
    if (hasTax) base.push(toTTC(totHt));
    base.push(r.insurance_name || '', r.insurance_card || '', (r.insurance_rate ?? '') + '%', insHt);
    if (hasTax) base.push(toTTC(insHt));
    base.push(patHt);
    if (hasTax) base.push(toTTC(patHt));
    base.push(r.seller_name || '');
    return base;
  });
  downloadBlob([headers, ...rows].map(r => r.map(csvCell).join(';')).join('\n'),
    `ventes-assurance-${new Date().toISOString().split('T')[0]}.csv`);
}

// ── Export ventes XLSX ────────────────────────────────────────────────────────
async function exportVentesXlsx() {
  const { data, error } = await supabase
    .from('sales_journal')
    .select('sale_date,medication_name,quantity_sold,unit_price,total_price,payment_method,seller_name')
    .order('sale_date', { ascending: false })
    .limit(5000);
  if (error || !data?.length) { alert('Aucune vente à exporter.'); return; }
  const rows = data.map(r => {
    const qty = r.quantity_sold ?? 0;
    const isReturn = qty < 0;
    return {
      Date: new Date(r.sale_date).toLocaleDateString('fr-FR'),
      Type: isReturn ? 'Retour' : 'Vente',
      Médicament: r.medication_name || '',
      Quantité: Math.abs(qty),             // toujours positif — le Type indique si c'est un retour
      'Prix unitaire': r.unit_price ?? 0,
      Total: r.total_price ?? 0,           // négatif pour les retours → visible dans Excel
      Paiement: r.payment_method || '',
      Vendeur: r.seller_name || '',
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ventes');
  XLSX.writeFile(wb, `ventes_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ── Export stock XLSX ─────────────────────────────────────────────────────────
function exportStockXlsx() {
  const meds = offlineStorage.getCachedMedications();
  if (!meds.length) { alert('Inventaire non chargé. Ouvrez d\'abord l\'onglet Stock.'); return; }
  const rows = meds.map(m => ({
    Nom: m.name || '',
    DCI: m.dosage || '',
    Stock: m.quantity ?? 0,
    'Prix achat': (m as any).wholesale_price ?? '',
    'Prix vente': m.price ?? '',
    Expiration: m.expiry_date ? new Date(m.expiry_date).toLocaleDateString('fr-FR') : '',
    Fournisseur: m.supplier || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock');
  XLSX.writeFile(wb, `stock_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ── Export rapport complet XLSX (multi-feuilles) ───────────────────────────────
async function exportRapportCompletXlsx() {
  // Ventes
  const { data: salesData } = await supabase
    .from('sales_journal')
    .select('sale_date,medication_name,quantity_sold,unit_price,total_price,payment_method,seller_name,insurance_name,insurance_amount,patient_amount')
    .order('sale_date', { ascending: false })
    .limit(5000);
  const salesRows = (salesData || []).map(r => {
    const qty = r.quantity_sold ?? 0;
    const isReturn = qty < 0;
    return {
      Date: new Date(r.sale_date).toLocaleDateString('fr-FR'),
      Type: isReturn ? 'Retour' : 'Vente',
      Médicament: r.medication_name || '',
      Quantité: isReturn ? 0 : qty,
      Retour: isReturn ? Math.abs(qty) : 0,
      'Prix unitaire': r.unit_price ?? 0,
      Total: r.total_price ?? 0,
      Paiement: r.payment_method || '',
      Assurance: r.insurance_name || '',
      'Part assurance': r.insurance_amount ?? 0,
      'Part patient': r.patient_amount ?? 0,
      Vendeur: r.seller_name || '',
    };
  });

  // Stock
  const meds = offlineStorage.getCachedMedications();
  const stockRows = meds.map(m => ({
    Nom: m.name || '',
    DCI: m.dosage || '',
    Stock: m.quantity ?? 0,
    'Prix achat': (m as any).wholesale_price ?? '',
    'Prix vente': m.price ?? '',
    Expiration: m.expiry_date ? new Date(m.expiry_date).toLocaleDateString('fr-FR') : '',
    Fournisseur: m.supplier || '',
  }));

  // Dépenses (purchase_orders comme proxy)
  const { data: ordersData } = await supabase
    .from('purchase_orders')
    .select('order_date,supplier,status,notes')
    .order('order_date', { ascending: false });
  const depensesRows = (ordersData || []).map(o => ({
    Date: new Date(o.order_date).toLocaleDateString('fr-FR'),
    Fournisseur: o.supplier || '',
    Statut: o.status || '',
    Notes: o.notes || '',
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesRows.length ? salesRows : [{}]), 'Ventes');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockRows.length ? stockRows : [{}]), 'Stock');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(depensesRows.length ? depensesRows : [{}]), 'Dépenses');
  XLSX.writeFile(wb, `rapport_complet_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ── Bilan de stock PDF ─────────────────────────────────────────────────────────
async function printStockBilan(pharmacyName = 'JunglePharm') {
  const meds = offlineStorage.getCachedMedications();
  if (!meds.length) { alert('Inventaire non chargé. Ouvrez d\'abord l\'onglet Stock.'); return; }

  const today = new Date(); today.setHours(0, 0, 0, 0);

  type StockStatus = 'rupture' | 'perime' | 'critique' | 'peremption' | 'normal';
  function getStatus(m: any): StockStatus {
    const qty: number = m.quantity ?? 0;
    const minStock: number = m.minimum_stock ?? 0;
    const days = m.expiry_date
      ? Math.ceil((new Date(m.expiry_date).getTime() - today.getTime()) / 86_400_000)
      : null;
    if (days !== null && days < 0) return 'perime';
    if (qty <= 0) return 'rupture';
    if (minStock > 0 && qty <= minStock) return 'critique';
    if (days !== null && days <= 90) return 'peremption';
    return 'normal';
  }

  const groups: Record<StockStatus, any[]> = { rupture: [], perime: [], critique: [], peremption: [], normal: [] };
  for (const m of meds) groups[getStatus(m)].push(m);

  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
  const printDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const totalValue = meds.reduce((s, m) => s + ((m.quantity ?? 0) * (m.price ?? 0)), 0);

  const SECTION_META: Record<StockStatus, { label: string; bg: string; color: string; border: string }> = {
    rupture:   { label: '⛔ Ruptures de stock',        bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
    perime:    { label: '🚫 Produits périmés',          bg: '#fdf2f8', color: '#9d174d', border: '#f9a8d4' },
    critique:  { label: '⚠️ Stocks critiques',          bg: '#fffbeb', color: '#92400e', border: '#fcd34d' },
    peremption:{ label: '⏰ Péremption < 90 jours',     bg: '#fefce8', color: '#78350f', border: '#fde68a' },
    normal:    { label: '✓ Stocks normaux',              bg: '#f0fdf4', color: '#166534', border: '#86efac' },
  };

  function buildSectionRows(list: any[], status: StockStatus): string {
    if (!list.length) return '';
    const meta = SECTION_META[status];
    const headerRow = `<tr style="background:${meta.bg}">
      <td colspan="7" style="padding:8px 10px;font-weight:800;font-size:11px;color:${meta.color};
        border-top:2px solid ${meta.border};border-bottom:1px solid ${meta.border};letter-spacing:0.02em">
        ${meta.label} &nbsp;<span style="font-weight:500;font-size:10px;opacity:.75">(${list.length} produit${list.length > 1 ? 's' : ''})</span>
      </td></tr>`;
    const rows = list.map(m => {
      const days = m.expiry_date
        ? Math.ceil((new Date(m.expiry_date).getTime() - today.getTime()) / 86_400_000)
        : null;
      const daysLabel = days === null ? '—' : days < 0 ? `−${Math.abs(days)} j` : `${days} j`;
      const daysColor = days === null ? '#9ca3af' : days < 0 ? '#dc2626' : days <= 30 ? '#dc2626' : days <= 90 ? '#d97706' : '#6b7280';
      const qtyColor = (m.quantity ?? 0) <= 0 ? '#dc2626' : (m.minimum_stock ?? 0) > 0 && (m.quantity ?? 0) <= (m.minimum_stock ?? 0) ? '#d97706' : '#374151';
      return `<tr>
        <td style="font-weight:600;color:#0a0e14">${m.name}${m.dosage ? `<span style="color:#9ca3af;font-weight:400;margin-left:4px">${m.dosage}</span>` : ''}</td>
        <td style="text-align:right;font-weight:700;color:${qtyColor}">${m.quantity ?? 0}</td>
        <td style="text-align:right;color:#9ca3af">${m.minimum_stock ?? '—'}</td>
        <td style="text-align:right;color:#6b7280">${m.expiry_date ? new Date(m.expiry_date).toLocaleDateString('fr-FR') : '—'}</td>
        <td style="text-align:right;font-weight:600;color:${daysColor}">${daysLabel}</td>
        <td style="text-align:right;color:#10785a;font-weight:600">${m.price != null ? fmt(m.price) + ' F' : '—'}</td>
        <td style="color:#9ca3af;font-size:10px">${m.supplier || '—'}</td>
      </tr>`;
    }).join('');
    return headerRow + rows;
  }

  const allSectionRows = (['rupture', 'perime', 'critique', 'peremption', 'normal'] as StockStatus[])
    .map(s => buildSectionRows(groups[s], s))
    .join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
  <title>Bilan de stock — ${printDate}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#1a1a2e;padding:14mm}
    h1{font-size:20px;font-weight:800;letter-spacing:-0.025em;margin-bottom:2px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e5e7eb}
    .kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px}
    .kpi{background:#f9fafb;border:1px solid #e5e7eb;border-radius:7px;padding:9px 11px}
    .kpi .lbl{font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}
    .kpi .val{font-size:16px;font-weight:800;letter-spacing:-0.02em}
    table{width:100%;border-collapse:collapse;font-size:10.5px}
    th{background:#f3f4f6;padding:5px 8px;text-align:left;font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;position:sticky;top:0}
    td{padding:5px 8px;border-bottom:1px solid #f5f5f5}
    .footer{margin-top:18px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:9.5px;color:#9ca3af;display:flex;justify-content:space-between}
    @media print{@page{size:A4 landscape;margin:8mm}body{padding:0}}
  </style></head><body>
  <div class="header">
    <div>
      <h1>${pharmacyName}</h1>
      <div style="font-size:12px;color:#6b7280;margin-top:3px">Bilan de stock complet · ${printDate}</div>
    </div>
    <div style="text-align:right;font-size:11px;color:#6b7280;line-height:1.6">
      <strong style="color:#0a0e14">${meds.length}</strong> références<br>
      Valeur estimée : <strong style="color:#10785a">${fmt(totalValue)} FCFA</strong>
    </div>
  </div>
  <div class="kpi-row">
    <div class="kpi"><div class="lbl">Total références</div><div class="val" style="color:#374151">${meds.length}</div></div>
    <div class="kpi"><div class="lbl">Ruptures</div><div class="val" style="color:${groups.rupture.length > 0 ? '#dc2626' : '#059669'}">${groups.rupture.length}</div></div>
    <div class="kpi"><div class="lbl">Stocks critiques</div><div class="val" style="color:${groups.critique.length > 0 ? '#d97706' : '#059669'}">${groups.critique.length}</div></div>
    <div class="kpi"><div class="lbl">Périmés</div><div class="val" style="color:${groups.perime.length > 0 ? '#be185d' : '#059669'}">${groups.perime.length}</div></div>
    <div class="kpi"><div class="lbl">Valeur stock</div><div class="val" style="color:#10785a;font-size:13px">${fmt(totalValue)} F</div></div>
  </div>
  <table>
    <thead><tr>
      <th>Produit</th>
      <th style="text-align:right">Stock</th>
      <th style="text-align:right">Min</th>
      <th style="text-align:right">Expiration</th>
      <th style="text-align:right">Jours</th>
      <th style="text-align:right">Prix vente</th>
      <th>Fournisseur</th>
    </tr></thead>
    <tbody>${allSectionRows}</tbody>
  </table>
  <div class="footer">
    <span>${pharmacyName} · Bilan de stock · ${printDate}</span>
    <span>Confidentiel · JunglePharm</span>
  </div>
  </body></html>`;

  const { printHtml } = await import('../lib/printHelper');
  printHtml(html);
}

// ── Rapport vendeurs PDF ───────────────────────────────────────────────────────
async function printVendeurReport(year: number, month: number, pharmacyName = 'JunglePharm') {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const to   = new Date(year, month + 1, 0).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('sales_journal')
    .select('seller_name,medication_name,quantity_sold,total_price,payment_method,sale_date')
    .gte('sale_date', from)
    .lte('sale_date', to + 'T23:59:59')
    .gt('quantity_sold', 0);

  if (error || !data?.length) {
    alert(`Aucune vente trouvée pour ${MONTHS_FR[month]} ${year}.`);
    return;
  }

  type VendorData = { total: number; count: number; products: Record<string, { units: number; revenue: number }> };
  const byVendeur: Record<string, VendorData> = {};

  for (const row of data) {
    const seller = row.seller_name?.trim() || 'Vendeur inconnu';
    if (!byVendeur[seller]) byVendeur[seller] = { total: 0, count: 0, products: {} };
    byVendeur[seller].total += row.total_price || 0;
    byVendeur[seller].count++;
    const pName = row.medication_name || '—';
    if (!byVendeur[seller].products[pName]) byVendeur[seller].products[pName] = { units: 0, revenue: 0 };
    byVendeur[seller].products[pName].units   += row.quantity_sold || 0;
    byVendeur[seller].products[pName].revenue += row.total_price   || 0;
  }

  const sellers = Object.entries(byVendeur).sort((a, b) => b[1].total - a[1].total);
  const grandTotal = sellers.reduce((s, [, v]) => s + v.total, 0);
  const grandCount = sellers.reduce((s, [, v]) => s + v.count, 0);

  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
  const monthLabel = `${MONTHS_FR[month]} ${year}`;
  const printDate  = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const RANK_COLORS = ['#f59e0b', '#9ca3af', '#b45309'];

  const sellerCards = sellers.map(([name, vd], i) => {
    const topProds = Object.entries(vd.products)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5);
    const part    = grandTotal > 0 ? ((vd.total / grandTotal) * 100).toFixed(1) : '0';
    const rankColor = RANK_COLORS[i] ?? '#6b7280';
    const topRows = topProds.map(([pName, { units, revenue }]) => `
      <tr>
        <td>${pName}</td>
        <td style="text-align:right">${units}</td>
        <td style="text-align:right;font-weight:600;color:#10785a">${fmt(revenue)} F</td>
      </tr>`).join('');

    return `<div class="vcard">
      <div class="vcard-header">
        <div class="rank" style="background:${rankColor}22;color:${rankColor}">#${i + 1}</div>
        <div style="flex:1;min-width:0">
          <div class="vname">${name}</div>
          <div class="vsub">${vd.count} vente${vd.count > 1 ? 's' : ''} &nbsp;·&nbsp; ${part}% du CA</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:18px;font-weight:800;color:#10785a;letter-spacing:-0.02em">${fmt(vd.total)}</div>
          <div style="font-size:9px;color:#9ca3af;margin-top:1px">FCFA</div>
        </div>
      </div>
      <div class="vcard-body">
        <div class="top-label">Top produits</div>
        <table class="prod-table">
          <thead><tr><th>Produit</th><th style="text-align:right">Unités</th><th style="text-align:right">CA</th></tr></thead>
          <tbody>${topRows}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
  <title>Rapport vendeurs — ${monthLabel}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11.5px;color:#1a1a2e;padding:16mm}
    h1{font-size:20px;font-weight:800;letter-spacing:-0.025em;margin-bottom:2px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e5e7eb}
    .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}
    .scard{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:11px 14px}
    .scard .lbl{font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
    .scard .val{font-size:20px;font-weight:800;letter-spacing:-0.025em}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
    .vcard{background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}
    .vcard-header{display:flex;align-items:center;gap:12px;padding:14px 16px;background:#fafafa;border-bottom:1px solid #e5e7eb}
    .rank{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0}
    .vname{font-size:14px;font-weight:700;color:#0a0e14;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .vsub{font-size:11px;color:#9ca3af;margin-top:1px}
    .vcard-body{padding:10px 14px 14px}
    .top-label{font-size:9.5px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
    .prod-table{width:100%;border-collapse:collapse;font-size:10.5px}
    .prod-table th{background:#f3f4f6;padding:4px 6px;font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;text-align:left;letter-spacing:.04em}
    .prod-table td{padding:4px 6px;border-bottom:1px solid #f5f5f5}
    .prod-table tr:last-child td{border-bottom:none}
    .footer{margin-top:20px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between}
    @media print{@page{size:A4;margin:10mm}body{padding:0}.vcard{break-inside:avoid}}
  </style></head><body>
  <div class="header">
    <div>
      <h1>${pharmacyName}</h1>
      <div style="font-size:12px;color:#6b7280;margin-top:3px">Rapport vendeurs · ${monthLabel}</div>
    </div>
    <div style="text-align:right;font-size:11px;color:#6b7280">Imprimé le ${printDate}</div>
  </div>
  <div class="summary">
    <div class="scard"><div class="lbl">CA total</div><div class="val" style="color:#10785a">${fmt(grandTotal)}<span style="font-size:12px;color:#9ca3af;font-weight:500"> FCFA</span></div></div>
    <div class="scard"><div class="lbl">Transactions</div><div class="val" style="color:#374151">${grandCount}</div></div>
    <div class="scard"><div class="lbl">Vendeurs actifs</div><div class="val" style="color:#374151">${sellers.length}</div></div>
  </div>
  <div class="grid">${sellerCards}</div>
  <div class="footer">
    <span>${pharmacyName} · Rapport vendeurs · ${monthLabel}</span>
    <span>Confidentiel · JunglePharm</span>
  </div>
  </body></html>`;

  const { printHtml } = await import('../lib/printHelper');
  printHtml(html);
}

// ── Historique commandes ───────────────────────────────────────────────────────
function CommandesSection() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('purchase_orders')
        .select('id, order_date, supplier, rep_name, rep_phone, status, notes, created_at')
        .order('created_at', { ascending: false });
      setOrders(data || []);
      setLoaded(true);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
    brouillon: { label: 'Brouillon', bg: 'rgba(107,114,128,0.08)', fg: '#374151' },
    envoyée:   { label: 'Envoyée',   bg: 'rgba(37,99,235,0.08)',   fg: '#1d4ed8' },
    reçue:     { label: 'Reçue',     bg: 'rgba(16,120,90,0.08)',   fg: '#10785a' },
    annulée:   { label: 'Annulée',   bg: 'rgba(200,30,30,0.08)',   fg: '#c81e1e' },
  };

  const byStatus = ['reçue', 'envoyée', 'brouillon', 'annulée'].map(s => ({
    status: s,
    count: orders.filter(o => o.status === s).length,
    ...STATUS_META[s],
  }));

  const navigate = () => {
    window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab: 'commandes' } }));
  };

  return (
    <div>
      {loading && <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 13 }}>Chargement…</div>}

      {loaded && (
        <>
          {/* Résumé KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
            <div style={{ background: 'rgba(255,255,255,0.72)', border: '1.5px solid rgba(255,255,255,0.55)', borderRadius: 12, padding: '14px 16px', backdropFilter: 'blur(12px)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#0a0e14' }}>{orders.length}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>commandes</div>
            </div>
            {byStatus.filter(s => s.count > 0).map(s => (
              <div key={s.status} style={{ background: s.bg, border: '1.5px solid rgba(255,255,255,0.55)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: s.fg, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.fg }}>{s.count}</div>
              </div>
            ))}
          </div>

          {/* Tableau */}
          {orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', background: 'rgba(255,255,255,0.72)', borderRadius: 14, border: '1.5px solid rgba(255,255,255,0.55)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>Aucune commande enregistrée</div>
              <button onClick={navigate}
                style={{ marginTop: 12, padding: '8px 18px', borderRadius: 10, background: '#0a0e14', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                → Créer une commande
              </button>
            </div>
          ) : (
            <div style={{ background: 'rgba(255,255,255,0.72)', border: '1.5px solid rgba(255,255,255,0.55)', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
              {/* Thead */}
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 1fr 100px', gap: 0, padding: '8px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                {['Date', 'Fournisseur', 'Commercial', 'Notes', 'Statut'].map(h => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                ))}
              </div>
              {/* Rows */}
              <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                {orders.map((o, i) => {
                  const sm = STATUS_META[o.status] || STATUS_META.brouillon;
                  return (
                    <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 1fr 100px', gap: 0, padding: '10px 16px', borderBottom: i < orders.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none', alignItems: 'center' }}>
                      <div style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>
                        {new Date(o.order_date).toLocaleDateString('fr-FR')}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0a0e14', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.supplier || '—'}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.rep_name ? `${o.rep_name}${o.rep_phone ? ' · ' + o.rep_phone : ''}` : '—'}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: o.notes ? 'italic' : 'normal' }}>
                        {o.notes || '—'}
                      </div>
                      <div>
                        <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: sm.bg, color: sm.fg }}>
                          {sm.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Footer */}
              <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>{orders.length} commande{orders.length > 1 ? 's' : ''} au total</span>
                <button onClick={navigate}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 9, background: 'rgba(16,120,90,0.08)', border: 'none', fontSize: 12, fontWeight: 600, color: '#10785a', cursor: 'pointer' }}>
                  Gérer les commandes →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────
type Section = 'exports' | 'insurance' | 'commandes';

export default function Rapports() {
  const [section, setSection] = useState<Section>('exports');
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const now = new Date();
  const { settings } = useUserSettings();
  const pharmacyName = settings.pharmacy_name || 'JunglePharm';

  const [reportYear,  setReportYear]  = useState(now.getFullYear());
  const [reportMonth, setReportMonth] = useState(now.getMonth());

  const wrap = (key: string, fn: () => Promise<void> | void) => async () => {
    setLoadingKey(key);
    try { await fn(); } finally { setLoadingKey(null); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* En-tête */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0a0e14', letterSpacing: '-0.03em', margin: 0 }}>Rapports</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>Exports CSV, impressions et facturation assurance</p>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 6, background: 'rgba(0,0,0,0.05)', borderRadius: 12, padding: 4, alignSelf: 'flex-start' }}>
        {([
          { id: 'exports',   label: 'Exports & Rapports',     icon: <BarChart2 style={{ width: 14, height: 14 }} /> },
          { id: 'insurance', label: 'Facturation assurance',  icon: <Shield    style={{ width: 14, height: 14 }} /> },
          { id: 'commandes', label: 'Commandes',            icon: <Truck     style={{ width: 14, height: 14 }} /> },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setSection(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: section === t.id ? '#fff' : 'transparent',
              color: section === t.id ? '#0a0e14' : '#6b7280',
              boxShadow: section === t.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.12s',
            }}
          >{t.icon}{t.label}</button>
        ))}
      </div>

      {/* ── Section Exports ──────────────────────────────────────────────────── */}
      {section === 'exports' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Bloc rapport mensuel */}
          <div style={{ background: 'rgba(255,255,255,0.72)', border: '1.5px solid rgba(255,255,255,0.55)', borderRadius: 16, padding: '18px 20px', backdropFilter: 'blur(12px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <FileText style={{ width: 16, height: 16, color: '#10785a' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0a0e14' }}>Rapport mensuel imprimable</span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={reportMonth} onChange={e => setReportMonth(parseInt(e.target.value))}
                style={{ padding: '8px 12px', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 10, fontSize: 13, background: 'rgba(255,255,255,0.8)', outline: 'none', fontWeight: 600 }}>
                {MONTHS_FR.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={reportYear} onChange={e => setReportYear(parseInt(e.target.value))}
                style={{ padding: '8px 12px', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 10, fontSize: 13, background: 'rgba(255,255,255,0.8)', outline: 'none', fontWeight: 600 }}>
                {[now.getFullYear(), now.getFullYear() - 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button
                onClick={() => printMonthlyReport(reportYear, reportMonth, pharmacyName)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: '#10785a', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                <Printer style={{ width: 14, height: 14 }} />
                Imprimer rapport {MONTHS_FR[reportMonth]} {reportYear}
              </button>
            </div>
          </div>

          {/* Grille exports CSV */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Exports CSV</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
              <ActionCard
                icon={<BarChart2 style={{ width: 18, height: 18, color: '#fff' }} />}
                title="Journal des ventes (90 j)"
                description="Toutes les ventes des 3 derniers mois avec modes de paiement"
                color="#10785a"
                loading={loadingKey === 'sales'}
                onClick={wrap('sales', exportSalesJournalCsv)}
              />
              <ActionCard
                icon={<Shield style={{ width: 18, height: 18, color: '#fff' }} />}
                title="Ventes assurance"
                description="Toutes les ventes avec prise en charge assurance/mutuelle"
                color="#4f46e5"
                badge="Avec taux & montants"
                loading={loadingKey === 'insurance_csv'}
                onClick={wrap('insurance_csv', exportVentesAssuranceCsv)}
              />
              <ActionCard
                icon={<Package style={{ width: 18, height: 18, color: '#fff' }} />}
                title="Inventaire complet"
                description="Stock, prix, fournisseurs, dates d'expiration"
                color="#0651bc"
                loading={loadingKey === 'inventory'}
                onClick={wrap('inventory', exportInventaireCsv)}
              />
              <ActionCard
                icon={<Calendar style={{ width: 18, height: 18, color: '#fff' }} />}
                title="Péremptions"
                description="Tous les produits avec date d'expiration, triés par urgence"
                color="#b75f06"
                loading={loadingKey === 'expiry'}
                onClick={wrap('expiry', exportPeremptionsCsv)}
              />
            </div>
          </div>

          {/* Grille exports Excel */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#10785a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Exports Excel</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
              <ActionCard
                icon={<BarChart2 style={{ width: 18, height: 18, color: '#fff' }} />}
                title="Ventes Excel"
                description="Journal des ventes — Date, Médicament, Qté, Prix, Paiement, Vendeur"
                color="#10785a"
                badge="XLSX"
                loading={loadingKey === 'sales_xlsx'}
                onClick={wrap('sales_xlsx', exportVentesXlsx)}
              />
              <ActionCard
                icon={<Package style={{ width: 18, height: 18, color: '#fff' }} />}
                title="Stock Excel"
                description="Inventaire complet — Nom, DCI, Stock, Prix achat/vente, Expiration"
                color="#0651bc"
                badge="XLSX"
                loading={loadingKey === 'stock_xlsx'}
                onClick={wrap('stock_xlsx', exportStockXlsx)}
              />
              <ActionCard
                icon={<ClipboardList style={{ width: 18, height: 18, color: '#fff' }} />}
                title="Rapport complet Excel"
                description="Classeur multi-feuilles : Ventes + Stock + Dépenses"
                color="#7c3aed"
                badge="XLSX · 3 feuilles"
                loading={loadingKey === 'rapport_xlsx'}
                onClick={wrap('rapport_xlsx', exportRapportCompletXlsx)}
              />
            </div>
          </div>

          {/* Grille rapports PDF */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Rapports PDF imprimables</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
              <ActionCard
                icon={<ClipboardList style={{ width: 18, height: 18, color: '#fff' }} />}
                title="Bilan de stock"
                description="Inventaire complet, coloré par statut — ruptures, critiques, périmés"
                badge="PDF"
                color="#0f766e"
                loading={loadingKey === 'stock_pdf'}
                isPrint
                onClick={wrap('stock_pdf', () => printStockBilan(pharmacyName))}
              />
              <ActionCard
                icon={<Users style={{ width: 18, height: 18, color: '#fff' }} />}
                title="Rapport vendeurs"
                description={`Performance individuelle — ${MONTHS_FR[reportMonth]} ${reportYear}`}
                badge="PDF"
                color="#7c3aed"
                loading={loadingKey === 'vendeur_pdf'}
                isPrint
                onClick={wrap('vendeur_pdf', () => printVendeurReport(reportYear, reportMonth, pharmacyName))}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Section Commandes ────────────────────────────────────────────────── */}
      {section === 'commandes' && (
        <div>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
            Historique de toutes les commandes fournisseurs avec leurs commerciaux.
          </p>
          <CommandesSection />
        </div>
      )}

      {/* ── Section Facturation assurance ────────────────────────────────────── */}
      {section === 'insurance' && (
        <div>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
            Générez des bordereaux de remboursement par organisme pour une période donnée.
          </p>
          <InsuranceBillingSection />
        </div>
      )}
    </div>
  );
}

// ── Re-export missing import ───────────────────────────────────────────────────
function Package(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5 12 4l8.5 4.5M3.5 8.5v7L12 20m-8.5-11.5L12 13m0 7 8.5-4.5v-7M12 13v7m0-7 8.5-4.5" />
    </svg>
  );
}
