import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Plus, X, AlertTriangle, Phone, Mail, MapPin, Calendar, MessageCircle, Edit3, Trash2, ChevronRight, UserPlus, FileText, Heart, Loader2, TrendingUp } from 'lucide-react';
import { usePatients, Patient, PatientPurchase, PatientType, computePatientType } from '../lib/usePatients';
import { useOrdonnances, OrdStatus } from '../lib/useOrdonnances';

// ── Design tokens (Chalk Premium — source exacte) ─────────────────────────────
const C = {
  panel:      'rgba(255,255,255,0.62)',
  panel2:     'rgba(255,255,255,0.40)',
  panelHi:    'rgba(255,255,255,0.78)',
  panelSolid: '#ffffff',
  hairline:   'rgba(255,255,255,0.55)',   // ← bordure verre dépoli (BLANC)
  border:     'rgba(15,15,20,0.06)',      // ← bordure inputs/dividers (SOMBRE)
  borderHi:   'rgba(15,15,20,0.10)',
  brand:      '#10785a',
  brandHi:    '#149a73',
  brandLt:    'rgba(16,120,90,0.08)',
  brandMid:   'rgba(16,120,90,0.16)',
  ink:        '#0a0e14',
  inkSoft:    '#2c3138',
  inkMute:    '#6b7280',
  inkFaint:   '#9aa0a8',
  inkGhost:   '#c8ccd2',
  red:        '#c81e1e',  redLt:  'rgba(200,30,30,0.08)',
  amber:      '#b75f06',  amberLt:'rgba(183,95,6,0.09)',
  blue:       '#0651bc',  blueLt: 'rgba(6,81,188,0.07)',
  f:  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, system-ui, sans-serif',
  fm: '"SF Mono", "Geist Mono", ui-monospace, Menlo, monospace',
};

// ── Glass ring shadow (Chalk — effet verre) ───────────────────────────────────
const glassRing = 'inset 0 1px 0 rgba(255,255,255,0.8), inset 0 0 0 0.5px rgba(255,255,255,0.5), 0 4px 16px rgba(15,30,25,0.06), 0 1px 2px rgba(15,30,25,0.05)';

const GRADIENTS = [
  'linear-gradient(135deg,#10785a,#149a73)',
  'linear-gradient(135deg,#0651bc,#3b86e0)',
  'linear-gradient(135deg,#6e44b0,#9b6dd6)',
  'linear-gradient(135deg,#b75f06,#e08533)',
  'linear-gradient(135deg,#c81e1e,#e85555)',
  'linear-gradient(135deg,#0891b2,#22d3ee)',
  'linear-gradient(135deg,#7c3aed,#a78bfa)',
  'linear-gradient(135deg,#0f766e,#2dd4bf)',
];

// ── Types re-exported from hook (source of truth: src/lib/usePatients.ts) ────
export type { PatientType, PatientPurchase, Patient };

// ── Helpers ───────────────────────────────────────────────────────────────────
const getPatientType = computePatientType;

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
}

function fmt(n: number): string {
  return n.toLocaleString('fr-FR');
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function formatShortDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch { return iso; }
}

// ── Type colors ───────────────────────────────────────────────────────────────
const TYPE_STYLE: Record<PatientType, { bg: string; text: string }> = {
  fidèle:     { bg: 'rgba(16,120,90,0.1)',   text: '#10785a' },
  récurrent:  { bg: 'rgba(6,81,188,0.1)',    text: '#0651bc' },
  occasionnel:{ bg: 'rgba(0,0,0,0.06)',       text: '#6b7280' },
};

// ── Sub-components ────────────────────────────────────────────────────────────
function Avatar({ name, idx, size = 40 }: { name: string; idx: number; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28,
      background: GRADIENTS[idx % GRADIENTS.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.34, fontWeight: 700,
      letterSpacing: '-0.01em', flexShrink: 0,
      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
    }}>
      {getInitials(name)}
    </div>
  );
}

function TypePill({ type }: { type: PatientType }) {
  const s = TYPE_STYLE[type];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: s.bg, color: s.text, borderRadius: 99,
      padding: '2px 8px', fontSize: 11, fontWeight: 500,
      fontFamily: C.f, whiteSpace: 'nowrap', letterSpacing: '-0.005em',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 99, background: s.text, flexShrink: 0 }} />
      {type}
    </span>
  );
}

