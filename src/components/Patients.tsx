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

// ── Patient Detail Panel ──────────────────────────────────────────────────────
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

  const totalSpent = patient.purchases.reduce((s, p) => s + p.total, 0);
  const lastVisit = patient.purchases.length > 0
    ? [...patient.purchases].sort((a, b) => b.date.localeCompare(a.date))[0].date
    : null;

  const whatsappMessage = () => {
    const msg = encodeURIComponent(
      `Bonjour ${patient.name.split(' ')[0]} 👋\n\nMerci de votre fidélité à notre pharmacie.\nVous pouvez nous contacter pour toute ordonnance ou renouvellement.\n\nÀ bientôt !`
    );
    const phone = patient.phone.replace(/[\s+\-()\[\]]/g, '');
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  };

  return (
    <>
      <div style={{
        width: 340, borderLeft: `1px solid ${C.hairline}`, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        background: C.panel, fontFamily: C.f,
        backdropFilter: 'saturate(180%) blur(28px)',
        WebkitBackdropFilter: 'saturate(180%) blur(28px)',
      }}>
        {/* Panel header */}
        <div style={{
          padding: '14px 18px', borderBottom: `1px solid ${C.hairline}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Fiche patient</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={onEdit} title="Modifier" style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.inkMute }}
              onMouseEnter={e => (e.currentTarget.style.background = C.brandLt)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <Edit3 size={13} />
            </button>
            <button onClick={onDelete} title="Supprimer" style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.inkMute }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,30,30,0.08)'; e.currentTarget.style.color = C.red; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.inkMute; }}>
              <Trash2 size={13} />
            </button>
            <button onClick={onClose} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.inkMute }}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px' }}>
          {/* Identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <Avatar name={patient.name} idx={idx} size={48} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: '-0.015em', lineHeight: 1.2 }}>{patient.name}</div>
              <div style={{ fontSize: 12, color: C.inkMute, marginTop: 2 }}>{patient.phone}</div>
              <div style={{ marginTop: 5 }}><TypePill type={patient.type} /></div>
            </div>
          </div>

          {/* Contact info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
            {patient.phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.inkSoft }}>
                <Phone size={11} color={C.inkFaint} strokeWidth={1.5} />
                {patient.phone}
              </div>
            )}
            {patient.email && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.inkSoft }}>
                <Mail size={11} color={C.inkFaint} strokeWidth={1.5} />
                {patient.email}
              </div>
            )}
            {patient.address && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.inkSoft }}>
                <MapPin size={11} color={C.inkFaint} strokeWidth={1.5} />
                {patient.address}
              </div>
            )}
            {patient.dob && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.inkSoft }}>
                <Calendar size={11} color={C.inkFaint} strokeWidth={1.5} />
                {formatDate(patient.dob)}
              </div>
            )}
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
            {[
              { lbl: 'Visites', val: patient.purchases.length.toString() },
              { lbl: 'Dernière', val: lastVisit ? formatShortDate(lastVisit) : 'jamais' },
              { lbl: 'Total FC', val: fmt(totalSpent) },
            ].map(({ lbl, val }, i) => (
              <div key={i} style={{ background: C.brandLt, borderRadius: 9, padding: '9px 11px' }}>
                <div style={{ fontSize: 9.5, color: C.inkFaint, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{lbl}</div>
                <div style={{ fontSize: i === 2 ? 11 : 16, fontWeight: 700, color: C.ink, fontFamily: i !== 1 ? C.fm : 'inherit', lineHeight: 1.2 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Allergies */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
              <AlertTriangle size={10} color={C.inkFaint} strokeWidth={2} />
              Allergies
            </div>
            {patient.allergies.length === 0 ? (
              <div style={{ fontSize: 12, color: C.inkFaint, fontStyle: 'italic' }}>Aucune allergie connue</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {patient.allergies.map(a => (
                  <span key={a} style={{
                    background: 'rgba(200,30,30,0.08)', color: C.red,
                    borderRadius: 99, padding: '4px 10px', fontSize: 11.5, fontWeight: 550,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <AlertTriangle size={9} strokeWidth={2} /> {a}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Profil thérapeutique */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Heart size={10} color={C.inkFaint} strokeWidth={2} />
              Profil thérapeutique
            </div>
            {patient.therapeutic_profile.length === 0 ? (
              <div style={{ fontSize: 12, color: C.inkFaint, fontStyle: 'italic' }}>Aucun profil enregistré</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {patient.therapeutic_profile.map(t => (
                  <span key={t} style={{ background: C.brandLt, color: C.brand, borderRadius: 99, padding: '4px 10px', fontSize: 11.5, fontWeight: 550 }}>{t}</span>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          {patient.notes && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                <FileText size={10} color={C.inkFaint} strokeWidth={2} />
                Notes
              </div>
              <div style={{
                fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5,
                background: 'rgba(15,15,20,0.03)', borderRadius: 8,
                padding: '10px 12px',
              }}>
                {patient.notes}
              </div>
            </div>
          )}

          {/* ── Ordonnances liées ──────────────────────────────────────────── */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <FileText size={10} color={C.inkFaint} strokeWidth={2} />
                Ordonnances ({patOrdonnances.length})
              </span>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab: 'ordonnances' } }))}
                style={{ fontSize: 10.5, color: C.brand, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3, padding: 0, fontFamily: C.f }}
              >
                {patOrdonnances.length > 0 ? 'Voir toutes' : 'Créer'}
                <ChevronRight size={10} strokeWidth={2} />
              </button>
            </div>
            {patOrdonnances.length === 0 ? (
              <div style={{ fontSize: 12, color: C.inkFaint, fontStyle: 'italic' }}>Aucune ordonnance liée</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {patOrdonnances.slice(0, 3).map(ord => {
                  const st = ORD_STATUS[ord.status];
                  return (
                    <div key={ord.id} style={{ background: C.panel, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: '9px 12px', boxShadow: glassRing }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontFamily: C.fm, fontSize: 10.5, color: C.inkMute }}>{ord.ref}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, background: st.bg, color: st.fg, borderRadius: 99, padding: '1px 7px' }}>{st.label}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: C.inkSoft }}>
                        {ord.items.length} médicament{ord.items.length > 1 ? 's' : ''}
                        {' · '}{new Date(ord.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </div>
                      {ord.medecin && <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>Dr. {ord.medecin}</div>}
                    </div>
                  );
                })}
                {patOrdonnances.length > 3 && (
                  <button onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab: 'ordonnances' } }))}
                    style={{ fontSize: 11.5, color: C.brand, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '2px 0', fontFamily: C.f }}>
                    +{patOrdonnances.length - 3} de plus…
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Résumé fidélité ────────────────────────────────────────────── */}
          {patient.purchases.length > 0 && (() => {
            const sorted = [...patient.purchases].sort((a, b) => a.date.localeCompare(b.date));
            const firstDate = sorted[0]?.date;
            const monthsActive = firstDate
              ? Math.max(1, Math.ceil((Date.now() - new Date(firstDate).getTime()) / (30.44 * 86400000)))
              : 1;
            const freqPerMonth = (patient.purchases.length / monthsActive).toFixed(1);
            // Top 3 produits achetés
            const productFreq: Record<string, number> = {};
            patient.purchases.forEach(p => p.items.forEach(item => {
              const name = item.split('×')[0]?.trim() || item;
              productFreq[name] = (productFreq[name] || 0) + 1;
            }));
            const topProducts = Object.entries(productFreq).sort((a, b) => b[1] - a[1]).slice(0, 3);

            return (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <TrendingUp size={10} color={C.inkFaint} strokeWidth={2} />
                  Résumé fidélité
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: topProducts.length > 0 ? 8 : 0 }}>
                  <div style={{ background: C.brandLt, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.brand }}>{fmt(totalSpent)}</div>
                    <div style={{ fontSize: 10, color: C.inkMute, marginTop: 1 }}>Total FC</div>
                  </div>
                  <div style={{ background: 'rgba(37,99,235,0.06)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#2563eb' }}>{patient.purchases.length}</div>
                    <div style={{ fontSize: 10, color: C.inkMute, marginTop: 1 }}>Visites</div>
                  </div>
                  <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#b45309' }}>{freqPerMonth}</div>
                    <div style={{ fontSize: 10, color: C.inkMute, marginTop: 1 }}>×/mois</div>
                  </div>
                </div>
                {topProducts.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {topProducts.map(([name, count]) => (
                      <span key={name} style={{
                        fontSize: 10.5, background: 'rgba(16,120,90,0.06)',
                        color: C.brand, borderRadius: 5, padding: '3px 7px', fontWeight: 550,
                      }}>
                        {name} ×{count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Historique achats */}
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Historique des achats ({patient.purchases.length})</span>
              <button onClick={() => setShowAddPurchase(true)} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: C.brandLt, border: 'none', borderRadius: 99,
                padding: '3px 8px', fontSize: 10.5, color: C.brand, fontWeight: 600, cursor: 'pointer',
              }}>
                <Plus size={9} strokeWidth={2.5} /> Ajouter
              </button>
            </div>
            {patient.purchases.length === 0 ? (
              <div style={{ fontSize: 12, color: C.inkFaint, fontStyle: 'italic', padding: '8px 0' }}>Aucun achat enregistré</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[...patient.purchases].sort((a, b) => b.date.localeCompare(a.date)).map(pur => (
                  <div key={pur.id} style={{
                    background: C.panel, border: `1px solid ${C.hairline}`,
                    borderRadius: 10, padding: '10px 12px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: C.fm, fontSize: 10.5, color: C.inkMute }}>{pur.ticket}</span>
                        <span style={{ fontSize: 10.5, color: C.inkFaint }}>· {formatShortDate(pur.date)}</span>
                        {pur.payment_method && (
                          <span style={{ fontSize: 10, color: C.inkFaint, background: 'rgba(0,0,0,0.05)', borderRadius: 4, padding: '1px 5px' }}>{pur.payment_method}</span>
                        )}
                      </div>
                      <span style={{ fontFamily: C.fm, fontSize: 13, fontWeight: 700, color: C.brand }}>{fmt(pur.total)} FC</span>
                    </div>
                    {pur.items.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {pur.items.map((item, j) => (
                          <span key={j} style={{
                            fontSize: 10.5, background: 'rgba(15,15,20,0.04)',
                            color: C.inkSoft, borderRadius: 5, padding: '2px 6px',
                          }}>
                            {item}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions footer */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.hairline}`, display: 'flex', gap: 7, flexShrink: 0 }}>
          <button onClick={whatsappMessage} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '8px 0', border: 'none', borderRadius: 9,
            background: '#25D366', color: '#fff',
            fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
          }}>
            <MessageCircle size={13} strokeWidth={1.5} /> WhatsApp
          </button>
          <button onClick={onEdit} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '8px 0', border: `1px solid ${C.border}`, borderRadius: 9,
            background: 'transparent', color: C.inkSoft,
            fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: C.f,
          }}>
            <Edit3 size={13} strokeWidth={1.5} /> Modifier
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
    let list = patients;
    if (activeType !== 'Tous') list = list.filter(p => p.type === activeType);
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

  const typeChips: { label: string; value: 'Tous' | PatientType }[] = [
    { label: `Tous (${patients.length})`, value: 'Tous' },
    { label: `Fidèles (${patients.filter(p => p.type === 'fidèle').length})`, value: 'fidèle' },
    { label: `Récurrents (${patients.filter(p => p.type === 'récurrent').length})`, value: 'récurrent' },
    { label: `Occasionnels (${patients.filter(p => p.type === 'occasionnel').length})`, value: 'occasionnel' },
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
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: C.f, color: C.ink }}>
        {errorBanner}
        {/* ── Search bar ── */}
        <div style={{
          padding: '12px 28px', display: 'flex', alignItems: 'center', gap: 8,
          background: C.panel, backdropFilter: 'saturate(180%) blur(28px)',
          WebkitBackdropFilter: 'saturate(180%) blur(28px)',
          borderBottom: `1px solid ${C.hairline}`, flexShrink: 0,
        }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <Search size={13} color={C.inkMute} strokeWidth={1.5} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Nom, téléphone, email…"
              style={{
                width: '100%', height: 34, paddingLeft: 30, paddingRight: 10,
                border: `1px solid ${C.border}`, borderRadius: 8,
                fontSize: 12.5, background: C.panelSolid, color: C.ink,
                outline: 'none', boxSizing: 'border-box', fontFamily: C.f,
              }}
            />
          </div>
          <button
            data-tour="patients-add"
            onClick={() => setShowNewModal(true)}
            style={{
              height: 34, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6,
              background: C.ink, color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.1)',
              fontFamily: C.f,
            }}
          >
            <Plus size={13} strokeWidth={2.5} />
            Nouveau patient
          </button>
        </div>

        {/* ── Filter chips ── */}
        <div style={{
          padding: '8px 28px', display: 'flex', gap: 6, flexShrink: 0,
          overflowX: 'auto', background: C.panel, borderBottom: `1px solid ${C.hairline}`,
        }}>
          {typeChips.map(({ label, value }) => {
            const isActive = activeType === value;
            return (
              <button key={value} onClick={() => setActiveType(value)} style={{
                padding: '5px 12px', borderRadius: 99,
                fontSize: 11.5, fontWeight: isActive ? 550 : 500, cursor: 'pointer', whiteSpace: 'nowrap',
                border: `1px solid ${isActive ? C.brandMid : C.border}`,
                background: isActive ? C.brandLt : 'transparent',
                color: isActive ? C.brand : C.inkSoft,
                fontFamily: C.f,
              }}>
                {label}
              </button>
            );
          })}
        </div>

        {/* ── KPIs ── */}
        <div style={{
          padding: '12px 28px', display: 'flex', gap: 10, flexShrink: 0,
          borderBottom: `1px solid ${C.hairline}`,
        }}>
          {[
            { lbl: 'Total patients', val: kpis.total.toString(), color: C.ink },
            { lbl: 'Actifs ce mois', val: kpis.activeThisMonth.toString(), color: C.brand },
            { lbl: 'LTV moyen', val: `${fmt(kpis.ltv)} FC`, color: C.inkSoft },
            { lbl: 'Avec allergies', val: kpis.withAllergies.toString(), color: C.red },
          ].map(({ lbl, val, color }) => (
            <div key={lbl} style={{
              flex: 1, background: C.panel, border: `1px solid ${C.hairline}`,
              borderRadius: 10, padding: '10px 14px',
              backdropFilter: 'saturate(180%) blur(20px)',
              WebkitBackdropFilter: 'saturate(180%) blur(20px)',
              boxShadow: glassRing,
            }}>
              <div style={{ fontSize: 10, color: C.inkFaint, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{lbl}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: C.fm, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Patient grid */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
            {filtered.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: '56px 24px', gap: 12,
                background: C.panel, border: `1px solid ${C.hairline}`, borderRadius: 12,
              }}>
                {patients.length === 0 ? (
                  <>
                    <div style={{ width: 56, height: 56, borderRadius: 14, background: C.brandLt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <UserPlus size={26} color={C.brand} strokeWidth={1.5} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>Aucun patient enregistré</div>
                      <div style={{ fontSize: 13, color: C.inkMute, marginTop: 4 }}>Commencez par ajouter votre premier patient.</div>
                    </div>
                    <button onClick={() => setShowNewModal(true)} style={{
                      padding: '8px 20px', border: 'none', borderRadius: 8,
                      background: C.brand, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}>
                      Nouveau patient
                    </button>
                  </>
                ) : (
                  <>
                    <Search size={22} color={C.inkFaint} strokeWidth={1.5} />
                    <span style={{ fontSize: 13, color: C.inkMute }}>Aucun résultat pour « {search} »</span>
                  </>
                )}
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: selected ? 'repeat(auto-fill, minmax(240px, 1fr))' : 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 12,
              }}>
                {filtered.map((p, i) => {
                  const totalSpent = p.purchases.reduce((s, pur) => s + pur.total, 0);
                  const lastVisit = p.purchases.length > 0
                    ? [...p.purchases].sort((a, b) => b.date.localeCompare(a.date))[0].date
                    : null;
                  const isSelected = selected?.id === p.id;

                  return (
                    <article
                      key={p.id}
                      onClick={() => setSelected(isSelected ? null : p)}
                      style={{
                        background: isSelected ? `${C.brand}08` : C.panel,
                        border: `1.5px solid ${isSelected ? C.brandMid : C.hairline}`,
                        borderRadius: 12, padding: '16px 18px', cursor: 'pointer',
                        backdropFilter: 'saturate(180%) blur(20px)',
                        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
                        boxShadow: isSelected ? `0 0 0 3px ${C.brandLt}, ${glassRing}` : glassRing,
                        transition: 'all 0.14s',
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) e.currentTarget.style.borderColor = C.brandMid;
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) e.currentTarget.style.borderColor = C.hairline;
                      }}
                    >
                      {/* Top row */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                        <Avatar name={p.name} idx={i} size={38} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 550, color: C.ink, letterSpacing: '-0.01em', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: C.f }}>{p.name}</div>
                          <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 2 }}>{p.phone}</div>
                        </div>
                        <TypePill type={p.type} />
                      </div>

                      {/* Stats */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 9.5, color: C.inkFaint, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Visites</div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, fontFamily: C.fm }}>{p.purchases.length}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9.5, color: C.inkFaint, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Dernière</div>
                          <div style={{ fontSize: 11, fontWeight: 500, color: C.inkSoft }}>{lastVisit ? formatShortDate(lastVisit) : 'jamais'}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9.5, color: C.inkFaint, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Total FC</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.brand, fontFamily: C.fm }}>{fmt(totalSpent)}</div>
                        </div>
                      </div>

                      {/* Allergy warning */}
                      {p.allergies.length > 0 && (
                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <AlertTriangle size={10} color={C.red} strokeWidth={2} />
                          <span style={{ fontSize: 11, color: C.red, fontWeight: 550 }}>
                            Allergie : {p.allergies.slice(0, 2).join(', ')}{p.allergies.length > 2 ? ` +${p.allergies.length - 2}` : ''}
                          </span>
                        </div>
                      )}

                      {/* Therapeutic tags (preview) */}
                      {p.therapeutic_profile.length > 0 && (
                        <div style={{ marginTop: 7, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {p.therapeutic_profile.slice(0, 3).map(t => (
                            <span key={t} style={{ background: C.brandLt, color: C.brand, borderRadius: 4, padding: '2px 7px', fontSize: 10.5, fontWeight: 500 }}>{t}</span>
                          ))}
                          {p.therapeutic_profile.length > 3 && (
                            <span style={{ color: C.inkFaint, fontSize: 10.5 }}>+{p.therapeutic_profile.length - 3}</span>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selected && selectedIdx >= 0 && (
            <PatientDetail
              patient={selected}
              idx={selectedIdx}
              onClose={() => setSelected(null)}
              onEdit={() => { setEditPatient(selected); }}
              onDelete={() => handleDelete(selected.id)}
              onAddPurchase={p => handleAddPurchase(selected.id, p)}
            />
          )}
        </div>
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
