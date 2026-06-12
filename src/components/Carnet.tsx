import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Plus, X, MessageSquare, Check, RefreshCw, ArrowRight, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { offlineStorage } from '../lib/offlineStorage';
import { offlineSafePayCredit } from '../lib/writeService';
import { insertWithUserId } from '../lib/supabaseHelpers';

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  panel:    'rgba(255,255,255,0.62)',
  panel2:   'rgba(255,255,255,0.82)',
  hairline: 'rgba(255,255,255,0.55)',
  border:   'rgba(15,15,20,0.06)',
  bg:       'rgba(15,15,20,0.025)',
  brand:    '#537d14',
  brandHi:  '#6a9e28',
  brandLt:  'rgba(83,125,20,0.08)',
  brandMid: 'rgba(83,125,20,0.16)',
  ink:      '#0a0e14',
  inkSoft:  '#2c3138',
  inkMute:  '#6b7280',
  inkFaint: '#9aa0a8',
  red:      '#c81e1e',
  redLt:    'rgba(200,30,30,0.08)',
  redMid:   'rgba(200,30,30,0.15)',
  amber:    '#b75f06',
  amberLt:  'rgba(183,95,6,0.09)',
  blue:     '#0651bc',
  blueLt:   'rgba(6,81,188,0.08)',
  fm:       '"SF Mono","Geist Mono",ui-monospace,Menlo,monospace',
  f:        '-apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,system-ui,sans-serif',
};

const glass: React.CSSProperties = {
  background: C.panel, border: `1px solid ${C.hairline}`, borderRadius: 12,
  backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)',
  boxShadow: `0 1px 0 ${C.hairline}`,
};

const GRADIENTS = [
  'linear-gradient(135deg,#0651bc,#3b86e0)',
  'linear-gradient(135deg,#6e44b0,#9b6dd6)',
  'linear-gradient(135deg,#b75f06,#e08533)',
  'linear-gradient(135deg,#537d14,#6a9e28)',
  'linear-gradient(135deg,#c81e1e,#e05555)',
  'linear-gradient(135deg,#0891b2,#22b8cf)',
];