function TagsInput({ tags, onChange, placeholder, colorScheme = 'green' }: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
  colorScheme?: 'green' | 'red';
}) {
  const [input, setInput] = useState('');
  const bg = colorScheme === 'red' ? 'rgba(200,30,30,0.08)' : C.brandLt;
  const color = colorScheme === 'red' ? C.red : C.brand;

  const addTag = () => {
    const v = input.trim();
    if (v && !tags.includes(v)) { onChange([...tags, v]); }
    setInput('');
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
        {tags.map(t => (
          <span key={t} style={{
            background: bg, color, borderRadius: 99,
            padding: '3px 8px', fontSize: 11.5, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {t}
            <button onClick={() => onChange(tags.filter(x => x !== t))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color, display: 'flex', lineHeight: 1 }}>
              <X size={10} strokeWidth={2} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder={placeholder}
          style={{
            flex: 1, height: 30, padding: '0 8px',
            border: `1px solid ${C.border}`, borderRadius: 6,
            fontSize: 12, background: C.panelSolid, color: C.ink, outline: 'none',
            fontFamily: C.f,
          }}
        />
        <button onClick={addTag} style={{
          width: 30, height: 30, border: 'none', borderRadius: 6,
          background: C.brandLt, color: C.brand, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Plus size={13} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

// ── New/Edit Patient Modal ────────────────────────────────────────────────────
function PatientModal({ patient, onSave, onClose, saving = false }: {
  patient?: Patient | null;
  onSave: (p: Patient) => void | Promise<void>;
  onClose: () => void;
  saving?: boolean;
}) {
  const isEdit = !!patient;
  const [form, setForm] = useState({
    name: patient?.name || '',
    phone: patient?.phone || '',
    email: patient?.email || '',
    address: patient?.address || '',
    dob: patient?.dob || '',
    notes: patient?.notes || '',
    allergies: patient?.allergies || [] as string[],
    therapeutic_profile: patient?.therapeutic_profile || [] as string[],
  });

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));
  const canSave = form.name.trim() && form.phone.trim();

  const handleSave = () => {
    if (!canSave) return;
    const visits = patient?.purchases.length || 0;
    const saved: Patient = {
      id: patient?.id || `__new__${Date.now()}`,  // hook detects "__new__" prefix as insert
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      dob: form.dob,
      type: getPatientType(visits),
      allergies: form.allergies,
      therapeutic_profile: form.therapeutic_profile,
      notes: form.notes,
      created_at: patient?.created_at || new Date().toISOString(),
      purchases: patient?.purchases || [],
    };
    onSave(saved);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 540, maxHeight: '90vh',
        background: C.panelSolid, borderRadius: 18,
        boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.5)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        fontFamily: C.f,
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9, background: C.brandLt,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <UserPlus size={15} color={C.brand} strokeWidth={1.5} />
            </div>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>
              {isEdit ? 'Modifier le patient' : 'Nouveau patient'}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
            <X size={18} color={C.inkMute} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {[
              { lbl: 'Nom complet *', key: 'name', ph: 'Ex: Jean Dupont' },
              { lbl: 'Téléphone *', key: 'phone', ph: '+243 8XX XXX XXX' },
              { lbl: 'Email', key: 'email', ph: 'patient@email.com' },
              { lbl: 'Adresse', key: 'address', ph: 'Quartier, commune' },
              { lbl: 'Date de naissance', key: 'dob', ph: '', type: 'date' },
            ].map(({ lbl, key, ph, type }) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.inkMute, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>{lbl}</label>
                <input
                  type={type || 'text'}
                  value={form[key as keyof typeof form] as string}
                  onChange={e => set(key as keyof typeof form, e.target.value)}
                  placeholder={ph}
                  style={{
                    width: '100%', height: 34, padding: '0 10px',
                    border: `1px solid ${C.border}`, borderRadius: 7,
                    fontSize: 13, background: C.panelSolid, color: C.ink,
                    outline: 'none', boxSizing: 'border-box', fontFamily: C.f,
                  }}
                />
              </div>
            ))}
          </div>

          {/* Allergies */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.red, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>
              ⚠ Allergies connues
            </label>
            <TagsInput
              tags={form.allergies}
              onChange={v => setForm(f => ({ ...f, allergies: v }))}
              placeholder="Pénicilline, Aspirine… (Entrée)"
              colorScheme="red"
            />
          </div>

          {/* Profil thérapeutique */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.inkMute, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>
              Profil thérapeutique
            </label>
            <TagsInput
              tags={form.therapeutic_profile}
              onChange={v => setForm(f => ({ ...f, therapeutic_profile: v }))}
              placeholder="Diabète, HTA, Paludisme… (Entrée)"
              colorScheme="green"
            />
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.inkMute, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Observations, préférences, médecin traitant…"
              rows={3}
              style={{
                width: '100%', padding: '8px 10px',
                border: `1px solid ${C.border}`, borderRadius: 7,
                fontSize: 12.5, background: C.panelSolid, color: C.ink,
                outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                fontFamily: C.f,
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: `1px solid ${C.border}`,
          display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0,
        }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', border: `1px solid ${C.border}`, borderRadius: 8,
            background: 'transparent', color: C.inkSoft, fontSize: 13, cursor: 'pointer',
            fontFamily: C.f,
          }}>
            Annuler
          </button>
          <button onClick={handleSave} disabled={!canSave || saving} style={{
            padding: '8px 20px', border: 'none', borderRadius: 8,
            background: canSave && !saving ? C.ink : C.inkGhost,
            color: canSave && !saving ? '#fff' : C.inkFaint,
            fontSize: 13, fontWeight: 600, cursor: canSave && !saving ? 'pointer' : 'default',
            fontFamily: C.f, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {saving && <Loader2 size={12} strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} />}
            {isEdit ? 'Enregistrer' : 'Créer le patient'}
          </button>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    </div>
  );
}

// ── Add Purchase Modal ────────────────────────────────────────────────────────
function AddPurchaseModal({ onSave, onClose }: {
  onSave: (p: PatientPurchase) => void;
  onClose: () => void;
}) {
  const [date, setDate]   = useState(new Date().toISOString().split('T')[0]);
  const [ticket, setTicket] = useState('');
  const [items, setItems]  = useState('');
  const [total, setTotal]  = useState('');
  const [method, setMethod] = useState('espèces');

  const canSave = date && total && parseFloat(total) > 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      backdropFilter: 'blur(6px)', zIndex: 210,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 400, background: C.panelSolid,
        borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.5)',
        fontFamily: C.f,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Ajouter un achat</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color={C.inkMute} /></button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                style={{ width: '100%', height: 32, padding: '0 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12.5, background: C.panelSolid, color: C.ink, outline: 'none', boxSizing: 'border-box', fontFamily: C.f }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>N° Ticket</label>
              <input value={ticket} onChange={e => setTicket(e.target.value)} placeholder="T-001"
                style={{ width: '100%', height: 32, padding: '0 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12.5, background: C.panelSolid, color: C.ink, outline: 'none', boxSizing: 'border-box', fontFamily: C.f }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Produits achetés</label>
            <input value={items} onChange={e => setItems(e.target.value)} placeholder="Paracétamol, Amoxicilline… (séparés par virgule)"
              style={{ width: '100%', height: 32, padding: '0 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12.5, background: C.panelSolid, color: C.ink, outline: 'none', boxSizing: 'border-box', fontFamily: C.f }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Total (FC) *</label>
              <input type="number" value={total} onChange={e => setTotal(e.target.value)} placeholder="0"
                style={{ width: '100%', height: 32, padding: '0 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12.5, background: C.panelSolid, color: C.ink, outline: 'none', boxSizing: 'border-box', fontFamily: C.f }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Paiement</label>
              <select value={method} onChange={e => setMethod(e.target.value)}
                style={{ width: '100%', height: 32, padding: '0 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12.5, background: C.panelSolid, color: C.ink, outline: 'none', boxSizing: 'border-box', fontFamily: C.f }}>
                {['espèces', 'mobile money', 'carte', 'crédit'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 14px', border: `1px solid ${C.border}`, borderRadius: 7, background: 'transparent', color: C.inkSoft, fontSize: 12.5, cursor: 'pointer', fontFamily: C.f }}>Annuler</button>
          <button onClick={() => {
            if (!canSave) return;
            onSave({
              id: `pur_${Date.now()}`,
              date: new Date(date).toISOString(),
              ticket: ticket || `T-${Date.now().toString().slice(-6)}`,
              items: items.split(',').map(s => s.trim()).filter(Boolean),
              total: parseFloat(total),
              payment_method: method,
            });
          }} disabled={!canSave} style={{
            padding: '7px 18px', border: 'none', borderRadius: 7,
            background: canSave ? C.brand : C.inkGhost,
            color: canSave ? '#fff' : C.inkFaint,
            fontSize: 12.5, fontWeight: 600, cursor: canSave ? 'pointer' : 'default',
            fontFamily: C.f,
          }}>
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ordonnance status mini-config ─────────────────────────────────────────────
const ORD_STATUS: Record<OrdStatus, { label: string; bg: string; fg: string }> = {
  en_attente: { label: 'En attente', bg: 'rgba(183,95,6,0.09)',   fg: '#b75f06' },
  partielle:  { label: 'Partielle',  bg: 'rgba(6,81,188,0.07)',   fg: '#0651bc' },
  terminee:   { label: 'Terminée',   bg: 'rgba(16,120,90,0.08)',  fg: '#10785a' },
};

// ── Patient Detail Panel — Chalk Premium ─────────────────────────────────────
function PatientDetail({ patient, idx, onClose, onEdit, onDelete, onAddPurchase }: {
  patient: Patient;
  idx: number;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddPurchase: (p: PatientPurchase) => void;
}) {
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const { ords } = useOrdonnances();

  // Linked ordonnances: match by patient_id (FK) or patient_name (fallback)
  const patOrdonnances = useMemo(() =>
    ords.filter(o =>
      (o.patient_id && o.patient_id === patient.id) ||
      o.patient_name.trim().toLowerCase() === patient.name.trim().toLowerCase()
    ).sort((a, b) => b.date.localeCompare(a.date)),
  [ords, patient.id, patient.name]);

  const sortedPurchases = useMemo(() =>
    [...patient.purchases].sort((a, b) => b.date.localeCompare(a.date)),
  [patient.purchases]);

  const totalSpent = patient.purchases.reduce((s, p) => s + p.total, 0);
  const avgBasket  = patient.purchases.length > 0 ? Math.round(totalSpent / patient.purchases.length) : 0;
  const lastPurchase = sortedPurchases[0] ?? null;

  // Médicaments fréquents : top items from all purchases
  const freqMeds = useMemo(() => {
    const freq: Record<string, number> = {};
    patient.purchases.forEach(p => p.items.forEach(item => {
      const name = item.split('×')[0]?.trim() || item;
      freq[name] = (freq[name] || 0) + 1;
    }));
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => n);
  }, [patient.purchases]);

  // Active / pending ordonnances
  const activeOrds = patOrdonnances.filter(o => o.status !== 'terminee');

  // Age from dob
  const age = patient.dob
    ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / (365.25 * 86400000))
    : null;

  // Gender from notes heuristic (M/F stored as first char of notes or not stored — show nothing if unknown)
  const hasUrgentOrd = activeOrds.some(o => o.status === 'en_attente');

  // Last visit display
  const lastVisitLabel = lastPurchase
    ? (() => {
        const d = new Date(lastPurchase.date);
        const today = new Date();
        const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
        if (diff === 0) return "Aujourd'hui";
        if (diff === 1) return 'Hier';
        return formatDate(lastPurchase.date);
      })()
    : 'Jamais';

  // Build combined timeline: purchases + ordonnances
  type TimelineRow = { date: string; type: 'achat' | 'ordonnance'; label: string; articles: number; montant: number; ref?: string; status?: string };
  const timeline = useMemo((): TimelineRow[] => {
    const rows: TimelineRow[] = sortedPurchases.map(p => ({
      date: p.date,
      type: 'achat',
      label: p.ticket || 'Vente libre',
      articles: p.items.length,
      montant: p.total,
    }));
    patOrdonnances.forEach(o => {
      const montant = o.items.reduce((s, i) => s + (i.qty * 0), 0); // no price in ordonnance items
      rows.push({ date: o.date, type: 'ordonnance', label: o.ref, articles: o.items.length, montant: o.total, ref: o.ref, status: o.status });
    });
    return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  }, [sortedPurchases, patOrdonnances]);

  return (
    <>
      <div style={{
        flex: 1, borderLeft: `1px solid ${C.hairline}`,
        display: 'flex', flexDirection: 'column',
        background: 'rgba(255,255,255,0.5)', fontFamily: C.f,
        backdropFilter: 'saturate(180%) blur(28px)',
        WebkitBackdropFilter: 'saturate(180%) blur(28px)',
        minWidth: 0, overflow: 'hidden',
      }}>
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <div style={{
          padding: '20px 28px 18px', borderBottom: `1px solid ${C.hairline}`,
          flexShrink: 0, background: 'rgba(255,255,255,0.62)',
        }}>
          {/* Top row: avatar + name + actions */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 12 }}>
            <Avatar name={patient.name} idx={idx} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.1 }}>{patient.name}</span>
                <TypePill type={patient.type} />
                {hasUrgentOrd && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(200,30,30,0.08)', color: C.red, borderRadius: 99, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                    <span style={{ width: 5, height: 5, borderRadius: 99, background: C.red }} />
                    Ordo. urgente
                  </span>
                )}
              </div>
              {/* Bio line */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', fontSize: 12.5, color: C.inkMute }}>
                {age !== null && <span>{age} ans</span>}
                {patient.dob && <><span style={{ margin: '0 8px', opacity: 0.3 }}>·</span><span>née le {formatDate(patient.dob)}</span></>}
                {patient.phone && <><span style={{ margin: '0 8px', opacity: 0.3 }}>·</span><span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={11} strokeWidth={1.5} />{patient.phone}</span></>}
                {patient.address && <><span style={{ margin: '0 8px', opacity: 0.3 }}>·</span><span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} strokeWidth={1.5} />{patient.address}</span></>}
              </div>
            </div>
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent', color: C.inkSoft, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: C.f }}>
                <Edit3 size={12} strokeWidth={1.5} /> Modifier
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab: 'sales' } }))}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 'none', borderRadius: 8, background: C.ink, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: C.f, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
                <ChevronRight size={13} strokeWidth={2} /> Nouvelle vente
              </button>
            </div>
          </div>
        </div>

        {/* ── SCROLLABLE BODY ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>

          {/* ── 4 STAT CARDS ─────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 22 }}>
            {[
              { lbl: 'Total dépensé', val: `${fmt(totalSpent)} FC`, sub: patient.purchases.length > 0 ? `${patient.purchases.length} achat${patient.purchases.length > 1 ? 's' : ''}` : 'Aucun achat', color: C.ink },
              { lbl: 'Visites', val: String(patient.purchases.length), sub: 'enregistrées', color: C.blue },
              { lbl: 'Panier moyen', val: avgBasket > 0 ? `${fmt(avgBasket)} FC` : '—', sub: avgBasket > 0 ? 'par visite' : 'Aucune donnée', color: C.brand },
              { lbl: 'Dernière visite', val: lastVisitLabel, sub: lastPurchase?.ticket ? `Ticket ${lastPurchase.ticket}` : lastPurchase ? formatShortDate(lastPurchase.date) : '—', color: C.inkSoft },
            ].map((s, i) => (
              <div key={i} style={{ background: C.panel, border: `1px solid ${C.hairline}`, borderRadius: 12, padding: '14px 16px', backdropFilter: 'saturate(180%) blur(20px)', boxShadow: glassRing }}>
                <div style={{ fontSize: 11, color: C.inkMute, marginBottom: 6 }}>{s.lbl}</div>
                <div style={{ fontSize: i === 3 ? 14 : 20, fontWeight: 700, color: s.color, letterSpacing: '-0.025em', fontFamily: C.fm, lineHeight: 1.15, marginBottom: 4 }}>{s.val}</div>
                <div style={{ fontSize: 11, color: C.inkFaint }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* ── TWO COLUMNS: history + therapeutic profile ───────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 20 }}>

            {/* LEFT — Historique des achats */}
            <div style={{ background: C.panel, border: `1px solid ${C.hairline}`, borderRadius: 12, overflow: 'hidden', backdropFilter: 'saturate(180%) blur(20px)', boxShadow: glassRing }}>
              <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Historique des achats</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11.5, color: C.inkMute }}>{timeline.length} entrée{timeline.length > 1 ? 's' : ''}</span>
                  <button onClick={() => setShowAddPurchase(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.brandLt, border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: C.brand, fontWeight: 600, cursor: 'pointer', fontFamily: C.f }}>
                    <Plus size={9} strokeWidth={2.5} /> Ajouter
                  </button>
                </div>
              </div>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px 90px', gap: 0, padding: '8px 16px', borderBottom: `1px solid ${C.border}` }}>
                {['DATE', 'TYPE', 'ART.', 'MONTANT'].map(h => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, letterSpacing: '0.06em' }}>{h}</div>
                ))}
              </div>
              {timeline.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: C.inkFaint, fontStyle: 'italic' }}>Aucun historique</div>
              ) : (
                <div>
                  {timeline.map((row, i) => {
                    const isOrd = row.type === 'ordonnance';
                    const st = isOrd ? ORD_STATUS[row.status as OrdStatus] : null;
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px 90px', gap: 0, padding: '10px 16px', borderBottom: i < timeline.length - 1 ? `1px solid ${C.hairline}` : 'none', alignItems: 'center' }}>
                        <div style={{ fontSize: 11.5, color: C.inkMute }}>{formatShortDate(row.date)}</div>
                        <div>
                          {isOrd ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: st!.bg, color: st!.fg, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                              <span style={{ width: 4, height: 4, borderRadius: 99, background: st!.fg, flexShrink: 0 }} />
                              {row.label}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: C.inkSoft, fontWeight: 500 }}>Vente libre</span>
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
              )}
            </div>

            {/* RIGHT — Profil thérapeutique */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: C.panel, border: `1px solid ${C.hairline}`, borderRadius: 12, overflow: 'hidden', backdropFilter: 'saturate(180%) blur(20px)', boxShadow: glassRing }}>
                <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Heart size={13} color={C.inkMute} strokeWidth={1.5} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Profil thérapeutique</span>
                </div>
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Allergies */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.red, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Allergies</div>
                    {patient.allergies.length === 0 ? (
                      <div style={{ fontSize: 11.5, color: C.inkFaint, fontStyle: 'italic' }}>Aucune allergie déclarée</div>
                    ) : (
                      <div style={{ background: 'rgba(200,30,30,0.05)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: C.red, lineHeight: 1.5 }}>
                        {patient.allergies.join(' · ')}
                      </div>
                    )}
                  </div>
                  {/* Traitements en cours */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.blue, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Traitements en cours</div>
                    {patient.therapeutic_profile.length === 0 ? (
                      <div style={{ fontSize: 11.5, color: C.inkFaint, fontStyle: 'italic' }}>Aucun traitement renseigné</div>
                    ) : (
                      <div style={{ background: C.blueLt, borderRadius: 8, padding: '8px 10px', fontSize: 12, color: C.blue, lineHeight: 1.5 }}>
                        {patient.therapeutic_profile.join(' · ')}
                      </div>
                    )}
                  </div>
                  {/* Médicaments fréquents */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.brand, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Médicaments fréquents</div>
                    {freqMeds.length === 0 ? (
                      <div style={{ fontSize: 11.5, color: C.inkFaint, fontStyle: 'italic' }}>Calculé depuis l'historique</div>
                    ) : (
                      <div style={{ background: C.brandLt, borderRadius: 8, padding: '8px 10px', fontSize: 12, color: C.brand, lineHeight: 1.5 }}>
                        {freqMeds.join(', ')}
                      </div>
                    )}
                  </div>
                  {/* Notes / mutuelle */}
                  {patient.notes && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Notes</div>
                      <div style={{ background: 'rgba(15,15,20,0.04)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: C.inkSoft, lineHeight: 1.5 }}>
                        {patient.notes}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── ACTIVE ORDONNANCES ────────────────────────────────────────── */}
          {activeOrds.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeOrds.slice(0, 2).map(ord => {
                const st = ORD_STATUS[ord.status];
                const rupture = ord.items.filter(i => i.status === 'rupture');
                return (
                  <div key={ord.id} style={{ background: C.panel, border: `1px solid ${C.hairline}`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, backdropFilter: 'saturate(180%) blur(20px)', boxShadow: glassRing }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: st.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <FileText size={16} color={st.fg} strokeWidth={1.5} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{ord.ref}</div>
                      <div style={{ fontSize: 12, color: C.inkMute, marginTop: 2 }}>
                        Dr. {ord.medecin || '—'} · {ord.items.length} médicament{ord.items.length > 1 ? 's' : ''}
                        {rupture.length > 0 && <span style={{ color: C.red }}>{` dont ${rupture.length} en rupture`}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab: 'ordonnances' } }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 'none', borderRadius: 8, background: C.ink, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: C.f, whiteSpace: 'nowrap' }}>
                      Continuer le traitement <ChevronRight size={12} strokeWidth={2} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── FOOTER ────────────────────────────────────────────────────────── */}
        <div style={{ padding: '10px 28px', borderTop: `1px solid ${C.hairline}`, display: 'flex', gap: 8, flexShrink: 0, background: 'rgba(255,255,255,0.62)' }}>
          <button onClick={() => { const msg = encodeURIComponent(`Bonjour ${patient.name.split(' ')[0]} 👋\n\nMerci de votre fidélité.\n\nÀ bientôt !`); const p = patient.phone.replace(/[\s+\-()\[\]]/g, ''); window.open(`https://wa.me/${p}?text=${msg}`, '_blank'); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: 'none', borderRadius: 8, background: '#25D366', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: C.f }}>
            <MessageCircle size={13} strokeWidth={1.5} /> WhatsApp
          </button>
          <button onClick={onDelete}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent', color: C.red, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: C.f }}>
            <Trash2 size={13} strokeWidth={1.5} /> Supprimer
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent', color: C.inkSoft, fontSize: 12.5, cursor: 'pointer', fontFamily: C.f }}>
            <X size={13} /> Fermer
          </button>
        </div>
      </div>

      {showAddPurchase && (
        <AddPurchaseModal
          onSave={p => { onAddPurchase(p); setShowAddPurchase(false); }}
          onClose={() => setShowAddPurchase(false)}
        />
      )}
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Patients() {
  const {
    patients, isLoading, error,
    addPatient, updatePatient, deletePatient, addPurchase,
  } = usePatients();

  const [selected, setSelected] = useState<Patient | null>(null);
  const [search, setSearch] = useState('');
  const [activeType, setActiveType] = useState<'Tous' | PatientType>('Tous');
  const [showNewModal, setShowNewModal] = useState(false);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [saving, setSaving] = useState(false);

  // Sync selected with latest patient data from hook
  useEffect(() => {
    if (selected) {
      const fresh = patients.find(p => p.id === selected.id);
      if (fresh) setSelected(fresh);
      else setSelected(null);
    }
  }, [patients]);

  // Topbar action listener
  useEffect(() => {
    const handler = (e: Event) => {
      const { action } = (e as CustomEvent<{ action: string }>).detail;
      if (action === 'add-patient') setShowNewModal(true);
    };
    window.addEventListener('topbar-action', handler);
    return () => window.removeEventListener('topbar-action', handler);
  }, []);

  // Derived data
  const filtered = useMemo(() => {
    const t30 = new Date(Date.now() - 30 * 86400000).toISOString();
    let list = patients;
    if (activeType === 'fidèle') list = list.filter(p => p.type === 'fidèle');
    else if (activeType === 'récurrent') list = list.filter(p => p.type === 'récurrent');
    else if (activeType === 'occasionnel') list = list.filter(p => p.type === 'occasionnel');
    else if (activeType === 'nouveaux' as any) list = list.filter(p => p.created_at >= t30);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.phone.includes(q) ||
      p.email.toLowerCase().includes(q)
    );
    return list;
  }, [patients, activeType, search]);

  const kpis = useMemo(() => {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const activeThisMonth = patients.filter(p =>
      p.purchases.some(pur => pur.date.startsWith(monthStr))
    ).length;
    const allSpent = patients.flatMap(p => p.purchases.map(pur => pur.total));
    const ltv = allSpent.length > 0 ? Math.round(allSpent.reduce((s, v) => s + v, 0) / patients.length) : 0;
    const withAllergies = patients.filter(p => p.allergies.length > 0).length;
    return { total: patients.length, activeThisMonth, ltv, withAllergies };
  }, [patients]);

  const handleSavePatient = async (p: Patient) => {
    setSaving(true);
    try {
      const isExisting = patients.some(x => x.id === p.id);
      const payload = {
        name: p.name, phone: p.phone, email: p.email, address: p.address,
        dob: p.dob, allergies: p.allergies, therapeutic_profile: p.therapeutic_profile, notes: p.notes,
      };
      if (isExisting) {
        await updatePatient(p.id, payload);
      } else {
        const saved = await addPatient(payload);
        setSelected(saved);
      }
      setShowNewModal(false);
      setEditPatient(null);
    } catch (e: any) {
      alert(`Erreur : ${e.message || 'Impossible de sauvegarder'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer ce patient ? Cette action est irréversible.')) return;
    try {
      await deletePatient(id);
      if (selected?.id === id) setSelected(null);
    } catch (e: any) {
      alert(`Erreur suppression : ${e.message}`);
    }
  };

  const handleAddPurchase = async (patientId: string, purchase: PatientPurchase) => {
    try {
      await addPurchase(patientId, {
        date: purchase.date, ticket: purchase.ticket,
        items: purchase.items, total: purchase.total, payment_method: purchase.payment_method,
      });
    } catch (e: any) {
      alert(`Erreur : ${e.message}`);
    }
  };

  const selectedIdx = selected ? patients.findIndex(p => p.id === selected.id) : -1;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const typeChips: { label: string; value: 'Tous' | PatientType | 'nouveaux' }[] = [
    { label: `Tous  ${patients.length}`, value: 'Tous' },
    { label: `Fidèles  ${patients.filter(p => p.type === 'fidèle').length}`, value: 'fidèle' },
    { label: `Nouveaux  ${patients.filter(p => p.created_at >= thirtyDaysAgo).length}`, value: 'nouveaux' },
  ];

  // Loading skeleton
  if (isLoading && patients.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, color: C.inkFaint, gap: 10, fontFamily: C.f }}>
        <Loader2 size={18} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 13 }}>Chargement des patients…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Error banner (non-blocking — show cached data below)
  const errorBanner = error ? (
    <div style={{ padding: '8px 28px', background: C.amberLt, borderBottom: `1px solid rgba(183,95,6,0.3)`, fontSize: 12, color: C.amber, display: 'flex', alignItems: 'center', gap: 6, fontFamily: C.f }}>
      <AlertTriangle size={12} strokeWidth={2} />
      Mode hors-ligne — données en cache ({error})
    </div>
  ) : null;

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ display: 'flex', height: '100%', fontFamily: C.f, color: C.ink, overflow: 'hidden' }}>

        {/* ── LEFT: LIST PANEL ──────────────────────────────────────────── */}
        <div style={{
          width: 360, flexShrink: 0, borderRight: `1px solid ${C.hairline}`,
          display: 'flex', flexDirection: 'column', background: C.panel,
          backdropFilter: 'saturate(180%) blur(28px)',
          WebkitBackdropFilter: 'saturate(180%) blur(28px)',
        }}>
          {/* Header */}
          <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid ${C.hairline}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>Patients</div>
                <div style={{ fontSize: 12, color: C.inkMute, marginTop: 1 }}>{patients.length} enregistrés</div>
              </div>
              <button
                data-tour="patients-add"
                onClick={() => setShowNewModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: 'none', borderRadius: 8, background: C.ink, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: C.f }}>
                <Plus size={12} strokeWidth={2.5} /> Ajouter
              </button>
            </div>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search size={12} color={C.inkMute} strokeWidth={1.5} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, téléphone, ID…"
                style={{ width: '100%', height: 32, paddingLeft: 28, paddingRight: 10, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12.5, background: C.panelSolid, color: C.ink, outline: 'none', boxSizing: 'border-box', fontFamily: C.f }} />
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ padding: '8px 18px', borderBottom: `1px solid ${C.hairline}`, display: 'flex', gap: 4, flexShrink: 0 }}>
            {typeChips.map(({ label, value }) => {
              const isActive = activeType === value;
              const [text, count] = label.split('  ');
              return (
                <button key={value} onClick={() => setActiveType(value as any)} style={{
                  padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: C.f,
                  background: isActive ? C.ink : 'transparent', color: isActive ? '#fff' : C.inkMute,
                  fontSize: 12, fontWeight: isActive ? 600 : 500, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.12s',
                }}>
                  {text}
                  <span style={{ fontSize: 11, background: isActive ? 'rgba(255,255,255,0.2)' : C.border, color: isActive ? '#fff' : C.inkFaint, borderRadius: 99, padding: '0 5px', lineHeight: '16px' }}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Patient list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {errorBanner}
            {isLoading && patients.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 8, color: C.inkFaint }}>
                <Loader2 size={16} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 12.5 }}>Chargement…</span>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '40px 18px', textAlign: 'center' }}>
                {patients.length === 0 ? (
                  <>
                    <UserPlus size={28} color={C.inkFaint} strokeWidth={1} style={{ marginBottom: 10 }} />
                    <div style={{ fontSize: 13, color: C.inkMute, fontWeight: 500 }}>Aucun patient</div>
                    <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 4 }}>Ajoutez votre premier patient.</div>
                  </>
                ) : (
                  <>
                    <Search size={22} color={C.inkFaint} strokeWidth={1.5} style={{ marginBottom: 8 }} />
                    <div style={{ fontSize: 12.5, color: C.inkMute }}>Aucun résultat pour « {search} »</div>
                  </>
                )}
              </div>
            ) : (
              filtered.map((p, i) => {
                const totalSpent = p.purchases.reduce((s, pur) => s + pur.total, 0);
                const lastVisit = p.purchases.length > 0
                  ? [...p.purchases].sort((a, b) => b.date.localeCompare(a.date))[0].date
                  : null;
                const isSelected = selected?.id === p.id;
                return (
                  <button key={p.id} onClick={() => setSelected(isSelected ? null : p)}
                    style={{ width: '100%', padding: '11px 18px', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: C.f, borderBottom: `1px solid ${C.hairline}`, background: isSelected ? C.brandLt : 'transparent', transition: 'background 0.1s', display: 'block' }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(15,15,20,0.025)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={p.name} idx={i} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                          <TypePill type={p.type} />
                        </div>
                        <div style={{ fontSize: 11.5, color: C.inkMute }}>
                          {p.purchases.length} visite{p.purchases.length > 1 ? 's' : ''}
                          {lastVisit && <span style={{ marginLeft: 6, color: C.inkFaint }}>{formatShortDate(lastVisit)}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? C.brand : C.ink, fontFamily: C.fm }}>{fmt(totalSpent)}</div>
                        {p.allergies.length > 0 && <AlertTriangle size={10} color={C.red} strokeWidth={2} style={{ marginTop: 3 }} />}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT: DETAIL OR EMPTY STATE ─────────────────────────────── */}
        {selected && selectedIdx >= 0 ? (
          <PatientDetail
            patient={selected}
            idx={selectedIdx}
            onClose={() => setSelected(null)}
            onEdit={() => setEditPatient(selected)}
            onDelete={() => handleDelete(selected.id)}
            onAddPurchase={p => handleAddPurchase(selected.id, p)}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: C.inkFaint }}>
            <UserPlus size={40} color={C.inkGhost} strokeWidth={1} />
            <div style={{ fontSize: 14, color: C.inkMute, fontWeight: 500 }}>Sélectionnez un patient</div>
            <div style={{ fontSize: 12.5, color: C.inkFaint }}>Cliquez sur un patient dans la liste pour afficher sa fiche.</div>
          </div>
        )}
      </div>

      {/* Modals */}
      {(showNewModal || editPatient) && (
        <PatientModal
          patient={editPatient}
          onSave={handleSavePatient}
          onClose={() => { if (!saving) { setShowNewModal(false); setEditPatient(null); } }}
          saving={saving}
        />
      )}
    </>
  );
}
