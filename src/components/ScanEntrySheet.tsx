/**
 * ScanEntrySheet
 * ─────────────────────────────────────────────────────────────────────────────
 * Bottom-sheet déclenché après chaque scan code-barres dans l'inventaire.
 *
 * Deux modes :
 *   • found   — produit identifié → entrée rapide en stock (qty, lot, exp, fourn)
 *   • unknown — code inconnu → deux onglets : Lier à existant | Créer nouveau
 *
 * Design : Chalk Premium (tokens C.*).
 */

import { useState, useEffect, useRef } from 'react';
import {
  X, Plus, Minus, Search, CheckCircle, AlertCircle,
  Loader2, Link2, PackagePlus, Tag,
} from 'lucide-react';
import { supabase, Medication } from '../lib/supabase';
import type { ParsedDataMatrix } from '../lib/dataMatrixParser';
import {
  offlineSafeUpdateMedication,
  offlineSafeInsertMedication,
  offlineSafeInsertStockEntries,
  offlineSafeInsertInventoryUnits,
  reserveUnitCodes,
  formatUnitCode,
  type OfflineInventoryUnit,
} from '../lib/writeService';
import { upsertWithUserId, updateWithUserId } from '../lib/supabaseHelpers';
import { barcodeCache } from '../lib/barcodeCache';
import { getLastSupplier, setLastSupplier } from '../lib/settings';

function isUnitModeEnabled(): boolean {
  return localStorage.getItem('workflow_mode') === 'unit';
}

