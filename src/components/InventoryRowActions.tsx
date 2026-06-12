/**
 * InventoryRowActions — Zone de travail contextuelle par ligne d'inventaire
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois actions "one-click" apparaissant au survol de chaque ligne :
 *   • Modifier    — modale légère d'édition inline (nom, prix, seuil min…)
 *   • Ajuster stock — stepper ±1/±5/±10 instantané sans rechargement
 *   • Vente rapide — ajoute au panier actif sans quitter l'inventaire
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Pencil, ShoppingCart, Plus, Minus, Check, X,
  Loader2, PackagePlus, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Medication } from '../lib/supabase';
import { insertWithUserId } from '../lib/supabaseHelpers';

// ── Tokens (alignés sur Chalk) ────────────────────────────────────────────────
const C = {
  brand:   '#537d14',
  brandLt: 'rgba(83,125,20,0.09)',
  brandBd: 'rgba(83,125,20,0.22)',
  ink:     '#0a0e14',
  inkSoft: '#2c3138',
  inkMute: '#6b7280',
  inkFaint:'#9aa0a8',
  red:     '#c81e1e',
  redLt:   'rgba(200,30,30,0.08)',
  redBd:   'rgba(200,30,30,0.22)',
  amber:   '#b45309',
  amberLt: 'rgba(183,95,6,0.08)',
  blue:    '#1d4ed8',
  blueLt:  'rgba(29,78,216,0.08)',
  hairline:'rgba(15,15,20,0.07)',
  panel:   'rgba(255,255,255,0.96)',
  bg:      '#f8fafc',
};

// ════════════════════════════════════════════════════════════════════════════
//  TYPES
// ════════════════════════════════════════════════════════════════════════════
interface RowActionsProps {
  med: Medication;
  isManager: boolean;
  onUpdated: (updated: Medication) => void;   // patch local optimiste
  onAddToCart: (med: Medication) => void;     // vente rapide
  onDelete?: (med: Medication) => void;
  visible: boolean;                           // contrôlé par le hover parent
}

// ════════════════════════════════════════════════════════════════════════════
//  COMPOSANT PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
export default function InventoryRowActions({
  med, isManager, onUpdated, onAddToCart, visible,
}: RowActionsProps) {
  const [editOpen,    setEditOpen]    = useState(false);
  const [stockOpen,   setStockOpen]   = useState(false);
  const [stockAnchor, setStockAnchor] = useState<DOMRect | null>(null);
  const [cartFlash,   setCartFlash]   = useState(false);

  const handleCartClick = () => {
    if (med.quantity <= 0) return;
    onAddToCart(med);
    setCartFlash(true);
    setTimeout(() => setCartFlash(false), 900);
  };

  const handleStockClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (stockOpen) { setStockOpen(false); setStockAnchor(null); return; }
    // Calcule la position du bouton cliqué pour ancrer le popover
    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
    setStockAnchor(rect);
    setStockOpen(true);
    setEditOpen(false);
  };

  return (
    <>
      {/* ── Groupe de boutons ──────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(4px)',
        transition: 'opacity 0.15s, transform 0.15s',
        pointerEvents: visible ? 'auto' : 'none',
      }}>

        {/* ── Vente rapide ─────────────────────────────────────────────────── */}
        <Tooltip text={med.quantity <= 0 ? 'Rupture de stock' : 'Vente rapide'}>
          <ActionBtn
            onClick={e => { e.stopPropagation(); handleCartClick(); }}
            color={cartFlash ? C.brand : C.blue}
            bg={cartFlash ? C.brandLt : C.blueLt}
            disabled={med.quantity <= 0}
            title=""
          >
            {cartFlash
              ? <Check size={13} strokeWidth={2.5} />
              : <ShoppingCart size={13} strokeWidth={1.8} />}
          </ActionBtn>
        </Tooltip>

        {/* ── Ajuster stock ────────────────────────────────────────────────── */}
        <Tooltip text="Ajuster le stock">
          <ActionBtn
            onClick={handleStockClick}
            color={stockOpen ? C.amber : C.inkMute}
            bg={stockOpen ? C.amberLt : 'rgba(0,0,0,0.04)'}
            title=""
          >
            <PackagePlus size={13} strokeWidth={1.8} />
          </ActionBtn>
        </Tooltip>

        {/* ── Modifier ─────────────────────────────────────────────────────── */}
        {isManager && (
          <Tooltip text="Modifier le produit">
            <ActionBtn
              onClick={e => { e.stopPropagation(); setEditOpen(v => !v); setStockOpen(false); setStockAnchor(null); }}
              color={editOpen ? C.brand : C.inkMute}
              bg={editOpen ? C.brandLt : 'rgba(0,0,0,0.04)'}
              title=""
            >
              <Pencil size={12} strokeWidth={1.8} />
            </ActionBtn>
          </Tooltip>
        )}
      </div>

      {/* ── Popover stepper stock — ancré sur le bouton ───────────────────── */}
      {stockOpen && stockAnchor && (
        <StockStepper
          med={med}
          anchor={stockAnchor}
          onClose={() => { setStockOpen(false); setStockAnchor(null); }}
          onUpdated={updated => { onUpdated(updated); setStockOpen(false); setStockAnchor(null); }}
        />
      )}

      {/* ── Modale d'édition ──────────────────────────────────────────────── */}
      {editOpen && (
        <EditModal
          med={med}
          onClose={() => setEditOpen(false)}
          onUpdated={updated => { onUpdated(updated); setEditOpen(false); }}
        />
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  STEPPER STOCK — popover inline
// ════════════════════════════════════════════════════════════════════════════
function StockStepper({
  med, anchor, onClose, onUpdated,
}: { med: Medication; anchor: DOMRect; onClose: () => void; onUpdated: (m: Medication) => void }) {
  const [delta,   setDelta]   = useState(0);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // ── Position calculée depuis le bouton anchor ─────────────────────────────
  const POPOVER_W = 240;
  const POPOVER_H = 260; // estimation
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Place en-dessous à gauche, ou au-dessus si pas de place en bas
  let top  = anchor.bottom + 6;
  let left = anchor.right - POPOVER_W;
  if (top + POPOVER_H > vh - 10) top = anchor.top - POPOVER_H - 6;
  if (left < 8) left = 8;
  if (left + POPOVER_W > vw - 8) left = vw - POPOVER_W - 8;

  // Ferme au clic extérieur
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const rawQty = (med.quantity || 0) + delta;
  const newQty = Math.max(0, rawQty);
  // effectiveDelta = vraie différence après clampage à 0
  // Exemple : stock=3, delta=-5 → newQty=0, effectiveDelta=-3 (pas -5)
  const effectiveDelta = newQty - (med.quantity || 0);
  const isClampedToZero = rawQty < 0; // demandé négatif → limité à 0

  const apply = useCallback(async () => {
    if (delta === 0) { onClose(); return; }
    setSaving(true); setError('');
    try {
      const before = med.quantity || 0;

      // 1. Mise à jour du stock
      const { error: err } = await supabase
        .from('medications')
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', med.id);
      if (err) throw err;

      // 2. Enregistrement du mouvement dans stock_movements
      //    — on utilise effectiveDelta (pas delta brut) pour garantir
      //      l'invariant : quantity_before + quantity_change = quantity_after
      await insertWithUserId('stock_movements', {
        medication_id:   med.id,
        medication_name: med.name,
        dosage:          med.dosage || null,
        movement_type:   effectiveDelta >= 0 ? 'ajustement_entree' : 'ajustement_sortie',
        quantity_before: before,
        quantity_change: effectiveDelta,   // ← delta réel, pas le delta demandé
        quantity_after:  newQty,
        reference:       'AJUST-INVENTAIRE',
        supplier:        med.supplier || null,
        unit_cost:       null,
        notes:           `Ajustement rapide depuis l'inventaire (${effectiveDelta > 0 ? '+' : ''}${effectiveDelta})`,
        seller_id:       null,
        seller_name:     null,
      });

      onUpdated({ ...med, quantity: newQty });
    } catch (e: any) {
      setError(e.message || 'Erreur');
      setSaving(false);
    }
  }, [delta, med, newQty, onClose, onUpdated]);

  // Raccourci clavier
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter') apply();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [apply, onClose]);

  const PRESETS = [-10, -5, -1, +1, +5, +10];

  return (
    <div
      ref={ref}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', zIndex: 9999,
        top, left,
        background: C.panel, border: `1px solid ${C.hairline}`,
        borderRadius: 14, padding: '14px 16px',
        boxShadow: '0 8px 28px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.08)',
        width: POPOVER_W, backdropFilter: 'blur(16px)',
        animation: 'fadeInDown 0.12s ease',
      }}
    >
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {med.name}
        </div>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: C.inkFaint }}>
          <X size={13} />
        </button>
      </div>

      {/* Stock actuel → nouveau */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: C.inkFaint, fontWeight: 600, marginBottom: 2 }}>ACTUEL</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.inkSoft, fontVariantNumeric: 'tabular-nums' }}>{med.quantity}</div>
        </div>
        <div style={{ fontSize: 18, color: C.inkFaint }}>→</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: C.inkFaint, fontWeight: 600, marginBottom: 2 }}>NOUVEAU</div>
          <div style={{
            fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
            color: delta > 0 ? C.brand : delta < 0 ? C.red : C.inkSoft,
            transition: 'color 0.15s',
          }}>{newQty}</div>
        </div>
      </div>

      {/* Presets */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 4, marginBottom: 10 }}>
        {PRESETS.map(p => (
          <button
            key={p}
            onClick={() => setDelta(d => d + p)}
            style={{
              padding: '5px 0', borderRadius: 7, border: `1px solid ${C.hairline}`,
              background: p > 0 ? 'rgba(83,125,20,0.06)' : 'rgba(200,30,30,0.06)',
              color: p > 0 ? C.brand : C.red,
              fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
              transition: 'all 0.1s',
            }}
          >
            {p > 0 ? `+${p}` : p}
          </button>
        ))}
      </div>

      {/* Input manuel */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <button onClick={() => setDelta(d => d - 1)}
          style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.hairline}`, background: C.bg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Minus size={13} color={C.red} strokeWidth={2.5} />
        </button>
        <input
          type="number"
          value={delta === 0 ? '' : delta}
          onChange={e => setDelta(parseInt(e.target.value) || 0)}
          placeholder="0"
          style={{
            flex: 1, height: 30, textAlign: 'center', borderRadius: 8,
            border: `1.5px solid ${C.hairline}`, fontSize: 13, fontWeight: 700,
            color: delta > 0 ? C.brand : delta < 0 ? C.red : C.inkSoft,
            outline: 'none', fontVariantNumeric: 'tabular-nums',
          }}
        />
        <button onClick={() => setDelta(d => d + 1)}
          style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.hairline}`, background: C.bg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Plus size={13} color={C.brand} strokeWidth={2.5} />
        </button>
      </div>

      {isClampedToZero && delta !== 0 && (
        <p style={{ fontSize: 11, color: C.amber, margin: '0 0 6px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          ⚠ Stock limité à 0 — retrait effectif : {effectiveDelta}
        </p>
      )}
      {error && <p style={{ fontSize: 11, color: C.red, margin: '0 0 8px', textAlign: 'center' }}>{error}</p>}

      {/* Bouton valider */}
      <button
        onClick={apply}
        disabled={saving || delta === 0}
        style={{
          width: '100%', height: 34, borderRadius: 9, border: 'none',
          background: delta === 0 || saving ? 'rgba(0,0,0,0.08)' : `linear-gradient(135deg,${C.brand},#6a9e28)`,
          color: delta === 0 || saving ? C.inkFaint : '#fff',
          fontSize: 13, fontWeight: 700, cursor: delta === 0 || saving ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          transition: 'all 0.15s',
          boxShadow: delta !== 0 && !saving ? '0 2px 8px rgba(83,125,20,0.25)' : 'none',
        }}
      >
        {saving
          ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Enregistrement…</>
          : <><Check size={13} strokeWidth={2.5} /> Appliquer {delta !== 0 && `(${delta > 0 ? '+' : ''}${delta})`}</>
        }
      </button>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeInDown{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  MODALE D'ÉDITION — formulaire léger inline
// ════════════════════════════════════════════════════════════════════════════
function EditModal({
  med, onClose, onUpdated,
}: { med: Medication; onClose: () => void; onUpdated: (m: Medication) => void }) {
  const [form, setForm] = useState({
    name:          med.name,
    price:         String(med.price ?? ''),
    wholesale_price: String(med.wholesale_price ?? ''),
    minimum_stock: String(med.minimum_stock ?? med.min_stock ?? ''),
    expiry_date:   med.expiry_date ?? '',
    supplier:      med.supplier ?? '',
    name_rayon:    med.name_rayon ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [saved,  setSaved]  = useState(false);

  // Ferme sur Échap
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Le nom est requis.'); return; }
    setSaving(true); setError('');
    try {
      const patch: Partial<Medication> & Record<string, unknown> = {
        name:           form.name.trim(),
        updated_at:     new Date().toISOString(),
      };
      if (form.price !== '')         patch.price           = parseFloat(form.price) || 0;
      if (form.wholesale_price !== '') patch.wholesale_price = parseFloat(form.wholesale_price) || 0;
      if (form.minimum_stock !== '')  patch.minimum_stock   = parseInt(form.minimum_stock)  || 0;
      if (form.expiry_date)           patch.expiry_date     = form.expiry_date;
      if (form.supplier !== undefined) patch.supplier       = form.supplier;
      if (form.name_rayon !== undefined) patch.name_rayon   = form.name_rayon;

      const { error: err } = await supabase.from('medications').update(patch).eq('id', med.id);
      if (err) throw err;
      setSaved(true);
      setTimeout(() => { onUpdated({ ...med, ...patch }); }, 600);
    } catch (e: any) {
      setError(e.message || 'Erreur de sauvegarde');
      setSaving(false);
    }
  };

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(10,14,20,0.45)', backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 18,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08)',
        width: '100%', maxWidth: 440,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 0' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>
              Modifier le produit
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: C.inkFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
              {med.name} {med.dosage && `· ${med.dosage}`}
            </p>
          </div>
          <button onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.hairline}`, background: C.bg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <X size={14} color={C.inkMute} />
          </button>
        </div>

        {/* Formulaire */}
        <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          <Field label="Nom du produit" required>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              style={inputStyle(!!form.name)} autoFocus />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Prix de vente (F)">
              <input type="number" value={form.price} onChange={e => set('price', e.target.value)}
                placeholder={String(med.price ?? '')} style={inputStyle(true)} />
            </Field>
            <Field label="Prix d'achat (F)">
              <input type="number" value={form.wholesale_price} onChange={e => set('wholesale_price', e.target.value)}
                placeholder={String(med.wholesale_price ?? '')} style={inputStyle(true)} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Stock minimum">
              <input type="number" value={form.minimum_stock} onChange={e => set('minimum_stock', e.target.value)}
                placeholder="10" style={inputStyle(true)} />
            </Field>
            <Field label="Date péremption">
              <input type="date" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)}
                style={inputStyle(true)} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Fournisseur">
              <input value={form.supplier} onChange={e => set('supplier', e.target.value)}
                placeholder="Laborex, COPHAB…" style={inputStyle(true)} />
            </Field>
            <Field label="Rayon / Catégorie">
              <input value={form.name_rayon} onChange={e => set('name_rayon', e.target.value)}
                placeholder="Antibiotique, OTC…" style={inputStyle(true)} />
            </Field>
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 9, background: 'rgba(200,30,30,0.07)', border: '1px solid rgba(200,30,30,0.18)', fontSize: 12.5, color: C.red }}>
              <AlertTriangle size={13} /> {error}
            </div>
          )}

          {/* Boutons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={onClose}
              style={{ flex: 1, height: 38, borderRadius: 10, border: `1px solid ${C.hairline}`, background: C.bg, color: C.inkMute, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving || saved}
              style={{
                flex: 2, height: 38, borderRadius: 10, border: 'none',
                background: saved ? 'rgba(83,125,20,0.15)' : `linear-gradient(135deg,${C.brand},#6a9e28)`,
                color: saved ? C.brand : '#fff',
                fontSize: 13, fontWeight: 700, cursor: saving || saved ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: !saving && !saved ? '0 2px 8px rgba(83,125,20,0.25)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {saving && <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
              {saved ? <><Check size={14} strokeWidth={2.5} /> Enregistré !</> : saving ? 'Enregistrement…' : <><Check size={14} strokeWidth={2.5} /> Enregistrer</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  UTILITAIRES
// ════════════════════════════════════════════════════════════════════════════
function ActionBtn({
  children, onClick, color, bg, disabled, title,
}: {
  children: React.ReactNode; onClick: React.MouseEventHandler;
  color: string; bg: string; disabled?: boolean; title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 7, border: 'none',
        background: bg, color, cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.35 : 1,
        transition: 'background 0.12s, transform 0.08s',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
    >
      {children}
    </button>
  );
}

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div style={{
          position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
          background: C.ink, color: '#fff', fontSize: 10.5, fontWeight: 600,
          padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap', pointerEvents: 'none',
          zIndex: 300, letterSpacing: '0.01em',
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        }}>
          {text}
          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', border: '4px solid transparent', borderTopColor: C.ink }} />
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, color: C.inkMute, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}{required && <span style={{ color: C.red, marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = (valid: boolean): React.CSSProperties => ({
  width: '100%', height: 36, padding: '0 10px', borderRadius: 9,
  border: `1.5px solid ${valid ? C.hairline : 'rgba(200,30,30,0.3)'}`,
  fontSize: 13, color: C.ink, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit', transition: 'border-color 0.12s',
  background: '#fafafa',
});
