import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Plus, X, Phone, MessageSquare, Check, RefreshCw, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { offlineStorage } from '../lib/offlineStorage';
import { offlineSafePayCredit } from '../lib/writeService';
import { insertWithUserId } from '../lib/supabaseHelpers';
import { useResponsive } from '../lib/useResponsive';

// ── Design tokens Chalk ───────────────────────────────────────────────────────
const C = {
  panel:    'rgba(255,255,255,0.62)',
  panel2:   'rgba(255,255,255,0.82)',
  hairline: 'rgba(255,255,255,0.55)',
  border:   'rgba(15,15,20,0.06)',
  bg:       'rgba(15,15,20,0.025)',
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
  redMid:   'rgba(200,30,30,0.15)',
  amber:    '#b75f06',
  amberLt:  'rgba(183,95,6,0.09)',
  blue:     '#0651bc',
  blueLt:   'rgba(6,81,188,0.08)',
  fm:       '"SF Mono","Geist Mono",ui-monospace,Menlo,monospace',
  f:        '-apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,system-ui,sans-serif',
};

const card: React.CSSProperties = {
  background: C.panel, border: `1px solid ${C.hairline}`, borderRadius: 12,
  backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)',
  boxShadow: `0 1px 0 ${C.hairline}`,
};

const GRADIENTS = [
  'linear-gradient(135deg,#0651bc,#3b86e0)',
  'linear-gradient(135deg,#6e44b0,#9b6dd6)',
  'linear-gradient(135deg,#b75f06,#e08533)',
  'linear-gradient(135deg,#10785a,#149a73)',
  'linear-gradient(135deg,#c81e1e,#e05555)',
  'linear-gradient(135deg,#0891b2,#22b8cf)',
];

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

// ── Types ─────────────────────────────────────────────────────────────────────
interface CreditItem {
  medication_id: string;
  medication_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface Credit {
  id: string;
  client_name: string;
  client_phone?: string | null;
  due_date?: string | null;
  total_amount: number;
  amount_paid: number;
  status: 'unpaid' | 'paid';
  sale_date: string;
  paid_at?: string | null;
  payment_method?: string | null;
  items: CreditItem[];
  notes?: string | null;
  created_at: string;
}

type VisualStatus = 'actif' | 'partiel' | 'solde';

function getVisualStatus(c: Credit): VisualStatus {
  if (c.status === 'paid') return 'solde';
  if ((c.amount_paid || 0) > 0) return 'partiel';
  return 'actif';
}

function isOverdue(c: Credit): boolean {
  if (!c.due_date || c.status === 'paid') return false;
  return new Date(c.due_date) < new Date();
}

const STATUS_MAP: Record<VisualStatus, { label: string; color: 'red' | 'amber' | 'green' }> = {
  actif:   { label: 'À régler', color: 'red'   },
  partiel: { label: 'Partiel',  color: 'amber' },
  solde:   { label: 'Soldé',    color: 'green' },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ name, idx = 0, size = 38 }: { name: string; idx?: number; size?: number }) {
  const initials = name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('');
  return (
    <div style={{
      width: size, height: size, borderRadius: 99,
      background: GRADIENTS[idx % GRADIENTS.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.36, fontWeight: 600, letterSpacing: '-0.01em',
      flexShrink: 0,
    }}>{initials}</div>
  );
}

type PillColor = 'gray' | 'green' | 'red' | 'amber' | 'blue';
function Pill({ children, color = 'gray' }: { children: React.ReactNode; color?: PillColor }) {
  const p: Record<PillColor, { bg: string; fg: string; dot: string }> = {
    gray:  { bg: 'rgba(15,15,20,0.05)', fg: C.inkSoft,  dot: C.inkFaint },
    green: { bg: C.brandLt,            fg: C.brand,    dot: C.brand    },
    red:   { bg: C.redLt,              fg: C.red,      dot: C.red      },
    amber: { bg: C.amberLt,            fg: C.amber,    dot: C.amber    },
    blue:  { bg: C.blueLt,             fg: C.blue,     dot: C.blue     },
  };
  const c = p[color];
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, background:c.bg, color:c.fg, padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:500, lineHeight:1.4, letterSpacing:'-0.005em', fontFamily:C.f, whiteSpace:'nowrap' }}>
      <span style={{ width:5, height:5, borderRadius:99, background:c.dot, flexShrink:0 }}/>
      {children}
    </span>
  );
}

