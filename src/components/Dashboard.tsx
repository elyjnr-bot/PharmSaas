import { useState, useEffect } from 'react';
import { AlertTriangle, Calendar, Package, Download, Share2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { fetchAllMedications, Medication, supabase } from '../lib/supabase';
import { isExpired, expiresInThreeMonths } from '../lib/dateUtils';
import { useResponsive } from '../lib/useResponsive';
import DashboardDesktop from './DashboardDesktop';

interface DailyData {
  label: string;
  total: number;
}

function Sparkline({ data, color = '#537d14', height = 52 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) return <div style={{ height }} />;
  const w = 200; const h = height; const pad = 2;
  const min = Math.min(...data); const max = Math.max(...data); const range = max - min || 1;
  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (w - 2 * pad),
    y: h - pad - ((v - min) / range) * (h - 2 * pad),
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${(w - pad).toFixed(1)},${h} L${pad},${h} Z`;
  const gradId = `spark-${color.replace('#', '')}`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.14" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2.5" fill={color} />
    </svg>
  );
}

function DonutChart({ segments }: { segments: { value: number; color: string; label: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;
  const r = 28; const circumference = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.map((seg) => {
    const dash = (seg.value / total) * circumference;
    const arc = { ...seg, dash, offset };
    offset += dash;
    return arc;
  });
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" style={{ flexShrink: 0 }}>
      <circle cx="36" cy="36" r={r} fill="none" stroke="#f1f5f9" strokeWidth="10" />
      {arcs.map((arc, i) => (
        <circle key={i} cx="36" cy="36" r={r} fill="none" stroke={arc.color} strokeWidth="10"
          strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
          strokeDashoffset={circumference / 4 - arc.offset} />
      ))}
    </svg>
  );
}

function TrendBadge({ pct }: { pct: number }) {
  if (Math.abs(pct) < 0.5) return (
    <span className="flex items-center gap-0.5 font-semibold" style={{ fontSize: '11px', color: '#64748b' }}>
      <Minus className="w-3 h-3" strokeWidth={2.5} />0%
    </span>
  );
  const up = pct > 0;
  return (
    <span className="flex items-center gap-0.5 font-semibold" style={{ fontSize: '11px', color: up ? '#537d14' : '#dc2626' }}>
      {up ? <TrendingUp className="w-3 h-3" strokeWidth={2.5} /> : <TrendingDown className="w-3 h-3" strokeWidth={2.5} />}
      {up ? '+' : ''}{pct.toFixed(0)}%
    </span>
  );
}

export default function Dashboard() {
  const { isDesktop } = useResponsive();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [dailyRevenue, setDailyRevenue] = useState<DailyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isDesktop) { setIsLoading(false); return; }
    Promise.all([loadMedications(), loadRevenue()]).finally(() => setIsLoading(false));
  }, [isDesktop]);

  const loadMedications = async () => {
    try {
      const data = await fetchAllMedications('expiry_date');
      setMedications(data);
    } catch { /* silent */ }
  };

  const loadRevenue = async () => {
    try {
      const since = new Date();
      since.setDate(since.getDate() - 29);
      const sinceStr = since.toISOString().split('T')[0];
      const { data } = await supabase
        .from('sales_journal')
        .select('sale_date, total_price')
        .gte('sale_date', sinceStr)
        .order('sale_date', { ascending: true });
      if (!data) return;
      const map: Record<string, number> = {};
      for (let i = 0; i < 30; i++) {
        const d = new Date(); d.setDate(d.getDate() - (29 - i));
        map[d.toISOString().split('T')[0]] = 0;
      }
      for (const row of data) {
        const day = row.sale_date.split('T')[0];
        if (day in map) map[day] = (map[day] || 0) + (row.total_price || 0);
      }
      setDailyRevenue(Object.entries(map).map(([date, total]) => ({
        label: new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        total,
      })));
    } catch { /* silent */ }
  };

  const outOfStock   = medications.filter(m => m.quantity === 0).length;
  const expiringSoon = medications.filter(m => expiresInThreeMonths(m.expiry_date) && !isExpired(m.expiry_date)).length;
  const expiredCount = medications.filter(m => isExpired(m.expiry_date)).length;
  const totalUnits   = medications.reduce((s, m) => s + m.quantity, 0);

  const totalRevenue30 = dailyRevenue.reduce((s, d) => s + d.total, 0);
  const last7  = dailyRevenue.slice(-7).reduce((s, d) => s + d.total, 0);
  const prev7  = dailyRevenue.slice(-14, -7).reduce((s, d) => s + d.total, 0);
  const trendPct = prev7 === 0 ? 0 : ((last7 - prev7) / prev7) * 100;
  const sparkValues = dailyRevenue.map(d => d.total);

  const statusSegments = [
    { value: medications.filter(m => !isExpired(m.expiry_date) && m.quantity > 0 && m.quantity >= (m.minimum_stock || 0)).length, color: '#537d14', label: 'Normal' },
    { value: outOfStock,   color: '#dc2626', label: 'Rupture' },
    { value: expiringSoon, color: '#f97316', label: 'Péremption' },
    { value: expiredCount, color: '#ef4444', label: 'Périmé' },
  ].filter(s => s.value > 0);

  const priorityAlerts = medications
    .filter(m =>
      isExpired(m.expiry_date) ||
      expiresInThreeMonths(m.expiry_date) ||
      m.quantity === 0 ||
      (m.minimum_stock !== undefined && m.quantity < m.minimum_stock)
    )
    .slice(0, 10);

  const restockItems = medications.filter(m => m.quantity < 10);

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });

  const fmtCurrency = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000   ? `${(n / 1_000).toFixed(0)}k`
    : `${n.toFixed(0)}`;

  const generateRestockReport = () => {
    let r = 'COMMANDE DE RÉAPPROVISIONNEMENT\n=================================\n';
    r += `Date: ${new Date().toLocaleDateString('fr-FR')}\n\nProduits avec quantité < 10:\n\n`;
    restockItems.forEach((item, i) => {
      r += `${i + 1}. ${item.name} ${item.dosage}\n   Quantité actuelle: ${item.quantity}\n   Stock minimum: ${item.minimum_stock}\n   Lot: ${item.batch_number}\n   Péremption: ${formatDate(item.expiry_date)}\n\n`;
    });
    const blob = new Blob([r], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `reapprovisionnement-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const shareStockOutOnWhatsApp = () => {
    // ── Ruptures (stock = 0) ──
    const outOfStock = medications.filter(m => m.quantity <= 0);
    // ── Stock bas (en-dessous du minimum configuré ou < 5 si pas de minimum) ──
    const lowStock = medications.filter(m => {
      const min = m.minimum_stock && m.minimum_stock > 0 ? m.minimum_stock : 5;
      return m.quantity > 0 && m.quantity <= min;
    });

    if (!outOfStock.length && !lowStock.length) {
      alert('✅ Aucune alerte stock — tous les produits sont au-dessus du seuil minimum !');
      return;
    }

    const date = new Date().toLocaleDateString('fr-FR');
    let msg = `⚠️ *ALERTE STOCK — ${date}*\n\n`;

    if (outOfStock.length > 0) {
      msg += `🚫 *RUPTURES (${outOfStock.length})*\n`;
      outOfStock.slice(0, 15).forEach((item, i) => {
        msg += `${i + 1}. *${item.name}* ${item.dosage || ''}\n`;
      });
      if (outOfStock.length > 15) msg += `   _... et ${outOfStock.length - 15} autres_\n`;
      msg += `\n`;
    }

    if (lowStock.length > 0) {
      msg += `📉 *STOCK BAS (${lowStock.length})*\n`;
      lowStock.slice(0, 15).forEach((item, i) => {
        const min = item.minimum_stock && item.minimum_stock > 0 ? item.minimum_stock : 5;
        msg += `${i + 1}. *${item.name}* ${item.dosage || ''} — ${item.quantity}/${min}\n`;
      });
      if (lowStock.length > 15) msg += `   _... et ${lowStock.length - 15} autres_\n`;
      msg += `\n`;
    }

    msg += `📦 Total alertes: ${outOfStock.length + lowStock.length} produit(s)\n`;
    msg += `_🌿 JunglePharm_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  if (isDesktop) return <DashboardDesktop />;

  if (isLoading) {
    return (
      <div className={`pb-20 px-4 pt-6 min-h-screen`} style={{ background: 'var(--color-bg)' }}>
        <div className="text-center py-16">
          <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin mx-auto" style={{ borderColor: '#537d14', borderTopColor: 'transparent' }} />
          <p className="mt-3 font-medium" style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Chargement...</p>
        </div>
      </div>
    );
  }

  const AlertList = ({ alerts, maxH }: { alerts: typeof priorityAlerts; maxH: string }) => (
    <>
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center py-8 gap-2">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: '#f0fdf4' }}>
            <Package className="w-5 h-5" style={{ color: '#537d14' }} />
          </div>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: 500 }}>Tout est en ordre</p>
        </div>
      ) : (
        <div style={{ maxHeight: maxH, overflowY: 'auto' }}>
          {alerts.map((med, i) => {
            const expired  = isExpired(med.expiry_date);
            const expiring = expiresInThreeMonths(med.expiry_date);
            const oos      = med.quantity === 0;
            type Cfg = { label: string; accent: string; bg: string; border: string };
            const cfg: Cfg = expired   ? { label: 'PÉRIMÉ',         accent: '#dc2626', bg: '#fef2f2', border: '#fecaca' }
                           : expiring  ? { label: 'EXPIRE BIENTÔT', accent: '#ea580c', bg: '#fff7ed', border: '#fed7aa' }
                           : oos       ? { label: 'RUPTURE',        accent: '#dc2626', bg: '#fef2f2', border: '#fecaca' }
                           :             { label: 'STOCK FAIBLE',   accent: '#d97706', bg: '#fffbeb', border: '#fde68a' };
            return (
              <div key={med.id} className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: i < alerts.length - 1 ? '1px solid var(--color-border-light)' : 'none', borderLeft: `3px solid ${cfg.accent}` }}>
                <div className="flex-1 min-w-0">
                  <p className="truncate" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>{med.name}</p>
                  <div className="flex items-center gap-2 mt-0.5" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    <span>Qté <strong style={{ color: 'var(--color-text)' }}>{med.quantity}</strong></span>
                    <span>·</span>
                    <span>Exp {formatDate(med.expiry_date)}</span>
                  </div>
                </div>
                <span className="pill-badge flex-shrink-0" style={{ background: cfg.bg, color: cfg.accent, border: `1px solid ${cfg.border}`, fontSize: '9px', fontWeight: 800, letterSpacing: '0.08em' }}>
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  /* Mobile layout */
  return (
    <div className="pb-24 px-4 pt-5 space-y-4 min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <div className="pt-1">
        <h1 className="font-extrabold" style={{ fontSize: '22px', letterSpacing: '-0.03em', color: 'var(--color-text)' }}>Tableau de bord</h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: 2 }}>
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Revenue sparkline */}
      <div className="rounded-ios overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="px-4 pt-4 pb-1">
          <p className="kpi-label">CHIFFRE D'AFFAIRES · 30 JOURS</p>
          <div className="flex items-end gap-3 mt-1.5">
            <span className="font-extrabold" style={{ fontSize: '28px', letterSpacing: '-0.04em', color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {fmtCurrency(totalRevenue30)}&thinsp;FCFA
            </span>
            <div className="mb-0.5"><TrendBadge pct={trendPct} /></div>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--color-text-faint)', marginTop: 2 }}>7j vs 7j précédents</p>
        </div>
        <div className="px-2 pb-1" style={{ height: 60 }}>
          {sparkValues.some(v => v > 0)
            ? <Sparkline data={sparkValues} height={56} />
            : <div className="flex items-center justify-center h-full"><p style={{ fontSize: '12px', color: 'var(--color-text-faint)' }}>Aucune vente enregistrée</p></div>
          }
        </div>
        {dailyRevenue.length > 0 && (
          <div className="flex justify-between px-4 pb-3 pt-1" style={{ borderTop: '1px solid var(--color-border-light)' }}>
            {[dailyRevenue[0], dailyRevenue[Math.floor(dailyRevenue.length / 2)], dailyRevenue[dailyRevenue.length - 1]].map((d, i) => (
              <p key={i} style={{ fontSize: '10px', color: 'var(--color-text-faint)', textAlign: i === 2 ? 'right' : i === 1 ? 'center' : 'left' }}>{d.label}</p>
            ))}
          </div>
        )}
      </div>

      {/* 2×2 KPI grid */}
      <div className="grid grid-cols-2 gap-3" data-tour="dash-kpis">
        {[
          { label: 'RUPTURES',     value: String(outOfStock),                 sub: 'hors stock',    color: '#dc2626', bg: '#fef2f2', Icon: AlertTriangle },
          { label: 'PÉREMPTIONS',  value: String(expiringSoon + expiredCount), sub: 'à traiter',     color: '#f97316', bg: '#fff7ed', Icon: Calendar },
          { label: 'CA · 7 JOURS', value: fmtCurrency(last7),                 sub: 'FCFA',          color: '#537d14', bg: '#f0fdf4', Icon: TrendingUp },
          { label: 'UNITÉS',       value: totalUnits.toLocaleString('fr-FR'),  sub: 'en inventaire', color: '#0ea5e9', bg: '#f0f9ff', Icon: Package },
        ].map(({ label, value, sub, color, bg, Icon }) => (
          <div key={label} className="rounded-ios p-3.5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center mb-2.5" style={{ background: bg }}>
              <Icon className="w-4 h-4" style={{ color }} strokeWidth={2} />
            </div>
            <p className="kpi-label">{label}</p>
            <p className="font-extrabold mt-0.5" style={{ fontSize: '22px', letterSpacing: '-0.04em', color: 'var(--color-text)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
            <p style={{ fontSize: '11px', color: 'var(--color-text-faint)', marginTop: 2 }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Stock health */}
      {statusSegments.length > 0 && (
        <div className="rounded-ios p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
          <p className="kpi-label mb-3">SANTÉ DU STOCK</p>
          <div className="flex items-center gap-5">
            <DonutChart segments={statusSegments} />
            <div className="flex-1 space-y-1.5">
              {statusSegments.map((seg) => (
                <div key={seg.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: seg.color }} />
                    <span style={{ fontSize: '12px', color: 'var(--color-text-2)', fontWeight: 500 }}>{seg.label}</span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>{seg.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Priority alerts */}
      <div data-tour="dash-alerts" className="rounded-ios overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>Alertes prioritaires</h3>
          {priorityAlerts.length > 0 && <span className="pill-badge badge-danger" style={{ fontWeight: 700 }}>{priorityAlerts.length}</span>}
        </div>
        <AlertList alerts={priorityAlerts} maxH="20rem" />
      </div>

      {/* Actions */}
      <div className="space-y-2.5 pb-2">
        <button onClick={shareStockOutOnWhatsApp}
          className="w-full text-white py-3.5 rounded-ios font-semibold active:scale-[0.97] transition-all flex items-center justify-center gap-2"
          style={{ fontSize: '14px', background: '#537d14', boxShadow: '0 1px 3px rgba(22,163,74,0.25)', letterSpacing: '-0.01em' }}>
          <Share2 className="w-4 h-4" strokeWidth={2} />Partager ruptures WhatsApp
        </button>
        <button onClick={generateRestockReport} disabled={restockItems.length === 0}
          className="w-full py-3.5 rounded-ios font-semibold active:scale-[0.97] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ fontSize: '14px', background: 'var(--color-surface)', color: 'var(--color-text-2)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-xs)', letterSpacing: '-0.01em' }}>
          <Download className="w-4 h-4" strokeWidth={2} />Commande réappro ({restockItems.length})
        </button>
      </div>
    </div>
  );
}