const fmt  = (n: number) => Math.round(n).toLocaleString('fr-FR');
const fmtk = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n/1_000)}k` : String(Math.round(n));

// ── Types ─────────────────────────────────────────────────────────────────────
interface CreditItem { medication_id: string; medication_name: string; quantity: number; unit_price: number; subtotal: number; }
interface Credit {
  id: string; client_name: string; client_phone?: string | null; due_date?: string | null;
  total_amount: number; amount_paid: number; status: 'unpaid' | 'paid';
  sale_date: string; paid_at?: string | null; payment_method?: string | null;
  items: CreditItem[]; notes?: string | null; created_at: string;
}
type ClientType = 'entreprise' | 'patient';
interface CreditAccount {
  key: string; client_name: string; client_phone?: string | null;
  type: ClientType; credits: Credit[];
  totalDu: number; totalAmount: number; totalPaid: number;
  isOverdue: boolean; isActive: boolean; latestDate: string; idx: number;
}
type AccFilter = 'tous' | 'entreprises' | 'patients';

function isOverdue(c: Credit) { return !!(c.due_date && c.status !== 'paid' && new Date(c.due_date) < new Date()); }
function clientType(c: Credit): ClientType { return c.notes?.includes('[Entreprise]') ? 'entreprise' : 'patient'; }

// ── Mini sparkline ────────────────────────────────────────────────────────────
function Spark({ color, up = true }: { color: string; up?: boolean }) {
  const pts = up
    ? [[0,28],[10,22],[22,18],[34,14],[46,10],[58,8],[70,4]]
    : [[0,6],[10,10],[22,14],[34,16],[46,18],[58,22],[70,24]];
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  return (
    <svg width="70" height="32" viewBox="0 0 70 32" fill="none" style={{ flexShrink: 0 }}>
      <path d={d} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.7" />
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="3" fill={color} opacity="0.9" />
    </svg>
  );
}

// ── Account avatar ────────────────────────────────────────────────────────────
function AccountAvatar({ name, idx, type }: { name: string; idx: number; type: ClientType }) {
  const initials = name.trim().split(/\s+/).map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
  return (
    <div style={{
      width: 44, height: 44, borderRadius: 11,
      background: GRADIENTS[idx % GRADIENTS.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: type === 'entreprise' ? 20 : 15, fontWeight: 700,
      letterSpacing: '-0.01em', flexShrink: 0,
    }}>
      {type === 'entreprise' ? '🏢' : initials}
    </div>
  );
}

// ── Payment Modal ─────────────────────────────────────────────────────────────
function PaymentModal({ credit, onConfirm, onClose, loading }: {
  credit: Credit; onConfirm: (amount: number, method: string) => Promise<void>;
  onClose: () => void; loading: boolean;
}) {
  const remaining = credit.total_amount - (credit.amount_paid || 0);
  const [amount, setAmount] = useState(String(Math.round(remaining)));
  const [method, setMethod] = useState('Especes');
  const parsed = parseInt(amount) || 0;
  const invalid = parsed <= 0 || parsed > remaining;
  const METHODS = [
    { key: 'Especes', label: 'Espèces' }, { key: 'MTN Mobile Money', label: 'MTN MM' },
    { key: 'Airtel Money', label: 'Airtel' }, { key: 'Carte Bancaire', label: 'Carte' },
  ];
  return (
    <div style={{ position:'fixed', inset:0, zIndex:999, background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'rgba(255,255,255,0.96)', borderRadius:16, width:'100%', maxWidth:440, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.2)', fontFamily: C.f }}>
        <div style={{ padding:'18px 22px 16px', borderBottom:`1px solid ${C.hairline}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:15, fontWeight:700, color:C.ink }}>Enregistrer un paiement</div>
          <button onClick={onClose} style={{ background:C.bg, border:'none', borderRadius:8, width:30, height:30, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><X size={14} color={C.inkMute}/></button>
        </div>
        <div style={{ padding:'20px 22px 22px', display:'flex', flexDirection:'column', gap:18 }}>
          <div style={{ background:`${C.brand}08`, borderRadius:10, padding:'12px 16px' }}>
            <div style={{ fontSize:12, color:C.inkMute, marginBottom:4 }}>{credit.client_name}</div>
            <div style={{ display:'flex', gap:24 }}>
              <div><div style={{ fontSize:10.5, color:C.inkFaint }}>Montant initial</div><div style={{ fontSize:15, fontWeight:600, fontFamily:C.fm, color:C.ink }}>{fmt(credit.total_amount)} FC</div></div>
              <div><div style={{ fontSize:10.5, color:C.inkFaint }}>Restant dû</div><div style={{ fontSize:15, fontWeight:700, fontFamily:C.fm, color:C.red }}>{fmt(remaining)} FC</div></div>
            </div>
          </div>
          <div>
            <label style={{ display:'block', fontSize:12, fontWeight:550, color:C.inkMute, marginBottom:6 }}>Montant à régler (FC)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              style={{ width:'100%', height:44, border:`1.5px solid ${invalid && amount ? C.red : C.brand}`, borderRadius:8, padding:'0 12px', fontSize:18, fontWeight:700, background:'transparent', color:C.ink, fontFamily:C.fm, outline:'none', boxSizing:'border-box' }} />
            {invalid && amount && <div style={{ fontSize:11.5, color:C.red, marginTop:4 }}>{parsed > remaining ? `Dépasse le solde (${fmt(remaining)} FC)` : 'Montant invalide'}</div>}
          </div>
          <div>
            <label style={{ display:'block', fontSize:12, fontWeight:550, color:C.inkMute, marginBottom:8 }}>Mode de paiement</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {METHODS.map(({ key, label }) => {
                const active = method === key;
                return <button key={key} onClick={() => setMethod(key)} style={{ padding:'9px 8px', borderRadius:9, border:`1.5px solid ${active ? C.brand : C.hairline}`, background:active ? C.brandLt : 'transparent', color:active ? C.brand : C.inkSoft, cursor:'pointer', fontFamily:C.f, fontSize:12.5, fontWeight:550, transition:'all 0.12s' }}>{label}</button>;
              })}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={onClose} style={{ background:'transparent', border:`1px solid ${C.hairline}`, borderRadius:8, padding:'9px 18px', fontSize:13, color:C.inkSoft, cursor:'pointer', fontFamily:C.f }}>Annuler</button>
            <button onClick={() => onConfirm(parsed, method)} disabled={invalid || loading}
              style={{ background:C.brand, color:'#fff', border:'none', borderRadius:8, padding:'9px 22px', fontSize:13, fontWeight:600, cursor:invalid||loading ? 'not-allowed' : 'pointer', fontFamily:C.f, opacity:invalid||loading ? 0.5 : 1, display:'flex', alignItems:'center', gap:8 }}>
              {loading ? <div style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:99, animation:'spin 0.8s linear infinite' }}/> : <Check size={14}/>}
              Confirmer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── New Credit Modal ──────────────────────────────────────────────────────────
function NewCreditModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Credit) => void }) {
  const [clientName, setClientName]   = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [cType, setCType]             = useState<'particulier' | 'entreprise'>('particulier');
  const [amount, setAmount]           = useState('');
  const [dueDate, setDueDate]         = useState('');
  const [notes, setNotes]             = useState('');
  const [saving, setSaving]           = useState(false);
  const valid = clientName.trim().length >= 2 && (parseInt(amount) || 0) > 0;

  const handleSubmit = async () => {
    if (!valid) return;
    setSaving(true);
    const now = new Date().toISOString();
    const credit = {
      client_name: clientName.trim(), client_phone: clientPhone.trim() || null,
      due_date: dueDate || null, total_amount: parseInt(amount), amount_paid: 0,
      status: 'unpaid' as const, sale_date: now, paid_at: null, payment_method: null, items: [] as CreditItem[],
      notes: [cType === 'entreprise' ? '[Entreprise]' : '', notes].filter(Boolean).join(' ') || null,
    };
    try {
      if (navigator.onLine) {
        const { data, error } = await insertWithUserId('credits', [credit]);
        if (!error && data?.[0]) { onCreated({ ...credit, ...data[0] }); setSaving(false); return; }
      }
      onCreated({ ...credit, id: `local-${Date.now()}`, created_at: now });
    } catch { onCreated({ ...credit, id: `local-${Date.now()}`, created_at: now }); }
    setSaving(false);
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:999, background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'rgba(255,255,255,0.96)', borderRadius:16, width:'100%', maxWidth:480, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.2)', fontFamily:C.f }}>
        <div style={{ padding:'18px 22px 16px', borderBottom:`1px solid ${C.hairline}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:15, fontWeight:700, color:C.ink }}>Nouveau compte crédit</div>
          <button onClick={onClose} style={{ background:C.bg, border:'none', borderRadius:8, width:30, height:30, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><X size={14} color={C.inkMute}/></button>
        </div>
        <div style={{ padding:'20px 22px 22px', display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ display:'flex', gap:8 }}>
            {(['particulier', 'entreprise'] as const).map(t => (
              <button key={t} onClick={() => setCType(t)} style={{ flex:1, padding:'9px 8px', borderRadius:9, border:`1.5px solid ${cType === t ? C.brand : C.hairline}`, background:cType === t ? C.brandLt : 'transparent', color:cType === t ? C.brand : C.inkSoft, cursor:'pointer', fontFamily:C.f, fontSize:13, fontWeight:550, transition:'all 0.12s' }}>
                {t === 'particulier' ? '👤 Particulier' : '🏢 Entreprise'}
              </button>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {([
              { lbl: cType === 'entreprise' ? 'Nom entreprise *' : 'Nom client *', val: clientName, set: setClientName, ph: cType === 'entreprise' ? 'SARL Biomed…' : 'M. Kabila…' },
              { lbl: 'Téléphone', val: clientPhone, set: setClientPhone, ph: '+243 81…' },
            ] as const).map(({ lbl, val, set, ph }) => (
              <div key={lbl}>
                <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:C.inkMute, marginBottom:5 }}>{lbl}</label>
                <input value={val} onChange={e => (set as (v: string) => void)(e.target.value)} placeholder={ph}
                  style={{ width:'100%', height:38, border:`1.5px solid ${C.hairline}`, borderRadius:8, padding:'0 12px', fontSize:13, background:'transparent', color:C.ink, fontFamily:C.f, outline:'none', boxSizing:'border-box' }} />
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:C.inkMute, marginBottom:5 }}>Montant (FC) *</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
                style={{ width:'100%', height:38, border:`1.5px solid ${C.hairline}`, borderRadius:8, padding:'0 12px', fontSize:14, fontWeight:600, background:'transparent', color:C.ink, fontFamily:C.fm, outline:'none', boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:C.inkMute, marginBottom:5 }}>Échéance</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} min={new Date().toISOString().split('T')[0]}
                style={{ width:'100%', height:38, border:`1.5px solid ${C.hairline}`, borderRadius:8, padding:'0 12px', fontSize:13, background:'transparent', color:C.ink, fontFamily:C.f, outline:'none', boxSizing:'border-box' }} />
            </div>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:C.inkMute, marginBottom:5 }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Objet, accord de paiement…" rows={2}
              style={{ width:'100%', border:`1.5px solid ${C.hairline}`, borderRadius:8, padding:'8px 12px', fontSize:13, background:'transparent', color:C.ink, fontFamily:C.f, outline:'none', resize:'none', boxSizing:'border-box', lineHeight:1.5 }} />
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={onClose} style={{ background:'transparent', border:`1px solid ${C.hairline}`, borderRadius:8, padding:'9px 18px', fontSize:13, color:C.inkSoft, cursor:'pointer', fontFamily:C.f }}>Annuler</button>
            <button onClick={handleSubmit} disabled={!valid || saving}
              style={{ background:valid && !saving ? C.ink : C.hairline, color:valid && !saving ? '#fff' : C.inkMute, border:'none', borderRadius:8, padding:'9px 22px', fontSize:13, fontWeight:600, cursor:!valid||saving ? 'not-allowed' : 'pointer', fontFamily:C.f, display:'flex', alignItems:'center', gap:8, transition:'all 0.12s' }}>
              {saving ? <div style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:99, animation:'spin 0.8s linear infinite' }}/> : <Plus size={14}/>}
              Créer le compte
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Carnet() {
  const [credits, setCredits]           = useState<Credit[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [filter, setFilter]             = useState<AccFilter>('tous');
  const [search, setSearch]             = useState('');
  const [payModal, setPayModal]         = useState<Credit | null>(null);
  const [payLoading, setPayLoading]     = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showAllMvt, setShowAllMvt]     = useState(false);
  const [showPicker, setShowPicker]     = useState(false);

  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent<{action:string}>).detail.action === 'add-credit') setShowNewModal(true); };
    window.addEventListener('topbar-action', h);
    return () => window.removeEventListener('topbar-action', h);
  }, []);

  const loadCredits = useCallback(async () => {
    setLoading(true);
    const cached = offlineStorage.getCachedCredits();
    if (cached.length > 0) { setCredits(cached as Credit[]); setLoading(false); }
    if (navigator.onLine) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase.from('credits').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        if (!error && data) {
          const parsed = data.map((c: any) => ({ ...c, amount_paid: c.amount_paid ?? 0, items: Array.isArray(c.items) ? c.items : [] })) as Credit[];
          setCredits(parsed);
          offlineStorage.cacheCredits(parsed);
        }
      } catch { /* offline */ }
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadCredits(); }, [loadCredits]);

  const handlePayment = async (credit: Credit, amount: number, method: string) => {
    setPayLoading(true);
    const result = await offlineSafePayCredit(credit, amount, method);
    if (result.status === 'paid' && navigator.onLine) {
      try {
        await insertWithUserId('sales_journal', [{
          sale_date: new Date().toISOString(), medication_id: credit.items[0]?.medication_id || null,
          medication_name: credit.client_name, quantity_sold: credit.items.reduce((s, i) => s + i.quantity, 0) || 1,
          unit_price: amount, total_price: amount, payment_method: method, stock_after_sale: 0, synced: true,
        }]);
      } catch { /* non-blocking */ }
    }
    setCredits(prev => prev.map(c =>
      c.id === credit.id
        ? { ...c, amount_paid: result.newAmountPaid, status: result.status, paid_at: result.status === 'paid' ? new Date().toISOString() : c.paid_at, payment_method: method }
        : c
    ));
    setPayModal(null);
    setPayLoading(false);
  };

  const handleWhatsApp = (credit: Credit) => {
    const remaining = Math.round(credit.total_amount - (credit.amount_paid || 0));
    const due = credit.due_date ? new Date(credit.due_date).toLocaleDateString('fr-FR') : 'dès que possible';
    const msg = `Bonjour ${credit.client_name},\n\nNous vous rappelons qu'un crédit de *${fmt(remaining)} FC* est en attente.\n\nÉchéance : ${due}\n\nMerci.\n— JunglePharm`;
    const phone = credit.client_phone?.replace(/[\s+]/g, '') || '';
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // ── Build credit accounts (grouped by client) ─────────────────────────────
  const accounts = useMemo((): CreditAccount[] => {
    const map = new Map<string, Credit[]>();
    credits.forEach(c => {
      const key = c.client_name.trim().toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return Array.from(map.entries()).map(([, cs], idx) => {
      const active   = cs.filter(c => c.status !== 'paid');
      const totalDu  = active.reduce((s, c) => s + Math.max(0, c.total_amount - (c.amount_paid || 0)), 0);
      const totalAmt = cs.reduce((s, c) => s + c.total_amount, 0);
      const totalPd  = cs.reduce((s, c) => s + (c.amount_paid || 0), 0);
      const overdue  = active.some(isOverdue);
      const latest   = [...cs].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return {
        key: cs[0].client_name, client_name: cs[0].client_name, client_phone: cs[0].client_phone,
        type: clientType(cs[0]), credits: cs, totalDu, totalAmount: totalAmt, totalPaid: totalPd,
        isOverdue: overdue, isActive: active.length > 0, latestDate: latest.created_at, idx,
      };
    }).sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      return b.totalDu - a.totalDu;
    });
  }, [credits]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const encours     = credits.filter(c => c.status !== 'paid').reduce((s, c) => s + Math.max(0, c.total_amount - (c.amount_paid || 0)), 0);
    const enRetard    = credits.filter(isOverdue).reduce((s, c) => s + Math.max(0, c.total_amount - (c.amount_paid || 0)), 0);
    const enRetardTop = credits.filter(isOverdue).sort((a, b) => (b.total_amount - b.amount_paid) - (a.total_amount - a.amount_paid))[0];
    const actifs      = accounts.filter(a => a.isActive).length;
    const total       = accounts.length;
    const entreprises = accounts.filter(a => a.type === 'entreprise').length;
    const patients    = accounts.filter(a => a.type === 'patient').length;
    const now = new Date();
    const overdueItems = credits.filter(isOverdue);
    const delayDays = overdueItems.length > 0
      ? overdueItems.reduce((s, c) => s + Math.floor((now.getTime() - new Date(c.due_date!).getTime()) / 86400000), 0) / overdueItems.length
      : 0;
    return { encours, enRetard, enRetardTop, actifs, total, entreprises, patients, delayDays };
  }, [credits, accounts]);

  // ── Filtered accounts ─────────────────────────────────────────────────────
  const filteredAccounts = useMemo(() => {
    let list = accounts;
    if (filter === 'entreprises') list = list.filter(a => a.type === 'entreprise');
    if (filter === 'patients')    list = list.filter(a => a.type === 'patient');
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a => a.client_name.toLowerCase().includes(q) || (a.client_phone || '').includes(q));
    }
    return list;
  }, [accounts, filter, search]);

  // ── Recent movements (individual credits sorted by date) ──────────────────
  const movements = useMemo(() =>
    [...credits].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  [credits]);

  const visibleMovements = showAllMvt ? movements : movements.slice(0, 5);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadCredits();
    setRefreshing(false);
  };

  // "Enregistrer un paiement" : logique selon nombre d'impayés
  const handleCtaPayment = () => {
    const unpaid = credits.filter(c => c.status !== 'paid');
    if (unpaid.length === 0) { setShowNewModal(true); return; }   // aucun impayé → créer nouveau
    if (unpaid.length === 1) { setPayModal(unpaid[0]); return; }  // 1 seul → ouvrir directement
    setShowPicker(true);                                           // plusieurs → picker
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: C.f, color: C.ink }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Title */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.025em', margin: 0, marginBottom: 4 }}>Ventes à crédit</h1>
        <p style={{ fontSize: 13, color: C.inkMute, margin: 0 }}>
          {kpis.actifs} compte{kpis.actifs !== 1 ? 's' : ''} actif{kpis.actifs !== 1 ? 's' : ''}
          {(kpis.entreprises > 0 || kpis.patients > 0) && ` · ${[
            kpis.entreprises > 0 ? `${kpis.entreprises} entreprise${kpis.entreprises !== 1 ? 's' : ''}` : '',
            kpis.patients    > 0 ? `${kpis.patients} patient${kpis.patients !== 1 ? 's' : ''}` : '',
          ].filter(Boolean).join(' & ')}`}
        </p>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {([
          {
            lbl: 'Encours total',
            val: `${fmtk(kpis.encours)} FC`,
            sub: `${credits.filter(c => c.status !== 'paid').length} facture${credits.filter(c => c.status !== 'paid').length !== 1 ? 's' : ''} ouverte${credits.filter(c => c.status !== 'paid').length !== 1 ? 's' : ''}`,
            color: C.amber, up: true,
          },
          {
            lbl: 'En retard',
            val: `${fmtk(kpis.enRetard)} FC`,
            sub: kpis.enRetardTop
              ? `${kpis.enRetardTop.client_name.split(' ')[0]} · ${Math.floor((Date.now() - new Date(kpis.enRetardTop.due_date!).getTime()) / 86400000)} j`
              : 'Aucun retard',
            color: kpis.enRetard > 0 ? C.red : C.brand, up: false,
          },
          {
            lbl: 'Comptes actifs',
            val: `${kpis.actifs} sur ${kpis.total}`,
            sub: `${kpis.entreprises} entreprise${kpis.entreprises !== 1 ? 's' : ''} · ${kpis.patients} patient${kpis.patients !== 1 ? 's' : ''}`,
            color: C.brand, up: true,
          },
          {
            lbl: 'Délai moyen',
            val: `${kpis.delayDays.toFixed(1)} jours`,
            sub: kpis.delayDays > 0 ? 'Jours de retard moyen' : 'Aucun retard actif',
            color: kpis.delayDays > 14 ? C.red : C.inkSoft, up: false,
          },
        ] as const).map((k, i) => (
          <div key={i} style={{ ...glass, padding: '16px 18px' }}>
            <div style={{ fontSize: 11.5, color: C.inkMute, marginBottom: 10 }}>{k.lbl}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.color, letterSpacing: '-0.03em', fontFamily: C.fm, lineHeight: 1 }}>{k.val}</div>
              <Spark color={k.color} up={k.up} />
            </div>
            <div style={{ fontSize: 11.5, color: C.inkMute }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>

        {/* LEFT — Comptes de crédit */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, flex: 1, minWidth: 120 }}>Comptes de crédit</div>

            <div style={{ position: 'relative' }}>
              <Search size={12} color={C.inkMute} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
                style={{ height: 32, paddingLeft: 28, paddingRight: 10, border: `1px solid ${C.hairline}`, borderRadius: 7, fontSize: 12.5, background: C.panel2, color: C.ink, fontFamily: C.f, outline: 'none', width: 180, boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', background: 'rgba(232,239,233,0.5)', padding: 3, borderRadius: 8, border: `1px solid ${C.hairline}`, gap: 2 }}>
              {(['tous', 'entreprises', 'patients'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{ border: 'none', background: filter === f ? C.panel : 'transparent', color: filter === f ? C.ink : C.inkMute, fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontFamily: C.f, boxShadow: filter === f ? `0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px ${C.hairline}` : 'none', transition: 'all 0.1s', textTransform: 'capitalize' }}>{f}</button>
              ))}
            </div>

            <button onClick={handleRefresh} title="Rafraîchir" style={{ background: C.panel2, border: `1px solid ${C.hairline}`, borderRadius: 7, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw size={12} color={C.inkMute} style={{ animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }} />
            </button>
            <button onClick={() => setShowNewModal(true)} style={{ background: C.ink, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: C.f }}>
              <Plus size={13} strokeWidth={2.5} /> Nouveau compte
            </button>
          </div>

          {loading && credits.length === 0 ? (
            <div style={{ padding: '64px 0', textAlign: 'center' }}>
              <div style={{ width: 28, height: 28, border: `3px solid ${C.amber}`, borderTopColor: 'transparent', borderRadius: 99, animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 13, color: C.inkMute }}>Chargement…</p>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div style={{ ...glass, padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>💳</div>
              <p style={{ fontSize: 14, color: C.inkMute, fontWeight: 500 }}>{search ? 'Aucun résultat' : 'Aucun compte crédit'}</p>
              {!search && <button onClick={() => setShowNewModal(true)} style={{ marginTop: 12, background: C.ink, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: C.f }}>Créer le premier compte</button>}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {filteredAccounts.map(acc => {
                const overdue  = acc.isOverdue;
                const inactive = !acc.isActive;
                const pct      = acc.totalAmount > 0 ? Math.min(100, Math.round((acc.totalPaid / acc.totalAmount) * 100)) : 0;
                const toPay    = acc.credits.filter(c => c.status !== 'paid').sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
                return (
                  <div key={acc.key} style={{ ...glass, padding: '16px 18px', opacity: inactive ? 0.72 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                      <AccountAvatar name={acc.client_name} idx={acc.idx} type={acc.type} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{acc.client_name}</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: overdue ? C.redLt : inactive ? C.bg : C.brandLt, color: overdue ? C.red : inactive ? C.inkMute : C.brand, borderRadius: 99, padding: '2px 7px', fontSize: 10.5, fontWeight: 600, flexShrink: 0 }}>
                            <span style={{ width: 4, height: 4, borderRadius: 99, background: overdue ? C.red : inactive ? C.inkMute : C.brand }} />
                            {overdue ? 'En retard' : inactive ? 'Inactif' : 'Actif'}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: C.inkMute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {acc.type === 'entreprise' ? 'Convention entreprise' : 'Patient fidèle'}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Remboursement</span>
                        <span style={{ fontSize: 11, color: C.inkMute, fontFamily: C.fm }}>{fmtk(acc.totalPaid)} / {fmtk(acc.totalAmount)} FC</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 99, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: pct === 100 ? C.brand : overdue ? C.red : C.amber, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: C.inkFaint, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2 }}>Solde dû</div>
                        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: C.fm, color: acc.totalDu === 0 ? C.brand : overdue ? C.red : C.amber, letterSpacing: '-0.02em', lineHeight: 1 }}>
                          {fmt(acc.totalDu)} <span style={{ fontSize: 12, fontWeight: 500, color: C.inkMute }}>FC</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {acc.client_phone && toPay && (
                          <button onClick={() => handleWhatsApp(toPay)} title="Relance WhatsApp"
                            style={{ background: 'rgba(37,211,102,0.09)', border: '1px solid rgba(37,211,102,0.22)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <MessageSquare size={13} color="#128c7e" />
                          </button>
                        )}
                        {toPay && (
                          <button onClick={() => setPayModal(toPay)}
                            style={{ background: C.ink, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: C.f, flexShrink: 0 }}>
                            Encaisser
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT — Mouvements récents */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 16 }}>
          <div style={{ ...glass, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Mouvements récents</span>
              <button
                onClick={() => setShowAllMvt(v => !v)}
                style={{ fontSize: 11.5, color: C.brand, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3, fontFamily: C.f }}
              >
                {showAllMvt ? 'Réduire' : 'Tout voir'} <ArrowRight size={11} strokeWidth={2} style={{ transition: 'transform 0.2s', transform: showAllMvt ? 'rotate(90deg)' : 'none' }} />
              </button>
            </div>
            <div>
              {movements.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12.5, color: C.inkFaint, fontStyle: 'italic' }}>Aucun mouvement</div>
              ) : visibleMovements.map((cr, i) => {
                const vs = cr.status === 'paid' ? 'solde' : isOverdue(cr) ? 'retard' : 'ouvert';
                const statusCfg = {
                  solde:  { label: 'Payé',      bg: C.brandLt, fg: C.brand },
                  retard: { label: 'En retard',  bg: C.redLt,   fg: C.red   },
                  ouvert: { label: 'Ouvert',     bg: C.amberLt, fg: C.amber },
                }[vs];
                return (
                  <div key={cr.id} style={{ padding: '10px 16px', borderBottom: i < visibleMovements.length - 1 ? `1px solid ${C.hairline}` : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <TrendingUp size={13} color={C.inkMute} strokeWidth={1.5} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cr.client_name}</div>
                      <div style={{ fontSize: 11, color: C.inkFaint }}>#{cr.id.slice(-4).toUpperCase()} · {cr.status === 'paid' ? 'Paiement' : 'Crédit'} · {fmtDate(cr.created_at)}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, fontFamily: C.fm, color: C.ink }}>{fmt(cr.total_amount)} FC</div>
                      <span style={{ fontSize: 10, fontWeight: 600, background: statusCfg.bg, color: statusCfg.fg, borderRadius: 99, padding: '1px 6px', display: 'inline-block', marginTop: 2 }}>{statusCfg.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CTA */}
          <div
            onClick={handleCtaPayment}
            style={{ ...glass, padding: '16px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, background: C.brandLt, border: `1px solid ${C.brandMid}` }}
            onMouseEnter={e => { e.currentTarget.style.background = C.brandMid; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.brandLt; }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: C.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>💳</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.brand }}>
                {credits.filter(c => c.status !== 'paid').length === 0 ? 'Nouveau crédit' : 'Enregistrer un paiement'}
              </div>
              <div style={{ fontSize: 11.5, color: C.inkMute }}>
                {credits.filter(c => c.status !== 'paid').length === 0
                  ? 'Créer un compte client'
                  : `${credits.filter(c => c.status !== 'paid').length} compte${credits.filter(c => c.status !== 'paid').length > 1 ? 's' : ''} impayé${credits.filter(c => c.status !== 'paid').length > 1 ? 's' : ''}`}
              </div>
            </div>
            <ArrowRight size={16} color={C.brand} />
          </div>
        </div>
      </div>

      {/* Modals */}
      {payModal && (
        <PaymentModal credit={payModal} onConfirm={(a, m) => handlePayment(payModal, a, m)} onClose={() => setPayModal(null)} loading={payLoading} />
      )}
      {showNewModal && (
        <NewCreditModal onClose={() => setShowNewModal(false)} onCreated={c => { setCredits(prev => [c, ...prev]); setShowNewModal(false); }} />
      )}

      {/* Picker — sélectionner quel crédit impayé encaisser */}
      {showPicker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowPicker(false)}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', fontFamily: C.f }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '18px 22px 14px', borderBottom: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Choisir un compte</div>
                <div style={{ fontSize: 12, color: C.inkMute, marginTop: 2 }}>Sélectionne le crédit à encaisser</div>
              </div>
              <button onClick={() => setShowPicker(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: C.inkFaint, lineHeight: 1, padding: 4 }}>✕</button>
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {credits.filter(c => c.status !== 'paid').map((cr, i, arr) => (
                <button
                  key={cr.id}
                  onClick={() => { setShowPicker(false); setPayModal(cr); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '13px 22px', border: 'none', borderBottom: i < arr.length - 1 ? `1px solid ${C.hairline}` : 'none',
                    background: 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.brandLt; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `linear-gradient(135deg, ${C.amber}, #e08533)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                    {cr.client_name.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cr.client_name}</div>
                    <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>
                      Solde dû : <span style={{ fontWeight: 700, color: isOverdue(cr) ? C.red : C.amber, fontFamily: C.fm }}>{fmt(cr.total_amount - (cr.amount_paid ?? 0))} FC</span>
                    </div>
                  </div>
                  <ArrowRight size={14} color={C.inkFaint} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
