import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, X, AlertTriangle, Phone, MapPin, Edit3, Trash2, ChevronRight, UserPlus, FileText, Loader2, MessageCircle, ArrowRight } from 'lucide-react';
import { usePatients, Patient, PatientPurchase, PatientType, computePatientType } from '../lib/usePatients';
import { useOrdonnances, OrdStatus, Ordonnance } from '../lib/useOrdonnances';

// ── Design tokens (Chalk Premium) ─────────────────────────────────────────────
const C = {
  panel:      'rgba(255,255,255,0.92)',
  panel2:     '#ffffff',
  hairline:   'rgba(15,15,20,0.08)',
  border:     'rgba(15,15,20,0.10)',
  bg:         'rgba(15,15,20,0.028)',
  brand:      '#10785a',
  brandLt:    'rgba(16,120,90,0.08)',
  brandMid:   'rgba(16,120,90,0.14)',
  ink:        '#0a0e14',
  inkSoft:    '#2c3138',
  inkMute:    '#6b7280',
  inkFaint:   '#9aa0a8',
  inkGhost:   '#c8ccd2',
  red:        '#c81e1e', redLt:  'rgba(200,30,30,0.08)',
  amber:      '#b75f06', amberLt:'rgba(183,95,6,0.09)',
  blue:       '#0651bc', blueLt: 'rgba(6,81,188,0.07)',
  green:      '#15803d', greenLt:'rgba(21,128,61,0.08)',
  f:  '-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",Inter,system-ui,sans-serif',
  fm: '"SF Mono","Geist Mono",ui-monospace,Menlo,monospace',
};

const GRADIENTS = [
  'linear-gradient(135deg,#7c3aed,#a78bfa)',
  'linear-gradient(135deg,#0f766e,#2dd4bf)',
  'linear-gradient(135deg,#c81e1e,#e85555)',
  'linear-gradient(135deg,#b75f06,#e08533)',
  'linear-gradient(135deg,#0651bc,#3b86e0)',
  'linear-gradient(135deg,#10785a,#149a73)',
  'linear-gradient(135deg,#6e44b0,#9b6dd6)',
  'linear-gradient(135deg,#0891b2,#22d3ee)',
];

export type { PatientType, PatientPurchase, Patient };
const getPatientType = computePatientType;

function getInitials(name: string) {
  return name.trim().split(/\s+/).map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
}
const fmt  = (n: number) => n.toLocaleString('fr-FR');
const fmtk = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n));

function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
function formatShort(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}
function relativeDate(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Hier';
  return formatShort(iso);
}

const ORD_STATUS: Record<OrdStatus, { label: string; bg: string; fg: string }> = {
  en_attente: { label: 'En attente', bg: 'rgba(183,95,6,0.09)',  fg: '#b75f06' },
  partielle:  { label: 'En cours',   bg: 'rgba(6,81,188,0.09)',  fg: '#0651bc' },
  terminee:   { label: 'Terminée',   bg: 'rgba(16,120,90,0.08)', fg: '#10785a' },
};

// ── Avatar ─────────────────────────────────────────────────────────────────────
function Avatar({ name, idx, size = 40, round = false }: { name: string; idx: number; size?: number; round?: boolean }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: round ? size : size * 0.28,
      background: GRADIENTS[idx % GRADIENTS.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.34, fontWeight: 700,
      letterSpacing: '-0.01em', flexShrink: 0,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    }}>
      {getInitials(name)}
    </div>
  );
}

// ── TypePill ──────────────────────────────────────────────────────────────────
const TYPE_STYLE: Record<PatientType, { bg: string; text: string }> = {
  fidèle:     { bg: 'rgba(16,120,90,0.1)',  text: '#10785a' },
  récurrent:  { bg: 'rgba(6,81,188,0.1)',   text: '#0651bc' },
  occasionnel:{ bg: 'rgba(0,0,0,0.06)',      text: '#6b7280' },
};
function TypePill({ type }: { type: PatientType }) {
  const s = TYPE_STYLE[type];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: s.bg, color: s.text, borderRadius: 99, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
      <span style={{ width: 4, height: 4, borderRadius: 99, background: s.text }} />
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
}