// ── Payment Modal ─────────────────────────────────────────────────────────────
interface PaymentModalProps {
  credit: Credit;
  onConfirm: (amount: number, method: string) => Promise<void>;
  onClose: () => void;
  loading: boolean;
}
function PaymentModal({ credit, onConfirm, onClose, loading }: PaymentModalProps) {
  const remaining = credit.total_amount - (credit.amount_paid || 0);
  const [amount, setAmount] = useState(String(Math.round(remaining)));
  const [method, setMethod] = useState('Especes');
  const parsed = parseInt(amount) || 0;
  const invalid = parsed <= 0 || parsed > remaining;

  const METHODS = [
    { key: 'Especes',          label: 'Espèces'      },
    { key: 'MTN Mobile Money', label: 'MTN MM'       },
    { key: 'Airtel Money',     label: 'Airtel'       },
    { key: 'Carte Bancaire',   label: 'Carte'        },
  ];

  return (
    <div style={{ position:'fixed', inset:0, zIndex:999, background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'rgba(255,255,255,0.96)', borderRadius:16, width:'100%', maxWidth:440, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding:'18px 22px 16px', borderBottom:`1px solid ${C.hairline}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:16, fontWeight:600, color:C.ink, letterSpacing:'-0.02em' }}>Enregistrer un paiement</div>
          <button onClick={onClose} style={{ background:C.bg, border:'none', borderRadius:8, width:30, height:30, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <X size={14} color={C.inkMute}/>
          </button>
        </div>

        <div style={{ padding:'20px 22px 22px', display:'flex', flexDirection:'column', gap:18 }}>
          {/* Credit summary */}
          <div style={{ background:`${C.brand}08`, borderRadius:10, padding:'12px 16px' }}>
            <div style={{ fontSize:12, color:C.inkMute, marginBottom:4 }}>{credit.client_name}</div>
            <div style={{ display:'flex', gap:24 }}>
              <div>
                <div style={{ fontSize:10.5, color:C.inkFaint }}>Montant initial</div>
                <div style={{ fontSize:15, fontWeight:600, fontFamily:C.fm, color:C.ink }}>{fmt(credit.total_amount)} FC</div>
              </div>
              <div>
                <div style={{ fontSize:10.5, color:C.inkFaint }}>Restant dû</div>
                <div style={{ fontSize:15, fontWeight:700, fontFamily:C.fm, color:C.red }}>{fmt(remaining)} FC</div>
              </div>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label style={{ display:'block', fontSize:12, fontWeight:550, color:C.inkMute, marginBottom:6 }}>Montant à régler (FC)</label>
            <input
              type="number" value={amount} onChange={e => setAmount(e.target.value)}
              style={{ width:'100%', height:44, border:`1.5px solid ${invalid && amount ? C.red : C.brand}`, borderRadius:8, padding:'0 12px', fontSize:18, fontWeight:700, background:'transparent', color:C.ink, fontFamily:C.fm, outline:'none', boxSizing:'border-box' }}
            />
            {invalid && amount && (
              <div style={{ fontSize:11.5, color:C.red, marginTop:4 }}>
                {parsed > remaining ? `Dépasse le solde restant (${fmt(remaining)} FC)` : 'Montant invalide'}
              </div>
            )}
          </div>

          {/* Methods */}
          <div>
            <label style={{ display:'block', fontSize:12, fontWeight:550, color:C.inkMute, marginBottom:8 }}>Mode de paiement</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {METHODS.map(({ key, label }) => {
                const active = method === key;
                return (
                  <button key={key} onClick={() => setMethod(key)} style={{ padding:'9px 8px', borderRadius:9, border:`1.5px solid ${active ? C.brand : C.hairline}`, background:active ? C.brandLt : 'transparent', color:active ? C.brand : C.inkSoft, cursor:'pointer', fontFamily:C.f, fontSize:12.5, fontWeight:550, transition:'all 0.12s' }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
            <button onClick={onClose} style={{ background:'transparent', border:`1px solid ${C.hairline}`, borderRadius:8, padding:'9px 18px', fontSize:13, color:C.inkSoft, cursor:'pointer', fontFamily:C.f }}>
              Annuler
            </button>
            <button
              onClick={() => onConfirm(parsed, method)}
              disabled={invalid || loading}
              style={{ background:C.brand, color:'#fff', border:'none', borderRadius:8, padding:'9px 22px', fontSize:13, fontWeight:600, cursor:invalid || loading ? 'not-allowed' : 'pointer', fontFamily:C.f, opacity:invalid || loading ? 0.5 : 1, display:'flex', alignItems:'center', gap:8 }}
            >
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
interface NewCreditModalProps {
  onClose: () => void;
  onCreated: (credit: Omit<Credit, 'id' | 'created_at'>) => void;
}
function NewCreditModal({ onClose, onCreated }: NewCreditModalProps) {
  const [clientName, setClientName]   = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientType, setClientType]   = useState<'particulier' | 'entreprise'>('particulier');
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
      client_name: clientName.trim(),
      client_phone: clientPhone.trim() || null,
      due_date: dueDate || null,
      total_amount: parseInt(amount),
      amount_paid: 0,
      status: 'unpaid' as const,
      sale_date: now,
      paid_at: null,
      payment_method: null,
      items: [],
      notes: [clientType === 'entreprise' ? '[Entreprise]' : '', notes].filter(Boolean).join(' ') || null,
    };

    try {
      if (navigator.onLine) {
        const { data, error } = await insertWithUserId('credits', [credit]);
        if (!error && data?.[0]) {
          onCreated({ ...credit, ...data[0] });
        } else {
          onCreated({ ...credit, id: `local-${Date.now()}`, created_at: now } as any);
        }
      } else {
        onCreated({ ...credit, id: `local-${Date.now()}`, created_at: now } as any);
      }
    } catch {
      onCreated({ ...credit, id: `local-${Date.now()}`, created_at: now } as any);
    }
    setSaving(false);
  };

  const minDate = new Date().toISOString().split('T')[0];

  return (
    <div style={{ position:'fixed', inset:0, zIndex:999, background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'rgba(255,255,255,0.96)', borderRadius:16, width:'100%', maxWidth:480, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }}>
        <div style={{ padding:'18px 22px 16px', borderBottom:`1px solid ${C.hairline}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:16, fontWeight:600, color:C.ink, letterSpacing:'-0.02em' }}>Nouveau crédit</div>
          <button onClick={onClose} style={{ background:C.bg, border:'none', borderRadius:8, width:30, height:30, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <X size={14} color={C.inkMute}/>
          </button>
        </div>

        <div style={{ padding:'20px 22px 22px', display:'flex', flexDirection:'column', gap:16 }}>
          {/* Type client */}
          <div>
            <label style={{ display:'block', fontSize:12, fontWeight:550, color:C.inkMute, marginBottom:8 }}>Type de client</label>
            <div style={{ display:'flex', gap:8 }}>
              {(['particulier', 'entreprise'] as const).map(t => (
                <button key={t} onClick={() => setClientType(t)} style={{ flex:1, padding:'9px 8px', borderRadius:9, border:`1.5px solid ${clientType === t ? C.brand : C.hairline}`, background:clientType === t ? C.brandLt : 'transparent', color:clientType === t ? C.brand : C.inkSoft, cursor:'pointer', fontFamily:C.f, fontSize:13, fontWeight:550, textTransform:'capitalize', transition:'all 0.12s' }}>
                  {t === 'particulier' ? '👤 Particulier' : '🏢 Entreprise'}
                </button>
              ))}
            </div>
          </div>

          {/* Nom + téléphone */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={{ display:'block', fontSize:12, fontWeight:550, color:C.inkMute, marginBottom:6 }}>
                {clientType === 'entreprise' ? 'Nom entreprise *' : 'Nom client *'}
              </label>
              <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder={clientType === 'entreprise' ? 'SARL Biomed...' : 'M. Kabila...'} style={{ width:'100%', height:40, border:`1.5px solid ${C.hairline}`, borderRadius:8, padding:'0 12px', fontSize:13, background:'transparent', color:C.ink, fontFamily:C.f, outline:'none', boxSizing:'border-box' }}
                onFocus={e => (e.target.style.borderColor = C.brand)} onBlur={e => (e.target.style.borderColor = C.hairline)}/>
            </div>
            <div>
              <label style={{ display:'block', fontSize:12, fontWeight:550, color:C.inkMute, marginBottom:6 }}>Téléphone</label>
              <input type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="+243 81..." style={{ width:'100%', height:40, border:`1.5px solid ${C.hairline}`, borderRadius:8, padding:'0 12px', fontSize:13, background:'transparent', color:C.ink, fontFamily:C.f, outline:'none', boxSizing:'border-box' }}
                onFocus={e => (e.target.style.borderColor = C.brand)} onBlur={e => (e.target.style.borderColor = C.hairline)}/>
            </div>
          </div>

          {/* Montant + échéance */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={{ display:'block', fontSize:12, fontWeight:550, color:C.inkMute, marginBottom:6 }}>Montant (FC) *</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" style={{ width:'100%', height:40, border:`1.5px solid ${C.hairline}`, borderRadius:8, padding:'0 12px', fontSize:14, fontWeight:600, background:'transparent', color:C.ink, fontFamily:C.fm, outline:'none', boxSizing:'border-box' }}
                onFocus={e => (e.target.style.borderColor = C.brand)} onBlur={e => (e.target.style.borderColor = C.hairline)}/>
            </div>
            <div>
              <label style={{ display:'block', fontSize:12, fontWeight:550, color:C.inkMute, marginBottom:6 }}>Date d'échéance</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} min={minDate} style={{ width:'100%', height:40, border:`1.5px solid ${C.hairline}`, borderRadius:8, padding:'0 12px', fontSize:13, background:'transparent', color:C.ink, fontFamily:C.f, outline:'none', boxSizing:'border-box' }}
                onFocus={e => (e.target.style.borderColor = C.brand)} onBlur={e => (e.target.style.borderColor = C.hairline)}/>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ display:'block', fontSize:12, fontWeight:550, color:C.inkMute, marginBottom:6 }}>Notes / Objet</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Commande médicaments, accord de paiement…" rows={2}
              style={{ width:'100%', border:`1.5px solid ${C.hairline}`, borderRadius:8, padding:'8px 12px', fontSize:13, background:'transparent', color:C.ink, fontFamily:C.f, outline:'none', resize:'none', boxSizing:'border-box', lineHeight:1.5 }}
              onFocus={e => (e.target.style.borderColor = C.brand)} onBlur={e => (e.target.style.borderColor = C.hairline)}/>
          </div>

          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
            <button onClick={onClose} style={{ background:'transparent', border:`1px solid ${C.hairline}`, borderRadius:8, padding:'9px 18px', fontSize:13, color:C.inkSoft, cursor:'pointer', fontFamily:C.f }}>
              Annuler
            </button>
            <button onClick={handleSubmit} disabled={!valid || saving}
              style={{ background:valid && !saving ? C.brand : C.hairline, color:valid && !saving ? '#fff' : C.inkMute, border:'none', borderRadius:8, padding:'9px 22px', fontSize:13, fontWeight:600, cursor:!valid || saving ? 'not-allowed' : 'pointer', fontFamily:C.f, display:'flex', alignItems:'center', gap:8, transition:'all 0.12s' }}>
              {saving ? <div style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:99, animation:'spin 0.8s linear infinite' }}/> : <Plus size={14}/>}
              Créer le crédit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Carnet() {
  const { isDesktop } = useResponsive();
  const [credits, setCredits]           = useState<Credit[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState<'all' | 'actif' | 'partiel' | 'solde'>('actif');
  const [search, setSearch]             = useState('');
  const [payModal, setPayModal]         = useState<Credit | null>(null);
  const [payLoading, setPayLoading]     = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [expandedId, setExpandedId]     = useState<string | null>(null);

  // Écouter le raccourci topbar "Nouveau crédit"
  useEffect(() => {
    const handler = (e: Event) => {
      const { action } = (e as CustomEvent<{ action: string }>).detail;
      if (action === 'add-credit') setShowNewModal(true);
    };
    window.addEventListener('topbar-action', handler);
    return () => window.removeEventListener('topbar-action', handler);
  }, []);

  const loadCredits = useCallback(async () => {
    setLoading(true);
    const cached = offlineStorage.getCachedCredits();
    if (cached.length > 0) {
      setCredits(cached as Credit[]);
      setLoading(false);
    }
    if (navigator.onLine) {
      try {
        // ⚠ Filtrer par user_id pour garantir l'isolation des comptes
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from('credits').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        if (!error && data) {
          const parsed = data.map((c: any) => ({
            ...c,
            amount_paid: c.amount_paid ?? 0,
            items: Array.isArray(c.items) ? c.items : [],
          })) as Credit[];
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
          sale_date: new Date().toISOString(),
          medication_id: credit.items[0]?.medication_id || null,
          medication_name: credit.client_name,
          quantity_sold: credit.items.reduce((s, i) => s + i.quantity, 0) || 1,
          unit_price: amount,
          total_price: amount,
          payment_method: method,
          stock_after_sale: 0,
          synced: true,
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

  const handleCreditCreated = (credit: any) => {
    setCredits(prev => [credit, ...prev]);
    setShowNewModal(false);
  };

  const handleWhatsApp = (credit: Credit) => {
    const remaining = Math.round(credit.total_amount - (credit.amount_paid || 0));
    const due = credit.due_date ? new Date(credit.due_date).toLocaleDateString('fr-FR') : 'dès que possible';
    const msg = `Bonjour ${credit.client_name},\n\nNous vous rappelons qu'un crédit de *${fmt(remaining)} FC* est en attente de règlement auprès de *JunglePharm*.\n\nÉchéance : ${due}\n\nMerci de procéder au paiement dans les meilleurs délais.`;
    const phone = credit.client_phone?.replace(/[\s+]/g, '') || '';
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // ── KPIs ──
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const totalDu      = credits.filter(c => c.status !== 'paid').reduce((s, c) => s + (c.total_amount - (c.amount_paid || 0)), 0);
  const actifCount   = credits.filter(c => getVisualStatus(c) !== 'solde').length;
  const soldeCount   = credits.filter(c => c.status === 'paid' && (c.paid_at || c.sale_date || '').startsWith(thisMonth)).length;
  const overdueCount = credits.filter(c => isOverdue(c)).length;

  // ── Filtered list ──
  const filtered = useMemo(() => {
    return credits.filter(c => {
      const vs = getVisualStatus(c);
      if (filter !== 'all' && vs !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.client_name.toLowerCase().includes(q) && !(c.client_phone || '').includes(q)) return false;
      }
      return true;
    });
  }, [credits, filter, search]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: C.f, color: C.ink }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── KPI Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { lbl: 'Total dû',        val: `${fmt(totalDu)} FC`,      color: C.red,   bg: C.redLt   },
          { lbl: 'Crédits actifs',  val: String(actifCount),        color: C.amber, bg: C.amberLt },
          { lbl: 'Soldés ce mois',  val: String(soldeCount),        color: C.brand, bg: C.brandLt },
          { lbl: 'En retard',       val: String(overdueCount),      color: overdueCount > 0 ? C.red : C.inkMute, bg: overdueCount > 0 ? C.redLt : C.bg },
        ].map((s, i) => (
          <div key={i} style={{ ...card, padding: '16px 20px' }}>
            <div style={{ fontSize: 12, color: C.inkMute, marginBottom: 6 }}>{s.lbl}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color, letterSpacing: '-0.03em', fontFamily: C.fm }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* ── Search + Filters + New button ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: isDesktop ? '0 0 240px' : 1 }}>
          <Search size={13} color={C.inkMute} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}/>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un client…"
            style={{ width: '100%', height: 36, paddingLeft: 32, paddingRight: 10, border: `1px solid ${C.hairline}`, borderRadius: 8, fontSize: 13, background: C.panel2, color: C.ink, fontFamily: C.f, outline: 'none', boxSizing: 'border-box' }}
            onFocus={e => (e.target.style.borderColor = C.brand)} onBlur={e => (e.target.style.borderColor = C.hairline)}
          />
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', background: 'rgba(232,239,233,0.6)', padding: 3, borderRadius: 8, border: `1px solid ${C.hairline}`, gap: 2 }}>
          {([
            { id: 'all'    as const, label: 'Tous'       },
            { id: 'actif'  as const, label: 'À régler'   },
            { id: 'partiel'as const, label: 'Partiel'    },
            { id: 'solde'  as const, label: 'Soldé'      },
          ]).map(({ id, label }) => (
            <button key={id} onClick={() => setFilter(id)} style={{
              border: 'none', background: filter === id ? C.panel : 'transparent',
              color: filter === id ? C.ink : C.inkMute, fontSize: 12, fontWeight: 500,
              padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontFamily: C.f,
              boxShadow: filter === id ? `0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px ${C.hairline}` : 'none',
              transition: 'all 0.1s', whiteSpace: 'nowrap',
            }}>{label}</button>
          ))}
        </div>

        {/* Refresh */}
        <button onClick={loadCredits} style={{ background: C.panel2, border: `1px solid ${C.hairline}`, borderRadius: 8, width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <RefreshCw size={13} color={C.inkMute}/>
        </button>

        <div style={{ flex: 1 }}/>

        {/* New credit button */}
        <button onClick={() => setShowNewModal(true)} style={{ background: C.ink, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '-0.01em', boxShadow: '0 1px 3px rgba(0,0,0,0.12)', flexShrink: 0 }}>
          <Plus size={14} strokeWidth={2.5}/> Nouveau crédit
        </button>
      </div>

      {/* ── Credits list ── */}
      {loading && credits.length === 0 ? (
        <div style={{ padding: '64px 0', textAlign: 'center' }}>
          <div style={{ width: 28, height: 28, border: `3px solid ${C.amber}`, borderTopColor: 'transparent', borderRadius: 99, animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }}/>
          <p style={{ fontSize: 13, color: C.inkMute }}>Chargement...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <p style={{ fontSize: 14, color: C.inkMute, fontWeight: 500 }}>
            {search ? `Aucun résultat pour "${search}"` : filter === 'actif' ? 'Aucun crédit en attente' : filter === 'partiel' ? 'Aucun paiement partiel' : filter === 'solde' ? 'Aucun crédit soldé' : 'Aucun crédit enregistré'}
          </p>
        </div>
      ) : (
        <div style={{ ...card, overflow: 'hidden' }}>
          {isDesktop ? (
            /* ── Desktop : table layout ── */
            <>
              {filtered.map((cr, idx) => {
                const vs       = getVisualStatus(cr);
                const st       = STATUS_MAP[vs];
                const remaining = cr.total_amount - (cr.amount_paid || 0);
                const pct      = cr.total_amount > 0 ? Math.round(((cr.amount_paid || 0) / cr.total_amount) * 100) : 0;
                const overdue  = isOverdue(cr);
                const expanded = expandedId === cr.id;

                return (
                  <div key={cr.id} style={{ borderBottom: idx < filtered.length - 1 ? `1px solid ${C.hairline}` : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px' }}>

                      {/* Avatar */}
                      <Avatar name={cr.client_name} idx={idx} size={40}/>

                      {/* Info + progress */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, letterSpacing: '-0.01em' }}>{cr.client_name}</span>
                          {overdue && <Pill color="red">En retard</Pill>}
                          {cr.notes?.includes('[Entreprise]') && <Pill color="blue">Entreprise</Pill>}
                        </div>
                        <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 2 }}>
                          {formatDate(cr.sale_date)}
                          {cr.client_phone && <> · <span style={{ fontFamily: C.fm }}>{cr.client_phone}</span></>}
                        </div>
                        {/* Progress bar */}
                        <div style={{ marginTop: 7, height: 4, borderRadius: 99, background: C.hairline, overflow: 'hidden', maxWidth: 200 }}>
                          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: pct === 100 ? C.brand : C.amber, transition: 'width 0.3s' }}/>
                        </div>
                      </div>

                      {/* Montant initial */}
                      <div style={{ textAlign: 'right', width: 110, flexShrink: 0 }}>
                        <div style={{ fontSize: 10.5, color: C.inkFaint, marginBottom: 2 }}>Initial</div>
                        <div style={{ fontSize: 13, fontFamily: C.fm, color: C.inkSoft }}>{fmt(cr.total_amount)} FC</div>
                      </div>

                      {/* Restant */}
                      <div style={{ textAlign: 'right', width: 130, flexShrink: 0 }}>
                        <div style={{ fontSize: 10.5, color: C.inkFaint, marginBottom: 2 }}>Restant</div>
                        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: C.fm, color: vs === 'solde' ? C.brand : C.red }}>{fmt(remaining)} FC</div>
                      </div>

                      {/* Échéance */}
                      <div style={{ textAlign: 'right', width: 90, flexShrink: 0 }}>
                        <div style={{ fontSize: 10.5, color: C.inkFaint, marginBottom: 2 }}>Échéance</div>
                        <div style={{ fontSize: 12, color: overdue ? C.red : C.inkSoft }}>
                          {cr.due_date ? new Date(cr.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—'}
                        </div>
                      </div>

                      {/* Status pill */}
                      <Pill color={st.color}>{st.label}</Pill>

                      {/* Actions */}
                      {vs !== 'solde' ? (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {cr.client_phone && (
                            <button onClick={() => handleWhatsApp(cr)} title="Relancer sur WhatsApp" style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#128c7e', fontWeight: 600, fontFamily: C.f }}>
                              <MessageSquare size={13}/>
                            </button>
                          )}
                          <button onClick={() => setPayModal(cr)} style={{ background: C.brand, color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: C.f, whiteSpace: 'nowrap' }}>
                            + Paiement
                          </button>
                        </div>
                      ) : (
                        <div style={{ width: 98, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Check size={16} color={C.brand}/>
                        </div>
                      )}

                      {/* Expand toggle */}
                      <button onClick={() => setExpandedId(expanded ? null : cr.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: C.inkMute, display: 'flex' }}>
                        <ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}/>
                      </button>
                    </div>

                    {/* Expanded: items + payment history */}
                    {expanded && (
                      <div style={{ padding: '0 20px 16px 74px', borderTop: `1px solid ${C.hairline}`, paddingTop: 12 }}>
                        {cr.items.length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkMute, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Articles</div>
                            {cr.items.map((item, j) => (
                              <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: C.inkSoft, marginBottom: 4 }}>
                                <span>{item.medication_name} × {item.quantity}</span>
                                <span style={{ fontFamily: C.fm, fontWeight: 600 }}>{fmt(item.subtotal)} FC</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {cr.notes && !cr.notes.startsWith('[Entreprise]') && (
                          <div style={{ fontSize: 12, color: C.inkMute, fontStyle: 'italic', marginBottom: 8 }}>{cr.notes.replace('[Entreprise]', '').trim()}</div>
                        )}
                        {vs === 'solde' && cr.paid_at && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.brand }}>
                            <Check size={13}/>
                            Soldé le {formatDate(cr.paid_at)} · {cr.payment_method}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            /* ── Mobile : card layout ── */
            <>
              {filtered.map((cr, idx) => {
                const vs        = getVisualStatus(cr);
                const st        = STATUS_MAP[vs];
                const remaining = cr.total_amount - (cr.amount_paid || 0);
                const pct       = cr.total_amount > 0 ? Math.round(((cr.amount_paid || 0) / cr.total_amount) * 100) : 0;
                const overdue   = isOverdue(cr);
                const expanded  = expandedId === cr.id;

                return (
                  <div key={cr.id} style={{ borderBottom: idx < filtered.length - 1 ? `1px solid ${C.hairline}` : 'none' }}>
                    <button onClick={() => setExpandedId(expanded ? null : cr.id)} style={{ width: '100%', padding: '14px 16px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <Avatar name={cr.client_name} idx={idx} size={38}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{cr.client_name}</span>
                            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: C.fm, color: vs === 'solde' ? C.brand : C.red }}>{fmt(remaining)} FC</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                            <span style={{ fontSize: 11.5, color: C.inkMute }}>{formatDate(cr.sale_date)}</span>
                            {overdue && <Pill color="red">En retard</Pill>}
                            {!overdue && <Pill color={st.color}>{st.label}</Pill>}
                          </div>
                          <div style={{ marginTop: 7, height: 3, borderRadius: 99, background: C.hairline, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: pct === 100 ? C.brand : C.amber }}/>
                          </div>
                        </div>
                      </div>
                    </button>

                    {expanded && (
                      <div style={{ padding: '0 16px 14px 66px' }}>
                        {cr.due_date && <div style={{ fontSize: 12, color: overdue ? C.red : C.inkMute, marginBottom: 8 }}>Échéance : {formatDate(cr.due_date)}</div>}
                        {cr.items.length > 0 && cr.items.map((item, j) => (
                          <div key={j} style={{ fontSize: 12, color: C.inkSoft, marginBottom: 3 }}>{item.medication_name} × {item.quantity} = {fmt(item.subtotal)} FC</div>
                        ))}
                        {vs !== 'solde' && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            {cr.client_phone && (
                              <button onClick={() => handleWhatsApp(cr)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid rgba(37,211,102,0.25)', background: 'rgba(37,211,102,0.07)', color: '#128c7e', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                                <MessageSquare size={14}/> Relancer
                              </button>
                            )}
                            <button onClick={() => setPayModal(cr)} style={{ flex: 2, padding: '10px', borderRadius: 10, background: C.brand, color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                              + Paiement
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {payModal && (
        <PaymentModal
          credit={payModal}
          onConfirm={(amount, method) => handlePayment(payModal, amount, method)}
          onClose={() => setPayModal(null)}
          loading={payLoading}
        />
      )}
      {showNewModal && (
        <NewCreditModal
          onClose={() => setShowNewModal(false)}
          onCreated={handleCreditCreated}
        />
      )}
    </div>
  );
}
