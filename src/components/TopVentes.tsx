import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Search, BarChart2, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';

// ── Design tokens (identiques DashboardDesktop) ───────────────────────────────
const C = {
  panel:    'rgba(255,255,255,0.72)',
  hairline: 'rgba(15,15,20,0.07)',
  border:   'rgba(15,15,20,0.06)',
  brand:    '#537d14',
  brandLt:  'rgba(83,125,20,0.08)',
  brandMid: 'rgba(83,125,20,0.16)',
  ink:      '#0a0e14',
  inkSoft:  '#2c3138',
  inkMute:  '#6b7280',
  inkFaint: '#9aa0a8',
  red:      '#c81e1e',
  amber:    '#b75f06',
  blue:     '#0651bc',
  violet:   '#6e44b0',
  fm:       '"SF Mono", "Geist Mono", ui-monospace, Menlo, monospace',
};

const RANK_COLORS = [C.brand, C.blue, C.violet, C.amber, C.red,
  '#0f7e5e', '#1d4ed8', '#7c3aed', '#d97706', '#dc2626'];

const fmt = (n: number) =>
  Math.round(n).toLocaleString('fr-FR').replace(/[  ,]/g, ' ');

// ── Periods ───────────────────────────────────────────────────────────────────
const PERIODS = [
  { key: '7d',   label: '7 j' },
  { key: '30d',  label: '30 j' },
  { key: '90d',  label: '3 mois' },
  { key: '180d', label: '6 mois' },
  { key: '365d', label: '12 mois' },
  { key: 'all',  label: 'Tout' },
] as const;
type PeriodKey = typeof PERIODS[number]['key'];

