/**
 * Commandes.tsx
 * Gestion des commandes fournisseurs — avec annuaire des commerciaux.
 * Chalk Premium design.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Truck, Package, CheckCircle, X, Printer,
  ChevronDown, ChevronRight, ChevronUp, AlertTriangle,
  Search, User, Phone, Pencil, Trash2, Building2,
} from 'lucide-react';
import { supabase, fetchAllMedications, Medication } from '../lib/supabase';
import { offlineStorage } from '../lib/offlineStorage';
import { insertWithUserId, updateWithUserId, deleteWithUserId } from '../lib/supabaseHelpers';

// ── Types ──────────────────────────────────────────────────────────────────────

type OrderStatus = 'brouillon' | 'envoyée' | 'reçue' | 'annulée';

export interface SupplierRep {
  id: string;
  supplier_name: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
}

interface OrderItem {
  id?: string;
  medication_id?: string | null;
  medication_name: string;
  dosage?: string;
  quantity_ordered: number;
  quantity_received?: number;
  unit_cost?: number;
  notes?: string;
}

interface Order {
  id: string;
  order_date: string;
  supplier?: string;
  rep_id?: string;
  rep_name?: string;
  rep_phone?: string;
  status: OrderStatus;
  notes?: string;
  received_at?: string;
  created_at: string;
  items?: OrderItem[];
}

// ── Design tokens ──────────────────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
  width: '100%',
  padding: '8px 11px',
  border: '1.5px solid rgba(0,0,0,0.1)',
  borderRadius: 9,
  fontSize: 13,
  outline: 'none',
  background: '#fff',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS: Record<OrderStatus, { label: string; bg: string; fg: string; border: string }> = {
  brouillon: { label: 'Brouillon', bg: 'rgba(107,114,128,0.07)', fg: '#374151', border: 'rgba(107,114,128,0.2)' },
  envoyée:   { label: 'Envoyée',   bg: 'rgba(37,99,235,0.07)',   fg: '#1d4ed8', border: 'rgba(37,99,235,0.2)'   },
  reçue:     { label: 'Reçue',     bg: 'rgba(83,125,20,0.07)',   fg: '#537d14', border: 'rgba(83,125,20,0.2)'   },
  annulée:   { label: 'Annulée',   bg: 'rgba(200,30,30,0.07)',   fg: '#c81e1e', border: 'rgba(200,30,30,0.2)'   },
};

function StatusPill({ status }: { status: OrderStatus }) {
  const s = STATUS[status];
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
      background: s.bg, color: s.fg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}

// ── Annuaire commerciaux ───────────────────────────────────────────────────────

interface RepsSectionProps {
  reps: SupplierRep[];
  onReload: () => void;
}

function SupplierRepsSection({ reps, onReload }: RepsSectionProps) {
  const [isOpen,      setIsOpen]      = useState(false);
  const [editId,      setEditId]      = useState<string | null>(null);
  const [editForm,    setEditForm]    = useState({ name: '', phone: '', email: '', notes: '' });
  const [addingFor,   setAddingFor]   = useState<string | null>(null); // supplier_name or '__new__'
  const [newForm,     setNewForm]     = useState({ name: '', phone: '', email: '' });
  const [newSupplier, setNewSupplier] = useState('');
  const [saving,      setSaving]      = useState(false);

  const bySupplier = useMemo(() => {
    const map: Record<string, SupplierRep[]> = {};
    for (const r of reps) {
      if (!map[r.supplier_name]) map[r.supplier_name] = [];
      map[r.supplier_name].push(r);
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [reps]);

  const startEdit = (rep: SupplierRep) => {
    setEditId(rep.id);
    setEditForm({ name: rep.name, phone: rep.phone || '', email: rep.email || '', notes: rep.notes || '' });
    setAddingFor(null);
  };

  const saveEdit = async () => {
    if (!editId || !editForm.name.trim()) return;
    setSaving(true);
    try {
      await updateWithUserId('supplier_reps', {
        name:  editForm.name.trim(),
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        notes: editForm.notes.trim() || null,
      }, { id: editId });
      setEditId(null);
      onReload();
    } finally { setSaving(false); }
  };

  const deleteRep = async (id: string) => {
    if (!confirm('Supprimer ce commercial ?')) return;
    await deleteWithUserId('supplier_reps', { id });
    onReload();
  };

  const saveNew = async (supplierName: string) => {
    if (!newForm.name.trim() || !supplierName.trim()) return;
    setSaving(true);
    try {
      await insertWithUserId('supplier_reps', [{
        supplier_name: supplierName.trim(),
        name:  newForm.name.trim(),
        phone: newForm.phone.trim() || null,
        email: newForm.email.trim() || null,
      }]);
      setNewForm({ name: '', phone: '', email: '' });
      setAddingFor(null);
      setNewSupplier('');
      onReload();
    } finally { setSaving(false); }
  };

  const cancelAdd = () => {
    setAddingFor(null);
    setNewSupplier('');
    setNewForm({ name: '', phone: '', email: '' });
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.72)', border: '1.5px solid rgba(255,255,255,0.55)',
      borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(12px)',
    }}>
      {/* Accordion header */}
      <button
        onClick={() => setIsOpen(p => !p)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: 'rgba(83,125,20,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <User style={{ width: 15, height: 15, color: '#537d14' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0a0e14' }}>Commerciaux fournisseurs</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>
            {reps.length > 0
              ? `${reps.length} contact${reps.length > 1 ? 's' : ''} · ${bySupplier.length} fournisseur${bySupplier.length > 1 ? 's' : ''}`
              : 'Annuaire des commerciaux — cliquez pour gérer'}
          </div>
        </div>
        {isOpen
          ? <ChevronUp    style={{ width: 16, height: 16, color: '#9ca3af', flexShrink: 0 }} />
          : <ChevronDown  style={{ width: 16, height: 16, color: '#9ca3af', flexShrink: 0 }} />
        }
      </button>

      {isOpen && (
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.05)', padding: '14px 16px 16px' }}>

          {/* Fournisseurs existants */}
          {bySupplier.map(([supplierName, repsList]) => (
            <div key={supplierName} style={{ marginBottom: 18 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#6b7280',
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
              }}>
                {supplierName}
              </div>
              <div style={{ background: '#f9fafb', borderRadius: 10, overflow: 'hidden' }}>
                {repsList.map((rep, i) => (
                  <div key={rep.id}>
                    {editId === rep.id ? (
                      /* Formulaire édition */
                      <div style={{
                        padding: '12px', background: 'rgba(83,125,20,0.03)',
                        borderBottom: i < repsList.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                      }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                          <input value={editForm.name}  onChange={e => setEditForm(f => ({ ...f, name:  e.target.value }))} placeholder="Nom *"       style={inputSt} />
                          <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="Téléphone"   style={inputSt} />
                          <input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} placeholder="Email"        style={{ ...inputSt, gridColumn: '1/-1' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={saveEdit} disabled={saving || !editForm.name.trim()}
                            style={{ padding: '7px 14px', borderRadius: 8, background: '#537d14', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            Sauvegarder
                          </button>
                          <button onClick={() => setEditId(null)}
                            style={{ padding: '7px 14px', borderRadius: 8, background: '#f3f4f6', color: '#6b7280', border: 'none', fontSize: 12, cursor: 'pointer' }}>
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Ligne commercial */
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                        borderBottom: i < repsList.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                      }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 8, background: 'rgba(83,125,20,0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <User style={{ width: 12, height: 12, color: '#537d14' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0a0e14' }}>{rep.name}</div>
                          {rep.phone && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6b7280', marginTop: 1 }}>
                              <Phone style={{ width: 10, height: 10 }} />{rep.phone}
                            </div>
                          )}
                          {rep.email && <div style={{ fontSize: 11, color: '#9ca3af' }}>{rep.email}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => startEdit(rep)}
                            style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(0,0,0,0.04)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Pencil style={{ width: 11, height: 11, color: '#6b7280' }} />
                          </button>
                          <button onClick={() => deleteRep(rep.id)}
                            style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(200,30,30,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Trash2 style={{ width: 11, height: 11, color: '#c81e1e' }} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Ajouter commercial à ce fournisseur */}
                {addingFor === supplierName ? (
                  <div style={{ padding: '12px', borderTop: '1px solid rgba(0,0,0,0.05)', background: 'rgba(83,125,20,0.02)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                      <input value={newForm.name}  onChange={e => setNewForm(f => ({ ...f, name:  e.target.value }))} placeholder="Nom *"     style={inputSt} autoFocus />
                      <input value={newForm.phone} onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))} placeholder="Téléphone" style={inputSt} />
                      <input value={newForm.email} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))} placeholder="Email"     style={{ ...inputSt, gridColumn: '1/-1' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => saveNew(supplierName)} disabled={saving || !newForm.name.trim()}
                        style={{ padding: '7px 14px', borderRadius: 8, background: '#537d14', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: !newForm.name.trim() ? 0.5 : 1 }}>
                        Ajouter
                      </button>
                      <button onClick={cancelAdd}
                        style={{ padding: '7px 14px', borderRadius: 8, background: '#f3f4f6', color: '#6b7280', border: 'none', fontSize: 12, cursor: 'pointer' }}>
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingFor(supplierName); setEditId(null); setNewForm({ name: '', phone: '', email: '' }); }}
                    style={{ width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', borderTop: '1px solid rgba(0,0,0,0.04)', fontSize: 12, color: '#537d14', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                  >
                    + Ajouter un commercial
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Nouveau fournisseur */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              {bySupplier.length > 0 ? 'Nouveau fournisseur' : 'Premier fournisseur'}
            </div>
            {addingFor === '__new__' ? (
              <div style={{ background: '#f9fafb', borderRadius: 10, padding: '12px' }}>
                <input value={newSupplier} onChange={e => setNewSupplier(e.target.value)}
                  placeholder="Nom du fournisseur *"
                  style={{ ...inputSt, marginBottom: 8 }} autoFocus />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input value={newForm.name}  onChange={e => setNewForm(f => ({ ...f, name:  e.target.value }))} placeholder="Nom du commercial *" style={inputSt} />
                  <input value={newForm.phone} onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))} placeholder="Téléphone"           style={inputSt} />
                  <input value={newForm.email} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))} placeholder="Email"               style={{ ...inputSt, gridColumn: '1/-1' }} />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => saveNew(newSupplier)} disabled={saving || !newForm.name.trim() || !newSupplier.trim()}
                    style={{ padding: '7px 14px', borderRadius: 8, background: '#537d14', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (!newForm.name.trim() || !newSupplier.trim()) ? 0.5 : 1 }}>
                    Ajouter
                  </button>
                  <button onClick={cancelAdd}
                    style={{ padding: '7px 14px', borderRadius: 8, background: '#f3f4f6', color: '#6b7280', border: 'none', fontSize: 12, cursor: 'pointer' }}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setAddingFor('__new__'); setEditId(null); setNewForm({ name: '', phone: '', email: '' }); setNewSupplier(''); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px',
                  borderRadius: 10, background: 'rgba(83,125,20,0.07)',
                  border: '1.5px dashed rgba(83,125,20,0.3)', fontSize: 13, fontWeight: 600,
                  color: '#537d14', cursor: 'pointer',
                }}
              >
                <Plus style={{ width: 13, height: 13 }} />
                Ajouter un fournisseur & commercial
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal création commande ────────────────────────────────────────────────────

interface OrderModalProps {
  onClose: () => void;
  onSaved: () => void;
  medications: Medication[];
  reps: SupplierRep[];
  initialLowStock?: boolean;
  initialSupplier?: string;
}

// Chargement des fournisseurs depuis l'onglet Fournisseurs (localStorage)
function useSavedSuppliers() {
  return useMemo(() => {
    try {
      const raw = localStorage.getItem('pharma_suppliers');
      if (!raw) return [] as { name: string; phone?: string; contact_person?: string }[];
      return JSON.parse(raw) as { name: string; phone?: string; contact_person?: string }[];
    } catch { return []; }
  }, []);
}

function OrderModal({ onClose, onSaved, medications, reps, initialLowStock = false, initialSupplier = '' }: OrderModalProps) {
  const [supplier,     setSupplier]     = useState(initialSupplier);
  const [selectedRep,  setSelectedRep]  = useState<SupplierRep | null>(null);
  const [orderDate,    setOrderDate]    = useState(new Date().toISOString().split('T')[0]);
  const [notes,        setNotes]        = useState('');
  const [items,        setItems]        = useState<OrderItem[]>([]);
  const [medSearch,    setMedSearch]    = useState('');
  const [saving,       setSaving]       = useState(false);
  const [showSuggest,  setShowSuggest]  = useState(false);

  // Fournisseurs enregistrés dans l'onglet Fournisseurs
  const savedSuppliers = useSavedSuppliers();
  // Fournisseur sélectionné (pour afficher ses coordonnées)
  const selectedFournisseur = useMemo(
    () => savedSuppliers.find(s => s.name.toLowerCase() === supplier.trim().toLowerCase()),
    [savedSuppliers, supplier]
  );

  // Pré-remplir avec les stocks bas
  useEffect(() => {
    if (!initialLowStock) return;
    const low = medications.filter(m => (m.minimum_stock ?? 0) > 0 && m.quantity <= (m.minimum_stock ?? 0));
    if (low.length) {
      setItems(low.map(m => ({
        medication_id: m.id,
        medication_name: `${m.name} ${m.dosage}`.trim(),
        dosage: m.dosage,
        quantity_ordered: Math.max(10, (m.minimum_stock ?? 5) * 2),
        unit_cost: (m as any).wholesale_price ?? undefined,
      })));
    }
  }, [initialLowStock, medications]);

  // Commerciaux du fournisseur sélectionné
  const supplierReps = useMemo(() =>
    reps.filter(r => r.supplier_name.trim().toLowerCase() === supplier.trim().toLowerCase()),
    [reps, supplier]
  );

  // Fournisseurs connus = onglet Fournisseurs + commerciaux Supabase (fusionnés, sans doublon)
  const knownSuppliers = useMemo(() => {
    const fromFournisseurs = savedSuppliers.map(s => s.name);
    const fromReps = reps.map(r => r.supplier_name);
    const names = [...new Set([...fromFournisseurs, ...fromReps])].sort();
    const q = supplier.trim().toLowerCase();
    return q ? names.filter(n => n.toLowerCase().includes(q)) : names;
  }, [reps, savedSuppliers, supplier]);

  // Quand le fournisseur change, reset le commercial si pas dans la liste
  useEffect(() => {
    if (selectedRep && selectedRep.supplier_name.toLowerCase() !== supplier.trim().toLowerCase()) {
      setSelectedRep(null);
    }
  }, [supplier, selectedRep]);

  // Recherche médicaments
  const filteredMeds = useMemo(() => {
    const q = medSearch.toLowerCase();
    if (!q) return medications.slice(0, 8);
    return medications.filter(m =>
      m.name.toLowerCase().includes(q) || m.dosage.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [medSearch, medications]);

  const addItem = (med: Medication) => {
    if (items.some(i => i.medication_id === med.id)) return;
    setItems(prev => [...prev, {
      medication_id: med.id,
      medication_name: `${med.name} ${med.dosage}`.trim(),
      dosage: med.dosage,
      quantity_ordered: 10,
      unit_cost: (med as any).wholesale_price ?? undefined,
    }]);
    setMedSearch('');
  };

  const addManualItem = () => setItems(prev => [...prev, { medication_name: '', quantity_ordered: 1 }]);
  const updateItem    = (idx: number, patch: Partial<OrderItem>) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const removeItem    = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!items.length) { alert('Ajoutez au moins un produit.'); return; }
    setSaving(true);
    try {
      // Récupérer l'userId manuellement pour pouvoir chaîner .select().single()
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non connecté');

      const { data: order, error: oErr } = await supabase
        .from('purchase_orders')
        .insert({
          user_id:   user.id,
          order_date: orderDate,
          supplier:   supplier.trim() || null,
          rep_id:     selectedRep?.id    || null,
          rep_name:   selectedRep?.name  || null,
          rep_phone:  selectedRep?.phone || null,
          status: 'brouillon',
          notes: notes.trim() || null,
        })
        .select()
        .single();

      if (oErr || !order) throw oErr || new Error('Échec création commande');

      const lineItems = items.filter(i => i.medication_name.trim()).map(i => ({
        user_id:           user.id,
        purchase_order_id: order.id,
        medication_id:     i.medication_id || null,
        medication_name:   i.medication_name.trim(),
        dosage:            i.dosage  || null,
        quantity_ordered:  i.quantity_ordered,
        unit_cost:         i.unit_cost || null,
        notes:             i.notes    || null,
      }));
      await supabase.from('purchase_order_items').insert(lineItems);
      onSaved();
    } catch (e: any) {
      alert(`Erreur : ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#0a0e14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Truck style={{ width: 16, height: 16, color: '#fff' }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0a0e14' }}>Nouvelle commande</div>
              {initialLowStock && (
                <div style={{ fontSize: 11, color: '#b75f06', fontWeight: 600 }}>Pré-remplie avec les produits en stock bas</div>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: '#f3f4f6', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X style={{ width: 14, height: 14, color: '#6b7280' }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px' }}>

          {/* Ligne 1 : fournisseur + date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            {/* Fournisseur avec suggestions depuis l'onglet Fournisseurs */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>
                Fournisseur
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  value={supplier}
                  onChange={e => { setSupplier(e.target.value); setShowSuggest(true); }}
                  onFocus={() => setShowSuggest(true)}
                  onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                  placeholder="Choisir un fournisseur…"
                  style={inputSt}
                />
                {showSuggest && knownSuppliers.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 100, overflow: 'hidden', marginTop: 3, maxHeight: 200, overflowY: 'auto' }}>
                    {knownSuppliers.map(name => {
                      const sup = savedSuppliers.find(s => s.name === name);
                      return (
                        <button key={name} onMouseDown={() => { setSupplier(name); setShowSuggest(false); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', textAlign: 'left', background: name === supplier ? 'rgba(83,125,20,0.06)' : 'transparent', border: 'none', cursor: 'pointer', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(83,125,20,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Truck style={{ width: 12, height: 12, color: '#537d14' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#0a0e14' }}>{name}</div>
                            {sup?.phone && <div style={{ fontSize: 11, color: '#9ca3af' }}>{sup.phone}</div>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            {/* Date */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>Date</label>
              <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} style={inputSt} />
            </div>
          </div>

          {/* Hint quand aucun fournisseur enregistré dans l'onglet Fournisseurs */}
          {savedSuppliers.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(6,81,188,0.05)', border: '1px solid rgba(6,81,188,0.15)', borderRadius: 10, marginBottom: 12 }}>
              <Building2 style={{ width: 15, height: 15, color: '#0651bc', flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 12, color: '#374151', lineHeight: 1.5 }}>
                <strong style={{ color: '#0651bc' }}>Aucun fournisseur enregistré.</strong> Ajoutez vos fournisseurs (numéro WhatsApp, contact) dans l'onglet{' '}
                <strong>Fournisseurs</strong> pour les retrouver ici et envoyer les commandes directement par WhatsApp.
              </div>
            </div>
          )}

          {/* Carte fournisseur sélectionné — affiche ses coordonnées + accès rapide */}
          {selectedFournisseur && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(83,125,20,0.05)', border: '1px solid rgba(83,125,20,0.18)', borderRadius: 10, marginBottom: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: '#537d14', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Truck style={{ width: 14, height: 14, color: '#fff' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#537d14' }}>{selectedFournisseur.name}</div>
                {selectedFournisseur.contact_person && (
                  <div style={{ fontSize: 11, color: '#6b7280' }}>Contact : {selectedFournisseur.contact_person}</div>
                )}
                {selectedFournisseur.phone && (
                  <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{selectedFournisseur.phone}</div>
                )}
              </div>
              {selectedFournisseur.phone && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <a href={`tel:${selectedFournisseur.phone}`}
                    style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(83,125,20,0.1)', border: '1px solid rgba(83,125,20,0.25)', color: '#537d14', fontSize: 11, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Phone style={{ width: 10, height: 10 }} /> Appeler
                  </a>
                  <a
                    href={`https://wa.me/${selectedFournisseur.phone.replace(/[\s\-().]/g,'').replace(/^00/,'+')}?text=${encodeURIComponent(`Bonjour, je souhaite passer une commande.`)}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.3)', color: '#128C7E', fontSize: 11, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="#128C7E"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.533 5.853L0 24l6.334-1.509A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.647-.49-5.17-1.348l-.371-.22-3.762.896.957-3.66-.242-.382A9.926 9.926 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                    WhatsApp
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Sélection commercial (apparaît si le fournisseur a des reps connus) */}
          {supplierReps.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 8 }}>
                Commercial référent
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {supplierReps.map(rep => {
                  const isSelected = selectedRep?.id === rep.id;
                  return (
                    <button
                      key={rep.id}
                      onClick={() => setSelectedRep(isSelected ? null : rep)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
                        borderRadius: 10, cursor: 'pointer', transition: 'all 0.1s',
                        background: isSelected ? 'rgba(83,125,20,0.1)' : '#f9fafb',
                        border: `1.5px solid ${isSelected ? 'rgba(83,125,20,0.4)' : 'rgba(0,0,0,0.08)'}`,
                      }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: isSelected ? '#537d14' : 'rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <User style={{ width: 12, height: 12, color: isSelected ? '#fff' : '#6b7280' }} />
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? '#537d14' : '#0a0e14' }}>{rep.name}</div>
                        {rep.phone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: isSelected ? '#537d14' : '#9ca3af' }}>
                            <Phone style={{ width: 9, height: 9 }} />{rep.phone}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <CheckCircle style={{ width: 14, height: 14, color: '#537d14', marginLeft: 4 }} />
                      )}
                    </button>
                  );
                })}
              </div>
              {!selectedRep && (
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 5 }}>
                  Optionnel — sélectionnez le commercial qui traite cette commande
                </div>
              )}
            </div>
          )}

          {/* Recherche médicaments */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ position: 'relative' }}>
              <Search style={{ width: 13, height: 13, color: '#9ca3af', position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                value={medSearch} onChange={e => setMedSearch(e.target.value)}
                placeholder="Rechercher et ajouter un médicament…"
                style={{ ...inputSt, paddingLeft: 34, background: '#f9fafb' }}
              />
            </div>
            {medSearch && (
              <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', overflow: 'hidden', marginTop: 4 }}>
                {filteredMeds.length === 0 ? (
                  <div style={{ padding: '10px 14px', fontSize: 12, color: '#9ca3af' }}>Aucun résultat</div>
                ) : filteredMeds.map(m => (
                  <button key={m.id} onClick={() => addItem(m)}
                    disabled={items.some(i => i.medication_id === m.id)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 14px', border: 'none', borderBottom: '1px solid rgba(0,0,0,0.05)', background: 'transparent', cursor: items.some(i => i.medication_id === m.id) ? 'default' : 'pointer', opacity: items.some(i => i.medication_id === m.id) ? 0.4 : 1 }}>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0a0e14' }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>{m.dosage} · Stock : {m.quantity}</div>
                    </div>
                    {(m.minimum_stock ?? 0) > 0 && m.quantity <= (m.minimum_stock ?? 0) && (
                      <AlertTriangle style={{ width: 13, height: 13, color: '#b75f06' }} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Liste produits */}
          {items.length > 0 ? (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                Produits ({items.length})
              </div>
              <div style={{ background: '#f9fafb', borderRadius: 12, overflow: 'hidden' }}>
                {items.map((item, idx) => (
                  <div key={idx} style={{ padding: '10px 12px', borderBottom: idx < items.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {!item.medication_id ? (
                        <input value={item.medication_name} onChange={e => updateItem(idx, { medication_name: e.target.value })}
                          placeholder="Nom du produit" style={{ flex: 1, padding: '7px 10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, fontSize: 12, outline: 'none', background: '#fff' }} />
                      ) : (
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#0a0e14' }}>{item.medication_name}</div>
                      )}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ position: 'relative' }}>
                          <input type="number" min={1} value={item.quantity_ordered}
                            onChange={e => updateItem(idx, { quantity_ordered: Math.max(1, parseInt(e.target.value) || 1) })}
                            style={{ width: 72, padding: '7px 22px 7px 8px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, fontSize: 13, fontWeight: 700, outline: 'none', background: '#fff', textAlign: 'right' }} />
                          <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#9ca3af', pointerEvents: 'none' }}>u.</span>
                        </div>
                        <div style={{ position: 'relative' }}>
                          <input type="number" min={0} placeholder="P.U." value={item.unit_cost ?? ''}
                            onChange={e => updateItem(idx, { unit_cost: parseFloat(e.target.value) || undefined })}
                            style={{ width: 88, padding: '7px 18px 7px 8px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, fontSize: 12, outline: 'none', background: '#fff', textAlign: 'right' }} />
                          <span style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#9ca3af', pointerEvents: 'none' }}>F</span>
                        </div>
                        <button onClick={() => removeItem(idx)} style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(200,30,30,0.07)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <X style={{ width: 11, height: 11, color: '#c81e1e' }} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={addManualItem} style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
                + Ajouter un produit manuellement
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '28px 20px', background: '#f9fafb', borderRadius: 12, color: '#9ca3af', marginBottom: 12 }}>
              <Package style={{ width: 28, height: 28, margin: '0 auto 8px', opacity: 0.4 }} />
              <p style={{ fontSize: 13 }}>Recherchez des médicaments ci-dessus ou</p>
              <button onClick={addManualItem} style={{ fontSize: 13, fontWeight: 600, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}>
                ajoutez une ligne manuellement
              </button>
            </div>
          )}

          {/* Notes */}
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optionnel)…" rows={2}
            style={{ width: '100%', padding: '9px 12px', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', marginTop: 4 }} />
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', gap: 10 }}>
          {selectedRep && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px', fontSize: 12, color: '#537d14', fontWeight: 600 }}>
              <User style={{ width: 12, height: 12 }} />
              Via {selectedRep.name}
              {selectedRep.phone && <span style={{ color: '#9ca3af', fontWeight: 400 }}>· {selectedRep.phone}</span>}
            </div>
          )}
          {!selectedRep && <div style={{ flex: 1 }} />}
          <button onClick={onClose} style={{ padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: '#f3f4f6', border: 'none', color: '#6b7280', cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving || items.length === 0}
            style={{ padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, background: items.length ? '#0a0e14' : '#e5e7eb', border: 'none', color: items.length ? '#fff' : '#9ca3af', cursor: (saving || !items.length) ? 'default' : 'pointer' }}>
            {saving ? 'Enregistrement…' : `Créer (${items.length} produit${items.length > 1 ? 's' : ''})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal réception ────────────────────────────────────────────────────────────

function ReceiveModal({ order, onClose, onReceived }: { order: Order; onClose: () => void; onReceived: () => void }) {
  const [items,  setItems]  = useState<OrderItem[]>(
    (order.items || []).map(i => ({ ...i, quantity_received: i.quantity_received ?? i.quantity_ordered }))
  );
  const [saving, setSaving] = useState(false);

  const handleReceive = async () => {
    setSaving(true);
    try {
      await updateWithUserId('purchase_orders', { status: 'reçue', received_at: new Date().toISOString() }, { id: order.id });
      for (const item of items) {
        if (item.id && item.quantity_received !== undefined) {
          await supabase.from('purchase_order_items').update({ quantity_received: item.quantity_received }).eq('id', item.id);
        }
        if (item.medication_id && (item.quantity_received || 0) > 0) {
          const { data: med } = await supabase.from('medications').select('quantity').eq('id', item.medication_id).single();
          if (med) {
            await updateWithUserId('medications', { quantity: med.quantity + (item.quantity_received || 0) }, { id: item.medication_id });
          }
        }
      }
      const cached  = offlineStorage.getCachedMedications();
      const updated = cached.map(m => {
        const match = items.find(i => i.medication_id === m.id && (i.quantity_received || 0) > 0);
        return match ? { ...m, quantity: m.quantity + (match.quantity_received || 0) } : m;
      });
      offlineStorage.cacheMedications(updated);
      onReceived();
    } catch (e: any) {
      alert(`Erreur : ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0a0e14' }}>Réception commande</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {order.supplier || 'Fournisseur inconnu'} · {new Date(order.order_date).toLocaleDateString('fr-FR')}
            </div>
            {order.rep_name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#537d14', marginTop: 3, fontWeight: 600 }}>
                <User style={{ width: 11, height: 11 }} />
                Via {order.rep_name}
                {order.rep_phone && <span style={{ fontWeight: 400, color: '#6b7280' }}>· {order.rep_phone}</span>}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: '#f3f4f6', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X style={{ width: 14, height: 14, color: '#6b7280' }} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 24px' }}>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
            Saisissez les quantités réellement reçues. Le stock sera mis à jour automatiquement.
          </p>
          {items.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0a0e14' }}>{item.medication_name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Commandé : {item.quantity_ordered}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#6b7280' }}>Reçu :</span>
                <input
                  type="number" min={0}
                  value={item.quantity_received ?? item.quantity_ordered}
                  onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity_received: parseInt(e.target.value) || 0 } : it))}
                  style={{
                    width: 70, padding: '7px 8px', textAlign: 'center', outline: 'none', background: '#fff',
                    fontWeight: 700, fontSize: 13, borderRadius: 8,
                    border: `1.5px solid ${(item.quantity_received ?? item.quantity_ordered) < item.quantity_ordered ? 'rgba(183,95,6,0.4)' : 'rgba(83,125,20,0.4)'}`,
                  }}
                />
              </div>
              {item.medication_id && <CheckCircle style={{ width: 14, height: 14, color: '#537d14', flexShrink: 0 }} />}
            </div>
          ))}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 0', borderRadius: 12, fontSize: 14, fontWeight: 600, background: '#f3f4f6', border: 'none', color: '#6b7280', cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={handleReceive} disabled={saving}
            style={{ flex: 2, padding: '12px 0', borderRadius: 12, fontSize: 14, fontWeight: 700, background: '#537d14', border: 'none', color: '#fff', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Mise à jour stock…' : '✓ Confirmer la réception'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Impression bon de commande ─────────────────────────────────────────────────

async function printOrder(order: Order) {
  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
  const total = (order.items || []).reduce((s, i) => s + (i.unit_cost || 0) * i.quantity_ordered, 0);
  const rows  = (order.items || []).map(i => `
    <tr>
      <td>${i.medication_name}${i.dosage && !i.medication_name.includes(i.dosage) ? ` <span style="color:#9ca3af">${i.dosage}</span>` : ''}</td>
      <td style="text-align:right">${i.quantity_ordered}</td>
      <td style="text-align:right">${i.unit_cost ? fmt(i.unit_cost) + ' F' : '—'}</td>
      <td style="text-align:right">${i.unit_cost ? fmt(i.unit_cost * i.quantity_ordered) + ' F' : '—'}</td>
      <td>${i.notes || ''}</td>
    </tr>
  `).join('');

  const repBlock = order.rep_name ? `
    <div class="meta-item">
      <div class="lbl">Commercial</div>
      <div class="val">${order.rep_name}</div>
      ${order.rep_phone ? `<div class="sub">📞 ${order.rep_phone}</div>` : ''}
    </div>` : '';

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
  <title>Bon de commande #${order.id.slice(-6)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;color:#1a1a2e;padding:18mm}
    h1{font-size:20px;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px}
    .header{display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid #e5e7eb}
    .meta{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:18px}
    .meta-item{background:#f9fafb;border:1px solid #e5e7eb;border-radius:7px;padding:9px 12px}
    .lbl{font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}
    .val{font-size:13px;font-weight:700;color:#0a0e14}
    .sub{font-size:11px;color:#6b7280;margin-top:2px}
    table{width:100%;border-collapse:collapse}
    th{background:#f3f4f6;padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em}
    td{padding:8px 10px;border-bottom:1px solid #f3f4f6}
    tfoot td{font-weight:800;background:#f3f4f6}
    .footer{margin-top:28px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between}
    @media print{@page{size:A4;margin:12mm}body{padding:0}}
  </style></head><body>
  <div class="header">
    <div>
      <h1>Bon de commande</h1>
      <div style="font-size:13px;color:#6b7280;margin-top:3px">N° ${order.id.slice(-8).toUpperCase()}</div>
    </div>
    <div style="text-align:right;font-size:11px;color:#6b7280">JunglePharm<br>Émis le ${new Date().toLocaleDateString('fr-FR')}</div>
  </div>
  <div class="meta">
    <div class="meta-item"><div class="lbl">Fournisseur</div><div class="val">${order.supplier || '—'}</div></div>
    ${repBlock}
    <div class="meta-item"><div class="lbl">Date commande</div><div class="val">${new Date(order.order_date).toLocaleDateString('fr-FR')}</div></div>
    <div class="meta-item"><div class="lbl">Statut</div><div class="val">${order.status}</div></div>
  </div>
  <table>
    <thead><tr><th>Produit</th><th style="text-align:right">Qté</th><th style="text-align:right">P.U.</th><th style="text-align:right">Total</th><th>Notes</th></tr></thead>
    <tbody>${rows}</tbody>
    ${total > 0 ? `<tfoot><tr><td colspan="3" style="text-align:right">Total estimé</td><td style="text-align:right">${fmt(total)} FCFA</td><td></td></tr></tfoot>` : ''}
  </table>
  ${order.notes ? `<div style="margin-top:16px;padding:10px;background:#f9fafb;border-radius:8px;font-size:12px"><strong>Notes :</strong> ${order.notes}</div>` : ''}
  <div class="footer">
    <span>Bon de commande JunglePharm — ${order.supplier || ''}</span>
    <span>Signature : ________________</span>
  </div>
  </body></html>`;

  const { printHtml } = await import('../lib/printHelper');
  printHtml(html);
}

// ── Composant principal ────────────────────────────────────────────────────────

type StatusFilter = 'all' | OrderStatus;

export default function Commandes({ initialSupplier }: { initialSupplier?: string } = {}) {
  const [orders,       setOrders]       = useState<Order[]>([]);
  const [reps,         setReps]         = useState<SupplierRep[]>([]);
  const [medications,  setMedications]  = useState<Medication[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [showCreate,   setShowCreate]   = useState(false);
  const [lowStock,     setLowStock]     = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<Order | null>(null);
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [filter,       setFilter]       = useState<StatusFilter>('all');
  const [prefilledSupplier, setPrefilledSupplier] = useState<string | undefined>(initialSupplier);

  // Ouvrir automatiquement le formulaire si un fournisseur est pré-rempli
  useEffect(() => {
    if (initialSupplier) {
      setPrefilledSupplier(initialSupplier);
      setShowCreate(true);
    }
  }, [initialSupplier]);

  const ORDERS_CACHE_KEY = 'junglepharm_orders_cache';

  // Charger les commandes (avec cache local pour la résilience offline)
  const loadOrders = useCallback(async () => {
    setLoading(true);
    // Afficher d'abord le cache pour éviter le flash "vide"
    try {
      const cached = localStorage.getItem(ORDERS_CACHE_KEY);
      if (cached) setOrders(JSON.parse(cached));
    } catch {}
    try {
      const { data: ordersData, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error || !ordersData) { setLoading(false); return; }
      const { data: itemsData } = await supabase.from('purchase_order_items').select('*');
      const itemsMap: Record<string, OrderItem[]> = {};
      for (const item of (itemsData || [])) {
        if (!itemsMap[item.purchase_order_id]) itemsMap[item.purchase_order_id] = [];
        itemsMap[item.purchase_order_id].push(item);
      }
      const merged = ordersData.map(o => ({ ...o, items: itemsMap[o.id] || [] }));
      setOrders(merged);
      // Sauvegarder dans le cache local
      try { localStorage.setItem(ORDERS_CACHE_KEY, JSON.stringify(merged)); } catch {}
    } catch {
      // En cas d'erreur réseau, le cache est déjà affiché
    } finally {
      setLoading(false);
    }
  }, []);

  // Charger les commerciaux
  const loadReps = useCallback(async () => {
    const { data } = await supabase
      .from('supplier_reps')
      .select('*')
      .order('supplier_name')
      .order('name');
    setReps(data || []);
  }, []);

  useEffect(() => {
    loadOrders();
    loadReps();
    fetchAllMedications()
      .then(setMedications)
      .catch(() => setMedications(offlineStorage.getCachedMedications()));
  }, [loadOrders, loadReps]);

  const filteredOrders = useMemo(() =>
    filter === 'all' ? orders : orders.filter(o => o.status === filter),
    [orders, filter]
  );

  const lowStockCount = useMemo(() =>
    medications.filter(m => (m.minimum_stock ?? 0) > 0 && m.quantity <= (m.minimum_stock ?? 0)).length,
    [medications]
  );

  /** Callback optionnel pour naviguer vers l'onglet Fournisseurs */
  // (passé depuis App.tsx via prop si besoin — non utilisé ici mais prévu)

  /** Formate et ouvre WhatsApp avec le bon de commande */
  const sendOrderViaWhatsApp = (order: Order) => {
    const items = order.items || [];
    const pharmacyName = (() => {
      try { return JSON.parse(localStorage.getItem('jungle_pharm_settings') || '{}').pharmacy_name || 'JunglePharm'; } catch { return 'JunglePharm'; }
    })();
    const dateStr = new Date(order.order_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const lines = [
      `🏥 *Bon de commande — ${pharmacyName}*`,
      `📅 Date : ${dateStr}`,
      order.supplier ? `🏭 Fournisseur : ${order.supplier}` : '',
      '',
      '*Articles commandés :*',
      ...items.map(it => `• ${it.medication_name}${it.dosage ? ' ' + it.dosage : ''} — *${it.quantity_ordered} unités*`),
      '',
      order.notes ? `📝 Notes : ${order.notes}` : '',
      '',
      '_Merci de confirmer la disponibilité et le délai de livraison._',
    ].filter(l => l !== undefined && l !== null).join('\n');

    const rawPhone = order.rep_phone || '';
    const phone = rawPhone.replace(/[\s\-().]/g, '').replace(/^00/, '+');
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(lines)}`
      : `https://wa.me/?text=${encodeURIComponent(lines)}`;
    window.open(url, '_blank');
  };

  const updateStatus = async (id: string, status: OrderStatus) => {
    const order = orders.find(o => o.id === id);
    // Envoi WhatsApp automatique quand on passe en statut "envoyée"
    if (status === 'envoyée' && order) {
      sendOrderViaWhatsApp(order);
    }
    await updateWithUserId('purchase_orders', { status }, { id });
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0a0e14', letterSpacing: '-0.03em', margin: 0 }}>Commandes fournisseurs</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>
            {orders.length} commande{orders.length > 1 ? 's' : ''} · {reps.length} commercial{reps.length > 1 ? 'x' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {lowStockCount > 0 && (
            <button
              onClick={() => { setLowStock(true); setShowCreate(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, background: 'rgba(183,95,6,0.08)', color: '#b75f06', border: '1.5px solid rgba(183,95,6,0.25)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <AlertTriangle style={{ width: 14, height: 14 }} />
              Commande urgente ({lowStockCount})
            </button>
          )}
          <button
            onClick={() => { setLowStock(false); setShowCreate(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, background: '#0a0e14', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Nouvelle commande
          </button>
        </div>
      </div>

      {/* Annuaire commerciaux */}
      <SupplierRepsSection reps={reps} onReload={loadReps} />

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(['all', 'brouillon', 'envoyée', 'reçue', 'annulée'] as const).map(f => {
          const count = f === 'all' ? orders.length : orders.filter(o => o.status === f).length;
          return (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1.5px solid ${filter === f ? '#0a0e14' : 'rgba(0,0,0,0.1)'}`,
                background: filter === f ? '#0a0e14' : 'rgba(255,255,255,0.8)',
                color: filter === f ? '#fff' : '#6b7280',
              }}>
              {f === 'all' ? 'Toutes' : STATUS[f].label}
              {count > 0 && (
                <span style={{ marginLeft: 5, fontSize: 10, background: filter === f ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)', borderRadius: 99, padding: '1px 5px' }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Liste commandes */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af', fontSize: 13 }}>Chargement…</div>
      )}

      {!loading && filteredOrders.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'rgba(255,255,255,0.7)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.55)' }}>
          <Truck style={{ width: 36, height: 36, color: '#d1d5db', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>
            {filter === 'all' ? 'Aucune commande' : `Aucune commande "${STATUS[filter as OrderStatus]?.label}"`}
          </p>
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Créez votre première commande fournisseur</p>
        </div>
      )}

      {!loading && filteredOrders.map(order => {
        const isExpanded     = expanded === order.id;
        const totalItems     = (order.items || []).length;
        const estimatedTotal = (order.items || []).reduce((s, i) => s + (i.unit_cost || 0) * i.quantity_ordered, 0);

        return (
          <div key={order.id} style={{ background: 'rgba(255,255,255,0.72)', border: '1.5px solid rgba(255,255,255,0.55)', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
            {/* Ligne header */}
            <div
              onClick={() => setExpanded(isExpanded ? null : order.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: order.status === 'reçue' ? 'rgba(83,125,20,0.1)' : 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {order.status === 'reçue'
                  ? <CheckCircle style={{ width: 16, height: 16, color: '#537d14' }} />
                  : <Truck       style={{ width: 16, height: 16, color: '#6b7280' }} />
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0a0e14' }}>
                    {order.supplier || 'Fournisseur inconnu'}
                  </span>
                  <StatusPill status={order.status} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>
                    {new Date(order.order_date).toLocaleDateString('fr-FR')} · {totalItems} produit{totalItems > 1 ? 's' : ''}
                    {estimatedTotal > 0 && ` · ~${Math.round(estimatedTotal).toLocaleString('fr-FR')} F`}
                  </span>
                  {order.rep_name && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#537d14', background: 'rgba(83,125,20,0.08)', padding: '2px 8px', borderRadius: 99 }}>
                      <User style={{ width: 9, height: 9 }} />
                      {order.rep_name}
                      {order.rep_phone && <span style={{ color: '#6b7280', fontWeight: 400 }}> · {order.rep_phone}</span>}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {order.status === 'brouillon' && (
                  <>
                    <button onClick={e => { e.stopPropagation(); updateStatus(order.id, 'envoyée'); }}
                      style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)', color: '#1d4ed8', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      → Envoyer
                    </button>
                    <button onClick={e => { e.stopPropagation(); updateStatus(order.id, 'annulée'); }}
                      style={{ width: 30, height: 30, borderRadius: 7, background: 'rgba(200,30,30,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X style={{ width: 12, height: 12, color: '#c81e1e' }} />
                    </button>
                  </>
                )}
                {order.status === 'envoyée' && (
                  <button onClick={e => { e.stopPropagation(); setReceiveOrder(order); }}
                    style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(83,125,20,0.08)', border: '1px solid rgba(83,125,20,0.2)', color: '#537d14', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    ✓ Réceptionner
                  </button>
                )}
                {/* Impression disponible pour tous les statuts sauf annulée */}
                {order.status !== 'annulée' && (
                  <button onClick={e => { e.stopPropagation(); printOrder(order); }}
                    title="Imprimer le bon de commande"
                    style={{ width: 30, height: 30, borderRadius: 7, background: 'rgba(0,0,0,0.05)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Printer style={{ width: 13, height: 13, color: '#6b7280' }} />
                  </button>
                )}
                {isExpanded
                  ? <ChevronDown  style={{ width: 16, height: 16, color: '#9ca3af', flexShrink: 0 }} />
                  : <ChevronRight style={{ width: 16, height: 16, color: '#9ca3af', flexShrink: 0 }} />
                }
              </div>
            </div>

            {/* Détail expandable */}
            {isExpanded && (order.items || []).length > 0 && (
              <div style={{ borderTop: '1px solid rgba(0,0,0,0.05)', padding: '0 16px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 100px 80px', gap: 0, padding: '8px 0 5px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  {['Produit', 'Commandé', 'Reçu', 'P.U.'].map(h => (
                    <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
                  ))}
                </div>
                {(order.items || []).map((item, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 100px 80px', padding: '8px 0', borderBottom: i < (order.items || []).length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0a0e14' }}>{item.medication_name}</div>
                      {item.notes && <div style={{ fontSize: 11, color: '#9ca3af' }}>{item.notes}</div>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{item.quantity_ordered}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: item.quantity_received !== undefined && item.quantity_received < item.quantity_ordered ? '#b75f06' : '#537d14' }}>
                      {item.quantity_received !== undefined ? item.quantity_received : (order.status === 'reçue' ? item.quantity_ordered : '—')}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {item.unit_cost ? `${Math.round(item.unit_cost).toLocaleString('fr-FR')} F` : '—'}
                    </div>
                  </div>
                ))}
                {order.notes && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>Note : {order.notes}</div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Modals */}
      {showCreate && (
        <OrderModal
          medications={medications}
          reps={reps}
          initialLowStock={lowStock}
          initialSupplier={prefilledSupplier}
          onClose={() => { setShowCreate(false); setLowStock(false); setPrefilledSupplier(undefined); }}
          onSaved={() => { setShowCreate(false); setLowStock(false); setPrefilledSupplier(undefined); loadOrders(); }}
        />
      )}
      {receiveOrder && (
        <ReceiveModal
          order={receiveOrder}
          onClose={() => setReceiveOrder(null)}
          onReceived={() => { setReceiveOrder(null); loadOrders(); }}
        />
      )}
    </div>
  );
}
