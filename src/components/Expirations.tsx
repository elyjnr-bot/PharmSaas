/**
 * Expirations.tsx
 * Suivi des dates de péremption des médicaments.
 * Chalk Premium design — offline-first (localStorage + Supabase).
 */

import { useState, useMemo } from 'react';
import { AlertTriangle, Calendar, Package, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { offlineStorage } from '../lib/offlineStorage';
import { fetchAllMedications, Medication } from '../lib/supabase';
import { useEffect } from 'react';

// ── Helpers ────────────────────────────────────────────────────────────────────
function daysUntilExpiry(dateStr: string): number | null {
  if (!dateStr) return null;
  const exp = new Date(dateStr);
  if (isNaN(exp.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - today.getTime()) / 86_400_000);
}

type Severity = 'expired' | 'critical' | 'warning' | 'ok';
function severity(days: number | null): Severity {
  if (days === null) return 'ok';
  if (days < 0)   return 'expired';
  if (days <= 30)  return 'critical';
  if (days <= 90)  return 'warning';
  return 'ok';
}

const SEV_META: Record<Severity, { label: string; bg: string; fg: string; border: string }> = {
  expired:  { label: 'Expiré',     bg: 'rgba(200,30,30,0.07)',  fg: '#c81e1e', border: 'rgba(200,30,30,0.25)' },
  critical: { label: '< 30 j',     bg: 'rgba(183,95,6,0.07)',   fg: '#b75f06', border: 'rgba(183,95,6,0.25)'  },
  warning:  { label: '30 – 90 j',  bg: 'rgba(202,138,4,0.06)',  fg: '#92400e', border: 'rgba(202,138,4,0.2)'  },
  ok:       { label: '> 90 j',     bg: 'rgba(83,125,20,0.06)',  fg: '#537d14', border: 'rgba(83,125,20,0.18)' },
};

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: string[][], filename: string) {
  const blob = new Blob(['﻿' + rows.map(r => r.map(csvCell).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Component ──────────────────────────────────────────────────────────────────
type Filter = 'all' | Severity;

export default function Expirations() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cached = offlineStorage.getCachedMedications();
    if (cached.length) setMedications(cached);
    setLoading(true);
    fetchAllMedications()
      .then(data => { setMedications(data); offlineStorage.cacheMedications(data); })
      .catch(() => {/* keep cached */})
      .finally(() => setLoading(false));
  }, []);

  // Only meds with an expiry_date set
  const withExpiry = useMemo(() =>
    medications.filter(m => !!m.expiry_date),
    [medications]
  );

  const rows = useMemo(() => {
    let list = withExpiry.map(m => ({
      ...m,
      days: daysUntilExpiry(m.expiry_date),
      sev:  severity(daysUntilExpiry(m.expiry_date)),
    }));

    if (filter !== 'all') list = list.filter(r => r.sev === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q) || (r.dosage||'').toLowerCase().includes(q) || (r.supplier||'').toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      const da = a.days ?? 9999, db = b.days ?? 9999;
      return sortDir === 'asc' ? da - db : db - da;
    });
    return list;
  }, [withExpiry, filter, search, sortDir]);

  // KPI counts
  const counts = useMemo(() => {
    const c = { expired: 0, critical: 0, warning: 0, ok: 0 };
    for (const m of withExpiry) {
      c[severity(daysUntilExpiry(m.expiry_date))]++;
    }
    return c;
  }, [withExpiry]);

  const handleExport = () => {
    const headers = ['Nom', 'Dosage', 'Lot', 'Quantité', 'Date expiration', 'Jours restants', 'Statut', 'Fournisseur'];
    const data = rows.map(r => [
      r.name, r.dosage, r.batch_number, r.quantity,
      r.expiry_date, r.days ?? '', SEV_META[r.sev].label, r.supplier || '',
    ]);
    downloadCsv([headers, ...data], `peremptions-${new Date().toISOString().split('T')[0]}.csv`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── En-tête ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0a0e14', letterSpacing: '-0.03em', margin: 0 }}>
            Péremptions
          </h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>
            {withExpiry.length} produit{withExpiry.length > 1 ? 's' : ''} avec date d'expiration
            {loading && <span style={{ marginLeft: 8, fontSize: 11, color: '#9ca3af' }}>Chargement…</span>}
          </p>
        </div>
        <button
          onClick={handleExport}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, background: '#0a0e14', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          <Download style={{ width: 14, height: 14 }} />
          Exporter CSV
        </button>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {(['expired', 'critical', 'warning', 'ok'] as const).map(s => {
          const meta = SEV_META[s];
          const active = filter === s;
          return (
            <button
              key={s}
              onClick={() => setFilter(filter === s ? 'all' : s)}
              style={{
                padding: '14px 12px', borderRadius: 14, textAlign: 'left', cursor: 'pointer',
                background: active ? meta.bg : 'rgba(255,255,255,0.72)',
                border: `1.5px solid ${active ? meta.border : 'rgba(255,255,255,0.55)'}`,
                backdropFilter: 'blur(12px)',
                boxShadow: active ? `0 0 0 3px ${meta.border}` : '0 1px 3px rgba(0,0,0,0.05)',
                transition: 'all 0.12s',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800, color: meta.fg, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {counts[s]}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: meta.fg, marginTop: 4, opacity: 0.8 }}>
                {meta.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Alerte urgente */}
      {(counts.expired + counts.critical) > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(200,30,30,0.07)', border: '1px solid rgba(200,30,30,0.2)', borderRadius: 12, fontSize: 13 }}>
          <AlertTriangle style={{ width: 16, height: 16, color: '#c81e1e', flexShrink: 0 }} />
          <span style={{ color: '#7f1d1d', fontWeight: 600 }}>
            {counts.expired > 0 && <><strong>{counts.expired}</strong> lot{counts.expired > 1 ? 's' : ''} expiré{counts.expired > 1 ? 's' : ''} — à retirer immédiatement. </>}
            {counts.critical > 0 && <><strong>{counts.critical}</strong> lot{counts.critical > 1 ? 's' : ''} expirant dans moins de 30 jours.</>}
          </span>
        </div>
      )}

      {/* ── Barre de recherche + sort ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrer par nom, dosage, fournisseur…"
            style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 13, background: 'rgba(255,255,255,0.8)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        {(['all', 'expired', 'critical', 'warning', 'ok'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
              border: `1.5px solid ${filter === f ? '#0a0e14' : 'rgba(0,0,0,0.1)'}`,
              background: filter === f ? '#0a0e14' : 'rgba(255,255,255,0.8)',
              color: filter === f ? '#fff' : '#6b7280', cursor: 'pointer',
            }}
          >
            {f === 'all' ? 'Tous' : SEV_META[f].label}
            {f !== 'all' && counts[f] > 0 && <span style={{ marginLeft: 5, fontSize: 10, background: filter === f ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)', borderRadius: 99, padding: '1px 5px' }}>{counts[f]}</span>}
          </button>
        ))}
        <button
          onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', borderRadius: 10, border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}
        >
          {sortDir === 'asc' ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />}
          Date exp.
        </button>
      </div>

      {/* ── Tableau ────────────────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'rgba(255,255,255,0.7)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.55)' }}>
          <Calendar style={{ width: 36, height: 36, color: '#d1d5db', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>
            {filter === 'all' && !search ? 'Aucun médicament avec date d\'expiration enregistrée' : 'Aucun résultat pour ce filtre'}
          </p>
        </div>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.72)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.55)', overflow: 'hidden', backdropFilter: 'blur(16px)' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 80px 120px 90px', gap: 0, padding: '10px 16px', background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            {['Produit', 'Lot', 'Fournisseur', 'Qté', 'Expiration', 'Statut'].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
            ))}
          </div>
          {/* Rows */}
          {rows.map((med, i) => {
            const meta = SEV_META[med.sev];
            const isLast = i === rows.length - 1;
            return (
              <div
                key={med.id}
                style={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 80px 120px 90px', gap: 0,
                  padding: '12px 16px',
                  borderBottom: isLast ? 'none' : '1px solid rgba(0,0,0,0.04)',
                  background: med.sev === 'expired' ? 'rgba(200,30,30,0.03)' : med.sev === 'critical' ? 'rgba(183,95,6,0.02)' : 'transparent',
                  alignItems: 'center',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0a0e14', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {med.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{med.dosage || '—'}</div>
                </div>
                <div style={{ fontSize: 12, color: '#374151', fontFamily: 'monospace' }}>{med.batch_number || '—'}</div>
                <div style={{ fontSize: 12, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{med.supplier || '—'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Package style={{ width: 11, height: 11, color: '#9ca3af' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0a0e14' }}>{med.quantity}</span>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: med.sev === 'expired' ? '#c81e1e' : '#374151' }}>
                    {new Date(med.expiry_date).toLocaleDateString('fr-FR')}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                    {med.days === null ? '—' : med.days < 0 ? `il y a ${Math.abs(med.days)} j` : med.days === 0 ? "Aujourd'hui" : `dans ${med.days} j`}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: meta.bg, color: meta.fg, border: `1px solid ${meta.border}`, whiteSpace: 'nowrap' }}>
                    {meta.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