function periodToIso(key: PeriodKey): string | null {
  if (key === 'all') return null;
  const days = parseInt(key);
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Row {
  medication_name: string;
  quantity_sold: number;
  total_price: number;
  is_return?: boolean;
}

interface ProductStat {
  name: string;
  units: number;
  revenue: number;
  tickets: number;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TopVentes() {
  const [period, setPeriod]   = useState<PeriodKey>('30d');
  const [metric, setMetric]   = useState<'revenue' | 'units'>('revenue');
  const [search, setSearch]   = useState('');
  const [rows, setRows]       = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = periodToIso(period);
      let q = supabase
        .from('sales_journal')
        .select('medication_name, quantity_sold, total_price');
      if (since) q = q.gte('sale_date', since);

      const { data } = await q;
      if (!cancelled) {
        setRows(data || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period]);

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const products = useMemo<ProductStat[]>(() => {
    const map: Record<string, ProductStat> = {};
    for (const r of rows) {
      if (r.is_return || (r.total_price || 0) < 0) continue;  // exclure retours
      const n = r.medication_name || 'Inconnu';
      if (!map[n]) map[n] = { name: n, units: 0, revenue: 0, tickets: 0 };
      map[n].units   += r.quantity_sold  || 0;
      map[n].revenue += r.total_price    || 0;
      map[n].tickets += 1;
    }
    return Object.values(map).sort((a, b) =>
      metric === 'revenue' ? b.revenue - a.revenue : b.units - a.units
    );
  }, [rows, metric]);

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q));
  }, [products, search]);

  // ── Summary KPIs ──────────────────────────────────────────────────────────
  const totalRevenue = useMemo(() => products.reduce((s, p) => s + p.revenue, 0), [products]);
  const totalUnits   = useMemo(() => products.reduce((s, p) => s + p.units,   0), [products]);
  const maxVal = filtered.length > 0
    ? (metric === 'revenue' ? filtered[0].revenue : filtered[0].units)
    : 1;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 28px', maxWidth: 860, margin: '0 auto', minHeight: '100vh' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: C.brandLt,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <TrendingUp size={18} color={C.brand} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>
            Top ventes
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: C.inkMute }}>
            Classement des produits les plus vendus
          </p>
        </div>
      </div>

      {/* ── Controls row ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>

        {/* Period tabs */}
        <div style={{
          display: 'flex', background: 'rgba(15,15,20,0.05)', borderRadius: 9, padding: 3, gap: 2,
        }}>
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              style={{
                padding: '4px 11px', border: 'none', borderRadius: 7, cursor: 'pointer',
                fontSize: 12, fontWeight: period === p.key ? 600 : 400,
                background: period === p.key ? '#fff' : 'transparent',
                color: period === p.key ? C.brand : C.inkMute,
                boxShadow: period === p.key ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                transition: 'all 0.12s',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Metric toggle */}
        <div style={{
          display: 'flex', background: 'rgba(15,15,20,0.05)', borderRadius: 9, padding: 3, gap: 2,
        }}>
          {([['revenue', 'CA (FCFA)'], ['units', 'Unités']] as const).map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => setMetric(k)}
              style={{
                padding: '4px 11px', border: 'none', borderRadius: 7, cursor: 'pointer',
                fontSize: 12, fontWeight: metric === k ? 600 : 400,
                background: metric === k ? '#fff' : 'transparent',
                color: metric === k ? C.brand : C.inkMute,
                boxShadow: metric === k ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                transition: 'all 0.12s',
              }}
            >
              {lbl}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{
          flex: 1, minWidth: 160, display: 'flex', alignItems: 'center',
          gap: 7, background: C.panel, border: `1px solid ${C.hairline}`,
          borderRadius: 9, padding: '5px 10px',
        }}>
          <Search size={13} color={C.inkFaint} style={{ flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un produit…"
            style={{
              border: 'none', background: 'transparent', outline: 'none',
              fontSize: 12.5, color: C.ink, flex: 1, fontFamily: 'inherit',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.inkFaint, padding: 0, lineHeight: 1 }}
            >✕</button>
          )}
        </div>
      </div>

      {/* ── Summary KPIs ── */}
      {!loading && products.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18,
        }}>
          {[
            { icon: <BarChart2 size={14} color={C.brand} />, label: 'CA total', value: `${fmt(totalRevenue)} FCFA` },
            { icon: <Package size={14} color={C.blue} />,    label: 'Unités vendues', value: fmt(totalUnits) },
            { icon: <TrendingUp size={14} color={C.violet} />, label: 'Produits distincts', value: String(products.length) },
          ].map(({ icon, label, value }) => (
            <div key={label} style={{
              background: C.panel, border: `1px solid ${C.hairline}`,
              borderRadius: 11, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8, background: 'rgba(15,15,20,0.04)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{icon}</div>
              <div>
                <div style={{ fontSize: 11, color: C.inkMute, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: C.fm, letterSpacing: '-0.02em' }}>
                  {value}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── List ── */}
      <div style={{
        background: C.panel, border: `1px solid ${C.hairline}`,
        borderRadius: 14, overflow: 'hidden',
      }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '36px 1fr 90px 90px 70px',
          gap: 0, padding: '9px 16px',
          borderBottom: `1px solid ${C.hairline}`,
          background: 'rgba(15,15,20,0.025)',
        }}>
          {['#', 'Produit', metric === 'revenue' ? 'CA (FCFA)' : 'Unités', metric === 'revenue' ? 'Unités' : 'CA (FCFA)', 'Tickets'].map((h, i) => (
            <div key={i} style={{
              fontSize: 10.5, fontWeight: 600, color: C.inkFaint,
              textTransform: 'uppercase', letterSpacing: '0.04em',
              textAlign: i >= 2 ? 'right' : 'left',
            }}>{h}</div>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div style={{
              width: 22, height: 22, border: `2px solid ${C.hairline}`,
              borderTopColor: C.brand, borderRadius: 99,
              animation: 'spin 0.7s linear infinite',
            }} />
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: C.inkFaint }}>
            <TrendingUp size={28} color={C.inkFaint} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: C.inkMute, marginBottom: 4 }}>
              {search ? 'Aucun produit trouvé' : 'Aucune vente sur cette période'}
            </div>
            <div style={{ fontSize: 12, color: C.inkFaint }}>
              {search ? 'Essayez un autre mot-clé' : 'Élargissez la période ou vérifiez les données'}
            </div>
          </div>
        )}

        {/* Rows */}
        {!loading && filtered.map((p, i) => {
          const barPct = Math.max(2, Math.round((metric === 'revenue' ? p.revenue : p.units) / maxVal * 100));
          const color = RANK_COLORS[i] || C.inkFaint;
          const primaryVal = metric === 'revenue' ? p.revenue : p.units;
          const secondaryVal = metric === 'revenue' ? p.units : p.revenue;

          return (
            <div
              key={p.name}
              style={{
                display: 'grid',
                gridTemplateColumns: '36px 1fr 90px 90px 70px',
                alignItems: 'center', gap: 0,
                padding: '10px 16px',
                borderBottom: `1px solid ${C.hairline}`,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(83,125,20,0.03)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Rank */}
              <div style={{
                width: 22, height: 22, borderRadius: 6,
                background: i < 3 ? color : 'rgba(15,15,20,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: i < 3 ? '#fff' : C.inkMute,
                fontFamily: C.fm, flexShrink: 0,
              }}>{i + 1}</div>

              {/* Name + bar */}
              <div style={{ paddingRight: 12, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 500, color: C.inkSoft,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  marginBottom: 4,
                }}>{p.name}</div>
                <div style={{
                  height: 3, borderRadius: 99, background: 'rgba(15,15,20,0.06)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 99,
                    width: `${barPct}%`, background: color,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>

              {/* Primary value */}
              <div style={{
                textAlign: 'right', fontSize: 13, fontWeight: 700,
                color: C.ink, fontFamily: C.fm, letterSpacing: '-0.02em',
              }}>
                {metric === 'revenue'
                  ? fmt(primaryVal)
                  : primaryVal.toLocaleString('fr-FR')}
              </div>

              {/* Secondary value */}
              <div style={{
                textAlign: 'right', fontSize: 12, color: C.inkMute, fontFamily: C.fm,
              }}>
                {metric === 'revenue'
                  ? secondaryVal.toLocaleString('fr-FR')
                  : fmt(secondaryVal)}
              </div>

              {/* Tickets */}
              <div style={{
                textAlign: 'right', fontSize: 12, color: C.inkFaint, fontFamily: C.fm,
              }}>
                {p.tickets}
              </div>
            </div>
          );
        })}

        {/* Footer */}
        {!loading && filtered.length > 0 && (
          <div style={{
            padding: '9px 16px', fontSize: 11, color: C.inkFaint,
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>{filtered.length} produit{filtered.length > 1 ? 's' : ''}</span>
            <span>
              {search && products.length !== filtered.length
                ? `${products.length} au total`
                : `Période : ${PERIODS.find(p => p.key === period)?.label}`}
            </span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
