import { useState, useEffect, useMemo } from 'react';
import { Truck, ArrowRight, ChevronDown, FileText, Users, ClipboardList, Calendar, X } from 'lucide-react';
import { printMonthlyReport } from '../lib/printMonthlyReport';
import { fetchAllMedications, Medication, supabase } from '../lib/supabase';
import { getDaysUntilExpiry, isExpired } from '../lib/dateUtils';
import { useAuth } from '../lib/auth';
import { offlineStorage } from '../lib/offlineStorage';

interface PatientStatsData {
  total: number;
  newThisMonth: number;
  fideles: number;
  recurrents: number;
  topPatients: { name: string; total: number }[];
}

interface OrdStatsData {
  total: number;
  en_attente: number;
  partielle: number;
  terminee: number;
  stale: number;       // en_attente depuis > 7 jours
  coverage: number;    // % qté délivrée / prescrite
  topMeds: { name: string; qty: number }[];
}

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
  is_return?: boolean;
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

// ── Agrégation graphe CA (plage libre) ───────────────────────────
function buildChartData(
  rows: { sale_date: string; total_price: number }[],
  fromDate: Date,
  toDate: Date
): { key: string; label: string; total: number }[] {
  const dayCount = Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;

  if (dayCount <= 90) {
    // Barres journalières
    const result: { key: string; label: string; total: number }[] = [];
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(fromDate.getTime() + i * 86400000);
      const key = d.toISOString().split('T')[0];
      const label = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
      result.push({ key, label, total: 0 });
    }
    for (const r of rows) {
      const k = r.sale_date.split('T')[0];
      const item = result.find(x => x.key === k);
      if (item) item.total += r.total_price || 0;
    }
    return result;
  } else if (dayCount <= 548) {
    // Barres hebdomadaires (lundi–dimanche)
    const weekMap = new Map<string, { label: string; total: number }>();
    const firstDay = new Date(fromDate);
    const dow0 = firstDay.getDay();
    firstDay.setDate(firstDay.getDate() - (dow0 === 0 ? 6 : dow0 - 1));
    let cur = new Date(firstDay);
    while (cur <= toDate) {
      const key = cur.toISOString().split('T')[0];
      weekMap.set(key, { label: `${cur.getDate()}/${cur.getMonth() + 1}`, total: 0 });
      cur = new Date(cur.getTime() + 7 * 86400000);
    }
    for (const r of rows) {
      const rDate = new Date(r.sale_date.split('T')[0] + 'T00:00:00');
      const rdow = rDate.getDay();
      const mon = new Date(rDate.getTime() - (rdow === 0 ? 6 : rdow - 1) * 86400000);
      const key = mon.toISOString().split('T')[0];
      const entry = weekMap.get(key);
      if (entry) entry.total += r.total_price || 0;
    }
    return Array.from(weekMap.entries()).map(([key, v]) => ({ key, label: v.label, total: v.total }));
  } else {
    // Barres mensuelles
    const monthMap = new Map<string, { label: string; total: number }>();
    let cur = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
    const endM = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
    while (cur <= endM) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
      const label = cur.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
      monthMap.set(key, { label, total: 0 });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    for (const r of rows) {
      const key = r.sale_date.split('T')[0].substring(0, 7);
      const entry = monthMap.get(key);
      if (entry) entry.total += r.total_price || 0;
    }
    return Array.from(monthMap.entries()).map(([key, v]) => ({ key, label: v.label, total: v.total }));
  }
}

