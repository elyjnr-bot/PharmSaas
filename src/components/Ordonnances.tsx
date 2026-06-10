import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Plus, X, AlertTriangle, Printer, ChevronRight, FileText, ShoppingCart, Loader2 } from 'lucide-react';
import { useMedications } from '../lib/useMedications';
import { useOrdonnances, Ordonnance, OrdonnanceItem, OrdStatus, genOrdRef } from '../lib/useOrdonnances';
import { usePatients, Patient } from '../lib/usePatients';
import { useWorkflow } from '../lib/workflowContext';
import { supabase } from '../lib/supabase';

// ── Design tokens (Chalk Premium — source exacte) ─────────────────────────────
const C = {
  panel:      'rgba(255,255,255,0.62)',
  panel2:     'rgba(255,255,255,0.40)',
  panelHi:    'rgba(255,255,255,0.78)',
  panelSolid: '#ffffff',
  hairline:   'rgba(255,255,255,0.55)',
  border:     'rgba(15,15,20,0.06)',
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
const glassRing = 'inset 0 1px 0 rgba(255,255,255,0.8), inset 0 0 0 0.5px rgba(255,255,255,0.5), 0 4px 16px rgba(15,30,25,0.06), 0 1px 2px rgba(15,30,25,0.05)';

// ── Types re-exported from hook (source of truth: src/lib/useOrdonnances.ts) ─
export type { OrdStatus, OrdonnanceItem, Ordonnance };

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_MAP: Record<OrdStatus, { label: string; bg: string; fg: string; dot: string }> = {
  en_attente: { label: 'À dispenser', bg: C.amberLt, fg: C.amber, dot: C.amber },
  partielle:  { label: 'Partielle',   bg: C.blueLt,  fg: C.blue,  dot: C.blue  },
  terminee:   { label: 'Complétée',   bg: C.brandLt, fg: C.brand, dot: C.brand },
};
const FILTERS = [
  { key: 'en_attente', label: 'À traiter'  },
  { key: 'partielle',  label: 'Partielles' },
  { key: 'terminee',   label: 'Terminées'  },
];
const fmt = (n: number) => n.toLocaleString('fr-FR');

// ── Pill ──────────────────────────────────────────────────────────────────────
function Pill({ status, sm }: { status: OrdStatus; sm?: boolean }) {
  const s = STATUS_MAP[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: sm ? 4 : 5,
      background: s.bg, color: s.fg, borderRadius: 99,
      padding: sm ? '1px 7px' : '2px 8px',
      fontSize: sm ? 10.5 : 11, fontWeight: 500, fontFamily: C.f,
      whiteSpace: 'nowrap', letterSpacing: '-0.005em',
    }}>
      <span style={{ width: sm ? 4 : 5, height: sm ? 4 : 5, borderRadius: 99, background: s.dot, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

// ── Avatar initiales ──────────────────────────────────────────────────────────
const GRADS = [
  'linear-gradient(135deg,#10785a,#149a73)',
  'linear-gradient(135deg,#0651bc,#3b86e0)',
  'linear-gradient(135deg,#6e44b0,#9b6dd6)',
  'linear-gradient(135deg,#b75f06,#e08533)',
  'linear-gradient(135deg,#c81e1e,#e85555)',
  'linear-gradient(135deg,#0891b2,#22d3ee)',
];
function initials(name: string) { return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase(); }
function Avatar({ name, idx, size = 30 }: { name: string; idx: number; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: GRADS[idx % GRADS.length], display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.36, fontWeight: 700,
      letterSpacing: '-0.01em', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
    }}>
      {initials(name)}
    </div>
  );
}

// ── Add/Edit Ordonnance Modal ─────────────────────────────────────────────────
function OrdModal({
  ord, onSave, onClose, saving, medications, patients,
}: {
  ord?: Ordonnance | null;
  onSave: (o: Ordonnance) => void | Promise<void>;
  onClose: () => void;
  saving?: boolean;
  medications: { id?: string; name: string; quantity: number; code_produit?: string }[];
  patients: Patient[];
}) {
  const isEdit = !!ord;
  const [patientName, setPatientName] = useState(ord?.patient_name || '');
  const [patientPhone, setPatientPhone] = useState(ord?.patient_phone || '');
  const [patientId, setPatientId] = useState<string | null>(ord?.patient_id || null);
  const [medecin, setMedecin] = useState(ord?.medecin || '');
  const [date, setDate] = useState(ord?.date || new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState(ord?.notes || '');
  const [items, setItems] = useState<OrdonnanceItem[]>(ord?.items || []);
  const [newItem, setNewItem] = useState({ name: '', dci: '', dosage: '', qty: '1' });
  const [selectedMedId, setSelectedMedId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [patSearch, setPatSearch] = useState('');
  const [showPatDrop, setShowPatDrop] = useState(false);
  const patRef = useRef<HTMLDivElement>(null);

  // Close patient dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (patRef.current && !patRef.current.contains(e.target as Node)) setShowPatDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const patSuggestions = useMemo(() => {
    const q = patSearch.trim().toLowerCase();
    if (!q) return patients.slice(0, 5);
    return patients.filter(p => p.name.toLowerCase().includes(q) || p.phone.includes(q)).slice(0, 6);
  }, [patSearch, patients]);

  const selectPatient = (p: Patient) => {
    setPatientName(p.name);
    setPatientPhone(p.phone);
    setPatientId(p.id);
    setPatSearch('');
    setShowPatDrop(false);
  };

  const canSave = patientName.trim() && items.length > 0;

  const medicationSuggestions = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return medications.filter(m => m.name.toLowerCase().includes(q)).slice(0, 5);
  }, [search, medications]);

  const addItem = () => {
    const qty = parseInt(newItem.qty) || 1;
    const med = medications.find(m =>
      selectedMedId ? m.id === selectedMedId : m.name.toLowerCase() === newItem.name.toLowerCase()
    );
    const stockAvail = med?.quantity ?? 0;
    const item: OrdonnanceItem = {
      id: `__item__${Date.now()}`,  // temp id — replaced by UUID after DB save
      medication_id: selectedMedId || med?.id,
      name: newItem.name.trim(),
      dci: newItem.dci.trim(),
      dosage: newItem.dosage.trim(),
      qty,
      qty_delivered: 0,
      stock_available: stockAvail,
      status: stockAvail >= qty ? 'disponible' : 'rupture',
    };
    setItems(prev => [...prev, item]);
    setNewItem({ name: '', dci: '', dosage: '', qty: '1' });
    setSelectedMedId(undefined);
    setSearch('');
  };

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const handleSave = () => {
    if (!canSave) return;
    const saved: Ordonnance = {
      id:           ord?.id || `__new__${Date.now()}`,
      ref:          ord?.ref || genOrdRef(),
      patient_id:   patientId || null,
      patient_name: patientName.trim(),
      patient_phone:patientPhone.trim(),
      medecin:      medecin.trim(),
      date,
      status:       ord?.status || 'en_attente',
      items,
      total:        0,
      notes,
      created_at:   ord?.created_at || new Date().toISOString(),
    };
    onSave(saved);
  };

  const inputStyle = {
    width: '100%', height: 34, padding: '0 10px',
    border: `1px solid ${C.border}`, borderRadius: 7,
    fontSize: 13, background: C.panelSolid, color: C.ink,
    outline: 'none', boxSizing: 'border-box' as const, fontFamily: C.f,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 620, maxHeight: '92vh',
        background: C.panelSolid, borderRadius: 18,
        boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.5)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: C.f,
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: C.brandLt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={15} color={C.brand} strokeWidth={1.5} />
            </div>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>
              {isEdit ? 'Modifier l\'ordonnance' : 'Nouvelle ordonnance'}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
            <X size={18} color={C.inkMute} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {/* Patient + médecin */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
              Informations patient
            </div>

            {/* Patient CRM search */}
            <div ref={patRef} style={{ position: 'relative', marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                Lier à un patient CRM
              </label>
              <div style={{ position: 'relative' }}>
                <Search size={12} color={C.inkMute} strokeWidth={1.5} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  value={patientId ? (patientName || patSearch) : patSearch}
                  onChange={e => {
                    setPatSearch(e.target.value);
                    if (patientId) { setPatientId(null); setPatientName(e.target.value); }
                    setShowPatDrop(true);
                  }}
                  onFocus={() => setShowPatDrop(true)}
                  placeholder="Rechercher dans la base patients…"
                  style={{ ...inputStyle, paddingLeft: 30, background: patientId ? `${C.brandLt}` : C.panelSolid, fontWeight: patientId ? 600 : 400 }}
                />
                {patientId && (
                  <button onClick={() => { setPatientId(null); setPatSearch(''); setPatientName(''); setPatientPhone(''); }}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.inkFaint, display: 'flex' }}>
                    <X size={12} strokeWidth={2.5} />
                  </button>
                )}
              </div>
              {showPatDrop && patSuggestions.length > 0 && !patientId && (
                <div style={{ position: 'absolute', top: 60, left: 0, right: 0, background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
                  {patSuggestions.map(p => (
                    <button key={p.id} onClick={() => selectPatient(p)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: `1px solid ${C.border}`, fontFamily: C.f }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#10785a,#149a73)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                        {p.name.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 550, color: C.ink }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: C.inkFaint }}>{p.phone || '—'}</div>
                      </div>
                      {p.allergies.length > 0 && (
                        <span style={{ fontSize: 10, color: C.red, background: C.redLt, borderRadius: 4, padding: '1px 5px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          ⚠ Allergies
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Nom patient *</label>
                <input value={patientName} onChange={e => { setPatientName(e.target.value); if (patientId) setPatientId(null); }} placeholder="Jean Dupont" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Téléphone</label>
                <input value={patientPhone} onChange={e => setPatientPhone(e.target.value)} placeholder="+243 8XX XXX XXX" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Médecin prescripteur</label>
                <input value={medecin} onChange={e => setMedecin(e.target.value)} placeholder="Dr. Kabila" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Médicaments prescrits */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
              Médicaments prescrits
            </div>

            {/* Items list */}
            {items.length > 0 && (
              <div style={{ background: C.panel, border: `1px solid ${C.hairline}`, borderRadius: 10, overflow: 'hidden', marginBottom: 10, boxShadow: glassRing }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.hairline}` }}>
                      {['Médicament', 'Posologie', 'Qté', 'Stock', ''].map((h, i) => (
                        <th key={i} style={{ padding: '8px 12px', textAlign: i >= 2 ? 'center' : 'left', fontSize: 10, color: C.inkMute, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', background: 'rgba(15,15,20,0.02)', fontFamily: C.f }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={item.id} style={{ borderBottom: i < items.length - 1 ? `1px solid ${C.hairline}` : 'none', background: item.status === 'rupture' ? `${C.amber}07` : 'transparent' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 550, color: C.ink }}>{item.name}</div>
                          {item.dci && <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 1 }}>{item.dci}</div>}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 11.5, color: C.inkMute }}>{item.dosage || '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontFamily: C.fm, fontSize: 13, fontWeight: 700, color: C.ink }}>{item.qty}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ fontFamily: C.fm, fontSize: 12.5, fontWeight: 700, color: item.status === 'rupture' ? C.red : C.brand }}>{item.stock_available}</span>
                          {item.status === 'rupture' && (
                            <span style={{ display: 'block', fontSize: 9.5, color: C.amber, fontWeight: 600, marginTop: 1 }}>Rupture</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: C.inkFaint, display: 'flex' }}>
                            <X size={13} strokeWidth={2} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add item form */}
            <div style={{ background: `rgba(15,15,20,0.02)`, borderRadius: 10, padding: 12, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMute, marginBottom: 8 }}>Ajouter un médicament</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 60px', gap: 8, marginBottom: 8 }}>
                <div style={{ position: 'relative' }}>
                  <input
                    value={search || newItem.name}
                    onChange={e => { setSearch(e.target.value); setNewItem(p => ({ ...p, name: e.target.value })); }}
                    placeholder="Nom du médicament"
                    style={{ ...inputStyle, height: 32, fontSize: 12 }}
                  />
                  {medicationSuggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: 34, left: 0, right: 0, background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 10, overflow: 'hidden' }}>
                      {medicationSuggestions.map(m => (
                        <button key={m.name} onClick={() => {
                          setNewItem(p => ({ ...p, name: m.name }));
                          setSelectedMedId((m as any).id);
                          setSearch('');
                        }} style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12.5, color: C.ink, borderBottom: `1px solid ${C.border}`, fontFamily: C.f }}>
                          <span style={{ fontWeight: 550 }}>{m.name}</span>
                          <span style={{ color: m.quantity === 0 ? C.red : C.brand, fontSize: 11, marginLeft: 8, fontFamily: C.fm }}>Stock: {m.quantity}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input value={newItem.dosage} onChange={e => setNewItem(p => ({ ...p, dosage: e.target.value }))} placeholder="Posologie" style={{ ...inputStyle, height: 32, fontSize: 12 }} />
                <input type="number" min={1} value={newItem.qty} onChange={e => setNewItem(p => ({ ...p, qty: e.target.value }))} placeholder="Qté" style={{ ...inputStyle, height: 32, fontSize: 12 }} />
                <button onClick={addItem} disabled={!newItem.name.trim()} style={{
                  height: 32, width: '100%', border: 'none', borderRadius: 7,
                  background: newItem.name.trim() ? C.brand : C.inkGhost,
                  color: '#fff', cursor: newItem.name.trim() ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.f,
                }}>
                  <Plus size={14} strokeWidth={2.5} />
                </button>
              </div>
              <div>
                <input value={newItem.dci} onChange={e => setNewItem(p => ({ ...p, dci: e.target.value }))} placeholder="DCI / générique (optionnel)" style={{ ...inputStyle, height: 30, fontSize: 11.5, width: '50%' }} />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Notes / Observations</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Instructions particulières, allergies connues…" rows={2}
              style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12.5, background: C.panelSolid, color: C.ink, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: C.f }} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '8px 16px', border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent', color: C.inkSoft, fontSize: 13, cursor: 'pointer', fontFamily: C.f }}>Annuler</button>
          <button onClick={handleSave} disabled={!canSave || saving} style={{
            padding: '8px 22px', border: 'none', borderRadius: 8,
            background: canSave && !saving ? C.ink : C.inkGhost,
            color: canSave && !saving ? '#fff' : C.inkFaint,
            fontSize: 13, fontWeight: 600, cursor: canSave && !saving ? 'pointer' : 'default',
            fontFamily: C.f, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {saving && <Loader2 size={12} strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} />}
            {isEdit ? 'Enregistrer' : 'Créer l\'ordonnance'}
          </button>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    </div>
  );
}

// ── Ordonnance Detail ─────────────────────────────────────────────────────────
function OrdDetail({
  ord, onStatusChange, onEdit, onDelete, onConvertToSale, avatarIdx = 0,
}: {
  ord: Ordonnance;
  onStatusChange: (id: string, status: OrdStatus) => void | Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
  onConvertToSale: (ord: Ordonnance) => void;
  avatarIdx?: number;
}) {
  const ruptureItems = ord.items.filter(i => i.status === 'rupture');
  const availCount = ord.items.filter(i => i.status !== 'rupture').length;
  const totalQty = ord.items.reduce((s, i) => s + i.qty, 0);
  const delivered = ord.items.reduce((s, i) => s + i.qty_delivered, 0);
  const dateFormatted = new Date(ord.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const handlePrint = () => {
    const html = `<!DOCTYPE html><html><head><title>Ordonnance ${ord.ref}</title>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 32px; color: #0a0e14; }
        h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 4px; }
        .meta { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
        .items { background: #f8faf8; border-radius: 10px; padding: 16px; margin-bottom: 20px; }
        .item { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .item:last-child { border-bottom: none; }
        .name { font-weight: 600; font-size: 14px; }
        .dci { color: #9aa0a8; font-size: 12px; }
        .dos { color: #6b7280; font-size: 12px; margin-top: 2px; }
        .footer { text-align: center; color: #9aa0a8; font-size: 11px; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 16px; }
        @media print { @page { margin: 15mm; } }
      </style></head>
      <body>
        <h1>${ord.patient_name}</h1>
        <div class="meta">${ord.ref} · ${ord.medecin || 'Médecin non renseigné'} · ${new Date(ord.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
        <div class="items">
          ${ord.items.map(i => `<div class="item">
            <div class="name">${i.name}</div>
            ${i.dci ? `<div class="dci">${i.dci}</div>` : ''}
            ${i.dosage ? `<div class="dos">${i.dosage} — Qté : ${i.qty}</div>` : `<div class="dos">Qté : ${i.qty}</div>`}
          </div>`).join('')}
        </div>
        ${ord.notes ? `<div style="font-size:12px;color:#6b7280;margin-bottom:20px;"><strong>Notes :</strong> ${ord.notes}</div>` : ''}
        <div class="footer">JunglePharm · Ordonnance imprimée le ${new Date().toLocaleDateString('fr-FR')}</div>
      </body></html>`;
    import('../lib/printHelper').then(({ printHtml }) => printHtml(html));
  };

  return (
    <div>
      {/* ── Header: avatar · nom+Urgent (inline) · bio — boutons à droite ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 22 }}>
        <Avatar name={ord.patient_name} idx={avatarIdx} size={62} />

        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          {/* Nom + Urgent sur la même ligne, sans wrap */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, minWidth: 0 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.15, whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {ord.patient_name}
            </span>
            {ord.status === 'en_attente' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.redLt, color: C.red, borderRadius: 99, padding: '3px 10px', fontSize: 11, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.red, flexShrink: 0 }} />
                Urgent
              </span>
            )}
          </div>
          {/* Phone · médecin — no-wrap avec nowrap sur la ligne entière */}
          <div style={{ fontSize: 13, color: C.inkMute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[ord.patient_phone, ord.medecin].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>

        {/* Boutons droite */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, paddingTop: 2 }}>
          <button onClick={onEdit} title="Modifier" style={{ width: 30, height: 30, border: `1px solid ${C.border}`, borderRadius: 7, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.inkFaint }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f5'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onClick={onDelete} title="Supprimer" style={{ width: 30, height: 30, border: `1px solid ${C.border}`, borderRadius: 7, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.inkFaint }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.redLt; (e.currentTarget as HTMLButtonElement).style.color = C.red; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = C.inkFaint; }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>

          <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', border: `1px solid ${C.border}`, borderRadius: 9, background: '#f3f4f6', color: C.inkSoft, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: C.f, whiteSpace: 'nowrap' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#fff', fontSize: 9, fontWeight: 800, lineHeight: 1 }}>R</span>
            </div>
            Historique
          </button>

          {(ord.status === 'en_attente' || ord.status === 'partielle') && (
            <button onClick={() => onStatusChange(ord.id, 'terminee')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 16px', border: 'none', borderRadius: 9, background: '#111', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: C.f, whiteSpace: 'nowrap', boxShadow: '0 2px 5px rgba(0,0,0,0.18)' }}>
              <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><polyline points="1,4.5 4,7.5 10,1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Valider
            </button>
          )}
          {ord.status === 'terminee' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, background: C.brandLt, color: C.brand, fontSize: 12.5, fontWeight: 700, fontFamily: C.f, whiteSpace: 'nowrap' }}>
              ✓ Complétée
            </div>
          )}
        </div>
      </div>

      {/* ── Grille info (scrollable) : N°ORD · MÉDECIN · DATE · VALIDITÉ · STATUT + bouton violet ── */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 22, background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto', borderRadius: 12, padding: '0' }}>
          {[
            { lbl: 'N° ORD.',  val: ord.ref,           mono: true  },
            { lbl: 'MÉDECIN',  val: ord.medecin || '—', mono: false },
            { lbl: 'DATE',     val: dateFormatted,       mono: false },
            { lbl: 'VALIDITÉ', val: '3 mois',            mono: false },
          ].map(({ lbl, val, mono }) => (
            <div key={lbl} style={{ padding: '13px 14px', borderRight: `1px solid ${C.border}`, flexShrink: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 7 }}>{lbl}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: mono ? C.fm : C.f, whiteSpace: 'nowrap' }}>{val}</div>
            </div>
          ))}
          <div style={{ padding: '13px 16px', borderRight: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 8 }}>STATUT</div>
            <Pill status={ord.status} />
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '12px 16px', minWidth: 160 }}>
            <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', border: 'none', borderRadius: 9, background: '#6e44b0', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: C.f, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(110,68,176,0.3)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>
              </svg>
              Voir l'ordonnance
            </button>
          </div>
        </div>
      </div>

      {/* ── Progression (partielle) ── */}
      {ord.status === 'partielle' && totalQty > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: C.inkMute, marginBottom: 5 }}>
            <span>Progression délivrance</span>
            <span style={{ fontFamily: C.fm, fontWeight: 600 }}>{delivered}/{totalQty}</span>
          </div>
          <div style={{ height: 5, background: C.blueLt, borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(delivered / totalQty) * 100}%`, background: C.blue, borderRadius: 99, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {/* ── Tableau médicaments ── */}
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Médicaments prescrits</span>
          <span style={{ fontSize: 12.5 }}>
            {availCount > 0 && <span style={{ color: C.brand, fontWeight: 600 }}>{availCount} disponible{availCount > 1 ? 's' : ''}</span>}
            <span style={{ color: C.inkMute }}> sur {ord.items.length}</span>
            {ruptureItems.length > 0 && <span style={{ color: C.red, fontWeight: 600 }}> · {ruptureItems.length} en rupture</span>}
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(15,15,20,0.02)', borderBottom: `1px solid ${C.border}` }}>
                <th style={{ width: 52, padding: '10px 16px' }} />
                {['MÉDICAMENT', 'POSOLOGIE', 'DURÉE', 'QUANTITÉ', 'STOCK DISPO.', 'STATUT'].map((h, i) => (
                  <th key={i} style={{ padding: '10px 16px', textAlign: i >= 2 ? 'center' : 'left', fontSize: 10.5, color: C.inkMute, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', whiteSpace: 'nowrap', fontFamily: C.f }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ord.items.map((item, i) => {
                const isOk = item.status !== 'rupture';
                const durMatch = item.dosage.match(/(\d+)\s*(jour|jours|semaine|semaines|mois)/i);
                const duration = durMatch ? `${durMatch[1]} ${durMatch[2]}` : '—';
                return (
                  <tr key={item.id} style={{ borderBottom: i < ord.items.length - 1 ? `1px solid ${C.border}` : 'none', background: !isOk ? 'rgba(200,30,30,0.02)' : 'transparent' }}>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <div style={{ width: 20, height: 20, borderRadius: 5, margin: '0 auto', background: isOk ? C.brand : '#fff', border: isOk ? 'none' : `1.5px solid ${C.inkGhost}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isOk && (
                          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                            <polyline points="1.5,4.5 4.5,7.5 9.5,1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{item.name}</div>
                      {item.dci && <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 2 }}>{item.dci}</div>}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: C.inkSoft }}>{item.dosage || '—'}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, color: C.inkSoft }}>{duration}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'center', fontFamily: C.fm, fontSize: 14, fontWeight: 800, color: C.ink }}>{item.qty}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'center', fontFamily: C.fm, fontSize: 14, fontWeight: 800, color: !isOk ? C.red : C.ink }}>{item.stock_available}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      {!isOk ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.redLt, color: C.red, border: `1px solid rgba(200,30,30,0.2)`, borderRadius: 99, padding: '4px 11px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.red, flexShrink: 0 }} />
                          Rupture · alternative ?
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: C.brand, fontSize: 12, fontWeight: 600 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.brand, flexShrink: 0 }} />
                          Dispo.
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Suggestion d'alternative (carte crème) ── */}
      {ruptureItems.map(item => (
        <div key={item.id} style={{ background: '#f6f2eb', borderRadius: 14, padding: '18px 22px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fde9c2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>✦</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 6 }}>
              Suggestion d'alternative pour {item.name}
            </div>
            <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.6, marginBottom: 14 }}>
              {item.alternative
                ? <>L'<strong>{item.alternative}</strong> est en stock — même classe thérapeutique.</>
                : 'Aucune alternative renseignée — contactez le médecin prescripteur.'}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ padding: '8px 20px', border: `1px solid ${C.border}`, borderRadius: 9, background: '#fff', color: C.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: C.f }}>
                Proposer au médecin
              </button>
              <button style={{ padding: '8px 20px', border: 'none', borderRadius: 9, background: '#111', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: C.f }}>
                Accepter alternative
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* ── Notes ── */}
      {ord.notes && (
        <div style={{ background: 'rgba(15,15,20,0.03)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Notes</div>
          <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.5 }}>{ord.notes}</div>
        </div>
      )}

      {/* ── Actions secondaires ── */}
      {ord.status !== 'terminee' && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', paddingTop: 4 }}>
          <button onClick={() => onConvertToSale(ord)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', border: `1.5px solid ${C.brandMid}`, borderRadius: 9, background: 'transparent', color: C.brand, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: C.f }}>
            <ShoppingCart size={13} strokeWidth={2} />
            Préparer la vente
          </button>
          {ord.status === 'en_attente' && (
            <button onClick={() => onStatusChange(ord.id, 'partielle')} style={{ padding: '9px 18px', border: `1px solid rgba(183,95,6,0.3)`, borderRadius: 9, background: C.amberLt, color: C.amber, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: C.f }}>
              Délivrance partielle
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Ordonnances() {
  const { medications } = useMedications();
  const { patients } = usePatients();
  const { ords, isLoading, error, saveOrdonnance, deleteOrdonnance, changeStatus } = useOrdonnances();
  const { setPendingOrdCart } = useWorkflow();
  const [filter, setFilter] = useState('en_attente');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editOrd, setEditOrd] = useState<Ordonnance | null>(null);
  const [saving, setSaving] = useState(false);

  // Topbar action
  useEffect(() => {
    const handler = (e: Event) => {
      const { action } = (e as CustomEvent<{ action: string }>).detail;
      if (action === 'add-ordonnance') setShowModal(true);
    };
    window.addEventListener('topbar-action', handler);
    return () => window.removeEventListener('topbar-action', handler);
  }, []);

  const filtered = useMemo(() => {
    let list = ords.filter(o => o.status === filter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(o =>
      o.patient_name.toLowerCase().includes(q) ||
      o.ref.toLowerCase().includes(q) ||
      o.medecin.toLowerCase().includes(q)
    );
    return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [ords, filter, search]);

  const selected = ords.find(o => o.id === selectedId) ?? null;
  const selectedIdx = selected ? ords.indexOf(selected) : -1;

  const handleStatusChange = async (id: string, status: OrdStatus) => {
    try {
      await changeStatus(id, status);
      // ── Stock deduction when fully delivered ───────────────────────────────
      if (status === 'terminee') {
        const ord = ords.find(o => o.id === id);
        if (ord) {
          for (const item of ord.items) {
            const med = medications.find(m => m.name.toLowerCase() === item.name.toLowerCase());
            if (!med) continue;
            const newQty = Math.max(0, med.quantity - item.qty);
            await supabase.from('medications').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', med.id);
          }
        }
      }
    } catch (e: any) {
      alert(`Erreur : ${e.message}`);
    }
  };

  const handleConvertToSale = (ord: Ordonnance) => {
    // Calcule la quantité restante à délivrer (total - déjà livré)
    // Ignore les articles déjà totalement délivrés
    const pendingItems = ord.items
      .map(i => ({ medication_id: i.medication_id, name: i.name, qty: Math.max(0, i.qty - (i.qty_delivered || 0)), ordonnanceRef: ord.ref }))
      .filter(i => i.qty > 0);
    if (pendingItems.length === 0) return; // tout déjà délivré
    setPendingOrdCart(pendingItems);
    window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab: 'sales' } }));
  };

  const handleSave = async (o: Ordonnance) => {
    setSaving(true);
    try {
      const saved = await saveOrdonnance(o);
      setSelectedId(saved.id);
      setShowModal(false);
      setEditOrd(null);
    } catch (e: any) {
      alert(`Erreur : ${e.message || 'Impossible de sauvegarder'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer cette ordonnance ? Cette action est irréversible.')) return;
    try {
      await deleteOrdonnance(id);
      if (selectedId === id) setSelectedId(null);
    } catch (e: any) {
      alert(`Erreur suppression : ${e.message}`);
    }
  };

  const medList = medications.map(m => ({ id: m.id, name: m.name, quantity: m.quantity, code_produit: m.code_produit }));

  // KPIs
  const kpis = useMemo(() => ({
    total:      ords.length,
    enAttente:  ords.filter(o => o.status === 'en_attente').length,
    partielle:  ords.filter(o => o.status === 'partielle').length,
    terminee:   ords.filter(o => o.status === 'terminee').length,
  }), [ords]);

  if (isLoading && ords.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, color: C.inkFaint, gap: 10, fontFamily: C.f }}>
        <Loader2 size={18} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 13 }}>Chargement des ordonnances…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: C.f, color: C.ink }}>

        {/* Error banner (non-blocking) */}
        {error && (
          <div style={{ padding: '7px 20px', background: C.amberLt, borderBottom: `1px solid rgba(183,95,6,0.3)`, fontSize: 12, color: C.amber, display: 'flex', alignItems: 'center', gap: 6, fontFamily: C.f, flexShrink: 0 }}>
            <AlertTriangle size={12} strokeWidth={2} />
            Mode hors-ligne — données en cache
          </div>
        )}

        {/* ── Content ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Left list */}
          <div style={{ width: 380, borderRight: `1px solid ${C.hairline}`, display: 'flex', flexDirection: 'column', flexShrink: 0, background: '#f8f8f8' }}>

            {/* Panel header */}
            <div style={{ padding: '16px 18px 14px', background: '#f8f8f8', borderBottom: `1px solid ${C.hairline}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>Ordonnances</span>
                  {kpis.enAttente > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', background: C.redLt, color: C.red, borderRadius: 99, padding: '2px 8px', fontSize: 10.5, fontWeight: 700 }}>
                      {kpis.enAttente}
                    </span>
                  )}
                </div>
                <button onClick={() => { setEditOrd(null); setShowModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: 'none', borderRadius: 8, background: C.ink, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: C.f }}>
                  <Plus size={11} strokeWidth={2.5} />
                  Nouvelle
                </button>
              </div>

              {/* Search */}
              <div style={{ position: 'relative' }}>
                <Search size={12} color={C.inkMute} strokeWidth={1.5} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Patient, ref, médecin…" style={{ width: '100%', height: 34, paddingLeft: 30, paddingRight: 10, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, background: '#fff', color: C.ink, outline: 'none', boxSizing: 'border-box' as const, fontFamily: C.f }} />
              </div>
            </div>

            {/* Chip filter tabs */}
            <div style={{ display: 'flex', gap: 6, padding: '10px 14px', background: '#f8f8f8', borderBottom: `1px solid ${C.hairline}`, flexShrink: 0 }}>
              {FILTERS.map(f => {
                const count = ords.filter(o => o.status === f.key).length;
                const isActive = filter === f.key;
                return (
                  <button key={f.key} onClick={() => setFilter(f.key)} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '6px 14px', border: isActive ? 'none' : `1px solid ${C.border}`,
                    borderRadius: 99, cursor: 'pointer', fontFamily: C.f,
                    background: isActive ? '#fff' : 'transparent',
                    color: isActive ? C.ink : C.inkMute,
                    fontSize: 12, fontWeight: isActive ? 700 : 500,
                    boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}>
                    {f.label}
                    {count > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? C.brand : C.inkFaint }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: C.inkFaint, fontSize: 12.5 }}>
                  {ords.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: C.brandLt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FileText size={20} color={C.brand} strokeWidth={1.5} />
                      </div>
                      <span>Aucune ordonnance</span>
                    </div>
                  ) : (
                    <span>Aucun résultat</span>
                  )}
                </div>
              ) : filtered.map((o, i) => {
                const isActive = selectedId === o.id;
                const hasRupture = o.items.some(it => it.status === 'rupture');
                const dateStr = new Date(o.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
                return (
                  <div key={o.id} onClick={() => setSelectedId(isActive ? null : o.id)}
                    style={{ padding: '13px 18px', borderBottom: `1px solid ${C.hairline}`, cursor: 'pointer', background: isActive ? '#fff' : '#fff', borderLeft: `3px solid ${isActive ? C.brand : 'transparent'}`, transition: 'border-color 0.12s' }}>
                    {/* Ref + badges + statut */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: C.fm, fontSize: 11, fontWeight: 700, color: C.inkFaint }}>{o.ref}</span>
                        {o.status === 'en_attente' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: C.redLt, color: C.red, borderRadius: 99, padding: '1px 7px', fontSize: 9.5, fontWeight: 700 }}>
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.red, flexShrink: 0 }} />
                            Urgent
                          </span>
                        )}
                        {hasRupture && o.status !== 'en_attente' && (
                          <span style={{ fontSize: 9.5, background: C.amberLt, color: C.amber, borderRadius: 99, padding: '1px 7px', fontWeight: 600 }}>Rupture</span>
                        )}
                      </div>
                      <Pill status={o.status} sm />
                    </div>
                    {/* Nom patient */}
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, letterSpacing: '-0.015em', marginBottom: 3 }}>{o.patient_name}</div>
                    {/* Médecin */}
                    <div style={{ fontSize: 12, color: C.inkMute, marginBottom: 6 }}>{o.medecin || 'Médecin non renseigné'}</div>
                    {/* Date + nb méds */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11.5, color: C.inkFaint }}>{dateStr}</span>
                      <span style={{ fontSize: 11.5, color: C.inkFaint }}>{o.items.length} médicament{o.items.length > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right detail */}
          <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px', minWidth: 0 }}>
            {!selected ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.inkFaint, gap: 12 }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, background: C.brandLt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={28} color={C.brand} strokeWidth={1.5} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>Sélectionnez une ordonnance</div>
                  <div style={{ fontSize: 13, color: C.inkFaint }}>ou créez-en une nouvelle</div>
                </div>
                <button onClick={() => { setEditOrd(null); setShowModal(true); }} style={{
                  marginTop: 8, padding: '9px 22px', background: C.brand, color: '#fff', border: 'none',
                  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: C.f,
                }}>
                  <Plus size={13} style={{ marginRight: 6 }} />
                  Nouvelle ordonnance
                </button>
              </div>
            ) : (
              <OrdDetail
                ord={selected}
                onStatusChange={handleStatusChange}
                onEdit={() => { setEditOrd(selected); setShowModal(true); }}
                onDelete={() => handleDelete(selected.id)}
                onConvertToSale={handleConvertToSale}
                avatarIdx={selectedIdx}
              />
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <OrdModal
          ord={editOrd}
          medications={medList}
          patients={patients}
          onSave={handleSave}
          saving={saving}
          onClose={() => { if (!saving) { setShowModal(false); setEditOrd(null); } }}
        />
      )}
    </>
  );
}