// Résultat renvoyé quand des unités JP ont été générées
export interface ScanEntryUnitResult {
  units: { id: string; unit_code: string; batch_number: string; expiry_date: string | null }[];
  medicationName: string;
  price?: number;
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  panel:    'rgba(255,255,255,0.97)',
  hairline: 'rgba(15,15,20,0.08)',
  border:   'rgba(15,15,20,0.12)',
  brand:    '#10785a',
  brandLt:  'rgba(16,120,90,0.08)',
  brandMid: 'rgba(16,120,90,0.18)',
  ink:      '#0a0e14',
  inkSoft:  '#2c3138',
  inkMute:  '#6b7280',
  inkFaint: '#9aa0a8',
  red:      '#c81e1e', redLt: 'rgba(200,30,30,0.08)',
  amber:    '#b75f06', amberLt: 'rgba(183,95,6,0.09)',
  blue:     '#0651bc', blueLt: 'rgba(6,81,188,0.08)',
  f:  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, system-ui, sans-serif',
  fm: '"SF Mono", "Geist Mono", ui-monospace, Menlo, monospace',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDefaultExpiry(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
}

function fieldStyle(error?: boolean) {
  return {
    width: '100%', height: 38, padding: '0 10px',
    border: `1px solid ${error ? C.red : C.border}`,
    borderRadius: 8, fontSize: 13, color: C.ink,
    background: '#fff', fontFamily: C.f,
    outline: 'none', boxSizing: 'border-box' as const,
  };
}

function labelStyle() {
  return {
    display: 'block' as const,
    fontSize: 11, fontWeight: 600,
    color: C.inkMute, letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  };
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface ScanEntrySheetProps {
  code: string;
  gs1: ParsedDataMatrix | null;
  medication: Medication | null;  // null = inconnu
  onSuccess: (medication: Medication) => void;
  onDismiss: () => void;
  /** Appelé après génération des codes JP (MODE UNITAIRE) */
  onUnitsGenerated?: (result: ScanEntryUnitResult) => void;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ScanEntrySheet({
  code, gs1, medication, onSuccess, onDismiss, onUnitsGenerated,
}: ScanEntrySheetProps) {
  return (
    // Backdrop
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.50)',
      zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      {/* Click outside to dismiss */}
      <div style={{ position: 'absolute', inset: 0 }} onClick={onDismiss} />

      {/* Sheet */}
      <div style={{
        position: 'relative',
        width: '100%', maxWidth: 520,
        background: C.panel,
        borderRadius: '18px 18px 0 0',
        maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 48px rgba(0,0,0,0.20)',
        fontFamily: C.f,
        overflowY: 'auto',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: 'rgba(15,15,20,0.12)' }} />
        </div>

        {medication
          ? <FoundPanel code={code} gs1={gs1} medication={medication} onSuccess={onSuccess} onDismiss={onDismiss} onUnitsGenerated={onUnitsGenerated} />
          : <UnknownPanel code={code} gs1={gs1} onSuccess={onSuccess} onDismiss={onDismiss} onUnitsGenerated={onUnitsGenerated} />
        }
      </div>

      <style>{`
        @keyframes sheet-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FOUND PANEL — produit identifié, entrée rapide en stock
// ══════════════════════════════════════════════════════════════════════════════
function FoundPanel({ code, gs1, medication, onSuccess, onDismiss, onUnitsGenerated }: {
  code: string;
  gs1: ParsedDataMatrix | null;
  medication: Medication;
  onSuccess: (m: Medication) => void;
  onDismiss: () => void;
  onUnitsGenerated?: (result: ScanEntryUnitResult) => void;
}) {
  const [qty, setQty]           = useState(1);
  const [lot, setLot]           = useState(gs1?.lot || medication.batch_number || '');
  const [expiry, setExpiry]     = useState(gs1?.expiryFormatted || medication.expiry_date || getDefaultExpiry());
  const [supplier, setSupplier] = useState(medication.supplier || getLastSupplier() || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');
  const unitMode = isUnitModeEnabled();

  const stockColor = medication.quantity === 0
    ? C.red
    : (medication.minimum_stock && medication.quantity <= medication.minimum_stock) ? C.amber : C.brand;

  const handleConfirm = async () => {
    if (qty <= 0) { setError('Quantité invalide'); return; }
    setError('');
    setSubmitting(true);
    try {
      const newQty = medication.quantity + qty;
      const updateFields: Record<string, unknown> = { quantity: newQty };
      if (lot)     updateFields.batch_number = lot;
      if (expiry)  updateFields.expiry_date  = expiry;
      if (supplier) {
        updateFields.supplier = supplier;
        setLastSupplier(supplier);
      }

      await offlineSafeUpdateMedication(medication.id, updateFields);

      // ── MODE UNITAIRE : générer N codes JP ─────────────────────────────────
      if (unitMode) {
        const receptionBatch = `REC-${Date.now()}`;
        const startCounter = await reserveUnitCodes(qty);
        const today = new Date().toISOString().split('T')[0];

        const unitsToInsert: OfflineInventoryUnit[] = Array.from({ length: qty }, (_, i) => ({
          medication_id:   medication.id,
          unit_code:       formatUnitCode(startCounter + i),
          batch_number:    lot || '',
          expiry_date:     expiry || null,
          entry_date:      today,
          supplier:        supplier || '',
          reception_batch: receptionBatch,
          status:          'available',
        }));

        const createdUnits = await offlineSafeInsertInventoryUnits(unitsToInsert);

        // Cache liaison code EAN ↔ médicament
        barcodeCache.set(code, medication.id);
        if (gs1?.gtin && gs1.gtin !== code) barcodeCache.set(gs1.gtin, medication.id);

        onSuccess({ ...medication, quantity: newQty });

        // Déclencher l'impression des étiquettes JP
        if (onUnitsGenerated && createdUnits.length > 0) {
          onUnitsGenerated({
            units: createdUnits.map(u => ({
              id: u.id,
              unit_code: u.unit_code,
              batch_number: u.batch_number,
              expiry_date: u.expiry_date,
            })),
            medicationName: medication.name,
            price: medication.price,
          });
        }
        return;
      }

      // ── MODE GLOBAL : enregistrement lot dans stock_entries ────────────────
      if (lot || expiry) {
        const today = new Date().toISOString().split('T')[0];
        await offlineSafeInsertStockEntries(
          Array(qty).fill(null).map(() => ({
            medication_id: medication.id,
            entry_date: today,
            batch_number: lot || null,
            expiry_date:  expiry || null,
            is_sold: false,
          }))
        );
      }

      // Cache la liaison code ↔ médicament
      barcodeCache.set(code, medication.id);
      if (gs1?.gtin && gs1.gtin !== code) barcodeCache.set(gs1.gtin, medication.id);

      onSuccess({ ...medication, quantity: newQty });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la mise à jour');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div style={{ padding: '12px 20px 10px', borderBottom: `1px solid ${C.hairline}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: C.brandLt,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CheckCircle size={16} color={C.brand} strokeWidth={1.8} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
                Produit identifié
              </div>
              <div style={{ fontSize: 11, color: C.inkMute, marginTop: 1, fontFamily: C.fm }}>
                {code.length > 24 ? code.slice(0, 24) + '…' : code}
              </div>
            </div>
          </div>
          <button onClick={onDismiss} style={{
            width: 28, height: 28, borderRadius: 7, border: 'none',
            background: 'rgba(15,15,20,0.06)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={14} color={C.inkMute} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Product card */}
      <div style={{
        margin: '14px 20px 0',
        padding: '12px 14px',
        background: C.brandLt,
        border: `1px solid ${C.brandMid}`,
        borderRadius: 10,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
          {medication.name}
        </div>
        {medication.dosage && (
          <div style={{ fontSize: 12, color: C.inkMute, marginTop: 2 }}>{medication.dosage}</div>
        )}
        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stock actuel</div>
            <div style={{ fontFamily: C.fm, fontSize: 18, fontWeight: 800, color: stockColor }}>
              {medication.quantity}
            </div>
          </div>
          {medication.price ? (
            <div>
              <div style={{ fontSize: 10, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prix vente</div>
              <div style={{ fontFamily: C.fm, fontSize: 14, fontWeight: 700, color: C.ink }}>
                {medication.price.toLocaleString('fr-FR')} F
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Mode Unitaire badge */}
      {unitMode && (
        <div style={{
          margin: '10px 20px 0',
          padding: '8px 12px',
          background: 'rgba(16,120,90,0.07)',
          border: '1px solid rgba(16,120,90,0.20)',
          borderRadius: 9,
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: C.brand, fontWeight: 600,
        }}>
          <Tag size={13} strokeWidth={2} />
          Mode Unitaire — {qty} code{qty > 1 ? 's' : ''} JP seront générés et à imprimer
        </div>
      )}

      {/* Entry form */}
      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Qty stepper */}
        <div>
          <span style={labelStyle()}>Quantité entrante</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setQty(q => Math.max(1, q - 1))}
              style={{
                width: 38, height: 38, borderRadius: 8,
                border: `1px solid ${C.border}`, background: '#fff',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Minus size={16} color={C.inkSoft} strokeWidth={2} />
            </button>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              style={{
                flex: 1, height: 38, textAlign: 'center',
                border: `1px solid ${C.border}`, borderRadius: 8,
                fontSize: 20, fontWeight: 800, color: C.ink,
                background: '#fff', outline: 'none', fontFamily: C.fm,
              }}
            />
            <button
              onClick={() => setQty(q => q + 1)}
              style={{
                width: 38, height: 38, borderRadius: 8,
                border: `1px solid ${C.brandMid}`, background: C.brandLt,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Plus size={16} color={C.brand} strokeWidth={2.5} />
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 5 }}>
            Nouveau stock après entrée :{' '}
            <span style={{ fontWeight: 700, color: C.brand, fontFamily: C.fm }}>
              {medication.quantity + qty}
            </span>
          </div>
        </div>

        {/* Lot + Expiry row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle()}>N° de lot</label>
            <input
              type="text"
              value={lot}
              onChange={e => setLot(e.target.value)}
              placeholder="LOT-2024-A"
              style={fieldStyle()}
            />
          </div>
          <div>
            <label style={labelStyle()}>Péremption</label>
            <input
              type="date"
              value={expiry}
              onChange={e => setExpiry(e.target.value)}
              style={fieldStyle()}
            />
          </div>
        </div>

        {/* Supplier */}
        <div>
          <label style={labelStyle()}>Fournisseur</label>
          <input
            type="text"
            value={supplier}
            onChange={e => setSupplier(e.target.value)}
            placeholder="Laborex, Cophadom…"
            style={fieldStyle()}
          />
        </div>

        {error && (
          <div style={{
            fontSize: 12.5, color: C.red, background: C.redLt,
            border: `1px solid rgba(200,30,30,0.20)`,
            padding: '8px 12px', borderRadius: 8,
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <button
          onClick={handleConfirm}
          disabled={submitting}
          style={{
            height: 46, borderRadius: 10, border: 'none',
            background: submitting ? 'rgba(16,120,90,0.5)' : C.brand,
            color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: submitting ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {submitting ? (
            <>
              <div style={{
                width: 16, height: 16, borderRadius: 99,
                border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff',
                animation: 'sheet-spin 0.7s linear infinite',
              }} />
              Enregistrement…
            </>
          ) : (
            <>
              <Plus size={16} strokeWidth={2.5} />
              Confirmer l'entrée (+{qty})
            </>
          )}
        </button>
        <button
          onClick={onDismiss}
          style={{
            height: 40, borderRadius: 10,
            border: `1px solid ${C.hairline}`,
            background: 'transparent', color: C.inkMute,
            fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Annuler
        </button>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// UNKNOWN PANEL — code inconnu → Lier OU Créer
// ══════════════════════════════════════════════════════════════════════════════
type UnknownTab = 'link' | 'create';

function UnknownPanel({ code, gs1, onSuccess, onDismiss, onUnitsGenerated }: {
  code: string;
  gs1: ParsedDataMatrix | null;
  onSuccess: (m: Medication) => void;
  onDismiss: () => void;
  onUnitsGenerated?: (result: ScanEntryUnitResult) => void;
}) {
  const [tab, setTab] = useState<UnknownTab>('link');

  return (
    <>
      {/* Header */}
      <div style={{ padding: '12px 20px 10px', borderBottom: `1px solid ${C.hairline}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: C.amberLt,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AlertCircle size={16} color={C.amber} strokeWidth={1.8} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Produit inconnu</div>
              <div style={{ fontSize: 11, color: C.inkMute, marginTop: 1, fontFamily: C.fm }}>
                {code.length > 24 ? code.slice(0, 24) + '…' : code}
              </div>
            </div>
          </div>
          <button onClick={onDismiss} style={{
            width: 28, height: 28, borderRadius: 7, border: 'none',
            background: 'rgba(15,15,20,0.06)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={14} color={C.inkMute} strokeWidth={2} />
          </button>
        </div>

        {/* GS1 info pill */}
        {gs1 && (
          <div style={{
            marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap',
          }}>
            {gs1.gtin && (
              <span style={{
                fontFamily: C.fm, fontSize: 11, padding: '2px 8px',
                borderRadius: 99, background: C.blueLt, color: C.blue,
              }}>
                GTIN {gs1.gtin}
              </span>
            )}
            {gs1.lot && (
              <span style={{
                fontFamily: C.fm, fontSize: 11, padding: '2px 8px',
                borderRadius: 99, background: 'rgba(15,15,20,0.05)', color: C.inkSoft,
              }}>
                Lot {gs1.lot}
              </span>
            )}
            {gs1.expiryFormatted && (
              <span style={{
                fontFamily: C.fm, fontSize: 11, padding: '2px 8px',
                borderRadius: 99, background: 'rgba(15,15,20,0.05)', color: C.inkSoft,
              }}>
                Exp. {gs1.expiry}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', margin: '12px 20px 0',
        borderRadius: 10, overflow: 'hidden',
        border: `1px solid ${C.hairline}`,
        background: 'rgba(15,15,20,0.03)',
      }}>
        {[
          { id: 'link' as const,   icon: <Link2 size={13} strokeWidth={1.8} />,       label: 'Lier à existant' },
          { id: 'create' as const, icon: <PackagePlus size={13} strokeWidth={1.8} />, label: 'Créer nouveau' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              border: 'none', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 600, fontFamily: C.f,
              borderRadius: tab === t.id ? 8 : 0,
              background: tab === t.id ? '#fff' : 'transparent',
              color: tab === t.id ? C.ink : C.inkMute,
              boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              margin: tab === t.id ? 2 : 0,
              transition: 'all 0.15s',
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'link'
        ? <LinkTab   code={code} gs1={gs1} onSuccess={onSuccess} onDismiss={onDismiss} onUnitsGenerated={onUnitsGenerated} />
        : <CreateTab code={code} gs1={gs1} onSuccess={onSuccess} onDismiss={onDismiss} onUnitsGenerated={onUnitsGenerated} />
      }
    </>
  );
}

// ── Link tab ──────────────────────────────────────────────────────────────────
function LinkTab({ code, gs1, onSuccess, onDismiss, onUnitsGenerated }: {
  code: string; gs1: ParsedDataMatrix | null;
  onSuccess: (m: Medication) => void; onDismiss: () => void;
  onUnitsGenerated?: (result: ScanEntryUnitResult) => void;
}) {
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState<Medication[]>([]);
  const [searching, setSearching]   = useState(false);
  const [linking, setLinking]       = useState<string | null>(null);
  const [error, setError]           = useState('');
  const inputRef                    = useRef<HTMLInputElement>(null);
  const debounceRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 150);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from('medications')
        .select('*')
        .or(`name.ilike.%${q}%,code_produit.ilike.%${q}%`)
        .order('name').limit(15);
      setResults(data || []);
      setSearching(false);
    }, 260);
  }, [query]);

  const handleLink = async (med: Medication) => {
    if (linking) return;
    setLinking(med.id);
    setError('');
    try {
      const barcodeVal = gs1?.gtin || code;
      await upsertWithUserId('barcodes',
        { barcode: barcodeVal, medication_id: med.id, code_produit: med.code_produit },
        { onConflict: 'barcode', ignoreDuplicates: false }
      );
      if (gs1?.gtin && gs1.gtin !== code) {
        await upsertWithUserId('barcodes',
          { barcode: code, medication_id: med.id, code_produit: med.code_produit },
          { onConflict: 'barcode', ignoreDuplicates: false }
        );
      }
      if (gs1?.gtin && !med.gtin) {
        await updateWithUserId('medications', { gtin: gs1.gtin }, { id: med.id });
      }
      barcodeCache.set(barcodeVal, med.id);
      if (gs1?.gtin && gs1.gtin !== code) barcodeCache.set(code, med.id);
      onSuccess(med);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la liaison');
      setLinking(null);
    }
  };

  return (
    <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Search input */}
      <div style={{ position: 'relative' }}>
        <Search size={13} color={C.inkMute} strokeWidth={1.5}
          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Nom du médicament…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ ...fieldStyle(), paddingLeft: 30 }}
        />
      </div>

      {/* Results */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 260, overflowY: 'auto' }}>
        {searching && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
            <Loader2 size={18} color={C.brand} strokeWidth={1.5}
              style={{ animation: 'sheet-spin 0.7s linear infinite' }} />
          </div>
        )}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 13, color: C.inkMute }}>
            Aucun médicament trouvé
          </div>
        )}
        {!searching && query.trim().length < 2 && (
          <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: C.inkFaint }}>
            Tapez au moins 2 caractères
          </div>
        )}
        {results.map(med => {
          const isLinking = linking === med.id;
          return (
            <button
              key={med.id}
              onClick={() => handleLink(med)}
              disabled={!!linking}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 12px',
                borderRadius: 8, cursor: linking ? 'default' : 'pointer',
                border: `1px solid ${isLinking ? C.brandMid : C.hairline}`,
                background: isLinking ? C.brandLt : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                opacity: linking && !isLinking ? 0.5 : 1,
                transition: 'all 0.12s',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {med.name}
                </div>
                <div style={{ fontSize: 11, color: C.inkMute, marginTop: 1 }}>
                  {med.dosage}{med.code_produit ? ` · ${med.code_produit}` : ''}
                </div>
              </div>
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: C.fm, fontWeight: 700, fontSize: 13, color: med.quantity === 0 ? C.red : C.inkSoft }}>
                  {med.quantity}
                </span>
                {isLinking
                  ? <Loader2 size={14} color={C.brand} strokeWidth={1.5} style={{ animation: 'sheet-spin 0.7s linear infinite' }} />
                  : <Link2 size={13} color={C.inkFaint} strokeWidth={1.5} />
                }
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{ fontSize: 12, color: C.red, background: C.redLt, padding: '7px 10px', borderRadius: 7 }}>
          {error}
        </div>
      )}

      <button onClick={onDismiss} style={{
        height: 38, borderRadius: 9,
        border: `1px solid ${C.hairline}`,
        background: 'transparent', color: C.inkMute,
        fontSize: 13, fontWeight: 500, cursor: 'pointer', marginTop: 2,
      }}>
        Annuler
      </button>
    </div>
  );
}

// ── Create tab ────────────────────────────────────────────────────────────────
function CreateTab({ code, gs1, onSuccess, onDismiss, onUnitsGenerated }: {
  code: string; gs1: ParsedDataMatrix | null;
  onSuccess: (m: Medication) => void; onDismiss: () => void;
  onUnitsGenerated?: (result: ScanEntryUnitResult) => void;
}) {
  const [form, setForm] = useState({
    name:     '',
    dosage:   '',
    qty:      '1',
    price:    '',
    lot:      gs1?.lot || '',
    expiry:   gs1?.expiryFormatted || getDefaultExpiry(),
    supplier: getLastSupplier() || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors]         = useState<Partial<typeof form>>({});
  const unitMode = isUnitModeEnabled();

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e: Partial<typeof form> = {};
    if (!form.name.trim())                e.name  = 'Requis';
    if (!form.qty || parseInt(form.qty) < 1) e.qty = 'Requis';
    if (!form.price || parseFloat(form.price) <= 0) e.price = 'Requis';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const name  = form.name.trim().toUpperCase();
      const dosage = form.dosage.trim().toUpperCase();
      const mergedName = dosage ? `${name} ${dosage}` : name;
      const qty   = parseInt(form.qty);
      const price = parseFloat(form.price);

      if (form.supplier) setLastSupplier(form.supplier);

      // code_produit = EAN scanné → permet à la Caisse de retrouver le produit
      // via m.code_produit === barcode (localMatch) sans requête Supabase
      const created = await offlineSafeInsertMedication({
        name:          mergedName,
        dosage:        form.dosage || '',
        quantity:      qty,
        batch_number:  form.lot || null,
        expiry_date:   form.expiry || null,
        minimum_stock: 0,
        price,
        supplier:      form.supplier || null,
        code_produit:  code,   // ← EAN comme code interne du produit
      });

      // Enregistrer le code-barres
      await upsertWithUserId('barcodes',
        { barcode: code, medication_id: created.id, code_produit: created.code_produit },
        { onConflict: 'barcode', ignoreDuplicates: false }
      );
      if (gs1?.gtin && gs1.gtin !== code) {
        await upsertWithUserId('barcodes',
          { barcode: gs1.gtin, medication_id: created.id, code_produit: created.code_produit },
          { onConflict: 'barcode', ignoreDuplicates: false }
        );
        await supabase.from('medications').update({ gtin: gs1.gtin }).eq('id', created.id);
      }

      barcodeCache.set(code, created.id);
      if (gs1?.gtin) barcodeCache.set(gs1.gtin, created.id);

      // ── MODE UNITAIRE : générer N codes JP ─────────────────────────────────
      if (unitMode) {
        const receptionBatch = `REC-${Date.now()}`;
        const startCounter = await reserveUnitCodes(qty);
        const today = new Date().toISOString().split('T')[0];

        const unitsToInsert: OfflineInventoryUnit[] = Array.from({ length: qty }, (_, i) => ({
          medication_id:   created.id,
          unit_code:       formatUnitCode(startCounter + i),
          batch_number:    form.lot || '',
          expiry_date:     form.expiry || null,
          entry_date:      today,
          supplier:        form.supplier || '',
          reception_batch: receptionBatch,
          status:          'available',
        }));

        const createdUnits = await offlineSafeInsertInventoryUnits(unitsToInsert);

        onSuccess(created as Medication);
        if (onUnitsGenerated && createdUnits.length > 0) {
          onUnitsGenerated({
            units: createdUnits.map(u => ({
              id: u.id,
              unit_code: u.unit_code,
              batch_number: u.batch_number,
              expiry_date: u.expiry_date,
            })),
            medicationName: mergedName,
            price,
          });
        }
        return;
      }

      onSuccess(created as Medication);
    } catch (e) {
      setErrors({ name: e instanceof Error ? e.message : 'Erreur lors de la création' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Nom + Dosage */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle()}>Nom *</label>
          <input type="text" value={form.name} onChange={set('name')}
            placeholder="PARACETAMOL" style={fieldStyle(!!errors.name)} />
          {errors.name && <div style={{ fontSize: 11, color: C.red, marginTop: 3 }}>{errors.name}</div>}
        </div>
        <div>
          <label style={labelStyle()}>Dosage</label>
          <input type="text" value={form.dosage} onChange={set('dosage')}
            placeholder="500mg" style={fieldStyle()} />
        </div>
      </div>

      {/* Nom prévisualisé */}
      {(form.name || form.dosage) && (
        <div style={{
          fontSize: 12, padding: '7px 10px', borderRadius: 7,
          background: C.brandLt, color: C.brand, fontWeight: 600,
        }}>
          {[form.name.toUpperCase(), form.dosage.toUpperCase()].filter(Boolean).join(' ')}
        </div>
      )}

      {/* Qty + Prix */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle()}>Quantité *</label>
          <input type="number" min="1" value={form.qty} onChange={set('qty')}
            style={{ ...fieldStyle(!!errors.qty), textAlign: 'center', fontWeight: 700, fontSize: 16 }} />
        </div>
        <div>
          <label style={labelStyle()}>Prix (FCFA) *</label>
          <input type="number" min="0" step="1" value={form.price} onChange={set('price')}
            placeholder="0" style={{ ...fieldStyle(!!errors.price), textAlign: 'center', fontWeight: 700, fontSize: 16 }} />
        </div>
      </div>

      {/* Lot + Expiry */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle()}>N° de lot</label>
          <input type="text" value={form.lot} onChange={set('lot')}
            placeholder="LOT-2024-A" style={fieldStyle()} />
        </div>
        <div>
          <label style={labelStyle()}>Péremption</label>
          <input type="date" value={form.expiry} onChange={set('expiry')}
            style={fieldStyle()} />
        </div>
      </div>

      {/* Supplier */}
      <div>
        <label style={labelStyle()}>Fournisseur</label>
        <input type="text" value={form.supplier} onChange={set('supplier')}
          placeholder="Laborex, Cophadom…" style={fieldStyle()} />
      </div>

      {/* Submit */}
      <button
        onClick={handleCreate}
        disabled={submitting}
        style={{
          height: 46, borderRadius: 10, border: 'none', marginTop: 2,
          background: submitting ? 'rgba(16,120,90,0.5)' : C.brand,
          color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: submitting ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {submitting ? (
          <>
            <div style={{
              width: 16, height: 16, borderRadius: 99,
              border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff',
              animation: 'sheet-spin 0.7s linear infinite',
            }} />
            Création…
          </>
        ) : (
          <>
            <PackagePlus size={16} strokeWidth={2} />
            Créer le produit
          </>
        )}
      </button>
      <button onClick={onDismiss} style={{
        height: 38, borderRadius: 9,
        border: `1px solid ${C.hairline}`,
        background: 'transparent', color: C.inkMute,
        fontSize: 13, fontWeight: 500, cursor: 'pointer',
      }}>
        Annuler
      </button>
    </div>
  );
}