// ── TagsInput ─────────────────────────────────────────────────────────────────
function TagsInput({ tags, onChange, placeholder, colorScheme = 'green' }: {
  tags: string[]; onChange: (tags: string[]) => void; placeholder: string; colorScheme?: 'green' | 'red';
}) {
  const [input, setInput] = useState('');
  const bg    = colorScheme === 'red' ? 'rgba(200,30,30,0.08)' : C.brandLt;
  const color = colorScheme === 'red' ? C.red : C.brand;
  const add = () => { const v = input.trim(); if (v && !tags.includes(v)) onChange([...tags, v]); setInput(''); };
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
        {tags.map(t => (
          <span key={t} style={{ background: bg, color, borderRadius: 99, padding: '3px 8px', fontSize: 11.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
            {t}
            <button onClick={() => onChange(tags.filter(x => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color, display: 'flex', lineHeight: 1 }}><X size={10} strokeWidth={2} /></button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={placeholder}
          style={{ flex: 1, height: 30, padding: '0 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, background: C.panel2, color: C.ink, outline: 'none', fontFamily: C.f }} />
        <button onClick={add} style={{ width: 30, height: 30, border: 'none', borderRadius: 6, background: C.brandLt, color: C.brand, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Plus size={13} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

// ── Patient Modal (add / edit) ────────────────────────────────────────────────
function PatientModal({ patient, onSave, onClose, saving = false }: {
  patient?: Patient | null; onSave: (p: Patient) => void | Promise<void>; onClose: () => void; saving?: boolean;
}) {
  const isEdit = !!patient;
  const [form, setForm] = useState({
    name: patient?.name || '', phone: patient?.phone || '',
    email: patient?.email || '', address: patient?.address || '',
    dob: patient?.dob || '', notes: patient?.notes || '',
    allergies: patient?.allergies || [] as string[],
    therapeutic_profile: patient?.therapeutic_profile || [] as string[],
  });
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));
  const canSave = form.name.trim() && form.phone.trim();

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id: patient?.id || `__new__${Date.now()}`,
      name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(),
      address: form.address.trim(), dob: form.dob,
      type: getPatientType(patient?.purchases.length || 0),
      allergies: form.allergies, therapeutic_profile: form.therapeutic_profile, notes: form.notes,
      created_at: patient?.created_at || new Date().toISOString(),
      purchases: patient?.purchases || [],
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 540, maxHeight: '90vh', background: C.panel2, borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: C.f }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: C.brandLt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserPlus size={15} color={C.brand} strokeWidth={1.5} />
            </div>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>{isEdit ? 'Modifier le patient' : 'Nouveau patient'}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={C.inkMute} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {([
              { lbl: 'Nom complet *', key: 'name', ph: 'Ex: Jean Dupont' },
              { lbl: 'Téléphone *', key: 'phone', ph: '+243 8XX XXX XXX' },
              { lbl: 'Email', key: 'email', ph: 'patient@email.com' },
              { lbl: 'Adresse', key: 'address', ph: 'Quartier, commune' },
              { lbl: 'Date de naissance', key: 'dob', ph: '', type: 'date' },
            ] as const).map(({ lbl, key, ph, type }) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{lbl}</label>
                <input type={type || 'text'} value={form[key as keyof typeof form] as string} onChange={e => set(key as keyof typeof form, e.target.value)} placeholder={ph}
                  style={{ width: '100%', height: 34, padding: '0 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, background: C.panel2, color: C.ink, outline: 'none', boxSizing: 'border-box', fontFamily: C.f }} />
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: C.red, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>⚠ Allergies connues</label>
            <TagsInput tags={form.allergies} onChange={v => setForm(f => ({ ...f, allergies: v }))} placeholder="Pénicilline, Aspirine… (Entrée)" colorScheme="red" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Profil thérapeutique</label>
            <TagsInput tags={form.therapeutic_profile} onChange={v => setForm(f => ({ ...f, therapeutic_profile: v }))} placeholder="Diabète, HTA, Paludisme… (Entrée)" colorScheme="green" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Observations, mutuelle, médecin traitant…" rows={3}
              style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12.5, background: C.panel2, color: C.ink, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: C.f }} />
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.hairline}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent', color: C.inkSoft, fontSize: 13, cursor: 'pointer', fontFamily: C.f }}>Annuler</button>
          <button onClick={handleSave} disabled={!canSave || saving} style={{ padding: '8px 20px', border: 'none', borderRadius: 8, background: canSave && !saving ? C.ink : C.inkGhost, color: canSave && !saving ? '#fff' : C.inkFaint, fontSize: 13, fontWeight: 600, cursor: canSave && !saving ? 'pointer' : 'default', fontFamily: C.f, display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving && <div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin 0.8s linear infinite' }} />}
            {isEdit ? 'Enregistrer' : 'Créer le patient'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Purchase Modal ────────────────────────────────────────────────────────
function AddPurchaseModal({ onSave, onClose }: { onSave: (p: PatientPurchase) => void; onClose: () => void }) {
  const [date, setDate]   = useState(new Date().toISOString().split('T')[0]);
  const [ticket, setTicket] = useState('');
  const [items, setItems]  = useState('');
  const [total, setTotal]  = useState('');
  const [method, setMethod] = useState('espèces');
  const canSave = date && parseFloat(total) > 0;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 400, background: C.panel2, borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.18)', fontFamily: C.f }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Ajouter un achat</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color={C.inkMute} /></button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {([
              { lbl: 'Date *', key: 'date', type: 'date', val: date, set: setDate },
              { lbl: 'N° Ticket', key: 'ticket', type: 'text', val: ticket, set: setTicket, ph: 'T-001' },
            ] as const).map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{f.lbl}</label>
                <input type={f.type} value={f.val} onChange={e => (f.set as (v: string) => void)(e.target.value)} placeholder={'ph' in f ? f.ph : undefined}
                  style={{ width: '100%', height: 32, padding: '0 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12.5, background: C.panel2, color: C.ink, outline: 'none', boxSizing: 'border-box', fontFamily: C.f }} />
              </div>
            ))}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Produits achetés</label>
            <input value={items} onChange={e => setItems(e.target.value)} placeholder="Paracétamol, Amoxicilline… (virgule)"
              style={{ width: '100%', height: 32, padding: '0 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12.5, background: C.panel2, color: C.ink, outline: 'none', boxSizing: 'border-box', fontFamily: C.f }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Total (FC) *</label>
              <input type="number" value={total} onChange={e => setTotal(e.target.value)} placeholder="0"
                style={{ width: '100%', height: 32, padding: '0 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12.5, background: C.panel2, color: C.ink, outline: 'none', boxSizing: 'border-box', fontFamily: C.f }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Paiement</label>
              <select value={method} onChange={e => setMethod(e.target.value)}
                style={{ width: '100%', height: 32, padding: '0 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12.5, background: C.panel2, color: C.ink, outline: 'none', boxSizing: 'border-box', fontFamily: C.f }}>
                {['espèces', 'mobile money', 'carte', 'crédit'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.hairline}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 14px', border: `1px solid ${C.border}`, borderRadius: 7, background: 'transparent', color: C.inkSoft, fontSize: 12.5, cursor: 'pointer', fontFamily: C.f }}>Annuler</button>
          <button onClick={() => { if (!canSave) return; onSave({ id: `pur_${Date.now()}`, date: new Date(date).toISOString(), ticket: ticket || `T-${Date.now().toString().slice(-6)}`, items: items.split(',').map(s => s.trim()).filter(Boolean), total: parseFloat(total), payment_method: method }); }}
            disabled={!canSave}
            style={{ padding: '7px 18px', border: 'none', borderRadius: 7, background: canSave ? C.brand : C.inkGhost, color: canSave ? '#fff' : C.inkFaint, fontSize: 12.5, fontWeight: 600, cursor: canSave ? 'pointer' : 'default', fontFamily: C.f }}>
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Patient Detail Panel ──────────────────────────────────────────────────────
function PatientDetail({ patient, idx, patOrdonnances, onEdit, onDelete, onAddPurchase }: {
  patient: Patient; idx: number; patOrdonnances: Ordonnance[];
  onEdit: () => void; onDelete: () => void; onAddPurchase: (p: PatientPurchase) => void;
}) {
  const [showAddPurchase, setShowAddPurchase] = useState(false);

  const sortedPurchases = useMemo(() => [...patient.purchases].sort((a, b) => b.date.localeCompare(a.date)), [patient.purchases]);
  const totalSpent = patient.purchases.reduce((s, p) => s + p.total, 0);
  const avgBasket  = patient.purchases.length > 0 ? Math.round(totalSpent / patient.purchases.length) : 0;
  const lastPurchase = sortedPurchases[0] ?? null;
  const activeOrds = useMemo(() => patOrdonnances.filter(o => o.status !== 'terminee'), [patOrdonnances]);
  const hasUrgentOrd = activeOrds.some(o => o.status === 'en_attente');

  const age = patient.dob ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / (365.25 * 86400000)) : null;

  const lastVisitLabel = lastPurchase ? relativeDate(lastPurchase.date) : 'Jamais';
  const lastVisitSub   = lastPurchase?.ticket ? `Ticket ${lastPurchase.ticket}` : lastPurchase ? formatShort(lastPurchase.date) : '—';

  // Year-over-year comparison for total spent
  const currYear  = new Date().getFullYear();
  const prevYear  = currYear - 1;
  const spentCurr = patient.purchases.filter(p => new Date(p.date).getFullYear() === currYear).reduce((s, p) => s + p.total, 0);
  const spentPrev = patient.purchases.filter(p => new Date(p.date).getFullYear() === prevYear).reduce((s, p) => s + p.total, 0);
  const yoyPct    = spentPrev > 0 ? Math.round(((spentCurr - spentPrev) / spentPrev) * 100) : null;

  // Avg basket vs all patients average (no global data here, skip subtly)
  const visitsThisYear = patient.purchases.filter(p => new Date(p.date).getFullYear() === currYear).length;

  const freqMeds = useMemo(() => {
    const freq: Record<string, number> = {};
    patient.purchases.forEach(p => p.items.forEach(item => {
      const name = item.split('×')[0]?.trim() || item;
      freq[name] = (freq[name] || 0) + 1;
    }));
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => n);
  }, [patient.purchases]);

  type TimelineRow = { date: string; type: 'achat' | 'ordonnance'; label: string; articles: number; montant: number; status?: string };
  const timeline = useMemo((): TimelineRow[] => {
    const rows: TimelineRow[] = sortedPurchases.map(p => ({ date: p.date, type: 'achat', label: p.ticket || 'Vente libre', articles: p.items.length, montant: p.total }));
    patOrdonnances.forEach(o => rows.push({ date: o.date, type: 'ordonnance', label: o.ref, articles: o.items.length, montant: o.total, status: o.status }));
    return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  }, [sortedPurchases, patOrdonnances]);

  return (
    <>
      <div style={{ flex: 1, borderLeft: `1px solid ${C.hairline}`, display: 'flex', flexDirection: 'column', background: C.panel2, fontFamily: C.f, minWidth: 0, overflow: 'hidden' }}>

        {/* ── HEADER ── */}
        <div style={{ padding: '24px 32px 20px', borderBottom: `1px solid ${C.hairline}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
            {/* Avatar */}
            <Avatar name={patient.name} idx={idx} size={64} round />
            {/* Name + pills + bio */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 26, fontWeight: 700, color: C.ink, letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0 }}>{patient.name}</h2>
                <TypePill type={patient.type} />
                {hasUrgentOrd && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(200,30,30,0.09)', color: C.red, borderRadius: 99, padding: '3px 9px', fontSize: 11.5, fontWeight: 600, border: `1px solid rgba(200,30,30,0.18)` }}>
                    <span style={{ width: 4, height: 4, borderRadius: 99, background: C.red }} />
                    Ordo. urgente
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0, fontSize: 12.5, color: C.inkMute, lineHeight: 1.6 }}>
                {age !== null && <span>F · {age} ans</span>}
                {patient.dob && <><span style={{ margin: '0 8px', color: C.inkGhost }}>·</span><span>née le {formatDate(patient.dob)}</span></>}
                {patient.phone && <><span style={{ margin: '0 8px', color: C.inkGhost }}>·</span><span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={11} strokeWidth={1.5} />{patient.phone}</span></>}
                {patient.address && <><span style={{ margin: '0 8px', color: C.inkGhost }}>·</span><span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={11} strokeWidth={1.5} />{patient.address}</span></>}
              </div>
            </div>
            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignSelf: 'flex-start' }}>
              <button onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: `1px solid ${C.border}`, borderRadius: 9, background: 'transparent', color: C.inkSoft, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: C.f }}>
                <Edit3 size={13} strokeWidth={1.5} /> Modifier
              </button>
              <button onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab: 'sales' } }))}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', border: 'none', borderRadius: 9, background: C.ink, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: C.f }}>
                <FileText size={13} strokeWidth={1.5} /> Nouvelle vente
              </button>
            </div>
          </div>
        </div>

        {/* ── BODY ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 32px' }}>

          {/* 4 Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
            {[
              {
                lbl: 'Total dépensé', val: `${fmt(totalSpent)} FC`, color: C.ink,
                sub: yoyPct !== null ? `${yoyPct >= 0 ? '+' : ''}${yoyPct}% vs an dernier` : `${patient.purchases.length} achat${patient.purchases.length > 1 ? 's' : ''}`,
                subColor: yoyPct !== null ? (yoyPct >= 0 ? C.green : C.red) : C.inkFaint,
              },
              {
                lbl: 'Visites', val: String(patient.purchases.length), color: C.blue,
                sub: visitsThisYear > 0 ? `${visitsThisYear} cette année` : 'enregistrées',
                subColor: C.inkFaint,
              },
              {
                lbl: 'Panier moyen', val: avgBasket > 0 ? `${fmt(avgBasket)} FC` : '—', color: C.brand,
                sub: avgBasket > 0 ? 'par visite' : 'Aucune donnée',
                subColor: C.inkFaint,
              },
              {
                lbl: 'Dernière visite', val: lastVisitLabel, color: C.inkSoft,
                sub: lastVisitSub, subColor: C.inkFaint,
              },
            ].map((s, i) => (
              <div key={i} style={{ background: C.panel, border: `1px solid ${C.hairline}`, borderRadius: 12, padding: '14px 16px', backdropFilter: 'saturate(180%) blur(20px)' }}>
                <div style={{ fontSize: 11, color: C.inkMute, marginBottom: 7 }}>{s.lbl}</div>
                <div style={{ fontSize: i === 3 ? 15 : 22, fontWeight: 700, color: s.color, letterSpacing: i === 3 ? '-0.01em' : '-0.03em', fontFamily: C.fm, lineHeight: 1.15, marginBottom: 5 }}>{s.val}</div>
                <div style={{ fontSize: 11, color: s.subColor, fontWeight: s.subColor === C.green || s.subColor === C.red ? 600 : 400 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Two-column: history + therapeutic profile */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 16, marginBottom: 20 }}>

            {/* LEFT — Historique des achats */}
            <div style={{ background: C.panel, border: `1px solid ${C.hairline}`, borderRadius: 14, overflow: 'hidden', backdropFilter: 'saturate(180%) blur(20px)' }}>
              <div style={{ padding: '14px 18px 12px', borderBottom: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Historique des achats</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setShowAddPurchase(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.brandLt, border: 'none', borderRadius: 6, padding: '3px 9px', fontSize: 11, color: C.brand, fontWeight: 600, cursor: 'pointer', fontFamily: C.f }}>
                    <Plus size={9} strokeWidth={2.5} /> Ajouter
                  </button>
                  <button style={{ fontSize: 11.5, color: C.brand, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3, fontFamily: C.f }}>
                    Voir tout ({timeline.length}) <ArrowRight size={10} strokeWidth={2} />
                  </button>
                </div>
              </div>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 50px 90px', padding: '8px 18px', borderBottom: `1px solid ${C.border}` }}>
                {['DATE', 'TYPE', 'ART.', 'MONTANT'].map(h => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, letterSpacing: '0.07em' }}>{h}</div>
                ))}
              </div>
              {timeline.length === 0 ? (
                <div style={{ padding: '24px 18px', textAlign: 'center', fontSize: 12, color: C.inkFaint, fontStyle: 'italic' }}>Aucun historique</div>
              ) : timeline.map((row, i) => {
                const isOrd = row.type === 'ordonnance';
                const st = isOrd ? ORD_STATUS[row.status as OrdStatus] : null;
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 50px 90px', padding: '10px 18px', borderBottom: i < timeline.length - 1 ? `1px solid ${C.hairline}` : 'none', alignItems: 'center' }}>
                    <div style={{ fontSize: 11.5, color: C.inkMute }}>{formatShort(row.date)}</div>
                    <div>
                      {isOrd ? (
                        <div style={{ display: 'inline-flex', flexDirection: 'column', background: st!.bg, borderRadius: 7, padding: '3px 8px', gap: 1 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: st!.fg }}>{row.label}</span>
                          <span style={{ fontSize: 10, color: st!.fg, opacity: 0.8 }}>{st!.label}</span>
                        </div>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', background: C.bg, borderRadius: 7, padding: '4px 8px', fontSize: 11.5, color: C.inkSoft, fontWeight: 500 }}>Vente libre</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: C.inkMute }}>{row.articles}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: isOrd && row.montant === 0 ? C.inkFaint : C.ink, fontFamily: C.fm }}>
                      {row.montant > 0 ? `${fmt(row.montant)} FC` : '—'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* RIGHT — Profil thérapeutique */}
            <div style={{ background: C.panel, border: `1px solid ${C.hairline}`, borderRadius: 14, overflow: 'hidden', backdropFilter: 'saturate(180%) blur(20px)' }}>
              <div style={{ padding: '14px 18px 12px', borderBottom: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, color: C.brand }}>✦</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Profil thérapeutique</span>
              </div>
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Allergies */}
                <div style={{ background: 'rgba(200,30,30,0.06)', borderRadius: 10, padding: '10px 12px', border: `1px solid rgba(200,30,30,0.12)` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.red, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Allergies</div>
                  <div style={{ fontSize: 12.5, color: C.red, lineHeight: 1.5 }}>
                    {patient.allergies.length > 0 ? patient.allergies.join(' · ') : <span style={{ color: C.inkFaint, fontStyle: 'italic' }}>Aucune allergie déclarée</span>}
                  </div>
                </div>
                {/* Traitements en cours */}
                <div style={{ background: 'rgba(6,81,188,0.06)', borderRadius: 10, padding: '10px 12px', border: `1px solid rgba(6,81,188,0.12)` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.blue, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Traitements en cours</div>
                  <div style={{ fontSize: 12.5, color: C.blue, lineHeight: 1.5 }}>
                    {patient.therapeutic_profile.length > 0 ? patient.therapeutic_profile.join(' · ') : <span style={{ color: C.inkFaint, fontStyle: 'italic' }}>Aucun traitement renseigné</span>}
                  </div>
                </div>
                {/* Médicaments fréquents */}
                <div style={{ background: 'rgba(16,120,90,0.06)', borderRadius: 10, padding: '10px 12px', border: `1px solid rgba(16,120,90,0.12)` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.brand, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Médicaments fréquents</div>
                  <div style={{ fontSize: 12.5, color: C.brand, lineHeight: 1.5 }}>
                    {freqMeds.length > 0 ? freqMeds.join(', ') : <span style={{ color: C.inkFaint, fontStyle: 'italic' }}>Calculé depuis l'historique</span>}
                  </div>
                </div>
                {/* Mutuelle / Notes */}
                <div style={{ background: C.bg, borderRadius: 10, padding: '10px 12px', border: `1px solid ${C.hairline}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Mutuelle / Assurance</div>
                  <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5 }}>
                    {patient.notes ? patient.notes : <span style={{ color: C.inkFaint, fontStyle: 'italic' }}>Non renseigné</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Active ordonnances */}
          {activeOrds.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeOrds.slice(0, 2).map(ord => {
                const st = ORD_STATUS[ord.status];
                const rupture = ord.items.filter(i => i.status === 'rupture');
                return (
                  <div key={ord.id} style={{ background: C.panel, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, backdropFilter: 'saturate(180%) blur(20px)' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 99, background: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: C.fm }}>R</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, marginBottom: 2 }}>Ordonnance {ord.ref} <span style={{ background: st.bg, color: st.fg, borderRadius: 99, padding: '1px 7px', fontSize: 10.5, fontWeight: 600, marginLeft: 4 }}>{st.label}</span></div>
                      <div style={{ fontSize: 12, color: C.inkMute }}>
                        Dr. {ord.medecin || '—'} · {ord.items.length} médicament{ord.items.length > 1 ? 's' : ''}
                        {rupture.length > 0 && <span style={{ color: C.red }}>{` dont ${rupture.length} en rupture (${rupture.map(r => r.name).join(', ')})`}</span>}
                      </div>
                    </div>
                    <button onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab: 'ordonnances' } }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', border: 'none', borderRadius: 9, background: C.ink, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: C.f, whiteSpace: 'nowrap' }}>
                      <ArrowRight size={14} strokeWidth={2} /> Continuer le traitement
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div style={{ padding: '10px 32px', borderTop: `1px solid ${C.hairline}`, display: 'flex', gap: 8, flexShrink: 0, background: C.panel }}>
          <button onClick={() => { const msg = encodeURIComponent(`Bonjour ${patient.name.split(' ')[0]} 👋\n\nMerci de votre fidélité à JunglePharm.\n\nÀ bientôt !`); const p = patient.phone.replace(/[\s+\-()\[\]]/g, ''); window.open(`https://wa.me/${p}?text=${msg}`, '_blank'); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: 'none', borderRadius: 8, background: '#25D366', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: C.f }}>
            <MessageCircle size={13} strokeWidth={1.5} /> WhatsApp
          </button>
          <button onClick={onDelete} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent', color: C.red, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: C.f }}>
            <Trash2 size={13} strokeWidth={1.5} /> Supprimer
          </button>
        </div>
      </div>

      {showAddPurchase && (
        <AddPurchaseModal onSave={p => { onAddPurchase(p); setShowAddPurchase(false); }} onClose={() => setShowAddPurchase(false)} />
      )}
    </>
  );
}

// ── Patient Overview (empty state) ───────────────────────────────────────────
function PatientOverview({ patients, urgentIds, onSelect, onAdd }: {
  patients: Patient[];
  urgentIds: Set<string>;
  onSelect: (p: Patient) => void;
  onAdd: () => void;
}) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const totalSpent    = patients.flatMap(p => p.purchases).reduce((s, pur) => s + pur.total, 0);
  const fideles       = patients.filter(p => p.type === 'fidèle').length;
  const nouveaux      = patients.filter(p => p.created_at >= thirtyDaysAgo).length;
  const avgBasket     = patients.length > 0 ? Math.round(totalSpent / patients.length) : 0;
  const withAllergies = patients.filter(p => p.allergies.length > 0).length;

  // Top 6 patients by total spent (with original index for avatar color)
  const top = useMemo(() =>
    patients
      .map((p, idx) => ({ p, idx, spent: p.purchases.reduce((s, pur) => s + pur.total, 0) }))
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 6),
  [patients]);

  // 4 most recently created patients
  const recent = useMemo(() =>
    [...patients]
      .map((p, idx) => ({ p, idx }))
      .sort((a, b) => b.p.created_at.localeCompare(a.p.created_at))
      .slice(0, 4),
  [patients]);

  const kpis = [
    { lbl: 'Total patients',   val: String(patients.length),            sub: 'enregistrés',                       color: C.ink },
    { lbl: 'Patients fidèles', val: String(fideles),                    sub: patients.length > 0 ? `${Math.round(fideles / patients.length * 100)}% du total` : '—', color: C.brand },
    { lbl: 'Nouveaux ce mois', val: String(nouveaux),                   sub: '30 derniers jours',                  color: C.blue },
    { lbl: 'Panier moyen',     val: avgBasket > 0 ? `${fmt(avgBasket)} FC` : '—', sub: 'par patient',             color: C.amber },
  ];

  return (
    <div style={{ flex: 1, borderLeft: `1px solid ${C.hairline}`, display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: C.f, overflowY: 'auto', minWidth: 0 }}>
      {/* Header */}
      <div style={{ padding: '24px 32px 20px', background: C.panel2, borderBottom: `1px solid ${C.hairline}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: C.ink, letterSpacing: '-0.025em', margin: 0, marginBottom: 4 }}>Vue d'ensemble · Patients</h2>
            <p style={{ fontSize: 13, color: C.inkMute, margin: 0 }}>
              {patients.length} patient{patients.length !== 1 ? 's' : ''} enregistrés
              {withAllergies > 0 && <span style={{ marginLeft: 10, background: C.redLt, color: C.red, borderRadius: 99, padding: '1px 8px', fontSize: 11.5, fontWeight: 600 }}>⚠ {withAllergies} allergie{withAllergies > 1 ? 's' : ''}</span>}
              {urgentIds.size > 0 && <span style={{ marginLeft: 6, background: 'rgba(183,95,6,0.09)', color: C.amber, borderRadius: 99, padding: '1px 8px', fontSize: 11.5, fontWeight: 600 }}>● {urgentIds.size} urgence{urgentIds.size > 1 ? 's' : ''}</span>}
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {kpis.map((k, i) => (
            <div key={i} style={{ background: C.panel2, border: `1px solid ${C.hairline}`, borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, color: C.inkMute, marginBottom: 8 }}>{k.lbl}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: k.color, letterSpacing: '-0.03em', fontFamily: C.fm, lineHeight: 1, marginBottom: 6 }}>{k.val}</div>
              <div style={{ fontSize: 11.5, color: C.inkFaint }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Two columns: top patients + recents */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Top patients */}
          <div style={{ background: C.panel2, border: `1px solid ${C.hairline}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px 12px', borderBottom: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Top patients</span>
              <span style={{ fontSize: 11.5, color: C.inkFaint }}>par dépense totale</span>
            </div>
            {top.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', fontSize: 12.5, color: C.inkFaint, fontStyle: 'italic' }}>Aucune donnée</div>
            ) : top.map(({ p, idx, spent }, i) => (
              <button key={p.id} onClick={() => onSelect(p)}
                style={{ width: '100%', padding: '11px 18px', border: 'none', borderBottom: i < top.length - 1 ? `1px solid ${C.hairline}` : 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, fontFamily: C.f, textAlign: 'left', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <div style={{ width: 20, fontSize: 12, fontWeight: 700, color: i < 3 ? C.amber : C.inkFaint, fontFamily: C.fm, textAlign: 'center', flexShrink: 0 }}>#{i + 1}</div>
                <Avatar name={p.name} idx={idx} size={34} round />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: C.inkMute }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: TYPE_STYLE[p.type].bg, color: TYPE_STYLE[p.type].text, borderRadius: 99, padding: '1px 6px', fontSize: 10.5, fontWeight: 600 }}>
                      <span style={{ width: 3, height: 3, borderRadius: 99, background: TYPE_STYLE[p.type].text }} />
                      {p.type}
                    </span>
                    <span style={{ marginLeft: 6 }}>{p.purchases.length} visite{p.purchases.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: C.fm }}>{fmtk(spent)}</div>
                  <div style={{ fontSize: 10.5, color: C.inkFaint }}>FC</div>
                </div>
              </button>
            ))}
          </div>

          {/* Recent patients */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: C.panel2, border: `1px solid ${C.hairline}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px 12px', borderBottom: `1px solid ${C.hairline}` }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Ajoutés récemment</span>
              </div>
              {recent.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', fontSize: 12.5, color: C.inkFaint, fontStyle: 'italic' }}>Aucun patient</div>
              ) : recent.map(({ p, idx }, i) => (
                <button key={p.id} onClick={() => onSelect(p)}
                  style={{ width: '100%', padding: '11px 18px', border: 'none', borderBottom: i < recent.length - 1 ? `1px solid ${C.hairline}` : 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, fontFamily: C.f, textAlign: 'left', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <Avatar name={p.name} idx={idx} size={34} round />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: C.inkFaint }}>{new Date(p.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}</div>
                  </div>
                  {urgentIds.has(p.id) && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: C.redLt, color: C.red, borderRadius: 99, padding: '1px 6px', whiteSpace: 'nowrap' }}>● Urgent</span>
                  )}
                  <ChevronRight size={14} color={C.inkGhost} strokeWidth={1.5} />
                </button>
              ))}
            </div>

            {/* Quick add CTA */}
            <button onClick={onAdd}
              style={{ background: C.brandLt, border: `1px solid rgba(16,120,90,0.18)`, borderRadius: 14, padding: '18px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, fontFamily: C.f, textAlign: 'left', transition: 'background 0.12s' }}
              onMouseEnter={e => (e.currentTarget.style.background = C.brandMid)}
              onMouseLeave={e => (e.currentTarget.style.background = C.brandLt)}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: C.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <UserPlus size={18} color="#fff" strokeWidth={1.5} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.brand }}>Ajouter un nouveau patient</div>
                <div style={{ fontSize: 12, color: C.inkMute, marginTop: 2 }}>Nom, téléphone, profil thérapeutique</div>
              </div>
              <ArrowRight size={16} color={C.brand} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Patients() {
  const { patients, isLoading, error, addPatient, updatePatient, deletePatient, addPurchase } = usePatients();
  const { ords } = useOrdonnances();

  const [selected, setSelected]     = useState<Patient | null>(null);
  const [search, setSearch]         = useState('');
  const [activeFilter, setActiveFilter] = useState<'tous' | 'fidèles' | 'nouveaux'>('tous');
  const [showNewModal, setShowNewModal] = useState(false);
  const [editPatient, setEditPatient]   = useState<Patient | null>(null);
  const [saving, setSaving]             = useState(false);

  // Sync selected
  useEffect(() => {
    if (selected) { const fresh = patients.find(p => p.id === selected.id); if (fresh) setSelected(fresh); else setSelected(null); }
  }, [patients]);

  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent<{ action: string }>).detail.action === 'add-patient') setShowNewModal(true); };
    window.addEventListener('topbar-action', h);
    return () => window.removeEventListener('topbar-action', h);
  }, []);

  // Urgent ordonnances by patient
  const urgentPatientIds = useMemo(() => {
    const ids = new Set<string>();
    ords.filter(o => o.status === 'en_attente').forEach(o => {
      if (o.patient_id) ids.add(o.patient_id);
      // fallback: match by name
      const match = patients.find(p => p.name.trim().toLowerCase() === o.patient_name.trim().toLowerCase());
      if (match) ids.add(match.id);
    });
    return ids;
  }, [ords, patients]);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const filtered = useMemo(() => {
    let list = patients;
    if (activeFilter === 'fidèles')  list = list.filter(p => p.type === 'fidèle');
    if (activeFilter === 'nouveaux') list = list.filter(p => p.created_at >= thirtyDaysAgo);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.phone.includes(q) || p.email.toLowerCase().includes(q));
    }
    return list;
  }, [patients, activeFilter, search, thirtyDaysAgo]);

  const counts = {
    tous:     patients.length,
    fidèles:  patients.filter(p => p.type === 'fidèle').length,
    nouveaux: patients.filter(p => p.created_at >= thirtyDaysAgo).length,
  };

  const handleSavePatient = async (p: Patient) => {
    setSaving(true);
    try {
      const isExisting = patients.some(x => x.id === p.id);
      const payload = { name: p.name, phone: p.phone, email: p.email, address: p.address, dob: p.dob, allergies: p.allergies, therapeutic_profile: p.therapeutic_profile, notes: p.notes };
      if (isExisting) { await updatePatient(p.id, payload); }
      else { const saved = await addPatient(payload); setSelected(saved); }
      setShowNewModal(false); setEditPatient(null);
    } catch (e: any) { alert(`Erreur : ${e.message || 'Impossible de sauvegarder'}`); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer ce patient ? Cette action est irréversible.')) return;
    try { await deletePatient(id); if (selected?.id === id) setSelected(null); }
    catch (e: any) { alert(`Erreur suppression : ${e.message}`); }
  };

  const handleAddPurchase = async (patientId: string, purchase: PatientPurchase) => {
    try { await addPurchase(patientId, { date: purchase.date, ticket: purchase.ticket, items: purchase.items, total: purchase.total, payment_method: purchase.payment_method }); }
    catch (e: any) { alert(`Erreur : ${e.message}`); }
  };

  const selectedIdx = selected ? patients.findIndex(p => p.id === selected.id) : -1;

  const patOrdonnances = useMemo(() => {
    if (!selected) return [];
    return ords.filter(o => (o.patient_id && o.patient_id === selected.id) || o.patient_name.trim().toLowerCase() === selected.name.trim().toLowerCase()).sort((a, b) => b.date.localeCompare(a.date));
  }, [ords, selected]);

  if (isLoading && patients.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, color: C.inkFaint, gap: 10, fontFamily: C.f }}>
        <Loader2 size={18} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 13 }}>Chargement des patients…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ display: 'flex', height: '100%', fontFamily: C.f, color: C.ink, overflow: 'hidden' }}>

        {/* ── LEFT PANEL ── */}
        <div style={{ width: 340, flexShrink: 0, borderRight: `1px solid ${C.hairline}`, display: 'flex', flexDirection: 'column', background: C.panel2 }}>
          {/* Header */}
          <div style={{ padding: '16px 18px 14px', borderBottom: `1px solid ${C.hairline}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>Patients</div>
                <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>{patients.length.toLocaleString('fr-FR')} enregistrés</div>
              </div>
            </div>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search size={12} color={C.inkMute} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, téléphone, ID…"
                style={{ width: '100%', height: 34, paddingLeft: 28, paddingRight: 10, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, background: C.bg, color: C.ink, outline: 'none', boxSizing: 'border-box', fontFamily: C.f }} />
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ padding: '10px 18px', borderBottom: `1px solid ${C.hairline}`, display: 'flex', gap: 4, flexShrink: 0 }}>
            {(['tous', 'fidèles', 'nouveaux'] as const).map(f => {
              const active = activeFilter === f;
              const label  = f.charAt(0).toUpperCase() + f.slice(1);
              const count  = counts[f];
              return (
                <button key={f} onClick={() => setActiveFilter(f)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: C.f, background: active ? C.ink : 'transparent', color: active ? '#fff' : C.inkMute, fontSize: 12.5, fontWeight: active ? 600 : 500, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.12s' }}>
                  {label}
                  <span style={{ fontSize: 11, background: active ? 'rgba(255,255,255,0.2)' : C.border, color: active ? '#fff' : C.inkFaint, borderRadius: 99, padding: '1px 6px', lineHeight: '16px', fontFamily: C.fm }}>{count.toLocaleString('fr-FR')}</span>
                </button>
              );
            })}
          </div>

          {/* Patient list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {error && (
              <div style={{ padding: '8px 18px', background: C.amberLt, borderBottom: `1px solid rgba(183,95,6,0.3)`, fontSize: 11.5, color: C.amber, display: 'flex', alignItems: 'center', gap: 5, fontFamily: C.f }}>
                <AlertTriangle size={11} strokeWidth={2} /> Mode hors-ligne
              </div>
            )}
            {filtered.length === 0 ? (
              <div style={{ padding: '40px 18px', textAlign: 'center' }}>
                {patients.length === 0 ? (
                  <>
                    <UserPlus size={28} color={C.inkGhost} strokeWidth={1} style={{ marginBottom: 10 }} />
                    <div style={{ fontSize: 13, color: C.inkMute, fontWeight: 500 }}>Aucun patient</div>
                    <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 4 }}>Ajoutez votre premier patient.</div>
                  </>
                ) : (
                  <div style={{ fontSize: 12.5, color: C.inkMute }}>Aucun résultat pour « {search} »</div>
                )}
              </div>
            ) : filtered.map((p, i) => {
              const totalSpent = p.purchases.reduce((s, pur) => s + pur.total, 0);
              const lastVisit  = p.purchases.length > 0 ? [...p.purchases].sort((a, b) => b.date.localeCompare(a.date))[0].date : null;
              const isSelected = selected?.id === p.id;
              const isUrgent   = urgentPatientIds.has(p.id);
              const age        = p.dob ? Math.floor((Date.now() - new Date(p.dob).getTime()) / (365.25 * 86400000)) : null;
              return (
                <button key={p.id} onClick={() => setSelected(isSelected ? null : p)}
                  style={{
                    width: '100%', padding: '12px 18px', border: 'none', textAlign: 'left', cursor: 'pointer',
                    fontFamily: C.f, borderBottom: `1px solid ${C.hairline}`,
                    background: isSelected ? 'rgba(10,14,20,0.04)' : 'transparent',
                    borderLeft: isSelected ? `4px solid ${C.ink}` : '4px solid transparent',
                    boxSizing: 'border-box', transition: 'background 0.1s, border-left 0.1s', display: 'block',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.bg; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <Avatar name={p.name} idx={i} size={40} round />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        {isUrgent && (
                          <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(200,30,30,0.09)', color: C.red, borderRadius: 99, padding: '1px 6px', whiteSpace: 'nowrap' }}>● Urgent</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: C.inkMute }}>
                        {age !== null && <span>F · {age} ans · </span>}
                        <span>{p.purchases.length} visite{p.purchases.length > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? C.ink : C.inkSoft, fontFamily: C.fm }}>{fmtk(totalSpent)}</div>
                      <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>{lastVisit ? relativeDate(lastVisit) : '—'}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: DETAIL OR EMPTY ── */}
        {selected && selectedIdx >= 0 ? (
          <PatientDetail
            patient={selected} idx={selectedIdx} patOrdonnances={patOrdonnances}
            onEdit={() => setEditPatient(selected)}
            onDelete={() => handleDelete(selected.id)}
            onAddPurchase={p => handleAddPurchase(selected.id, p)}
          />
        ) : (
          <PatientOverview
            patients={patients}
            urgentIds={urgentPatientIds}
            onSelect={p => setSelected(p)}
            onAdd={() => setShowNewModal(true)}
          />
        )}
      </div>

      {(showNewModal || editPatient) && (
        <PatientModal patient={editPatient} onSave={handleSavePatient} onClose={() => { if (!saving) { setShowNewModal(false); setEditPatient(null); } }} saving={saving} />
      )}
    </>
  );
}
