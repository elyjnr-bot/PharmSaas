import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Plus, X, Truck, Phone, Mail, Edit2, Trash2, Check, ChevronDown, ShoppingCart } from 'lucide-react';
import { supabase } from '../lib/supabase';

// ── Design tokens Chalk ───────────────────────────────────────────────────────
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
  amber:    '#b75f06',
  amberLt:  'rgba(183,95,6,0.09)',
  blue:     '#0651bc',
  blueLt:   'rgba(6,81,188,0.08)',
  fm:       '"SF Mono","Geist Mono",ui-monospace,Menlo,monospace',
  f:        '-apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,system-ui,sans-serif',
};

const card: React.CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.hairline}`,
  borderRadius: 12,
  backdropFilter: 'saturate(180%) blur(20px)',
  WebkitBackdropFilter: 'saturate(180%) blur(20px)',
  boxShadow: `0 1px 0 ${C.hairline}`,
};

const GRADIENTS = [
  'linear-gradient(135deg,#537d14,#6a9e28)',
  'linear-gradient(135deg,#0651bc,#3b86e0)',
  'linear-gradient(135deg,#6e44b0,#9b6dd6)',
  'linear-gradient(135deg,#b75f06,#e08533)',
  'linear-gradient(135deg,#c81e1e,#e05555)',
  'linear-gradient(135deg,#0891b2,#22b8cf)',
];

const SPECIALTIES = [
  'Médicaments génériques',
  'Médicaments de marque',
  'Vaccins',
  'Dispositifs médicaux',
  'Produits biologiques',
  'Parapharmacie',
  'Produits vétérinaires',
  'Réactifs de laboratoire',
  'Produits nutritionnels',
  'Autre',
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  specialty?: string;
  notes?: string;
  created_at: string;
}

const STORAGE_KEY = 'pharma_suppliers';

function loadSuppliers(): Supplier[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveSuppliers(suppliers: Supplier[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(suppliers)); } catch { /* quota */ }
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, idx = 0, size = 40 }: { name: string; idx?: number; size?: number }) {
  const initials = name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('');
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28,
      background: GRADIENTS[idx % GRADIENTS.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.34, fontWeight: 700, letterSpacing: '-0.01em',
      flexShrink: 0,
    }}>{initials || <Truck size={size * 0.4} color="#fff" strokeWidth={1.8} />}</div>
  );
}

// ── Pill ──────────────────────────────────────────────────────────────────────
type PillColor = 'gray' | 'green' | 'red' | 'amber' | 'blue';
function Pill({ children, color = 'gray' }: { children: React.ReactNode; color?: PillColor }) {
  const p: Record<PillColor, { bg: string; fg: string; dot: string }> = {
    gray:  { bg: 'rgba(15,15,20,0.05)', fg: C.inkSoft,  dot: C.inkFaint },
    green: { bg: C.brandLt,            fg: C.brand,    dot: C.brand    },
    red:   { bg: C.redLt,              fg: C.red,      dot: C.red      },
    amber: { bg: C.amberLt,            fg: C.amber,    dot: C.amber    },
    blue:  { bg: C.blueLt,             fg: C.blue,     dot: C.blue     },
  };
  const s = p[color];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: s.bg, color: s.fg, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500, lineHeight: 1.4, letterSpacing: '-0.005em', fontFamily: C.f, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: 99, background: s.dot, flexShrink: 0 }} />
      {children}
    </span>
  );
}

// ── Input helper ──────────────────────────────────────────────────────────────
function Field({
  label, value, onChange, placeholder, type = 'text', required = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 550, color: C.inkMute, marginBottom: 6 }}>
        {label}{required && <span style={{ color: C.red, marginLeft: 2 }}>*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', height: 40, border: `1.5px solid ${focused ? C.brand : C.hairline}`,
          borderRadius: 8, padding: '0 12px', fontSize: 13, background: 'transparent',
          color: C.ink, fontFamily: C.f, outline: 'none', boxSizing: 'border-box',
          transition: 'border-color 0.12s',
        }}
      />
    </div>
  );
}

// ── Supplier Modal (Add / Edit) ───────────────────────────────────────────────
interface SupplierModalProps {
  initial?: Partial<Supplier>;
  onClose: () => void;
  onSave: (s: Omit<Supplier, 'id' | 'created_at'>) => void;
}
function SupplierModal({ initial, onClose, onSave }: SupplierModalProps) {
  const [name, setName]               = useState(initial?.name || '');
  const [contact, setContact]         = useState(initial?.contact_person || '');
  const [phone, setPhone]             = useState(initial?.phone || '');
  const [email, setEmail]             = useState(initial?.email || '');
  const [specialty, setSpecialty]     = useState(initial?.specialty || '');
  const [notes, setNotes]             = useState(initial?.notes || '');
  const [specOpen, setSpecOpen]       = useState(false);
  const [saving, setSaving]           = useState(false);

  const isEditing = !!initial?.id;
  const valid = name.trim().length >= 2;

  const handleSubmit = () => {
    if (!valid) return;
    setSaving(true);
    setTimeout(() => {
      onSave({
        name: name.trim(),
        contact_person: contact.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        specialty: specialty || undefined,
        notes: notes.trim() || undefined,
      });
      setSaving(false);
    }, 120);
  };

  const [focusedNotes, setFocusedNotes] = useState(false);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 18, width: '100%', maxWidth: 520, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '18px 22px 16px', borderBottom: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'rgba(255,255,255,0.97)', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: C.brandLt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Truck size={15} color={C.brand} strokeWidth={1.8} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.ink, letterSpacing: '-0.02em' }}>
              {isEditing ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: C.bg, border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} color={C.inkMute} />
          </button>
        </div>

        <div style={{ padding: '20px 22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Nom */}
          <Field label="Nom du fournisseur" value={name} onChange={setName} placeholder="PHARMA DIST S.A., MedSupply..." required />

          {/* Contact + téléphone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Personne de contact" value={contact} onChange={setContact} placeholder="Jean Kabila..." />
            <Field label="Téléphone" value={phone} onChange={setPhone} placeholder="+243 81..." type="tel" />
          </div>

          {/* Email */}
          <Field label="E-mail" value={email} onChange={setEmail} placeholder="contact@fournisseur.com" type="email" />

          {/* Spécialité — dropdown */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 550, color: C.inkMute, marginBottom: 6 }}>Spécialité</label>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setSpecOpen(v => !v)}
                style={{
                  width: '100%', height: 40, border: `1.5px solid ${specOpen ? C.brand : C.hairline}`,
                  borderRadius: 8, padding: '0 12px', fontSize: 13, background: 'transparent',
                  color: specialty ? C.ink : C.inkFaint, fontFamily: C.f, outline: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                  transition: 'border-color 0.12s', boxSizing: 'border-box',
                }}
              >
                <span>{specialty || 'Sélectionner…'}</span>
                <ChevronDown size={14} color={C.inkMute} style={{ transform: specOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>
              {specOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                  background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, overflow: 'hidden',
                }}>
                  {SPECIALTIES.map(sp => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => { setSpecialty(sp); setSpecOpen(false); }}
                      style={{
                        display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left',
                        background: specialty === sp ? C.brandLt : 'transparent',
                        color: specialty === sp ? C.brand : C.inkSoft,
                        fontWeight: specialty === sp ? 600 : 450,
                        border: 'none', borderBottom: `1px solid ${C.border}`,
                        cursor: 'pointer', fontSize: 13, fontFamily: C.f,
                      }}
                      onMouseEnter={e => { if (specialty !== sp) (e.currentTarget as HTMLButtonElement).style.background = C.brandLt; }}
                      onMouseLeave={e => { if (specialty !== sp) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                    >
                      {sp}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 550, color: C.inkMute, marginBottom: 6 }}>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Conditions de paiement, délais de livraison…"
              rows={2}
              onFocus={() => setFocusedNotes(true)}
              onBlur={() => setFocusedNotes(false)}
              style={{
                width: '100%', border: `1.5px solid ${focusedNotes ? C.brand : C.hairline}`,
                borderRadius: 8, padding: '8px 12px', fontSize: 13, background: 'transparent',
                color: C.ink, fontFamily: C.f, outline: 'none', resize: 'none',
                boxSizing: 'border-box', lineHeight: 1.5, transition: 'border-color 0.12s',
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.hairline}`, borderRadius: 8, padding: '9px 18px', fontSize: 13, color: C.inkSoft, cursor: 'pointer', fontFamily: C.f }}>
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={!valid || saving}
              style={{
                background: valid && !saving ? C.brand : C.hairline,
                color: valid && !saving ? '#fff' : C.inkMute,
                border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 13, fontWeight: 600,
                cursor: !valid || saving ? 'not-allowed' : 'pointer', fontFamily: C.f,
                display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.12s',
              }}
            >
              {saving
                ? <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin 0.8s linear infinite' }} />
                : isEditing ? <Check size={14} /> : <Plus size={14} />}
              {isEditing ? 'Enregistrer' : 'Ajouter le fournisseur'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteModal({ supplier, onConfirm, onClose }: { supplier: Supplier; onConfirm: () => void; onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 16, width: '100%', maxWidth: 380, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '22px 22px 20px' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: C.redLt, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Trash2 size={20} color={C.red} strokeWidth={1.8} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em', marginBottom: 6 }}>
            Supprimer le fournisseur ?
          </div>
          <div style={{ fontSize: 13, color: C.inkMute, lineHeight: 1.6 }}>
            <strong style={{ color: C.ink }}>{supplier.name}</strong> sera définitivement supprimé. Cette action est irréversible.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.hairline}`, borderRadius: 8, padding: '9px 18px', fontSize: 13, color: C.inkSoft, cursor: 'pointer', fontFamily: C.f }}>
              Annuler
            </button>
            <button onClick={onConfirm} style={{ background: C.red, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: C.f, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trash2 size={13} /> Supprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Fournisseurs({ onOrderSupplier }: { onOrderSupplier?: (name: string) => void } = {}) {
  const [suppliers, setSuppliers]     = useState<Supplier[]>([]);
  const [search, setSearch]           = useState('');
  const [showModal, setShowModal]     = useState(false);
  const [editTarget, setEditTarget]   = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [expandedId, setExpandedId]   = useState<string | null>(null);

  // Stats commandes depuis Supabase (source unique de vérité)
  const [orderStats, setOrderStats] = useState<Record<string, { count: number; lastDate: string | null }>>({});

  // Load suppliers
  useEffect(() => {
    setSuppliers(loadSuppliers());
  }, []);

  // Charger les stats de commandes depuis Supabase
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('purchase_orders')
          .select('supplier, created_at, order_date')
          .not('supplier', 'is', null);
        if (!data) return;
        const stats: Record<string, { count: number; lastDate: string | null }> = {};
        for (const o of data) {
          const name = o.supplier || '';
          if (!name) continue;
          if (!stats[name]) stats[name] = { count: 0, lastDate: null };
          stats[name].count++;
          const d = o.created_at || o.order_date;
          if (d && (!stats[name].lastDate || d > stats[name].lastDate!)) {
            stats[name].lastDate = d;
          }
        }
        setOrderStats(stats);
      } catch { /* offline — ignore */ }
    })();
  }, [suppliers]);

  const saveAndSet = useCallback((updated: Supplier[]) => {
    setSuppliers(updated);
    saveSuppliers(updated);
  }, []);

  const handleAdd = (data: Omit<Supplier, 'id' | 'created_at'>) => {
    const newSupplier: Supplier = {
      ...data,
      id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      created_at: new Date().toISOString(),
    };
    saveAndSet([newSupplier, ...suppliers]);
    setShowModal(false);
  };

  const handleEdit = (data: Omit<Supplier, 'id' | 'created_at'>) => {
    if (!editTarget) return;
    const updated = suppliers.map(s =>
      s.id === editTarget.id ? { ...s, ...data } : s
    );
    saveAndSet(updated);
    setEditTarget(null);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    saveAndSet(suppliers.filter(s => s.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.contact_person || '').toLowerCase().includes(q) ||
      (s.specialty || '').toLowerCase().includes(q) ||
      (s.phone || '').includes(q)
    );
  }, [suppliers, search]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: C.f, color: C.ink }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── KPI Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          {
            lbl: 'Total fournisseurs',
            val: String(suppliers.length),
            color: C.brand,
            bg: C.brandLt,
          },
          {
            lbl: 'Spécialités couvertes',
            val: String(new Set(suppliers.map(s => s.specialty).filter(Boolean)).size),
            color: C.blue,
            bg: C.blueLt,
          },
          {
            lbl: 'Avec coordonnées',
            val: String(suppliers.filter(s => s.phone || s.email).length),
            color: C.amber,
            bg: C.amberLt,
          },
        ].map((stat, i) => (
          <div key={i} style={{ ...card, padding: '16px 20px' }}>
            <div style={{ fontSize: 12, color: C.inkMute, marginBottom: 6 }}>{stat.lbl}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: stat.color, letterSpacing: '-0.03em', fontFamily: C.fm }}>{stat.val}</div>
          </div>
        ))}
      </div>

      {/* ── Search + New button ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} color={C.inkMute} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un fournisseur…"
            style={{
              width: '100%', height: 36, paddingLeft: 32, paddingRight: 10,
              border: `1px solid ${C.hairline}`, borderRadius: 8, fontSize: 13,
              background: C.panel2, color: C.ink, fontFamily: C.f, outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={e => (e.target.style.borderColor = C.brand)}
            onBlur={e => (e.target.style.borderColor = C.hairline)}
          />
        </div>

        <button
          onClick={() => setShowModal(true)}
          style={{
            background: C.ink, color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '-0.01em',
            boxShadow: '0 1px 3px rgba(0,0,0,0.12)', flexShrink: 0,
          }}
        >
          <Plus size={14} strokeWidth={2.5} />
          Nouveau fournisseur
        </button>
      </div>

      {/* ── Supplier list ── */}
      {filtered.length === 0 ? (
        <div style={{ ...card, padding: '56px 24px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: C.brandLt, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Truck size={26} color={C.brand} strokeWidth={1.5} />
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
            {search ? `Aucun résultat pour "${search}"` : 'Aucun fournisseur enregistré'}
          </p>
          <p style={{ fontSize: 13, color: C.inkMute, marginBottom: 20 }}>
            {search ? 'Essayez un autre terme de recherche.' : 'Ajoutez votre premier fournisseur pour commencer.'}
          </p>
          {!search && (
            <button
              onClick={() => setShowModal(true)}
              style={{ background: C.brand, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <Plus size={14} /> Ajouter un fournisseur
            </button>
          )}
        </div>
      ) : (
        <div style={{ ...card, overflow: 'hidden' }}>
          {filtered.map((sup, idx) => {
            const stats = orderStats[sup.name];
            const expanded = expandedId === sup.id;

            return (
              <div key={sup.id} style={{ borderBottom: idx < filtered.length - 1 ? `1px solid ${C.hairline}` : 'none' }}>
                {/* Main row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px' }}>

                  {/* Avatar */}
                  <Avatar name={sup.name} idx={idx} size={42} />

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: '-0.01em' }}>{sup.name}</span>
                      {sup.specialty && <Pill color="green">{sup.specialty}</Pill>}
                    </div>
                    <div style={{ fontSize: 12, color: C.inkMute, marginTop: 3, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      {sup.contact_person && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontWeight: 500 }}>{sup.contact_person}</span>
                        </span>
                      )}
                      {sup.phone && (
                        <a
                          href={`tel:${sup.phone}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.inkMute, textDecoration: 'none', fontFamily: C.fm, fontSize: 11.5 }}
                          onClick={e => e.stopPropagation()}
                        >
                          <Phone size={10} strokeWidth={2} />
                          {sup.phone}
                        </a>
                      )}
                      {sup.email && (
                        <a
                          href={`mailto:${sup.email}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.inkMute, textDecoration: 'none', fontSize: 11.5 }}
                          onClick={e => e.stopPropagation()}
                        >
                          <Mail size={10} strokeWidth={2} />
                          {sup.email}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Order stats */}
                  {stats && (
                    <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 80 }}>
                      <div style={{ fontSize: 10.5, color: C.inkFaint, marginBottom: 2 }}>Commandes</div>
                      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: C.fm, color: C.brand }}>{stats.count}</div>
                      {stats.lastDate && (
                        <div style={{ fontSize: 10.5, color: C.inkFaint }}>
                          {formatDate(stats.lastDate)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => setEditTarget(sup)}
                      title="Modifier"
                      style={{ background: C.brandLt, border: `1px solid ${C.brandMid}`, borderRadius: 7, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.brand, fontWeight: 600, fontFamily: C.f, transition: 'all 0.12s' }}
                    >
                      <Edit2 size={12} strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(sup)}
                      title="Supprimer"
                      style={{ background: C.redLt, border: `1px solid rgba(200,30,30,0.15)`, borderRadius: 7, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.red, fontWeight: 600, fontFamily: C.f, transition: 'all 0.12s' }}
                    >
                      <Trash2 size={12} strokeWidth={2} />
                    </button>
                  </div>

                  {/* Expand */}
                  <button
                    onClick={() => setExpandedId(expanded ? null : sup.id)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: C.inkMute, display: 'flex', flexShrink: 0 }}
                  >
                    <ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </button>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div style={{ padding: '0 20px 16px 76px', borderTop: `1px solid ${C.hairline}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                      {sup.contact_person && (
                        <div>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Contact</div>
                          <div style={{ fontSize: 13, color: C.inkSoft }}>{sup.contact_person}</div>
                        </div>
                      )}
                      {sup.phone && (
                        <div>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Téléphone</div>
                          <a href={`tel:${sup.phone}`} style={{ fontSize: 13, color: C.brand, fontFamily: C.fm, textDecoration: 'none' }}>{sup.phone}</a>
                        </div>
                      )}
                      {sup.email && (
                        <div>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>E-mail</div>
                          <a href={`mailto:${sup.email}`} style={{ fontSize: 13, color: C.brand, textDecoration: 'none' }}>{sup.email}</a>
                        </div>
                      )}
                      {sup.specialty && (
                        <div>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Spécialité</div>
                          <div style={{ fontSize: 13, color: C.inkSoft }}>{sup.specialty}</div>
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Ajouté le</div>
                        <div style={{ fontSize: 13, color: C.inkSoft }}>{formatDate(sup.created_at)}</div>
                      </div>
                      {stats && (
                        <div>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Commandes passées</div>
                          <div style={{ fontSize: 13, color: C.inkSoft }}>
                            {stats.count} commande{stats.count !== 1 ? 's' : ''}
                            {stats.lastDate && ` · dernière le ${formatDate(stats.lastDate)}`}
                          </div>
                        </div>
                      )}
                    </div>
                    {sup.notes && (
                      <div style={{ marginTop: 4, padding: '10px 14px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Notes</div>
                        <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.6 }}>{sup.notes}</div>
                      </div>
                    )}

                    {/* Quick-action buttons */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      {/* Créer une commande → navigue vers l'onglet Commandes avec fournisseur pré-rempli */}
                      {onOrderSupplier && (
                        <button
                          onClick={() => onOrderSupplier(sup.name)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                            background: C.ink, color: '#fff', border: 'none', cursor: 'pointer',
                          }}
                        >
                          <ShoppingCart size={13} /> Commander
                        </button>
                      )}
                      {sup.phone && (
                        <>
                          <a
                            href={`tel:${sup.phone}`}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                              background: C.brandLt, color: C.brand, border: `1px solid ${C.brandMid}`,
                              textDecoration: 'none', cursor: 'pointer',
                            }}
                          >
                            <Phone size={13} /> Appeler
                          </a>
                          <a
                            href={`https://wa.me/${sup.phone.replace(/[\s\-().]/g,'').replace(/^00/,'+')}?text=${encodeURIComponent(`Bonjour ${sup.contact_person || sup.name}, je souhaite passer une commande.`)}`}
                            target="_blank" rel="noopener noreferrer"
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                              background: 'rgba(37,211,102,0.1)', color: '#128C7E',
                              border: '1px solid rgba(37,211,102,0.3)',
                              textDecoration: 'none', cursor: 'pointer',
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="#128C7E"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.533 5.853L0 24l6.334-1.509A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.647-.49-5.17-1.348l-.371-.22-3.762.896.957-3.66-.242-.382A9.926 9.926 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                            WhatsApp
                          </a>
                        </>
                      )}
                      {sup.email && (
                        <a
                          href={`mailto:${sup.email}`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                            background: C.blueLt, color: C.blue, border: `1px solid rgba(6,81,188,0.15)`,
                            textDecoration: 'none', cursor: 'pointer',
                          }}
                        >
                          <Mail size={13} /> E-mail
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modals ── */}
      {showModal && (
        <SupplierModal onClose={() => setShowModal(false)} onSave={handleAdd} />
      )}
      {editTarget && (
        <SupplierModal
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          supplier={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
