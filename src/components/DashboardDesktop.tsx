import { useState, useEffect, useMemo } from 'react';
import { Truck, ArrowRight, ChevronDown } from 'lucide-react';
import { fetchAllMedications, Medication, supabase } from '../lib/supabase';
import { getDaysUntilExpiry, isExpired } from '../lib/dateUtils';
import { useAuth } from '../lib/auth';

// ── Chalk Premium design tokens ──────────────────────────────────
const C = {
  panel:    'rgba(255,255,255,0.62)',
  panel2:   'rgba(255,255,255,0.40)',
  hairline: 'rgba(255,255,255,0.55)',
  border:   'rgba(15,15,20,0.06)',
  bgTab:    'rgba(232,239,233,0.6)',
  brand:    '#10785a',
  brandHi:  '#149a73',
  brandLt:  'rgba(16,120,90,0.08)',
  brandMid: 'rgba(16,120,90,0.16)',
  ink:      '#0a0e14',
  inkSoft:  '#2c3138',
  inkMute:  '#6b7280',
  inkFaint: '#9aa0a8',
  red:      '#c81e1e',
  redLt:    'rgba(200,30,30,0.08)',
  amber:    '#b75f06',
  amberLt:  'rgba(183,95,6,0.09)',
  blue:     '#0651bc',
  violet:   '#6e44b0',
  fm:       '"SF Mono", "Geist Mono", ui-monospace, Menlo, monospace',
};

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR').replace(/[  ,]/g, ' ');

interface JournalRow {
  id: string;
  sale_date: string;
  medication_name: string;
  quantity_sold: number;
  total_price: number;
  payment_method: string;
  seller_name?: string;
}

// ── Sparkline (matches reference) ────────────────────────────────
function Sparkline({ data, w = 64, h = 28, color = C.brand, fill = true }: { data: number[]; w?: number; h?: number; color?: string; fill?: boolean }) {
  if (data.length < 2) return <svg width={w} height={h} />;
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const pad = 2;
  const pts = data.map((v, i) => [
    pad + (i / (data.length - 1)) * (w - pad * 2),
    pad + (h - pad * 2) - ((v - min) / range) * (h - pad * 2) * 0.85,
  ]);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const fillD = `${d} L${last[0]},${h} L${pts[0][0]},${h} Z`;
  const gid = `sg-${color.replace('#', '')}-${w}`;
  return (
    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={fillD} fill={`url(#${gid})`} />}
      <path d={d} stroke={color} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} />
      <circle cx={last[0]} cy={last[1]} r="4" fill={color} opacity="0.18" />
    </svg>
  );
}

// ── Pill (matches reference) ─────────────────────────────────────
type PillColor = 'gray' | 'green' | 'red' | 'amber' | 'blue';
function Pill({ children, color = 'gray', size = 'sm' }: { children: React.ReactNode; color?: PillColor; size?: 'sm' | 'md' }) {
  const palette: Record<PillColor, { bg: string; fg: string; dot: string }> = {
    gray:  { bg: 'rgba(15,15,20,0.05)', fg: C.inkSoft, dot: C.inkFaint },
    green: { bg: C.brandLt, fg: C.brand, dot: C.brand },
    red:   { bg: C.redLt, fg: C.red, dot: C.red },
    amber: { bg: C.amberLt, fg: C.amber, dot: C.amber },
    blue:  { bg: 'rgba(6,81,188,0.07)', fg: C.blue, dot: C.blue },
  };
  const c = palette[color];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, background: c.bg, color: c.fg,
      padding: size === 'sm' ? '2px 8px' : '4px 10px', borderRadius: 99,
      fontSize: size === 'sm' ? 11 : 12, fontWeight: 500, lineHeight: 1.4, letterSpacing: '-0.005em',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 99, background: c.dot }} />
      {children}
    </span>
  );
}