export default function DashboardDesktop() {
  const { profile } = useAuth();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [journal, setJournal] = useState<JournalRow[]>([]);
  const [period, setPeriod] = useState<typeof PERIODS[number]['id']>('7j');
  const [patientStats, setPatientStats] = useState<PatientStatsData | null>(null);
  const [ordStats, setOrdStats] = useState<OrdStatsData | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [historySize, setHistorySize] = useState<'compact' | 'medium' | 'full'>('medium');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'ventes' | 'commandes'>('all');
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customChartData, setCustomChartData] = useState<{key:string;label:string;total:number}[]|null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [isCustomPeriod, setIsCustomPeriod] = useState(false);
  const [chartHeightMode, setChartHeightMode] = useState<'normal'|'tall'|'full'>('normal');
  const CHART_HEIGHTS = { normal: 200, tall: 340, full: 520 } as const;
  const [topMetric, setTopMetric] = useState<'units'|'revenue'>('revenue');
  const [patientsRefreshing, setPatientsRefreshing] = useState(false);

  // Chargement patients — appelable depuis useEffect ET depuis le bouton refresh
  // NOTE: la colonne 'type' n'existe PAS en base — elle est calculée à partir du nombre d'achats
  const loadPatients = async () => {
    // On joint patient_purchases pour compter les achats par patient (nécessaire pour le type)
    const { data: pts, error } = await supabase
      .from('patients')
      .select('id, name, created_at, patient_purchases(id, total)');
    if (error || !pts) {
      setPatientStats({ total: 0, newThisMonth: 0, fideles: 0, recurrents: 0, topPatients: [] });
      return;
    }
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const newThisMonth = pts.filter(p => new Date(p.created_at) >= monthStart).length;

    // computePatientType: ≥5 achats → fidèle, ≥2 → récurrent, sinon occasionnel
    let fideles = 0, recurrents = 0;
    const caByPatient: Record<string, number> = {};
    for (const p of pts) {
      const visits = (p.patient_purchases as any[])?.length || 0;
      if (visits >= 5) fideles++;
      else if (visits >= 2) recurrents++;
      const ca = ((p.patient_purchases as any[]) || []).reduce((s: number, pur: any) => s + (pur.total || 0), 0);
      caByPatient[p.id] = ca;
    }

    const topPatients = Object.entries(caByPatient)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, total]) => ({ name: (pts as any[]).find(p => p.id === id)?.name || '—', total }));

    setPatientStats({ total: pts.length, newThisMonth, fideles, recurrents, topPatients });
  };

  const refreshPatients = async () => {
    setPatientsRefreshing(true);
    await loadPatients().catch(() =>
      setPatientStats({ total: 0, newThisMonth: 0, fideles: 0, recurrents: 0, topPatients: [] })
    );
    setPatientsRefreshing(false);
  };

  useEffect(() => {
    // Médicaments : cache local immédiat, Supabase en fond
    const cachedMeds = offlineStorage.getCachedMedications();
    if (cachedMeds.length > 0) setMedications(cachedMeds);
    fetchAllMedications('expiry_date').then(data => {
      setMedications(data);
      offlineStorage.cacheMedications(data);
    }).catch(() => { /* Cache déjà affiché */ });

    const since = new Date();
    since.setDate(since.getDate() - 90);
    const sinceIso = since.toISOString();

    // ── Journal : local FIRST (immédiat), puis merge avec Supabase ──────────
    const localAll = offlineStorage.getSalesJournal();
    const localSince = localAll
      .filter(e => e.sale_date >= sinceIso)
      .map(e => ({
        id:               e.id,
        sale_date:        e.sale_date,
        medication_name:  e.medication_name,
        quantity_sold:    e.quantity_sold,
        total_price:      e.total_price,
        payment_method:   e.payment_method,
        seller_name:      e.seller_name,
      })) as JournalRow[];

    // Afficher les données locales immédiatement (pas d'attente réseau)
    setJournal(localSince.sort((a, b) => b.sale_date.localeCompare(a.sale_date)));

    // Puis enrichir avec Supabase si en ligne
    supabase
      .from('sales_journal')
      .select('id, sale_date, medication_name, quantity_sold, total_price, payment_method, seller_name')
      .gte('sale_date', sinceIso)
      .order('sale_date', { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        // Merge : remote + local non-synced, dédupliquer par ID
        const remoteIds = new Set(data.map(r => r.id));
        const localOnly = localSince.filter(e => !remoteIds.has(e.id));
        const merged = [...data as JournalRow[], ...localOnly]
          .sort((a, b) => b.sale_date.localeCompare(a.sale_date));
        setJournal(merged);
      })
      .catch(() => { /* Déjà affiché depuis le local */ });

    // ── Analytics patients ────────────────────────────────────────────────────
    loadPatients().catch(() =>
      setPatientStats({ total: 0, newThisMonth: 0, fideles: 0, recurrents: 0, topPatients: [] })
    );

    // Subscription Realtime → re-fetch automatique à chaque changement sur patients
    const patientsSub = supabase
      .channel('dashboard-patients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, () => {
        loadPatients().catch(() => {});
      })
      .subscribe();

    // ── Realtime : mise à jour auto quand une vente est enregistrée ─────────────
    const reloadJournal = () => {
      const freshLocal = offlineStorage.getSalesJournal();
      const freshSince = freshLocal
        .filter(e => e.sale_date >= sinceIso)
        .map(e => ({
          id: e.id, sale_date: e.sale_date,
          medication_name: e.medication_name,
          quantity_sold: e.quantity_sold,
          total_price: e.total_price,
          payment_method: e.payment_method,
          seller_name: e.seller_name,
          is_return: e.is_return,
        })) as JournalRow[];

      supabase
        .from('sales_journal')
        .select('id, sale_date, medication_name, quantity_sold, total_price, payment_method, seller_name')
        .gte('sale_date', sinceIso)
        .order('sale_date', { ascending: false })
        .then(({ data }) => {
          if (!data) { setJournal(freshSince); return; }
          const remoteIds = new Set(data.map(r => r.id));
          const localOnly = freshSince.filter(e => !remoteIds.has(e.id));
          setJournal([...data as JournalRow[], ...localOnly]
            .sort((a, b) => b.sale_date.localeCompare(a.sale_date)));
        })
        .catch(() => setJournal(freshSince));
    };

    // Écouter les ventes enregistrées par Sales.tsx
    window.addEventListener('sale-completed', reloadJournal);

    // Realtime Supabase sur sales_journal
    const saleSub = supabase
      .channel('dashboard-sales')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'sales_journal',
      }, reloadJournal)
      .subscribe();

    // ── Commandes fournisseurs ────────────────────────────────────────────────
    supabase
      .from('purchase_orders')
      .select('id, order_date, supplier, rep_name, rep_phone, status, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => setPurchaseOrders(data || []))
      .catch(() => {});

    // ── Analytics ordonnances ─────────────────────────────────────────────────
    supabase
      .from('ordonnances')
      .select('id, status, created_at')
      .then(async ({ data: ords }) => {
        if (!ords) return;
        const week = new Date(Date.now() - 7 * 86400000).toISOString();
        const en_attente = ords.filter(o => o.status === 'en_attente').length;
        const partielle  = ords.filter(o => o.status === 'partielle').length;
        const terminee   = ords.filter(o => o.status === 'terminee').length;
        const stale      = ords.filter(o => o.status === 'en_attente' && o.created_at < week).length;

        const { data: items } = await supabase.from('ordonnance_items').select('name, qty, qty_delivered');
        const totalQty     = (items || []).reduce((s, i) => s + (i.qty || 0), 0);
        const deliveredQty = (items || []).reduce((s, i) => s + (i.qty_delivered || 0), 0);
        const coverage     = totalQty > 0 ? Math.round((deliveredQty / totalQty) * 100) : 0;
        const medMap: Record<string, number> = {};
        for (const i of items || []) medMap[i.name] = (medMap[i.name] || 0) + (i.qty || 0);
        const topMeds = Object.entries(medMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty }));

        setOrdStats({ total: ords.length, en_attente, partielle, terminee, stale, coverage, topMeds });
      })
      .catch(() => { /* silencieux */ });

    // Cleanup subscriptions au démontage
    return () => {
      supabase.removeChannel(patientsSub);
      supabase.removeChannel(saleSub);
      window.removeEventListener('sale-completed', reloadJournal);
    };
  }, []);

  const dayKey = (d: Date) => d.toISOString().split('T')[0];

  const m = useMemo(() => {
    const today = dayKey(new Date());
    const todayRows    = journal.filter(r => r.sale_date.split('T')[0] === today);
    // Séparer ventes nettes et retours pour les KPIs
    const todaySaleRows   = todayRows.filter(r => !r.is_return && (r.total_price || 0) >= 0);
    const todayReturnRows = todayRows.filter(r => r.is_return  || (r.total_price || 0) < 0);
    const todaySales      = todaySaleRows.reduce((s, r) => s + (r.total_price || 0), 0);
    const todayReturns    = Math.abs(todayReturnRows.reduce((s, r) => s + (r.total_price || 0), 0));
    const ticketsToday    = todaySaleRows.length;

    // ── CA par heure aujourd'hui (6h → 21h) ─────────────────────────────────
    const hourlyCA: number[] = Array(24).fill(0);
    for (const r of todaySaleRows) {
      const h = new Date(r.sale_date).getHours();
      hourlyCA[h] += r.total_price || 0;
    }

    // ── Top 5 produits ce mois ────────────────────────────────────────────────
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthStartStr = monthStart.toISOString();
    const monthAggUnits: Record<string, number> = {};
    const monthAggRev:   Record<string, number> = {};
    for (const r of journal) {
      if (r.sale_date < monthStartStr) continue;
      if (r.is_return || (r.total_price || 0) < 0) continue;
      monthAggUnits[r.medication_name] = (monthAggUnits[r.medication_name] || 0) + (r.quantity_sold || 0);
      monthAggRev[r.medication_name]   = (monthAggRev[r.medication_name]   || 0) + (r.total_price  || 0);
    }
    const top5Month = Object.entries(monthAggRev)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, revenue]) => ({ name, revenue, units: monthAggUnits[name] || 0 }));

    // ── Résumé vendeurs du jour ───────────────────────────────────────────────
    const sellerMap: Record<string, { ca: number; tickets: number }> = {};
    for (const r of todaySaleRows) {
      const seller = r.seller_name?.trim() || 'Comptoir';
      if (!sellerMap[seller]) sellerMap[seller] = { ca: 0, tickets: 0 };
      sellerMap[seller].ca      += r.total_price  || 0;
      sellerMap[seller].tickets += 1;
    }
    const sellerRanking = Object.entries(sellerMap)
      .sort((a, b) => b[1].ca - a[1].ca)
      .map(([name, s]) => ({ name, ca: s.ca, tickets: s.tickets }));

    // ── Comparaison semaine en cours vs semaine précédente ────────────────────
    const todayDate = new Date();
    const dow = todayDate.getDay(); // 0=dim
    const startOfWeek = new Date(todayDate);
    startOfWeek.setDate(todayDate.getDate() - (dow === 0 ? 6 : dow - 1));
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfPrevWeek = new Date(startOfWeek.getTime() - 7 * 86400000);
    const endOfPrevWeek   = new Date(startOfWeek.getTime() - 1);
    const thisWeekCA = journal.filter(r => {
      if (r.is_return || (r.total_price || 0) < 0) return false;
      const d = new Date(r.sale_date);
      return d >= startOfWeek && d <= todayDate;
    }).reduce((s, r) => s + (r.total_price || 0), 0);
    const prevWeekCA = journal.filter(r => {
      if (r.is_return || (r.total_price || 0) < 0) return false;
      const d = new Date(r.sale_date);
      return d >= startOfPrevWeek && d <= endOfPrevWeek;
    }).reduce((s, r) => s + (r.total_price || 0), 0);
    const weekDelta = prevWeekCA === 0
      ? (thisWeekCA > 0 ? 100 : 0)
      : ((thisWeekCA - prevWeekCA) / prevWeekCA) * 100;

    // ── Comparaison mois en cours vs mois précédent ───────────────────────────
    const thisMonthCA = journal.filter(r => {
      if (r.is_return || (r.total_price || 0) < 0) return false;
      return r.sale_date >= monthStartStr;
    }).reduce((s, r) => s + (r.total_price || 0), 0);
    const prevMonthStart = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1);
    const prevMonthEnd   = new Date(todayDate.getFullYear(), todayDate.getMonth(), 0, 23, 59, 59);
    const prevMonthCA = journal.filter(r => {
      if (r.is_return || (r.total_price || 0) < 0) return false;
      const d = new Date(r.sale_date);
      return d >= prevMonthStart && d <= prevMonthEnd;
    }).reduce((s, r) => s + (r.total_price || 0), 0);
    const monthDelta = prevMonthCA === 0
      ? (thisMonthCA > 0 ? 100 : 0)
      : ((thisMonthCA - prevMonthCA) / prevMonthCA) * 100;

    // Daily totals for the selected period
    const days = PERIODS.find(p => p.id === period)!.days;
    const dailyMap: Record<string, number> = {};
    const dayList: { key: string; label: string; date: Date }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = dayKey(d);
      dailyMap[k] = 0;
      dayList.push({ key: k, label: `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`, date: d });
    }
    for (const r of journal) {
      if (r.is_return || (r.total_price || 0) < 0) continue; // retours exclus du graphe CA
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
      if (r.is_return || (r.total_price || 0) < 0) continue;
      const k = r.sale_date.split('T')[0];
      if (k in prevMap) prevMap[k] += r.total_price || 0;
    }
    const prevTotal = Object.values(prevMap).reduce((s, v) => s + v, 0);
    const periodDelta = prevTotal === 0 ? (periodTotal > 0 ? 100 : 0) : ((periodTotal - prevTotal) / prevTotal) * 100;

    // yesterday for "ventes du jour" comparison
    const yKey = dayKey(new Date(Date.now() - 86400000));
    const yTotal = journal
      .filter(r => r.sale_date.split('T')[0] === yKey && !r.is_return && (r.total_price || 0) >= 0)
      .reduce((s, r) => s + (r.total_price || 0), 0);
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

    // ── Vélocité de vente (30 derniers jours) ────────────────────────────────
    // avgDaily[medication_name] = unités vendues / jour en moyenne
    const since30 = new Date(); since30.setDate(since30.getDate() - 30);
    const since30Str = since30.toISOString();
    const velAgg: Record<string, number> = {};
    for (const r of journal) {
      if (r.sale_date < since30Str) continue;
      if ((r as any).is_return) continue;
      velAgg[r.medication_name] = (velAgg[r.medication_name] || 0) + (r.quantity_sold || 0);
    }
    const avgDaily: Record<string, number> = {};
    for (const [name, total] of Object.entries(velAgg)) avgDaily[name] = total / 30;

    const getDaysLeft = (med: Medication): number | null => {
      const v = avgDaily[med.name];
      if (!v || v === 0) return null;
      return Math.floor(med.quantity / v);
    };

    // Produits prévisionnellement en rupture dans < 14 jours
    const upcomingRuptures = medications
      .filter(med => {
        if (med.quantity === 0) return false; // déjà en rupture
        const d = getDaysLeft(med);
        return d !== null && d <= 14;
      })
      .map(med => ({
        name: `${med.name}${med.dosage ? ' ' + med.dosage : ''}`,
        stock: med.quantity,
        daysLeft: getDaysLeft(med)!,
        velocity: avgDaily[med.name],
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 4);

    const criticalList = [...critical]
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 5)
      .map(med => {
        const min = minOf(med) || 10;
        const spark = [5, 4, 3, 2, 1, 0.5, 0].map(f => Math.max(med.quantity, Math.round(med.quantity + (min - med.quantity) * (f / 5))));
        const daysLeft = getDaysLeft(med);
        return {
          name: `${med.name}${med.dosage ? ' ' + med.dosage : ''}`,
          cat: med.category || med.forme_produit || 'Produit',
          stock: med.quantity,
          status: med.quantity === 0 ? 'rupture' : 'critique',
          spark: spark.length > 1 ? spark : [min, med.quantity],
          daysLeft,
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

    // Top products — par unités ET par CA
    const sinceKey = dailyTotals[0]?.key ?? today;
    const aggU: Record<string, number> = {};
    const aggR: Record<string, number> = {};
    for (const r of journal) {
      if (r.sale_date.split('T')[0] >= sinceKey) {
        aggU[r.medication_name] = (aggU[r.medication_name] || 0) + (r.quantity_sold || 0);
        aggR[r.medication_name] = (aggR[r.medication_name] || 0) + (r.total_price || 0);
      }
    }
    const allProdNames = [...new Set([...Object.keys(aggU), ...Object.keys(aggR)])];
    const allProds = allProdNames.map(name => ({ name, units: aggU[name] || 0, revenue: aggR[name] || 0 }));
    const mkTop = (sorted: typeof allProds) =>
      sorted.slice(0, 8).map((p, i) => ({ ...p, color: TOP_COLORS[i % TOP_COLORS.length] }));
    const topProductsByUnits   = mkTop([...allProds].sort((a,b) => b.units   - a.units));
    const topProductsByRevenue = mkTop([...allProds].sort((a,b) => b.revenue - a.revenue));
    // legacy alias kept for KPI sparklines
    const topProducts = topProductsByUnits;

    return {
      todaySales, todayReturns, ticketsToday, dayDelta, last7, ticketsSpark,
      dailyTotals, periodTotal, periodDelta,
      ruptures, criticalCount: critical.length, expiring30Count: expiring30.length,
      criticalList, upcomingRuptures, recent, topProducts, topProductsByUnits, topProductsByRevenue,
      expiringNames: expiring30.slice(0, 3).map(med => med.name).join(' · ') || 'Aucun lot proche',
      // New enrichments
      hourlyCA,
      top5Month,
      sellerRanking,
      weekDelta, thisWeekCA, prevWeekCA,
      monthDelta, thisMonthCA, prevMonthCA,
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

  // "Créer une commande" : navigue vers l'onglet Commandes fournisseurs.
  const navigateToCommandes = () => {
    window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab: 'commandes' } }));
  };

  // Charge les données pour une plage personnalisée et construit le graphe.
  const loadCustomRange = async (from: string, to: string) => {
    if (!from || !to || from > to) return;
    setCustomLoading(true);
    try {
      const { data } = await supabase
        .from('sales_journal')
        .select('sale_date, total_price')
        .gte('sale_date', from)
        .lte('sale_date', to + 'T23:59:59')
        .order('sale_date', { ascending: true });
      setCustomChartData(buildChartData(data || [], new Date(from), new Date(to)));
      setIsCustomPeriod(true);
      setShowCustomPicker(false);
    } catch {
      // silencieux
    } finally {
      setCustomLoading(false);
    }
  };

  const panierMoyen = m.ticketsToday > 0 ? fmt(m.todaySales / m.ticketsToday) : null;
  const kpis = [
    {
      lbl: 'Ventes du jour',
      val: fmt(m.todaySales), unit: 'FC',
      delta: `${m.dayDelta >= 0 ? '+' : ''}${m.dayDelta.toFixed(1)}%`,
      pos: m.dayDelta >= 0,
      spark: m.last7.length ? m.last7 : [0, 0],
      color: m.dayDelta >= 0 ? C.brand : C.red,
      sub: m.todayReturns > 0 ? `vs. hier · ${fmt(m.todayReturns)} FC retournés` : 'vs. hier',
    },
    {
      lbl: 'Tickets émis',
      val: String(m.ticketsToday), unit: '',
      delta: `↑ ${m.ticketsToday}`,
      pos: m.ticketsToday > 0,
      spark: m.ticketsSpark.length ? m.ticketsSpark : [0, 0],
      color: C.brand,
      sub: panierMoyen ? `panier moyen ${panierMoyen} FC` : 'aucune vente',
    },
    {
      lbl: 'CA semaine',
      val: fmt(m.thisWeekCA), unit: 'FC',
      delta: `${m.weekDelta >= 0 ? '+' : ''}${m.weekDelta.toFixed(1)}%`,
      pos: m.weekDelta >= 0,
      spark: m.last7.length ? m.last7 : [0, 0],
      color: m.weekDelta >= 0 ? C.brand : C.red,
      sub: 'vs. semaine préc.',
    },
    {
      lbl: 'CA du mois',
      val: fmt(m.thisMonthCA), unit: 'FC',
      delta: `${m.monthDelta >= 0 ? '+' : ''}${m.monthDelta.toFixed(1)}%`,
      pos: m.monthDelta >= 0,
      spark: m.last7.length ? m.last7 : [0, 0],
      color: m.monthDelta >= 0 ? C.brand : C.red,
      sub: 'vs. mois préc.',
    },
    {
      lbl: 'Stock critique',
      val: String(m.criticalCount), unit: 'réf.',
      delta: m.criticalCount === 0 ? '✓ Stock sain' : `${m.ruptures} rupture${m.ruptures !== 1 ? 's' : ''}`,
      pos: m.criticalCount === 0 ? true : false,
      spark: [0, 0], color: m.criticalCount === 0 ? C.brand : C.red,
      sub: m.criticalCount === 0 ? 'Aucune rupture active' : `${m.ruptures} rupture${m.ruptures !== 1 ? 's' : ''} active${m.ruptures !== 1 ? 's' : ''}`,
      noSpark: true,
    },
    {
      lbl: 'Péremption < 30j',
      val: String(m.expiring30Count), unit: 'lots',
      delta: m.expiring30Count === 0 ? '✓ Aucun lot' : 'à surveiller',
      pos: m.expiring30Count === 0 ? true : null,
      spark: [0, 0], color: m.expiring30Count === 0 ? C.brand : C.amber,
      sub: m.expiring30Count === 0 ? 'Pas de péremption imminente' : m.expiringNames,
      noSpark: true,
    },
  ];

  const chartData = isCustomPeriod && customChartData ? customChartData : m.dailyTotals;
  const hasChartData = chartData.some(d => d.total > 0);
  const maxBar = hasChartData ? Math.max(...chartData.map(d => d.total)) : 100;
  const yTicks = [maxBar, maxBar * 0.75, maxBar * 0.5, maxBar * 0.25, 0];
  // Formatte un tick Y lisiblement (évite 1/1/1/0/0 quand pas de data)
  const fmtTick = (v: number) => {
    if (!hasChartData) return v === 0 ? '0' : '';
    if (v >= 1_000_000) return `${(v/1_000_000).toFixed(1).replace('.0','')}M`;
    if (v >= 1_000)     return `${(v/1_000).toFixed(1).replace('.0','')}k`;
    return String(Math.round(v));
  };
  const chartH = CHART_HEIGHTS[chartHeightMode];
  const barAreaH = chartH - 30; // 30px réservé pour étiquettes bas

  // ── Empty state : nouveau compte sans données ──────────────────────────────
  const isEmpty = medications.length === 0 && journal.length === 0;
  if (isEmpty) {
    const navigateTo = (tab: string) =>
      window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab } }));

    const steps = [
      {
        num: '1', icon: '📦', title: 'Remplir votre stock',
        desc: 'Ajoutez vos médicaments manuellement, par scan de code-barres ou via import CSV.',
        actions: [
          { label: 'Aller à l\'inventaire', tab: 'stock', primary: true },
        ],
      },
      {
        num: '2', icon: '🧾', title: 'Enregistrer vos premières ventes',
        desc: 'Ouvrez la caisse pour créer vos premiers tickets de vente.',
        actions: [
          { label: 'Ouvrir la caisse', tab: 'sales', primary: true },
        ],
      },
      {
        num: '3', icon: '👥', title: 'Ajouter vos patients',
        desc: 'Constituez votre base de patients pour suivre leur historique.',
        actions: [
          { label: 'Gérer les patients', tab: 'patients', primary: false },
        ],
      },
    ];

    return (
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, system-ui, sans-serif', color: C.ink }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em', color: C.ink, lineHeight: 1.1 }}>
              Bienvenue, {firstName} 👋
            </h1>
          </div>
          <p style={{ fontSize: 13.5, color: C.inkMute, marginTop: 4 }}>
            Votre espace est prêt. Suivez ces étapes pour démarrer.
          </p>
        </div>

        {/* Progress banner */}
        <div style={{
          background: `linear-gradient(135deg, ${C.brandDk ?? '#0a5240'} 0%, #064e3b 100%)`,
          borderRadius: 16, padding: '24px 28px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 20,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', right: -30, top: -30, width: 160, height: 160, borderRadius: 99, background: 'rgba(255,255,255,0.05)' }} />
          <div style={{ position: 'absolute', right: 40, bottom: -40, width: 100, height: 100, borderRadius: 99, background: 'rgba(255,255,255,0.04)' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              Pharmacie configurée avec succès ✓
            </div>
            <div style={{ fontSize: 13, color: 'rgba(167,243,208,0.75)', lineHeight: 1.5 }}>
              Votre compte est isolé — toutes vos données sont privées et sécurisées.<br />
              Commencez par remplir votre stock pour que le tableau de bord s'active.
            </div>
          </div>
          <button
            onClick={() => navigateTo('stock')}
            style={{
              marginLeft: 'auto', flexShrink: 0, position: 'relative', zIndex: 1,
              background: '#fff', color: C.brand, border: 'none', borderRadius: 10,
              padding: '10px 20px', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
              fontFamily: 'inherit', whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            Ajouter des médicaments →
          </button>
        </div>

        {/* Steps */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {steps.map(s => (
            <div key={s.num} style={{
              background: C.panel, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: '20px 20px 16px',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, fontSize: 18,
                  background: 'rgba(15,15,20,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Étape {s.num}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>{s.title}</div>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: C.inkMute, lineHeight: 1.55, flex: 1 }}>{s.desc}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {s.actions.map(a => (
                  <button
                    key={a.label}
                    onClick={() => navigateTo(a.tab)}
                    style={{
                      padding: '8px 14px', borderRadius: 8, border: 'none',
                      background: a.primary ? C.brand : 'rgba(15,15,20,0.06)',
                      color: a.primary ? '#fff' : C.inkSoft,
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      fontFamily: 'inherit', transition: 'opacity 0.12s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: '📋 Ordonnances', tab: 'ordonnances' },
            { label: '🚚 Commandes fournisseurs', tab: 'commandes' },
            { label: '📊 Rapports', tab: 'rapports' },
          ].map(l => (
            <button
              key={l.tab}
              onClick={() => navigateTo(l.tab)}
              style={{
                padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`,
                background: C.panel, color: C.inkSoft, fontSize: 13, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 0.12s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = C.brand)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

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
        <button
          data-tour="dash-report"
          onClick={() => { const d = new Date(); printMonthlyReport(d.getFullYear(), d.getMonth()); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600,
            background: C.panel, border: `1px solid ${C.hairline}`,
            color: C.inkSoft, cursor: 'pointer',
            backdropFilter: 'saturate(180%) blur(20px)',
            boxShadow: `0 1px 3px rgba(0,0,0,0.06)`,
          }}
        >
          <FileText size={14} color={C.inkMute} strokeWidth={1.6} />
          Rapport mensuel
        </button>
      </div>

      {/* KPI Row — 2 rows × 3 cols */}
      <div data-tour="dash-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
        {kpis.map((k, i) => (
          <article
            key={i}
            data-tour={['kpi-ventes', 'kpi-tickets', 'kpi-casemaine', 'kpi-camois', 'kpi-rupture', 'kpi-peremption'][i]}
            style={{ ...card, padding: '16px 18px' }}
          >
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
      <div style={{ display: 'grid', gridTemplateColumns: chartHeightMode === 'full' ? '1fr' : '1.7fr 1fr', gap: 14, marginBottom: 16 }}>
        {/* Revenue chart */}
        <article data-tour="dash-chart" style={{ ...card, padding: '20px 22px 16px', gridColumn: chartHeightMode === 'full' ? '1 / -1' : undefined }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: C.ink, marginBottom: 4 }}>Chiffre d'affaires</h2>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, color: C.inkMute, letterSpacing: '-0.005em' }}>
                  {fmt(isCustomPeriod ? chartData.reduce((s, d) => s + d.total, 0) : m.periodTotal)} FC sur la période
                </span>
                {isCustomPeriod
                  ? <Pill color="blue" size="sm">Plage personnalisée</Pill>
                  : <Pill color={m.periodDelta >= 0 ? 'green' : 'red'} size="sm">{m.periodDelta >= 0 ? '↑' : '↓'} {Math.abs(m.periodDelta).toFixed(1)}% vs préc.</Pill>
                }
              </div>
            </div>

            {/* Contrôles droite : segmenté + bouton calendrier */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
              {/* Chip plage active (avec × pour annuler) */}
              {isCustomPeriod && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: C.brandLt, border: `1px solid ${C.brandMid}`, borderRadius: 7, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, color: C.brand }}>
                  <Calendar size={11} color={C.brand} />
                  {new Date(customFrom + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                  {' → '}
                  {new Date(customTo + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                  <button onClick={() => { setIsCustomPeriod(false); setCustomChartData(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', marginLeft: 2 }}>
                    <X size={11} color={C.brand} />
                  </button>
                </div>
              )}
              {/* Segmenté 7j/30j/90j — masqué quand plage custom active */}
              {!isCustomPeriod && (
                <div data-tour="dash-period" style={{ display: 'flex', background: C.bgTab, padding: 3, borderRadius: 7, border: `1px solid ${C.hairline}` }}>
                  {PERIODS.map(p => (
                    <button key={p.id} onClick={() => setPeriod(p.id)} style={{
                      border: 'none', background: period === p.id ? C.panel : 'transparent',
                      color: period === p.id ? C.ink : C.inkMute, fontSize: 11.5, fontWeight: 500,
                      padding: '4px 12px', borderRadius: 5, cursor: 'pointer',
                      boxShadow: period === p.id ? `0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px ${C.hairline}` : 'none',
                    }}>{p.label}</button>
                  ))}
                </div>
              )}

              {/* Bouton calendrier ouvre le picker */}
              <button
                onClick={() => setShowCustomPicker(v => !v)}
                title="Sélectionner une plage de dates personnalisée"
                style={{
                  width: 30, height: 30, borderRadius: 7, flexShrink: 0, cursor: 'pointer',
                  border: `1px solid ${showCustomPicker || isCustomPeriod ? C.brand : C.hairline}`,
                  background: showCustomPicker || isCustomPeriod ? C.brandLt : C.panel,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'saturate(180%) blur(20px)',
                }}
              >
                <Calendar size={13} color={showCustomPicker || isCustomPeriod ? C.brand : C.inkMute} strokeWidth={1.7} />
              </button>

              {/* Bouton agrandir/réduire graphique */}
              <div style={{ display: 'flex', background: C.bgTab, padding: 2, borderRadius: 6, border: `1px solid ${C.hairline}` }}>
                {(['normal','tall','full'] as const).map((h, idx) => {
                  const icons = ['▬','▬▬','▬▬▬'];
                  return (
                    <button key={h} onClick={() => setChartHeightMode(h)} title={h === 'normal' ? 'Compact' : h === 'tall' ? 'Normal' : 'Plein écran'}
                      style={{ border: 'none', background: chartHeightMode === h ? C.panel : 'transparent', color: chartHeightMode === h ? C.ink : C.inkFaint, fontSize: 8, padding: '3px 7px', borderRadius: 4, cursor: 'pointer', lineHeight: 1.2, boxShadow: chartHeightMode === h ? `0 1px 2px rgba(0,0,0,0.06)` : 'none' }}
                    >{icons[idx]}</button>
                  );
                })}
              </div>

              {/* Panneau picker flottant */}
              {showCustomPicker && (
                <div style={{
                  position: 'absolute', top: 38, right: 0, zIndex: 200,
                  background: '#fff', border: `1px solid rgba(0,0,0,0.1)`,
                  borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.14)', padding: 18, minWidth: 268,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Plage personnalisée</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: C.inkFaint, marginBottom: 4 }}>Du</div>
                      <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: `1px solid rgba(0,0,0,0.14)`, fontSize: 13, color: C.ink, outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: C.inkFaint, marginBottom: 4 }}>Au</div>
                      <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: `1px solid rgba(0,0,0,0.14)`, fontSize: 13, color: C.ink, outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  {/* Raccourcis rapides */}
                  <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[
                      { label: '6 mois', days: 180 },
                      { label: '1 an',   days: 365 },
                      { label: '2 ans',  days: 730 },
                      { label: '3 ans',  days: 1095 },
                    ].map(preset => {
                      const toD  = new Date();
                      const fStr = new Date(toD.getTime() - preset.days * 86400000).toISOString().split('T')[0];
                      const tStr = toD.toISOString().split('T')[0];
                      return (
                        <button key={preset.label}
                          onClick={() => { setCustomFrom(fStr); setCustomTo(tStr); loadCustomRange(fStr, tStr); }}
                          style={{ padding: '3px 10px', borderRadius: 5, border: `1px solid ${C.hairline}`, background: C.bgTab, color: C.inkSoft, fontSize: 11, fontWeight: 500, cursor: 'pointer' }}
                        >{preset.label}</button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => loadCustomRange(customFrom, customTo)}
                    disabled={!customFrom || !customTo || customFrom > customTo || customLoading}
                    style={{
                      marginTop: 12, width: '100%', padding: '9px 0', borderRadius: 8,
                      background: (!customFrom || !customTo || customFrom > customTo) ? 'rgba(0,0,0,0.06)' : C.brand,
                      color: (!customFrom || !customTo || customFrom > customTo) ? C.inkFaint : '#fff',
                      border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      opacity: customLoading ? 0.65 : 1,
                    }}
                  >
                    {customLoading ? 'Chargement…' : 'Appliquer la plage'}
                  </button>
                </div>
              )}
            </div>
          </header>

          <div style={{ position: 'relative', height: chartH, transition: 'height 0.3s ease' }}>

            {/* Lignes de grille horizontales */}
            {[0, 0.25, 0.5, 0.75, 1].map((y, i) => (
              <div key={i} style={{ position: 'absolute', left: 44, right: 0, top: y * barAreaH, height: 1, background: i === 4 ? C.border : 'rgba(0,0,0,0.06)' }} />
            ))}

            {/* Étiquettes axe Y */}
            {yTicks.map((v, i) => (
              <div key={i} style={{ position: 'absolute', left: 0, width: 42, top: i * (barAreaH / 4) - 7, fontSize: 10, fontFamily: C.fm, color: C.inkFaint, textAlign: 'right', paddingRight: 6, lineHeight: 1 }}>
                {fmtTick(v)}
              </div>
            ))}

            {/* Barres */}
            <div style={{ position: 'absolute', left: 44, right: 0, top: 0, bottom: 28, display: 'flex', alignItems: 'flex-end', gap: chartData.length > 30 ? 2 : chartData.length > 14 ? 4 : 10, paddingRight: 4 }}>
              {chartData.map((d, i) => {
                const isLast = i === chartData.length - 1;
                const isHovered = hoveredBar === d.key;
                const isActive = isHovered || isLast;
                const barH = hasChartData ? Math.max((d.total / maxBar) * barAreaH, d.total > 0 ? 3 : 0) : 0;
                return (
                  <div key={d.key}
                    onMouseEnter={() => setHoveredBar(d.key)}
                    onMouseLeave={() => setHoveredBar(null)}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, cursor: 'pointer', height: '100%', justifyContent: 'flex-end' }}
                  >
                    <div style={{
                      width: '100%', height: `${barH}px`,
                      background: isActive ? `linear-gradient(180deg, ${C.brand}, ${C.brandHi})` : C.brandLt,
                      borderRadius: '4px 4px 0 0', position: 'relative',
                      boxShadow: isActive && d.total > 0 ? `0 -2px 10px ${C.brandMid}` : 'none',
                      transition: 'background 0.12s, height 0.3s ease',
                    }}>
                      {isActive && d.total > 0 && (
                        <div style={{ position: 'absolute', top: -46, left: '50%', transform: 'translateX(-50%)', background: C.ink, color: '#fff', padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, fontFamily: C.fm, whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.18)', zIndex: 10, pointerEvents: 'none' }}>
                          <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.55)', marginBottom: 1 }}>{d.label}</div>
                          {fmt(d.total)} FC
                          <div style={{ position: 'absolute', bottom: -3, left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: 6, height: 6, background: C.ink }} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Étiquettes axe X — position absolute pour éviter le clipping */}
            <div style={{ position: 'absolute', left: 44, right: 0, bottom: 0, height: 28, display: 'flex', gap: chartData.length > 30 ? 2 : chartData.length > 14 ? 4 : 10, paddingRight: 4 }}>
              {chartData.map((d, i) => {
                const isLast = i === chartData.length - 1;
                const isHovered = hoveredBar === d.key;
                const show = chartData.length <= 20
                  || i % Math.ceil(chartData.length / 12) === 0
                  || isLast || isHovered;
                return (
                  <div key={d.key} style={{ flex: 1, position: 'relative', height: 28 }}>
                    {show && (
                      <span style={{
                        position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
                        whiteSpace: 'nowrap', fontSize: 9.5, fontFamily: C.fm,
                        color: (isLast || isHovered) ? C.ink : C.inkFaint,
                        fontWeight: (isLast || isHovered) ? 700 : 400,
                        pointerEvents: 'none', transition: 'color 0.1s',
                      }}>
                        {d.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Overlay "aucune donnée" */}
            {!hasChartData && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, pointerEvents: 'none' }}>
                <div style={{ fontSize: 28, opacity: 0.25 }}>📊</div>
                <div style={{ fontSize: 13, color: C.inkMute, fontWeight: 500 }}>
                  {isCustomPeriod ? 'Aucune vente sur cette plage de dates' : 'Aucune vente sur la période'}
                </div>
                {isCustomPeriod && (
                  <div style={{ fontSize: 11, color: C.inkFaint }}>
                    {new Date(customFrom+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}
                    {' → '}
                    {new Date(customTo+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}
                  </div>
                )}
              </div>
            )}
          </div>
        </article>

        {/* Stock critique + prédictions */}
        <article data-tour="dash-alerts" style={{ ...card, padding: '20px 20px 12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: C.ink }}>Stock critique</h2>
                <Pill color="red">{m.criticalCount}</Pill>
              </div>
              <p style={{ fontSize: 12, color: C.inkMute }}>Recommandation : commander aujourd'hui</p>
            </div>
          </header>

          {/* En rupture maintenant */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {m.criticalList.length === 0 ? (
              <div style={{ padding: '12px 8px', textAlign: 'center', fontSize: 12.5, color: C.inkMute }}>Aucun produit critique 🎉</div>
            ) : m.criticalList.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 6px', borderRadius: 7 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: C.ink, fontWeight: 500, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: C.inkMute }}>
                    {r.cat} · stock <span style={{ fontFamily: C.fm, color: r.stock === 0 ? C.red : C.amber, fontWeight: 600 }}>{r.stock}</span>
                    {r.daysLeft !== null && r.stock > 0 && (
                      <span style={{ marginLeft: 4, color: r.daysLeft <= 2 ? C.red : C.amber, fontWeight: 600 }}>
                        · {r.daysLeft}j
                      </span>
                    )}
                  </div>
                </div>
                <Sparkline data={r.spark} color={r.status === 'rupture' ? C.red : C.amber} w={40} h={18} fill={false} />
                <Pill color={r.status === 'rupture' ? 'red' : 'amber'} size="sm">
                  {r.status === 'rupture' ? 'Rupture' : 'Critique'}
                </Pill>
              </div>
            ))}
          </div>

          {/* Ruptures prévisionnelles */}
          {m.upcomingRuptures.length > 0 && (
            <>
              <div style={{ margin: '10px 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, height: 1, background: C.hairline }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: C.inkMute, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  Ruptures prévisionnelles
                </span>
                <div style={{ flex: 1, height: 1, background: C.hairline }} />
              </div>
              {m.upcomingRuptures.map((r, i) => {
                const urgency = r.daysLeft <= 3 ? C.red : r.daysLeft <= 7 ? C.amber : C.inkMute;
                const urgencyBg = r.daysLeft <= 3 ? C.redLt : r.daysLeft <= 7 ? C.amberLt : 'rgba(0,0,0,0.04)';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px', borderRadius: 7 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: C.ink, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                      <div style={{ fontSize: 10.5, color: C.inkMute }}>
                        stock <span style={{ fontFamily: C.fm, fontWeight: 600, color: C.inkSoft }}>{r.stock}</span>
                        &nbsp;·&nbsp;≈<span style={{ fontFamily: C.fm }}>{r.velocity.toFixed(1)}</span>/j
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 99, background: urgencyBg, color: urgency, fontSize: 11, fontWeight: 700, fontFamily: C.fm }}>
                      {r.daysLeft}j
                    </div>
                  </div>
                );
              })}
            </>
          )}

          <button onClick={navigateToCommandes} style={{ marginTop: 10, padding: '9px 12px', borderRadius: 8, background: C.brandLt, border: `1px solid ${C.brandMid}`, color: C.brand, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0 }}>
            <Truck size={14} color={C.brand} strokeWidth={1.8} />
            Créer une commande
          </button>
        </article>
      </div>

      {/* Transactions + Top produits */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14, marginBottom: 16 }}>
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
        {(() => {
          const activeList = topMetric === 'revenue' ? m.topProductsByRevenue : m.topProductsByUnits;
          const topVal = activeList[0] ? (topMetric === 'revenue' ? activeList[0].revenue : activeList[0].units) : 1;
          return (
            <article style={{ ...card, padding: '18px 22px' }}>
              {/* En-tête */}
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', flexShrink: 0 }}>Top produits</h2>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {/* Toggle Unités / CA */}
                  <div style={{ display: 'flex', background: C.bgTab, padding: 2, borderRadius: 6, border: `1px solid ${C.hairline}` }}>
                    {(['revenue','units'] as const).map(m2 => (
                      <button key={m2} onClick={() => setTopMetric(m2)} style={{
                        border: 'none', background: topMetric === m2 ? C.panel : 'transparent',
                        color: topMetric === m2 ? C.ink : C.inkMute, fontSize: 11, fontWeight: 500,
                        padding: '3px 9px', borderRadius: 4, cursor: 'pointer',
                        boxShadow: topMetric === m2 ? `0 1px 2px rgba(0,0,0,0.06)` : 'none',
                      }}>{m2 === 'revenue' ? 'CA' : 'Unités'}</button>
                    ))}
                  </div>
                  {/* Sélecteur de période */}
                  <div style={{ display: 'flex', background: C.bgTab, padding: 2, borderRadius: 6, border: `1px solid ${C.hairline}` }}>
                    {PERIODS.map(p => (
                      <button key={p.id} onClick={() => setPeriod(p.id)} style={{
                        border: 'none', background: period === p.id ? C.panel : 'transparent',
                        color: period === p.id ? C.ink : C.inkMute, fontSize: 11, fontWeight: 500,
                        padding: '3px 9px', borderRadius: 4, cursor: 'pointer',
                        boxShadow: period === p.id ? `0 1px 2px rgba(0,0,0,0.06)` : 'none',
                      }}>{p.label}</button>
                    ))}
                  </div>
                </div>
              </header>

              {activeList.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12.5, color: C.inkMute }}>Aucune vente sur la période</div>
              ) : activeList.map((p, i) => {
                const val   = topMetric === 'revenue' ? p.revenue : p.units;
                const pct   = Math.round((val / topVal) * 100);
                const label = topMetric === 'revenue' ? `${fmt(p.revenue)} FC` : `${fmt(p.units)} u`;
                const sub   = topMetric === 'revenue' ? `${fmt(p.units)} u vendues` : `${fmt(p.revenue)} FC`;
                return (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5, gap: 8 }}>
                      {/* Nom complet — wraps si besoin, title pour survol */}
                      <span title={p.name} style={{ fontSize: 12.5, color: C.ink, fontWeight: 500, letterSpacing: '-0.005em', lineHeight: 1.35, wordBreak: 'break-word', flex: 1, minWidth: 0 }}>
                        {p.name}
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, gap: 1 }}>
                        <span style={{ fontFamily: C.fm, fontSize: 12, color: C.ink, fontWeight: 700 }}>{label}</span>
                        <span style={{ fontFamily: C.fm, fontSize: 10, color: C.inkFaint }}>{sub}</span>
                      </div>
                    </div>
                    <div style={{ height: 5, background: 'rgba(15,15,20,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: p.color, borderRadius: 99, transition: 'width 0.45s ease' }} />
                    </div>
                  </div>
                );
              })}
            </article>
          );
        })()}
      </div>

      {/* ── Top 5 produits ce mois + CA par heure + Résumé vendeurs ────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 0.9fr', gap: 14, marginBottom: 16 }}>

        {/* Top 5 produits ce mois — barres SVG horizontales */}
        <article style={{ ...card, padding: '18px 22px' }}>
          <header style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: C.ink }}>Top 5 produits · ce mois</h2>
            <p style={{ fontSize: 12, color: C.inkMute, marginTop: 2 }}>Classement par chiffre d'affaires</p>
          </header>
          {m.top5Month.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12.5, color: C.inkMute }}>Aucune vente ce mois</div>
          ) : (() => {
            const maxRev = m.top5Month[0]?.revenue || 1;
            const AVATAR_COLORS = [C.brand, C.blue, C.violet, C.amber, '#0f7e5e'];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {m.top5Month.map((p, i) => {
                  const barPct = Math.max((p.revenue / maxRev) * 100, 2);
                  const color  = AVATAR_COLORS[i % AVATAR_COLORS.length];
                  return (
                    <div key={i}>
                      {/* Nom + valeur */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                          {/* Rang */}
                          <span style={{ fontSize: 10, fontWeight: 700, color: i === 0 ? C.brand : C.inkFaint, fontFamily: C.fm, flexShrink: 0, width: 16, textAlign: 'right' }}>#{i + 1}</span>
                          <span title={p.name} style={{ fontSize: 12.5, color: C.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                          <span style={{ fontFamily: C.fm, fontSize: 12, color: C.ink, fontWeight: 700 }}>{fmt(p.revenue)} FC</span>
                          <span style={{ fontSize: 10, color: C.inkFaint, fontFamily: C.fm }}>{fmt(p.units)} u.</span>
                        </div>
                      </div>
                      {/* Barre SVG */}
                      <svg width="100%" height="8" style={{ display: 'block', borderRadius: 99, overflow: 'visible' }}>
                        <rect x="0" y="0" width="100%" height="8" rx="4" fill="rgba(15,15,20,0.05)" />
                        <rect x="0" y="0" width={`${barPct}%`} height="8" rx="4" fill={color}
                          style={{ transition: 'width 0.55s ease' }}
                        />
                      </svg>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </article>

        {/* CA par heure aujourd'hui */}
        <article style={{ ...card, padding: '18px 22px' }}>
          <header style={{ marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: C.ink }}>CA par heure · aujourd'hui</h2>
            <p style={{ fontSize: 12, color: C.inkMute, marginTop: 2 }}>Distribution des ventes 6h–21h</p>
          </header>
          {(() => {
            const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6..21
            const vals  = HOURS.map(h => m.hourlyCA[h] || 0);
            const maxV  = Math.max(...vals, 1);
            const barW  = 18;
            const gap   = 4;
            const svgW  = HOURS.length * (barW + gap) - gap;
            const svgH  = 80;
            const currentHour = new Date().getHours();
            const hasData = vals.some(v => v > 0);
            return hasData ? (
              <div>
                <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
                  {HOURS.map((h, i) => {
                    const v    = vals[i];
                    const barH = v > 0 ? Math.max((v / maxV) * (svgH - 18), 4) : 2;
                    const x    = i * (barW + gap);
                    const y    = svgH - 18 - barH;
                    const isCurrent = h === currentHour;
                    const isPast    = h < currentHour;
                    const fillColor = isCurrent ? C.brand : isPast ? C.brandMid : 'rgba(15,15,20,0.06)';
                    return (
                      <g key={h}>
                        <rect x={x} y={y} width={barW} height={barH} rx="3"
                          fill={fillColor}
                          style={{ transition: 'height 0.4s ease, y 0.4s ease' }}
                        />
                        {/* Label heure */}
                        <text x={x + barW / 2} y={svgH - 2} textAnchor="middle"
                          style={{ fontSize: 8, fill: isCurrent ? C.brand : C.inkFaint, fontFamily: 'ui-monospace, monospace', fontWeight: isCurrent ? 700 : 400 }}>
                          {h}h
                        </text>
                        {/* Valeur au-dessus si > 0 */}
                        {v > 0 && isCurrent && (
                          <text x={x + barW / 2} y={y - 4} textAnchor="middle"
                            style={{ fontSize: 7, fill: C.brand, fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>
                            {v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(Math.round(v))}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
                {/* Légende */}
                <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                  {[
                    { color: C.brand,    label: 'Heure courante' },
                    { color: C.brandMid, label: 'Heures passées' },
                    { color: 'rgba(15,15,20,0.06)', label: 'À venir' },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: C.inkMute }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: item.color === 'rgba(15,15,20,0.06)' ? 'rgba(15,15,20,0.1)' : item.color, display: 'inline-block', border: '1px solid rgba(0,0,0,0.08)' }} />
                      {item.label}
                    </div>
                  ))}
                </div>
                {/* Heure de pointe */}
                {(() => {
                  const peakH = HOURS[vals.indexOf(Math.max(...vals))];
                  const peakV = Math.max(...vals);
                  return peakV > 0 ? (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: C.brandLt, borderRadius: 8, fontSize: 12, color: C.brand, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>⏰</span>
                      <span>Heure de pointe : <strong>{peakH}h</strong> — {fmt(peakV)} FC</span>
                    </div>
                  ) : null;
                })()}
              </div>
            ) : (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12.5, color: C.inkMute }}>Aucune vente aujourd'hui</div>
            );
          })()}
        </article>

        {/* Résumé vendeurs du jour */}
        <article style={{ ...card, padding: '18px 22px' }}>
          <header style={{ marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: C.ink }}>Vendeurs · aujourd'hui</h2>
            <p style={{ fontSize: 12, color: C.inkMute, marginTop: 2 }}>Classement par CA du jour</p>
          </header>
          {m.sellerRanking.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12.5, color: C.inkMute }}>Aucune vente aujourd'hui</div>
          ) : (() => {
            const SELLER_COLORS = ['#10785a','#0651bc','#6e44b0','#b75f06','#0f7e5e'];
            const maxCA = m.sellerRanking[0]?.ca || 1;
            const getInitials = (name: string) =>
              name.split(/[\s\-]+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {m.sellerRanking.map((s, i) => {
                  const color    = SELLER_COLORS[i % SELLER_COLORS.length];
                  const barPct   = Math.max((s.ca / maxCA) * 100, 4);
                  const initials = getInitials(s.name);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* Avatar initiales */}
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: color + '22',
                        border: `1.5px solid ${color}44`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color,
                        letterSpacing: '-0.02em',
                      }}>
                        {initials || '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 6 }}>
                          <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                            <span style={{ fontFamily: C.fm, fontSize: 11.5, color: C.ink, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(s.ca)} FC</span>
                            <span style={{ fontSize: 10, color: C.inkFaint }}>{s.tickets} ticket{s.tickets !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        {/* Mini barre */}
                        <div style={{ height: 4, background: 'rgba(15,15,20,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ width: `${barPct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {/* Total */}
                <div style={{ marginTop: 4, paddingTop: 10, borderTop: `1px solid ${C.hairline}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 11.5, color: C.inkMute, fontWeight: 500 }}>Total équipe</span>
                  <span style={{ fontFamily: C.fm, fontSize: 13, color: C.brand, fontWeight: 700 }}>
                    {fmt(m.sellerRanking.reduce((s, v) => s + v.ca, 0))} FC
                  </span>
                </div>
              </div>
            );
          })()}
        </article>
      </div>

      {/* ── Analytics patients + rapport ordonnances ─────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>

        {/* ── Dashboard patients ─────────────────────────────────────────────── */}
        <article style={{ ...card, padding: '20px 22px' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: C.brandLt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={14} color={C.brand} strokeWidth={1.8} />
              </div>
              <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: C.ink }}>Patients CRM</h2>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {patientStats && <>
                <Pill color="green">{patientStats.total} total</Pill>
                {patientStats.newThisMonth > 0 && <Pill color="blue">+{patientStats.newThisMonth} ce mois</Pill>}
              </>}
              <button
                onClick={refreshPatients}
                title="Rafraîchir les données patients"
                style={{
                  width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.hairline}`,
                  background: C.panel, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'saturate(180%) blur(20px)',
                  transition: 'transform 0.5s',
                  transform: patientsRefreshing ? 'rotate(360deg)' : 'rotate(0deg)',
                }}
              >
                <span style={{ fontSize: 13, lineHeight: 1, display: 'block' }}>↻</span>
              </button>
            </div>
          </header>

          {!patientStats ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: C.inkFaint, fontSize: 12.5 }}>Chargement…</div>
          ) : patientStats.total === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: C.inkFaint, fontSize: 12.5 }}>Aucun patient enregistré</div>
          ) : (
            <>
              {/* Répartition fidélité */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
                {[
                  { lbl: 'Fidèles', val: patientStats.fideles, pct: Math.round((patientStats.fideles / patientStats.total) * 100), color: C.brand, bg: C.brandLt },
                  { lbl: 'Récurrents', val: patientStats.recurrents, pct: Math.round((patientStats.recurrents / patientStats.total) * 100), color: C.blue, bg: 'rgba(6,81,188,0.07)' },
                  { lbl: 'Occasionnels', val: patientStats.total - patientStats.fideles - patientStats.recurrents, pct: Math.round(((patientStats.total - patientStats.fideles - patientStats.recurrents) / patientStats.total) * 100), color: C.inkMute, bg: 'rgba(0,0,0,0.04)' },
                ].map(s => (
                  <div key={s.lbl} style={{ background: s.bg, borderRadius: 9, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: s.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, opacity: 0.85 }}>{s.lbl}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: C.ink, fontFamily: C.fm, lineHeight: 1, marginBottom: 2 }}>{s.val}</div>
                    <div style={{ fontSize: 10.5, color: C.inkMute }}>{s.pct}% des patients</div>
                  </div>
                ))}
              </div>

              {/* Barre fidélisation */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.inkMute, marginBottom: 5 }}>
                  <span>Taux de fidélisation</span>
                  <span style={{ fontFamily: C.fm, fontWeight: 700, color: patientStats.fideles / patientStats.total >= 0.3 ? C.brand : C.amber }}>
                    {Math.round((patientStats.fideles / patientStats.total) * 100)}%
                  </span>
                </div>
                <div style={{ height: 6, background: 'rgba(0,0,0,0.04)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', height: '100%' }}>
                    <div style={{ width: `${Math.round((patientStats.fideles / patientStats.total) * 100)}%`, background: C.brand, borderRadius: '99px 0 0 99px', transition: 'width 0.5s' }} />
                    <div style={{ width: `${Math.round((patientStats.recurrents / patientStats.total) * 100)}%`, background: 'rgba(6,81,188,0.5)', transition: 'width 0.5s' }} />
                  </div>
                </div>
              </div>

              {/* Top patients par CA */}
              {patientStats.topPatients.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Top patients · CA cumulé</div>
                  {patientStats.topPatients.map((p, i) => {
                    const maxCA = patientStats.topPatients[0]?.total || 1;
                    return (
                      <div key={i} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                          <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>{p.name}</span>
                          <span style={{ fontFamily: C.fm, fontSize: 12, color: C.brand, fontWeight: 700 }}>{fmt(p.total)} FC</span>
                        </div>
                        <div style={{ height: 4, background: 'rgba(0,0,0,0.04)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.round((p.total / maxCA) * 100)}%`, height: '100%', background: TOP_COLORS[i % TOP_COLORS.length], borderRadius: 99, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </article>

        {/* ── Rapport ordonnances ───────────────────────────────────────────────── */}
        <article style={{ ...card, padding: '20px 22px' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(6,81,188,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ClipboardList size={14} color={C.blue} strokeWidth={1.8} />
              </div>
              <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: C.ink }}>Rapport ordonnances</h2>
            </div>
            {ordStats && <Pill color="gray">{ordStats.total} total</Pill>}
          </header>

          {!ordStats ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: C.inkFaint, fontSize: 12.5 }}>Chargement…</div>
          ) : ordStats.total === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: C.inkFaint, fontSize: 12.5 }}>Aucune ordonnance enregistrée</div>
          ) : (
            <>
              {/* Taux de couverture */}
              <div style={{ background: ordStats.coverage >= 70 ? C.brandLt : ordStats.coverage >= 40 ? C.amberLt : 'rgba(200,30,30,0.07)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.inkMute, marginBottom: 4 }}>Taux de couverture</div>
                  <div style={{ fontSize: 28, fontWeight: 700, fontFamily: C.fm, letterSpacing: '-0.03em', color: ordStats.coverage >= 70 ? C.brand : ordStats.coverage >= 40 ? C.amber : '#c81e1e', lineHeight: 1 }}>
                    {ordStats.coverage}%
                  </div>
                  <div style={{ fontSize: 11, color: C.inkMute, marginTop: 3 }}>quantités délivrées / prescrites</div>
                </div>
                <div style={{ width: 64, height: 64, position: 'relative' }}>
                  <svg width="64" height="64" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="8" />
                    <circle cx="32" cy="32" r="26" fill="none"
                      stroke={ordStats.coverage >= 70 ? C.brand : ordStats.coverage >= 40 ? C.amber : '#c81e1e'}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${(ordStats.coverage / 100) * 163.4} 163.4`}
                      strokeDashoffset="40.8"
                      style={{ transition: 'stroke-dasharray 0.6s' }}
                    />
                  </svg>
                </div>
              </div>

              {/* Statuts */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 16 }}>
                {[
                  { lbl: 'En attente', val: ordStats.en_attente, color: C.amber,  bg: C.amberLt },
                  { lbl: 'Partielles', val: ordStats.partielle,  color: C.blue,   bg: 'rgba(6,81,188,0.07)' },
                  { lbl: 'Terminées',  val: ordStats.terminee,   color: C.brand,  bg: C.brandLt },
                ].map(s => (
                  <div key={s.lbl} style={{ background: s.bg, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: C.fm, lineHeight: 1, marginBottom: 2 }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 500 }}>{s.lbl}</div>
                  </div>
                ))}
              </div>

              {/* Alerte ordonnances en attente > 7j */}
              {ordStats.stale > 0 && (
                <div style={{ background: C.amberLt, border: `1px solid rgba(183,95,6,0.25)`, borderRadius: 8, padding: '8px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ fontSize: 14 }}>⏳</span>
                  <span style={{ color: C.amber, fontWeight: 600 }}>{ordStats.stale} ordonnance{ordStats.stale > 1 ? 's' : ''} en attente depuis plus de 7 jours</span>
                </div>
              )}

              {/* Top médicaments prescrits */}
              {ordStats.topMeds.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Médicaments les + prescrits</div>
                  {ordStats.topMeds.map((m, i) => {
                    const maxQty = ordStats.topMeds[0]?.qty || 1;
                    return (
                      <div key={i} style={{ marginBottom: 7 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                          <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{m.name}</span>
                          <span style={{ fontFamily: C.fm, fontSize: 11.5, color: C.inkMute, fontWeight: 600 }}>{m.qty} u.</span>
                        </div>
                        <div style={{ height: 4, background: 'rgba(0,0,0,0.04)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.round((m.qty / maxQty) * 100)}%`, height: '100%', background: TOP_COLORS[i % TOP_COLORS.length], borderRadius: 99, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </article>

      </div>

      {/* ── Historique d'activité complet ─────────────────────────────────────── */}
      {(() => {
        type HistItem = { id: string; date: string; type: 'vente' | 'commande'; label: string; sub: string; amount: number; badge: string; badgeColor: string };

        const salesItems: HistItem[] = journal.map(r => ({
          id: r.id,
          date: r.sale_date,
          type: 'vente',
          label: r.medication_name,
          sub: r.seller_name ? `Vendu par ${r.seller_name}` : 'Vente comptoir',
          amount: r.total_price || 0,
          badge: r.payment_method || 'Espèces',
          badgeColor: 'green',
        }));

        const orderItems: HistItem[] = purchaseOrders.map(o => ({
          id: o.id,
          date: o.created_at,
          type: 'commande',
          label: o.supplier || 'Fournisseur inconnu',
          sub: o.rep_name ? `Via ${o.rep_name}${o.rep_phone ? ' · ' + o.rep_phone : ''}` : 'Commande fournisseur',
          amount: 0,
          badge: o.status,
          badgeColor: o.status === 'reçue' ? 'green' : o.status === 'envoyée' ? 'blue' : o.status === 'annulée' ? 'red' : 'gray',
        }));

        const allItems = [...salesItems, ...orderItems].sort((a, b) => b.date.localeCompare(a.date));
        const filtered = historyFilter === 'all' ? allItems : allItems.filter(i => i.type === (historyFilter === 'ventes' ? 'vente' : 'commande'));

        const maxHeightMap = { compact: 230, medium: 420, full: 680 };
        const labelMap = { compact: 'Réduit', medium: 'Moyen', full: 'Plein' };

        return (
          <div data-journal-section>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: C.ink }}>Historique d'activité</h2>
                <p style={{ fontSize: 12, color: C.inkMute, marginTop: 2 }}>{filtered.length} événement{filtered.length !== 1 ? 's' : ''} · ventes + commandes fournisseurs</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/* Filtre type */}
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.04)', borderRadius: 8, padding: 3 }}>
                  {(['all', 'ventes', 'commandes'] as const).map(f => (
                    <button key={f} onClick={() => setHistoryFilter(f)}
                      style={{ padding: '4px 11px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.1s',
                        background: historyFilter === f ? '#fff' : 'transparent',
                        color: historyFilter === f ? C.ink : C.inkMute,
                        boxShadow: historyFilter === f ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      }}>
                      {f === 'all' ? 'Tout' : f === 'ventes' ? 'Ventes' : 'Commandes'}
                    </button>
                  ))}
                </div>
                {/* Toggle taille */}
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.04)', borderRadius: 8, padding: 3 }}>
                  {(['compact', 'medium', 'full'] as const).map(s => (
                    <button key={s} onClick={() => setHistorySize(s)}
                      style={{ padding: '4px 11px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.1s',
                        background: historySize === s ? C.ink : 'transparent',
                        color: historySize === s ? '#fff' : C.inkMute,
                        boxShadow: historySize === s ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                      }}>
                      {labelMap[s]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <article style={{ ...card, overflow: 'hidden' }}>
              {/* Tableau header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 100px 120px 80px', gap: 0, padding: '8px 18px', borderBottom: `1px solid ${C.hairline}` }}>
                {['Date', 'Détail', 'Montant', 'Info', 'Type'].map((h, i) => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: i === 2 ? 'right' : 'left' }}>{h}</div>
                ))}
              </div>

              {/* Lignes scrollables */}
              <div style={{ overflowY: 'auto', maxHeight: maxHeightMap[historySize], transition: 'max-height 0.3s ease' }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: '32px 18px', textAlign: 'center', color: C.inkFaint, fontSize: 13 }}>
                    Aucune activité
                  </div>
                ) : filtered.map((item, i) => {
                  const isVente = item.type === 'vente';
                  const dateObj = new Date(item.date);
                  const dateLabel = dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
                  const timeLabel = dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                  const pillColors: Record<string, { bg: string; fg: string }> = {
                    green: { bg: C.brandLt, fg: C.brand },
                    blue:  { bg: 'rgba(6,81,188,0.07)', fg: C.blue },
                    red:   { bg: C.redLt, fg: C.red },
                    amber: { bg: C.amberLt, fg: C.amber },
                    gray:  { bg: 'rgba(15,15,20,0.05)', fg: C.inkMute },
                  };
                  const pc = pillColors[item.badgeColor] || pillColors.gray;
                  return (
                    <div key={item.id + i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 100px 120px 80px', gap: 0, padding: '9px 18px', borderBottom: i < filtered.length - 1 ? `1px solid ${C.hairline}` : 'none', alignItems: 'center', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.02)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontFamily: C.fm, color: C.ink, fontWeight: 500 }}>{dateLabel}</div>
                        <div style={{ fontSize: 10.5, color: C.inkFaint, fontFamily: C.fm }}>{timeLabel}</div>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: C.ink, fontWeight: 500, letterSpacing: '-0.005em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: C.inkMute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sub}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {isVente && item.amount > 0 ? (
                          <>
                            <span style={{ fontFamily: C.fm, fontSize: 12.5, color: C.ink, fontWeight: 600 }}>{fmt(item.amount)}</span>
                            <span style={{ fontSize: 10.5, color: C.inkMute }}> FC</span>
                          </>
                        ) : (
                          <span style={{ fontSize: 11, color: C.inkFaint }}>—</span>
                        )}
                      </div>
                      <div>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 600, background: pc.bg, color: pc.fg }}>
                          {item.badge}
                        </span>
                      </div>
                      <div>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 600, background: isVente ? C.brandLt : 'rgba(6,81,188,0.07)', color: isVente ? C.brand : C.blue }}>
                          <span style={{ width: 5, height: 5, borderRadius: 99, background: isVente ? C.brand : C.blue, flexShrink: 0 }} />
                          {isVente ? 'Vente' : 'Commande'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer stats + bouton clôture Z ─────────────────────────── */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '10px 18px', borderTop: `1px solid ${C.hairline}`, background: 'rgba(0,0,0,0.01)' }}>
                <div style={{ display: 'flex', gap: 20 }}>
                  <div style={{ fontSize: 11.5, color: C.inkMute }}>
                    <span style={{ fontWeight: 700, color: C.brand, fontFamily: C.fm }}>{salesItems.length}</span> ventes
                  </div>
                  <div style={{ fontSize: 11.5, color: C.inkMute }}>
                    <span style={{ fontWeight: 700, color: C.blue, fontFamily: C.fm }}>{orderItems.length}</span> commandes
                  </div>
                  <div style={{ fontSize: 11.5, color: C.inkMute }}>
                    CA total : <span style={{ fontWeight: 700, color: C.ink, fontFamily: C.fm }}>{fmt(salesItems.reduce((s, i) => s + i.amount, 0))} FC</span>
                  </div>
                </div>
                {/* Bouton clôture Z — chip Chalk compact */}
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('topbar-action', { detail: { action: 'open-z-report' } }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 11px', borderRadius: 7, cursor: 'pointer',
                    background: 'rgba(16,120,90,0.08)',
                    border: '1px solid rgba(16,120,90,0.22)',
                    color: C.brand,
                    fontSize: 11, fontWeight: 700, letterSpacing: '-0.005em',
                    fontFamily: C.f,
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,120,90,0.14)';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(16,120,90,0.32)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,120,90,0.08)';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(16,120,90,0.22)';
                  }}
                  title="Clôturer la journée et générer le Rapport Z"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
                    <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                    <path d="M9 13h6M9 17h4"/>
                  </svg>
                  Clôture Z
                </button>
              </div>
            </article>
          </div>
        );
      })()}

    </div>
  );
}