const card: React.CSSProperties = {
  background: C.panel, border: `1px solid ${C.hairline}`, borderRadius: 12,
  boxShadow: `0 1px 0 ${C.hairline}`,
  backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)',
};

const PERIODS = [
  { id: '7j', label: '7j', days: 7 },
  { id: '30j', label: '30j', days: 30 },
  { id: '90j', label: '90j', days: 90 },
] as const;

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const TOP_COLORS = [C.brand, C.blue, C.violet, C.amber, '#0f7e5e'];

export default function DashboardDesktop() {
  const { profile } = useAuth();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [journal, setJournal] = useState<JournalRow[]>([]);
  const [period, setPeriod] = useState<typeof PERIODS[number]['id']>('7j');

  useEffect(() => {
    fetchAllMedications('expiry_date').then(setMedications).catch(() => {});
    const since = new Date();
    since.setDate(since.getDate() - 90);
    supabase
      .from('sales_journal')
      .select('id, sale_date, medication_name, quantity_sold, total_price, payment_method, seller_name')
      .gte('sale_date', since.toISOString())
      .order('sale_date', { ascending: false })
      .then(({ data }) => { if (data) setJournal(data as JournalRow[]); });
  }, []);

  const dayKey = (d: Date) => d.toISOString().split('T')[0];

  const m = useMemo(() => {
    const today = dayKey(new Date());
    const todayRows = journal.filter(r => r.sale_date.split('T')[0] === today);
    const todaySales = todayRows.reduce((s, r) => s + (r.total_price || 0), 0);
    const ticketsToday = todayRows.length;

    // Daily totals for the selected period
    const days = PERIODS.find(p => p.id === period)!.days;
    const dailyMap: Record<string, number> = {};
    const dayList: { key: string; label: string; date: Date }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = dayKey(d);
      dailyMap[k] = 0;
      dayList.push({ key: k, label: DAY_LABELS[d.getDay()], date: d });
    }
    for (const r of journal) {
      const k = r.sale_date.split('T')[0];
      if (k in dailyMap) dailyMap[k] += r.total_price || 0;
    }
    const dailyTotals = dayList.map(d => ({ ...d, total: dailyMap[d.key] }));
    const periodTotal = dailyTotals.reduce((s, d) => s + d.total, 0);

    // delta: this period vs previous same-length window
    const prevMap: Record<string, number> = {};
    for (let i = days * 2 - 1; i >= days; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      prevMap[dayKey(d)] = 0;
    }
    for (const r of journal) {
      const k = r.sale_date.split('T')[0];
      if (k in prevMap) prevMap[k] += r.total_price || 0;
    }
    const prevTotal = Object.values(prevMap).reduce((s, v) => s + v, 0);
    const periodDelta = prevTotal === 0 ? (periodTotal > 0 ? 100 : 0) : ((periodTotal - prevTotal) / prevTotal) * 100;

    // yesterday for "ventes du jour" comparison
    const yKey = dayKey(new Date(Date.now() - 86400000));
    const yTotal = journal.filter(r => r.sale_date.split('T')[0] === yKey).reduce((s, r) => s + (r.total_price || 0), 0);
    const dayDelta = yTotal === 0 ? (todaySales > 0 ? 100 : 0) : ((todaySales - yTotal) / yTotal) * 100;

    const last7 = dailyTotals.slice(-7).map(d => d.total);
    const ticketsSpark = dailyTotals.slice(-7).map(d =>
      journal.filter(r => r.sale_date.split('T')[0] === d.key).length
    );

    // Stock metrics
    const minOf = (med: Medication) => med.minimum_stock ?? med.min_stock ?? 0;
    const ruptures = medications.filter(med => med.quantity === 0).length;
    const critical = medications.filter(med => med.quantity === 0 || med.quantity < minOf(med));
    const expiring30 = medications.filter(med => {
      const d = getDaysUntilExpiry(med.expiry_date);
      return !isExpired(med.expiry_date) && d >= 0 && d <= 30;
    });

    const criticalList = [...critical]
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 5)
      .map(med => {
        const min = minOf(med) || 10;
        const spark = [5, 4, 3, 2, 1, 0.5, 0].map(f => Math.max(med.quantity, Math.round(med.quantity + (min - med.quantity) * (f / 5))));
        return {
          name: `${med.name}${med.dosage ? ' ' + med.dosage : ''}`,
          cat: med.category || med.forme_produit || 'Produit',
          stock: med.quantity,
          status: med.quantity === 0 ? 'rupture' : 'critique',
          spark: spark.length > 1 ? spark : [min, med.quantity],
        };
      });

    // Recent transactions
    const recent = journal.slice(0, 5).map(r => ({
      id: '#' + r.id.slice(0, 4).toUpperCase(),
      name: r.medication_name,
      type: r.seller_name ? `Vendu par ${r.seller_name}` : 'Vente comptoir',
      m: r.total_price || 0,
      pm: r.payment_method || 'Espèces',
      t: new Date(r.sale_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    }));

    // Top products over selected period
    const sinceKey = dailyTotals[0]?.key ?? today;
    const agg: Record<string, number> = {};
    for (const r of journal) {
      if (r.sale_date.split('T')[0] >= sinceKey) agg[r.medication_name] = (agg[r.medication_name] || 0) + (r.quantity_sold || 0);
    }
    const topEntries = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topMax = topEntries[0]?.[1] || 1;
    const topProducts = topEntries.map(([name, units], i) => ({
      name, units, pct: Math.round((units / topMax) * 100), color: TOP_COLORS[i % TOP_COLORS.length],
    }));

    return {
      todaySales, ticketsToday, dayDelta, last7, ticketsSpark,
      dailyTotals, periodTotal, periodDelta,
      ruptures, criticalCount: critical.length, expiring30Count: expiring30.length,
      criticalList, recent, topProducts,
      expiringNames: expiring30.slice(0, 3).map(med => med.name).join(' · ') || 'Aucun lot proche',
    };
  }, [journal, medications, period]);

  const displayName = profile?.full_name || profile?.email?.split('@')[0] || 'Manager';
  const firstName = displayName.split(' ')[0];
  const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Cycle la période (7j → 30j → 90j) — pilote aussi le graphe et les top produits.
  const cyclePeriod = () => {
    const idx = PERIODS.findIndex(p => p.id === period);
    setPeriod(PERIODS[(idx + 1) % PERIODS.length].id);
  };

  // "Voir tout" : descend vers le journal d'activité (rendu juste en dessous).
  const scrollToJournal = () => {
    document.querySelector('[data-journal-section]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // "Créer une commande" : exporte une liste de réapprovisionnement des produits sous le seuil.
  const exportRestock = () => {
    const low = medications.filter(med => med.quantity < (med.minimum_stock ?? med.min_stock ?? 10));
    if (low.length === 0) { alert('Aucun produit à réapprovisionner pour le moment.'); return; }
    let r = 'COMMANDE DE RÉAPPROVISIONNEMENT\n=================================\n';
    r += `Date : ${new Date().toLocaleDateString('fr-FR')}\n\n`;
    low.forEach((item, i) => {
      r += `${i + 1}. ${item.name}${item.dosage ? ' ' + item.dosage : ''}\n`;
      r += `   Quantité actuelle : ${item.quantity}\n`;
      r += `   Stock minimum : ${item.minimum_stock ?? item.min_stock ?? '-'}\n`;
      r += `   Fournisseur : ${item.supplier || '-'}\n\n`;
    });
    const blob = new Blob([r], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `reapprovisionnement-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const kpis = [
    { lbl: 'Ventes du jour', val: fmt(m.todaySales), unit: 'FC', delta: `${m.dayDelta >= 0 ? '+' : ''}${m.dayDelta.toFixed(1)}%`, pos: m.dayDelta >= 0, spark: m.last7.length ? m.last7 : [0, 0], color: m.dayDelta >= 0 ? C.brand : C.red, sub: 'vs. hier' },
    { lbl: 'Tickets émis', val: String(m.ticketsToday), unit: '', delta: `${m.ticketsToday}`, pos: true, spark: m.ticketsSpark.length ? m.ticketsSpark : [0, 0], color: C.brand, sub: m.ticketsToday ? `panier moyen ${fmt(m.todaySales / m.ticketsToday)} FC` : 'aucune vente' },
    { lbl: 'Stock critique', val: String(m.criticalCount), unit: 'réf.', delta: `${m.ruptures}`, pos: false, spark: [0, 0], color: C.red, sub: `${m.ruptures} rupture${m.ruptures !== 1 ? 's' : ''} active${m.ruptures !== 1 ? 's' : ''}`, noSpark: true },
    { lbl: 'Péremption < 30j', val: String(m.expiring30Count), unit: 'lots', delta: 'à surveiller', pos: null, spark: [0, 0], color: C.amber, sub: m.expiringNames, noSpark: true },
  ];

  const maxBar = Math.max(...m.dailyTotals.map(d => d.total), 1);
  const yTicks = [maxBar, maxBar * 0.75, maxBar * 0.5, maxBar * 0.25, 0];

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, system-ui, sans-serif', color: C.ink }}>
      {/* Page header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em', color: C.ink, lineHeight: 1.1 }}>Bonjour, {firstName}</h1>
            <span style={{ fontSize: 26, lineHeight: 1 }}>👋</span>
          </div>
          <p style={{ fontSize: 13.5, color: C.inkMute, marginTop: 4, letterSpacing: '-0.005em' }}>
            Voici votre journée du <span style={{ color: C.inkSoft, fontWeight: 500 }}>{dateStr}</span>. Synchronisation active.
          </p>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
        {kpis.map((k, i) => (
          <article key={i} style={{ ...card, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: C.inkMute, fontWeight: 500, letterSpacing: '-0.005em' }}>{k.lbl}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.04em', color: C.ink, lineHeight: 1, whiteSpace: 'nowrap' }}>{k.val}</span>
                  {k.unit && <span style={{ fontSize: 13, color: C.inkMute, fontWeight: 500 }}>{k.unit}</span>}
                </div>
              </div>
              {!k.noSpark && <Sparkline data={k.spark} color={k.color} w={64} h={28} />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {k.pos === true && <Pill color="green">↑ {k.delta}</Pill>}
              {k.pos === false && <Pill color="red">{k.delta}</Pill>}
              {k.pos === null && <Pill color="amber">{k.delta}</Pill>}
              <span style={{ fontSize: 11.5, color: C.inkMute, letterSpacing: '-0.005em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.sub}</span>
            </div>
          </article>
        ))}
      </div>

      {/* Chart + Stock critique */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14, marginBottom: 16 }}>
        {/* Revenue chart */}
        <article style={{ ...card, padding: '20px 22px 16px' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: C.ink, marginBottom: 4 }}>Chiffre d'affaires</h2>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, color: C.inkMute, letterSpacing: '-0.005em' }}>{fmt(m.periodTotal)} FC sur la période</span>
                <Pill color={m.periodDelta >= 0 ? 'green' : 'red'} size="sm">{m.periodDelta >= 0 ? '↑' : '↓'} {Math.abs(m.periodDelta).toFixed(1)}% vs préc.</Pill>
              </div>
            </div>
            <div style={{ display: 'flex', background: C.bgTab, padding: 3, borderRadius: 7, border: `1px solid ${C.hairline}` }}>
              {PERIODS.map(p => (
                <button key={p.id} onClick={() => setPeriod(p.id)} style={{
                  border: 'none', background: period === p.id ? C.panel : 'transparent',
                  color: period === p.id ? C.ink : C.inkMute, fontSize: 11.5, fontWeight: 500,
                  padding: '4px 12px', borderRadius: 5, cursor: 'pointer',
                  boxShadow: period === p.id ? `0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px ${C.hairline}` : 'none',
                }}>{p.label}</button>
              ))}
            </div>
          </header>

          <div style={{ position: 'relative', height: 200 }}>
            {[0, 0.25, 0.5, 0.75, 1].map((y, i) => (
              <div key={i} style={{ position: 'absolute', left: 44, right: 0, top: y * 170, height: 1, background: i === 4 ? C.border : C.hairline }} />
            ))}
            {yTicks.map((v, i) => (
              <div key={i} style={{ position: 'absolute', left: 0, top: i * 42.5 - 6, fontSize: 10.5, fontFamily: C.fm, color: C.inkFaint }}>
                {v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)}
              </div>
            ))}
            <div style={{ position: 'absolute', left: 44, right: 0, top: 0, bottom: 30, display: 'flex', alignItems: 'flex-end', gap: m.dailyTotals.length > 14 ? 3 : 14, paddingRight: 4 }}>
              {m.dailyTotals.map((d, i) => {
                const isLast = i === m.dailyTotals.length - 1;
                return (
                  <div key={d.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
                    <div style={{
                      width: '100%', height: `${(d.total / maxBar) * 170}px`, minHeight: d.total > 0 ? 3 : 0,
                      background: isLast ? `linear-gradient(180deg, ${C.brand}, ${C.brandHi})` : C.brandLt,
                      borderRadius: '5px 5px 0 0', position: 'relative',
                      boxShadow: isLast ? `0 -2px 12px ${C.brandMid}` : 'none',
                    }}>
                      {isLast && d.total > 0 && (
                        <div style={{ position: 'absolute', top: -32, left: '50%', transform: 'translateX(-50%)', background: C.ink, color: '#fff', padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: C.fm, whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                          {fmt(d.total)} FC
                          <div style={{ position: 'absolute', bottom: -3, left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: 6, height: 6, background: C.ink }} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ position: 'absolute', left: 44, right: 0, bottom: 0, display: 'flex', gap: m.dailyTotals.length > 14 ? 3 : 14, paddingRight: 4 }}>
              {m.dailyTotals.map((d, i) => {
                const isLast = i === m.dailyTotals.length - 1;
                const show = m.dailyTotals.length <= 14 || i % Math.ceil(m.dailyTotals.length / 10) === 0 || isLast;
                return (
                  <div key={d.key} style={{ flex: 1, textAlign: 'center', fontSize: 10.5, fontFamily: C.fm, color: isLast ? C.ink : C.inkFaint, fontWeight: isLast ? 600 : 400, overflow: 'hidden' }}>
                    {show ? d.label : ''}
                  </div>
                );
              })}
            </div>
          </div>
        </article>

        {/* Stock critique */}
        <article style={{ ...card, padding: '20px 20px 12px', display: 'flex', flexDirection: 'column' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: C.ink }}>Stock critique</h2>
                <Pill color="red">{m.criticalCount}</Pill>
              </div>
              <p style={{ fontSize: 12, color: C.inkMute }}>Recommandation : commander aujourd'hui</p>
            </div>
          </header>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {m.criticalList.length === 0 ? (
              <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: 12.5, color: C.inkMute }}>Aucun produit critique 🎉</div>
            ) : m.criticalList.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px', borderRadius: 7 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: C.ink, fontWeight: 500, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: C.inkMute }}>{r.cat} · stock <span style={{ fontFamily: C.fm, color: r.stock === 0 ? C.red : C.amber, fontWeight: 600 }}>{r.stock}</span></div>
                </div>
                <Sparkline data={r.spark} color={r.status === 'rupture' ? C.red : C.amber} w={48} h={20} fill={false} />
                <Pill color={r.status === 'rupture' ? 'red' : 'amber'} size="sm">{r.status === 'rupture' ? 'Rupture' : 'Critique'}</Pill>
              </div>
            ))}
          </div>

          <button onClick={exportRestock} style={{ marginTop: 8, padding: '9px 12px', borderRadius: 8, background: C.brandLt, border: `1px solid ${C.brandMid}`, color: C.brand, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Truck size={14} color={C.brand} strokeWidth={1.8} />
            Créer une commande
          </button>
        </article>
      </div>

      {/* Transactions + Top produits */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14 }}>
        {/* Transactions */}
        <article style={{ ...card, padding: '18px 22px 8px' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>Transactions récentes</h2>
              <Pill color="gray" size="sm">Live</Pill>
            </div>
            <button onClick={scrollToJournal} style={{ background: 'transparent', border: 'none', fontSize: 12.5, color: C.brand, fontWeight: 550, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              Voir tout <ArrowRight size={12} color={C.brand} />
            </button>
          </header>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                {['Réf.', 'Produit / Vendeur', 'Montant', 'Paiement', 'Heure'].map((h, i) => (
                  <th key={i} style={{ textAlign: i === 2 ? 'right' : 'left', padding: '6px 10px 8px 0', fontSize: 10.5, color: C.inkMute, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: `1px solid ${C.hairline}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.recent.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '20px 0', textAlign: 'center', color: C.inkMute }}>Aucune transaction récente</td></tr>
              ) : m.recent.map((tx, i) => (
                <tr key={i} style={{ borderBottom: i < m.recent.length - 1 ? `1px solid ${C.hairline}` : 'none' }}>
                  <td style={{ padding: '10px 10px 10px 0' }}><span style={{ fontFamily: C.fm, fontSize: 11.5, color: C.inkMute, fontWeight: 500 }}>{tx.id}</span></td>
                  <td style={{ padding: '10px 10px 10px 0' }}>
                    <div style={{ fontSize: 13, color: C.ink, fontWeight: 500, letterSpacing: '-0.005em' }}>{tx.name}</div>
                    <div style={{ fontSize: 11, color: C.inkMute }}>{tx.type}</div>
                  </td>
                  <td style={{ padding: '10px 10px 10px 0', textAlign: 'right' }}>
                    <span style={{ fontFamily: C.fm, fontSize: 13, color: C.ink, fontWeight: 600 }}>{fmt(tx.m)}</span>
                    <span style={{ fontSize: 11, color: C.inkMute, marginLeft: 2 }}> FC</span>
                  </td>
                  <td style={{ padding: '10px 10px 10px 0', fontSize: 12, color: C.inkSoft }}>{tx.pm}</td>
                  <td style={{ padding: '10px 0', fontSize: 12, fontFamily: C.fm, color: C.inkMute }}>{tx.t}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        {/* Top produits */}
        <article style={{ ...card, padding: '18px 22px' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>Top produits</h2>
            <button onClick={cyclePeriod} title="Changer la période" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <span style={{ fontSize: 11.5, color: C.inkMute }}>{PERIODS.find(p => p.id === period)!.label}</span>
              <ChevronDown size={12} color={C.inkFaint} />
            </button>
          </header>
          {m.topProducts.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12.5, color: C.inkMute }}>Aucune vente sur la période</div>
          ) : m.topProducts.map((p, i) => (
            <div key={i} style={{ marginBottom: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 500, letterSpacing: '-0.005em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{p.name}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontFamily: C.fm, fontSize: 11, color: C.inkMute }}>{fmt(p.units)}u</span>
                  <span style={{ fontSize: 12, color: C.ink, fontWeight: 600, fontFamily: C.fm }}>{p.pct}%</span>
                </div>
              </div>
              <div style={{ height: 5, background: 'rgba(15,15,20,0.04)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${p.pct}%`, height: '100%', background: p.color, borderRadius: 99, transition: 'width 0.4s' }} />
              </div>
            </div>
          ))}
        </article>
      </div>
    </div>
  );
}
