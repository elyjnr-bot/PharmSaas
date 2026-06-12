/**
 * Mouvements.tsx — Gestion des mouvements de stock
 * ─────────────────────────────────────────────────
 * 4 sous-onglets :
 *   • Réception BL  — saisir un bon de livraison → stock +N
 *   • Inventaire    — comptage physique → ajustement du stock
 *   • Sorties       — perte / casse / péremption → stock -N
 *   • Historique    — audit trail complet, exportable CSV
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, Plus, Trash2, Package, X, Download, Check,
  AlertTriangle, ClipboardList, TruckIcon, Archive,
  History, ChevronDown, ScanLine,
} from 'lucide-react';
import { fetchAllMedications, Medication, supabase } from '../lib/supabase';
import { insertWithUserId, updateWithUserId } from '../lib/supabaseHelpers';
import { offlineStorage } from '../lib/offlineStorage';
import { useSeller } from '../lib/sellerContext';
import { useResponsive } from '../lib/useResponsive';

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  brand:    '#10785a',
  brandBg:  'rgba(16,120,90,0.08)',
  ink:      '#0a0e14',
  inkSoft:  '#2c3138',
  inkMute:  '#6b7280',
  inkFaint: '#9aa0a8',
  bg:       '#f8fafc',
  surface:  '#ffffff',
  hairline: 'rgba(15,15,20,0.07)',
  red:      '#c81e1e',
  redBg:    'rgba(200,30,30,0.07)',
  amber:    '#b75f06',
  amberBg:  'rgba(183,95,6,0.08)',
  green:    '#059669',
  greenBg:  'rgba(5,150,105,0.08)',
};

// ── Types ─────────────────────────────────────────────────────────────────────
type SubTab = 'reception' | 'inventaire' | 'sorties' | 'historique';
type ExitReason = 'perte' | 'peremption' | 'casse';
type MovementType =
  | 'reception_bl' | 'vente' | 'retour_client'
  | 'inventaire' | 'perte' | 'peremption' | 'casse'
  | 'ajustement_entree' | 'ajustement_sortie'; // ajustements rapides depuis l'inventaire

interface BLLine {
  id: string;
  medication: Medication | null;
  search: string;
  suggestions: Medication[];
  quantity: number;
  unitCost: number;
}

interface InvLine {
  medication: Medication;
  counted: string; // string pour l'input, '' = non saisi
}

interface StockMovement {
  id: string;
  medication_name: string;
  dosage: string | null;
  movement_type: MovementType;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reference: string | null;
  supplier: string | null;
  notes: string | null;
  seller_name: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function newLine(): BLLine {
  return { id: crypto.randomUUID(), medication: null, search: '', suggestions: [], quantity: 1, unitCost: 0 };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function movLabel(type: MovementType): { label: string; color: string; bg: string; sign: string } {
  switch (type) {
    case 'reception_bl':   return { label: 'Réception BL',   color: C.green,  bg: C.greenBg,  sign: '+' };
    case 'vente':          return { label: 'Vente',           color: C.inkMute, bg: 'rgba(0,0,0,0.05)', sign: '−' };
    case 'retour_client':  return { label: 'Retour client',   color: C.brand,  bg: C.brandBg,  sign: '+' };
    case 'inventaire':     return { label: 'Inventaire',      color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', sign: '±' };
    case 'perte':          return { label: 'Perte',           color: C.red,    bg: C.redBg,    sign: '−' };
    case 'peremption':     return { label: 'Péremption',      color: C.amber,  bg: C.amberBg,  sign: '−' };
    case 'casse':              return { label: 'Casse',              color: C.red,    bg: C.redBg,    sign: '−' };
    case 'ajustement_entree':  return { label: 'Ajust. entrée',     color: C.green,  bg: C.greenBg,  sign: '+' };
    case 'ajustement_sortie':  return { label: 'Ajust. sortie',     color: C.amber,  bg: C.amberBg,  sign: '−' };
    default:                   return { label: type,                color: C.inkMute, bg: C.bg,       sign: '' };
  }
}

const EXIT_REASONS: { value: ExitReason; label: string }[] = [
  { value: 'perte',      label: 'Perte / vol' },
  { value: 'peremption', label: 'Péremption' },
  { value: 'casse',      label: 'Casse / dommage' },
];

// ── Sub-tab nav ───────────────────────────────────────────────────────────────
const TABS: { id: SubTab; icon: React.ReactNode; label: string }[] = [
  { id: 'reception',  icon: <TruckIcon size={14} strokeWidth={1.8} />,    label: 'Réception BL' },
  { id: 'inventaire', icon: <ClipboardList size={14} strokeWidth={1.8} />, label: 'Inventaire' },
  { id: 'sorties',    icon: <Archive size={14} strokeWidth={1.8} />,       label: 'Sorties' },
  { id: 'historique', icon: <History size={14} strokeWidth={1.8} />,       label: 'Historique' },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function Mouvements() {
  const { activeSeller } = useSeller();
  const { isDesktop } = useResponsive();
  const [subTab, setSubTab] = useState<SubTab>('historique');
  const [medications, setMedications] = useState<Medication[]>([]);

  // ── Charger les médicaments ───────────────────────────────────────────────
  useEffect(() => {
    const cached = offlineStorage.getCachedMedications();
    if (cached.length) setMedications(cached);
    fetchAllMedications().then(list => {
      if (list.length) {
        setMedications(list);
        offlineStorage.cacheMedications(list);
      }
    });
  }, []);

  // ── Écoute scanner HID ────────────────────────────────────────────────────
  const scanHandlerRef = useRef<((barcode: string) => void) | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const { barcode } = (e as CustomEvent<{ barcode: string }>).detail;
      if (scanHandlerRef.current) scanHandlerRef.current(barcode);
    };
    window.addEventListener('barcode-scanned', handler);
    return () => window.removeEventListener('barcode-scanned', handler);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100vh', padding: isDesktop ? 0 : '12px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.ink, margin: 0, letterSpacing: '-0.03em' }}>
            Mouvements de stock
          </h1>
          <p style={{ fontSize: 13, color: C.inkMute, margin: '2px 0 0', fontWeight: 400 }}>
            Réceptions · Inventaire · Sorties · Historique
          </p>
        </div>
      </div>

      {/* Sub-tab nav */}
      <div style={{
        display: 'flex', gap: 4,
        background: C.surface,
        border: `1px solid ${C.hairline}`,
        borderRadius: 12, padding: 4,
        width: 'fit-content',
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 9, border: 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.15s',
              background: subTab === t.id ? C.ink : 'transparent',
              color: subTab === t.id ? '#fff' : C.inkMute,
              letterSpacing: '-0.01em',
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {subTab === 'reception'  && <ReceptionBL  medications={medications} onMedicationsUpdated={setMedications} activeSeller={activeSeller} scanHandlerRef={scanHandlerRef} />}
      {subTab === 'inventaire' && <InventairePhysique medications={medications} onMedicationsUpdated={setMedications} activeSeller={activeSeller} />}
      {subTab === 'sorties'    && <SortiesStock  medications={medications} onMedicationsUpdated={setMedications} activeSeller={activeSeller} />}
      {subTab === 'historique' && <HistoriqueMovements />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RÉCEPTION BL
// ─────────────────────────────────────────────────────────────────────────────
interface SectionProps {
  medications: Medication[];
  onMedicationsUpdated: (meds: Medication[]) => void;
  activeSeller: { id: string; name: string } | null;
  scanHandlerRef?: React.MutableRefObject<((barcode: string) => void) | null>;
}

function ReceptionBL({ medications, onMedicationsUpdated, activeSeller, scanHandlerRef }: SectionProps) {
  const [supplier, setSupplier]     = useState('');
  const [blRef, setBlRef]           = useState('');
  const [blDate, setBlDate]         = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines]           = useState<BLLine[]>([newLine()]);
  const [loading, setLoading]       = useState(false);
  const [success, setSuccess]       = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);

  // Scanner HID → auto-fill ligne active
  useEffect(() => {
    if (!scanHandlerRef) return;
    scanHandlerRef.current = (barcode: string) => {
      const med = medications.find(m =>
        m.code_produit === barcode || (m as any).barcode === barcode || m.batch_number === barcode
      );
      if (!med) return;
      setLines(prev => {
        const target = activeLineId ?? prev[prev.length - 1]?.id;
        return prev.map(l =>
          l.id === target
            ? { ...l, medication: med, search: `${med.name} ${med.dosage ?? ''}`.trim(), suggestions: [] }
            : l
        );
      });
    };
    return () => { if (scanHandlerRef.current === scanHandlerRef.current) scanHandlerRef.current = null; };
  }, [medications, activeLineId, scanHandlerRef]);

  function updateLine(id: string, patch: Partial<BLLine>) {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  }

  function searchMed(id: string, q: string) {
    const q2 = q.toLowerCase();
    const sugg = q2.length < 2 ? [] : medications.filter(m =>
      m.name.toLowerCase().includes(q2) || m.code_produit?.toLowerCase().includes(q2)
    ).slice(0, 8);
    updateLine(id, { search: q, suggestions: sugg, medication: null });
  }

  function selectMed(id: string, med: Medication) {
    updateLine(id, { medication: med, search: `${med.name} ${med.dosage ?? ''}`.trim(), suggestions: [] });
  }

  const total = lines.reduce((s, l) => s + (l.quantity * l.unitCost), 0);
  const canSubmit = lines.some(l => l.medication && l.quantity > 0);

  async function submit() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const validLines = lines.filter(l => l.medication && l.quantity > 0);
      for (const line of validLines) {
        const med = line.medication!;
        const before = med.quantity ?? 0;
        const after  = before + line.quantity;

        // Update stock
        const { error: updErr } = await updateWithUserId('medications', { quantity: after }, { id: med.id });
        if (updErr) throw updErr;

        // Insert movement
        const { error: insErr } = await insertWithUserId('stock_movements', {
          medication_id:   med.id,
          medication_name: med.name,
          dosage:          med.dosage ?? null,
          movement_type:   'reception_bl',
          quantity_before: before,
          quantity_change: line.quantity,
          quantity_after:  after,
          reference:       blRef || null,
          supplier:        supplier || null,
          unit_cost:       line.unitCost || null,
          notes:           null,
          seller_id:       activeSeller?.id ?? null,
          seller_name:     activeSeller?.name ?? null,
        });
        if (insErr) throw insErr;
      }

      // Mettre à jour le cache
      const updated = medications.map(m => {
        const line = validLines.find(l => l.medication?.id === m.id);
        return line ? { ...m, quantity: (m.quantity ?? 0) + line.quantity } : m;
      });
      onMedicationsUpdated(updated);
      offlineStorage.cacheMedications(updated);

      setSuccess(true);
      setLines([newLine()]);
      setSupplier('');
      setBlRef('');
      setTimeout(() => setSuccess(false), 3500);
    } catch (err) {
      console.error('Réception BL error:', err);
      alert('Erreur lors de la réception. Réessayez.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
      {success && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: C.greenBg, border: `1px solid rgba(5,150,105,0.25)`, borderRadius: 10, fontSize: 13, fontWeight: 600, color: C.green }}>
          <Check size={15} /> Réception enregistrée — stock mis à jour
        </div>
      )}

      {/* Infos BL */}
      <div style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '16px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 12, letterSpacing: '-0.01em' }}>Informations du bon de livraison</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fournisseur</span>
            <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Nom du fournisseur"
              style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.hairline}`, fontSize: 13, color: C.ink, background: C.bg, outline: 'none' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.05em' }}>N° BL / Référence</span>
            <input value={blRef} onChange={e => setBlRef(e.target.value)} placeholder="BL-2026-001"
              style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.hairline}`, fontSize: 13, color: C.ink, background: C.bg, outline: 'none' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date réception</span>
            <input type="date" value={blDate} onChange={e => setBlDate(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.hairline}`, fontSize: 13, color: C.ink, background: C.bg, outline: 'none' }} />
          </label>
        </div>
      </div>

      {/* Scanner hint */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.inkFaint }}>
        <ScanLine size={13} strokeWidth={1.5} />
        Scanner un code-barres sur la dernière ligne active — ou utilisez la recherche manuelle
      </div>

      {/* Lignes produits */}
      <div style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 14, overflow: 'hidden' }}>
        {/* En-têtes */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 32px', gap: 0, padding: '10px 16px', background: C.bg, borderBottom: `1px solid ${C.hairline}`, fontSize: 11, fontWeight: 700, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span>Produit</span><span>Quantité</span><span>Coût unitaire</span><span />
        </div>

        {lines.map((line, idx) => (
          <div key={line.id}
            style={{ borderBottom: idx < lines.length - 1 ? `1px solid ${C.hairline}` : 'none', position: 'relative' }}
            onClick={() => setActiveLineId(line.id)}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 32px', gap: 0, padding: '10px 16px', alignItems: 'center' }}>
              {/* Recherche produit */}
              <div style={{ position: 'relative' }}>
                <input
                  value={line.search}
                  onChange={e => searchMed(line.id, e.target.value)}
                  onFocus={() => setActiveLineId(line.id)}
                  placeholder="Rechercher un produit…"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: `1px solid ${activeLineId === line.id ? C.brand : C.hairline}`, fontSize: 13, color: C.ink, background: C.bg, outline: 'none', boxSizing: 'border-box' }}
                />
                {line.suggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', zIndex: 50, marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
                    {line.suggestions.map(m => (
                      <div key={m.id} onMouseDown={() => selectMed(line.id, m)}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: C.ink, borderBottom: `1px solid ${C.hairline}` }}
                        onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ fontWeight: 600 }}>{m.name}</span>
                        <span style={{ color: C.inkMute, marginLeft: 6 }}>{m.dosage} — stock : {m.quantity}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quantité */}
              <input type="number" min={1} value={line.quantity} onChange={e => updateLine(line.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.hairline}`, fontSize: 13, textAlign: 'center', color: C.ink, background: C.bg, outline: 'none', width: '75px' }} />

              {/* Coût */}
              <div style={{ position: 'relative', width: '98px' }}>
                <input type="number" min={0} step="0.01" value={line.unitCost || ''} onChange={e => updateLine(line.id, { unitCost: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  style={{ padding: '7px 28px 7px 10px', borderRadius: 8, border: `1px solid ${C.hairline}`, fontSize: 13, color: C.ink, background: C.bg, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: C.inkFaint }}>F</span>
              </div>

              {/* Supprimer */}
              <button onClick={() => setLines(prev => prev.length > 1 ? prev.filter(l => l.id !== line.id) : prev)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.inkFaint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}

        {/* Ajouter une ligne */}
        <div style={{ padding: '10px 16px', borderTop: `1px dashed ${C.hairline}` }}>
          <button onClick={() => { const l = newLine(); setLines(prev => [...prev, l]); setActiveLineId(l.id); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: C.brand, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <Plus size={14} strokeWidth={2.5} /> Ajouter un produit
          </button>
        </div>
      </div>

      {/* Total + soumettre */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 14 }}>
        <div>
          <span style={{ fontSize: 13, color: C.inkMute }}>Valeur totale réception : </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{total.toLocaleString('fr-FR')} FCFA</span>
        </div>
        <button
          onClick={submit}
          disabled={!canSubmit || loading}
          style={{
            padding: '10px 24px', borderRadius: 10, border: 'none',
            background: canSubmit && !loading ? C.brand : '#e5e7eb',
            color: canSubmit && !loading ? '#fff' : C.inkFaint,
            fontSize: 14, fontWeight: 700, cursor: canSubmit && !loading ? 'pointer' : 'default',
            letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          {loading ? 'Enregistrement…' : <><TruckIcon size={14} /> Valider la réception</>}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INVENTAIRE PHYSIQUE
// ─────────────────────────────────────────────────────────────────────────────
function InventairePhysique({ medications, onMedicationsUpdated, activeSeller }: Omit<SectionProps, 'scanHandlerRef'>) {
  const [invLines, setInvLines]   = useState<InvLine[]>([]);
  const [search, setSearch]       = useState('');
  const [invRef, setInvRef]       = useState(`INV-${new Date().toISOString().slice(0, 10)}`);
  const [notes, setNotes]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const [showOnlyDiff, setShowOnlyDiff] = useState(false);

  useEffect(() => {
    setInvLines(medications.map(m => ({ medication: m, counted: '' })));
  }, [medications]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = invLines.filter(l =>
      !q || l.medication.name.toLowerCase().includes(q) || l.medication.code_produit?.toLowerCase().includes(q)
    );
    if (showOnlyDiff) list = list.filter(l => l.counted !== '' && parseInt(l.counted) !== l.medication.quantity);
    return list;
  }, [invLines, search, showOnlyDiff]);

  const diffs = invLines.filter(l => l.counted !== '' && parseInt(l.counted) !== l.medication.quantity);
  const totalGain = diffs.filter(l => parseInt(l.counted) > l.medication.quantity).reduce((s, l) => s + (parseInt(l.counted) - l.medication.quantity), 0);
  const totalLoss = diffs.filter(l => parseInt(l.counted) < l.medication.quantity).reduce((s, l) => s + (l.medication.quantity - parseInt(l.counted)), 0);

  function setCounted(medId: string, val: string) {
    setInvLines(prev => prev.map(l => l.medication.id === medId ? { ...l, counted: val } : l));
  }

  async function submit() {
    if (!diffs.length) { alert('Aucune différence à enregistrer.'); return; }
    setLoading(true);
    try {
      const updated = [...medications];
      for (const line of diffs) {
        const newQty = parseInt(line.counted);
        const before = line.medication.quantity;

        const { error: updErr } = await updateWithUserId('medications', { quantity: newQty }, { id: line.medication.id });
        if (updErr) throw updErr;

        const { error: insErr } = await insertWithUserId('stock_movements', {
          medication_id:   line.medication.id,
          medication_name: line.medication.name,
          dosage:          line.medication.dosage ?? null,
          movement_type:   'inventaire',
          quantity_before: before,
          quantity_change: newQty - before,
          quantity_after:  newQty,
          reference:       invRef || null,
          supplier:        null,
          unit_cost:       null,
          notes:           notes || null,
          seller_id:       activeSeller?.id ?? null,
          seller_name:     activeSeller?.name ?? null,
        });
        if (insErr) throw insErr;

        const idx = updated.findIndex(m => m.id === line.medication.id);
        if (idx >= 0) updated[idx] = { ...updated[idx], quantity: newQty };
      }

      onMedicationsUpdated(updated);
      offlineStorage.cacheMedications(updated);
      setInvLines(updated.map(m => ({ medication: m, counted: '' })));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la sauvegarde.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
      {success && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: C.greenBg, border: `1px solid rgba(5,150,105,0.25)`, borderRadius: 10, fontSize: 13, fontWeight: 600, color: C.green }}>
          <Check size={15} /> Inventaire validé — {diffs.length} ajustement(s) enregistré(s)
        </div>
      )}

      {/* Entête inventaire */}
      <div style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '16px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 12 }}>Paramètres de l'inventaire</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Référence</span>
            <input value={invRef} onChange={e => setInvRef(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.hairline}`, fontSize: 13, color: C.ink, background: C.bg, outline: 'none' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Observations</span>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optionnel…"
              style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.hairline}`, fontSize: 13, color: C.ink, background: C.bg, outline: 'none' }} />
          </label>
        </div>
      </div>

      {/* KPI diffs */}
      {diffs.length > 0 && (
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, background: C.amberBg, border: `1px solid rgba(183,95,6,0.2)`, borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Écarts détectés</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, marginTop: 2 }}>{diffs.length}</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(5,150,105,0.07)', border: `1px solid rgba(5,150,105,0.2)`, borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Gain inventaire</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, marginTop: 2 }}>+{totalGain}</div>
          </div>
          <div style={{ flex: 1, background: C.redBg, border: `1px solid rgba(200,30,30,0.2)`, borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.red, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Perte inventaire</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, marginTop: 2 }}>−{totalLoss}</div>
          </div>
        </div>
      )}

      {/* Barre outils */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.inkMute }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrer les produits…"
            style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8, border: `1px solid ${C.hairline}`, fontSize: 13, color: C.ink, background: C.surface, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <button onClick={() => setShowOnlyDiff(p => !p)}
          style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${showOnlyDiff ? C.amber : C.hairline}`, background: showOnlyDiff ? C.amberBg : C.surface, fontSize: 12.5, fontWeight: 600, color: showOnlyDiff ? C.amber : C.inkMute, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {showOnlyDiff ? 'Tous les produits' : `Écarts uniquement${diffs.length ? ` (${diffs.length})` : ''}`}
        </button>
      </div>

      {/* Table */}
      <div style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px', padding: '10px 16px', background: C.bg, borderBottom: `1px solid ${C.hairline}`, fontSize: 11, fontWeight: 700, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span>Produit</span><span style={{ textAlign: 'center' }}>Stock théorique</span><span style={{ textAlign: 'center' }}>Compté</span><span style={{ textAlign: 'center' }}>Écart</span>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: C.inkMute, fontSize: 13 }}>Aucun produit</div>
        )}
        {filtered.map((line, i) => {
          const counted = line.counted !== '' ? parseInt(line.counted) : null;
          const diff = counted !== null ? counted - line.medication.quantity : null;
          const hasDiff = diff !== null && diff !== 0;
          return (
            <div key={line.medication.id}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px',
                padding: '10px 16px', alignItems: 'center',
                borderBottom: i < filtered.length - 1 ? `1px solid ${C.hairline}` : 'none',
                background: hasDiff ? (diff! > 0 ? 'rgba(5,150,105,0.04)' : 'rgba(200,30,30,0.03)') : 'transparent',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{line.medication.name}</div>
                <div style={{ fontSize: 11.5, color: C.inkMute }}>{line.medication.dosage}</div>
              </div>
              <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: C.ink }}>{line.medication.quantity}</div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <input
                  type="number" min={0} value={line.counted}
                  onChange={e => setCounted(line.medication.id, e.target.value)}
                  placeholder="—"
                  style={{ width: 70, padding: '6px 8px', borderRadius: 7, border: `1px solid ${hasDiff ? (diff! > 0 ? C.green : C.red) : C.hairline}`, fontSize: 13, textAlign: 'center', color: C.ink, background: C.bg, outline: 'none' }}
                />
              </div>
              <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: diff === null ? C.inkFaint : diff > 0 ? C.green : diff < 0 ? C.red : C.inkMute }}>
                {diff === null ? '—' : diff > 0 ? `+${diff}` : diff === 0 ? '✓' : diff}
              </div>
            </div>
          );
        })}
      </div>

      {/* Valider */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={submit} disabled={!diffs.length || loading}
          style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: diffs.length && !loading ? C.brand : '#e5e7eb', color: diffs.length && !loading ? '#fff' : C.inkFaint, fontSize: 14, fontWeight: 700, cursor: diffs.length && !loading ? 'pointer' : 'default', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading ? 'Enregistrement…' : <><ClipboardList size={14} /> Valider l'inventaire ({diffs.length} écart{diffs.length !== 1 ? 's' : ''})</>}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SORTIES MANUELLES
// ─────────────────────────────────────────────────────────────────────────────
function SortiesStock({ medications, onMedicationsUpdated, activeSeller }: Omit<SectionProps, 'scanHandlerRef'>) {
  const [search, setSearch]       = useState('');
  const [suggestions, setSuggestions] = useState<Medication[]>([]);
  const [selectedMed, setSelectedMed] = useState<Medication | null>(null);
  const [qty, setQty]             = useState(1);
  const [reason, setReason]       = useState<ExitReason>('perte');
  const [notes, setNotes]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState<string | null>(null);

  function onSearch(q: string) {
    setSearch(q);
    setSelectedMed(null);
    const q2 = q.toLowerCase();
    setSuggestions(q2.length < 2 ? [] : medications.filter(m => m.name.toLowerCase().includes(q2) || m.code_produit?.toLowerCase().includes(q2)).slice(0, 8));
  }

  async function submit() {
    if (!selectedMed || qty <= 0) return;
    if (qty > selectedMed.quantity) { alert(`Stock insuffisant (disponible : ${selectedMed.quantity})`); return; }
    setLoading(true);
    try {
      const before  = selectedMed.quantity;
      const after   = before - qty;
      const { error: updErr } = await updateWithUserId('medications', { quantity: after }, { id: selectedMed.id });
      if (updErr) throw updErr;

      const { error: insErr } = await insertWithUserId('stock_movements', {
        medication_id:   selectedMed.id,
        medication_name: selectedMed.name,
        dosage:          selectedMed.dosage ?? null,
        movement_type:   reason,
        quantity_before: before,
        quantity_change: -qty,
        quantity_after:  after,
        reference:       null,
        supplier:        null,
        unit_cost:       null,
        notes:           notes || null,
        seller_id:       activeSeller?.id ?? null,
        seller_name:     activeSeller?.name ?? null,
      });
      if (insErr) throw insErr;

      const updated = medications.map(m => m.id === selectedMed.id ? { ...m, quantity: after } : m);
      onMedicationsUpdated(updated);
      offlineStorage.cacheMedications(updated);

      setSuccess(`${qty} unité(s) de ${selectedMed.name} retirée(s) (${EXIT_REASONS.find(r => r.value === reason)?.label})`);
      setSelectedMed(null); setSearch(''); setQty(1); setNotes('');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la sortie.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      {success && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: C.amberBg, border: `1px solid rgba(183,95,6,0.25)`, borderRadius: 10, fontSize: 13, fontWeight: 600, color: C.amber }}>
          <Archive size={15} /> {success}
        </div>
      )}

      <div style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '20px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 16 }}>Sortie manuelle de stock</div>

        {/* Produit */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Produit</span>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.inkMute }} />
            <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Nom ou code produit…"
              style={{ width: '100%', padding: '9px 10px 9px 32px', borderRadius: 9, border: `1px solid ${C.hairline}`, fontSize: 13, color: C.ink, background: C.bg, outline: 'none', boxSizing: 'border-box' }} />
            {suggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', zIndex: 50, marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
                {suggestions.map(m => (
                  <div key={m.id}
                    onMouseDown={() => { setSelectedMed(m); setSearch(`${m.name} ${m.dosage ?? ''}`.trim()); setSuggestions([]); }}
                    style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 13, color: C.ink, borderBottom: `1px solid ${C.hairline}` }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontWeight: 600 }}>{m.name}</span>
                    <span style={{ color: C.inkMute, marginLeft: 6 }}>{m.dosage} — stock : {m.quantity}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {selectedMed && (
            <div style={{ fontSize: 12, color: C.brand, marginTop: 2 }}>
              Stock actuel : <strong>{selectedMed.quantity}</strong> unité(s)
            </div>
          )}
        </label>

        {/* Motif */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Motif</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {EXIT_REASONS.map(r => (
              <button key={r.value} onClick={() => setReason(r.value)}
                style={{ flex: 1, padding: '9px 8px', borderRadius: 9, border: `1px solid ${reason === r.value ? C.red : C.hairline}`, background: reason === r.value ? C.redBg : C.bg, fontSize: 12.5, fontWeight: 600, color: reason === r.value ? C.red : C.inkMute, cursor: 'pointer' }}>
                {r.label}
              </button>
            ))}
          </div>
        </label>

        {/* Quantité */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quantité</span>
          <input type="number" min={1} max={selectedMed?.quantity} value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ padding: '9px 10px', borderRadius: 9, border: `1px solid ${C.hairline}`, fontSize: 13, color: C.ink, background: C.bg, outline: 'none', width: 100 }} />
        </label>

        {/* Notes */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Observations (optionnel)</span>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="N° de lot, détails…"
            style={{ padding: '9px 10px', borderRadius: 9, border: `1px solid ${C.hairline}`, fontSize: 13, color: C.ink, background: C.bg, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
        </label>

        <button onClick={submit} disabled={!selectedMed || qty <= 0 || loading}
          style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: selectedMed && !loading ? C.red : '#e5e7eb', color: selectedMed && !loading ? '#fff' : C.inkFaint, fontSize: 14, fontWeight: 700, cursor: selectedMed && !loading ? 'pointer' : 'default', letterSpacing: '-0.01em' }}>
          {loading ? 'Enregistrement…' : `Enregistrer la sortie${selectedMed ? ` — ${qty} × ${selectedMed.name}` : ''}`}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORIQUE
// ─────────────────────────────────────────────────────────────────────────────
const HIST_TYPES: { value: MovementType | 'all'; label: string }[] = [
  { value: 'all',               label: 'Tous' },
  { value: 'reception_bl',      label: 'Réceptions' },
  { value: 'vente',             label: 'Ventes' },
  { value: 'inventaire',        label: 'Inventaires' },
  { value: 'ajustement_entree', label: 'Ajust. entrée' },
  { value: 'ajustement_sortie', label: 'Ajust. sortie' },
  { value: 'perte',             label: 'Pertes' },
  { value: 'peremption',        label: 'Péremptions' },
  { value: 'casse',             label: 'Casse' },
];

function HistoriqueMovements() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<MovementType | 'all'>('all');
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(0);
  const PAGE = 50;

  useEffect(() => { loadMovements(); }, []);

  async function loadMovements() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('id,medication_name,dosage,movement_type,quantity_change,quantity_before,quantity_after,reference,supplier,notes,seller_name,created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      setMovements((data as StockMovement[]) ?? []);
    } catch (err: any) {
      console.error('Historique mouvements:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return movements.filter(m =>
      (filter === 'all' || m.movement_type === filter) &&
      (!q || m.medication_name.toLowerCase().includes(q) || m.reference?.toLowerCase().includes(q) || m.supplier?.toLowerCase().includes(q))
    );
  }, [movements, filter, search]);

  const paginated = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const pages = Math.ceil(filtered.length / PAGE);

  function exportCsv() {
    const header = ['Date','Produit','Type','Avant','Mouvement','Après','Référence','Fournisseur','Vendeur'];
    const rows = filtered.map(m => [
      fmtDate(m.created_at), m.medication_name, movLabel(m.movement_type).label,
      m.quantity_before, m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change,
      m.quantity_after, m.reference ?? '', m.supplier ?? '', m.seller_name ?? '',
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `mouvements-stock-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Outils */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.inkMute }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Produit, référence, fournisseur…"
            style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8, border: `1px solid ${C.hairline}`, fontSize: 13, color: C.ink, background: C.surface, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <button onClick={exportCsv} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.hairline}`, background: C.surface, fontSize: 12.5, fontWeight: 600, color: C.inkMute, cursor: 'pointer' }}>
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Filtres type */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {HIST_TYPES.map(t => (
          <button key={t.value} onClick={() => { setFilter(t.value as MovementType | 'all'); setPage(0); }}
            style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${filter === t.value ? C.ink : C.hairline}`, background: filter === t.value ? C.ink : C.surface, fontSize: 12, fontWeight: 600, color: filter === t.value ? '#fff' : C.inkMute, cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 120px 80px 80px 80px 120px', padding: '10px 16px', background: C.bg, borderBottom: `1px solid ${C.hairline}`, fontSize: 11, fontWeight: 700, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span>Date</span><span>Produit</span><span>Type</span>
          <span style={{ textAlign: 'center' }}>Avant</span>
          <span style={{ textAlign: 'center' }}>Mvt.</span>
          <span style={{ textAlign: 'center' }}>Après</span>
          <span>Référence</span>
        </div>

        {loading && <div style={{ padding: '32px 16px', textAlign: 'center', color: C.inkMute, fontSize: 13 }}>Chargement…</div>}
        {!loading && paginated.length === 0 && <div style={{ padding: '32px 16px', textAlign: 'center', color: C.inkMute, fontSize: 13 }}>Aucun mouvement enregistré</div>}

        {paginated.map((m, i) => {
          const meta = movLabel(m.movement_type);
          const sign = m.quantity_change > 0 ? '+' : '';
          return (
            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 120px 80px 80px 80px 120px', padding: '10px 16px', alignItems: 'center', borderBottom: i < paginated.length - 1 ? `1px solid ${C.hairline}` : 'none' }}>
              <span style={{ fontSize: 12, color: C.inkMute }}>{fmtDate(m.created_at)}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{m.medication_name}</div>
                {m.dosage && <div style={{ fontSize: 11.5, color: C.inkMute }}>{m.dosage}</div>}
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '3px 9px', borderRadius: 99, background: meta.bg, color: meta.color, fontSize: 11.5, fontWeight: 700 }}>{meta.label}</span>
              <span style={{ textAlign: 'center', fontSize: 13, color: C.inkMute }}>{m.quantity_before}</span>
              <span style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: m.quantity_change > 0 ? C.green : C.red }}>
                {sign}{m.quantity_change}
              </span>
              <span style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: C.ink }}>{m.quantity_after}</span>
              <span style={{ fontSize: 12, color: C.inkMute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.reference ?? m.supplier ?? m.seller_name ?? '—'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.hairline}`, background: C.surface, fontSize: 13, color: page === 0 ? C.inkFaint : C.ink, cursor: page === 0 ? 'default' : 'pointer', fontWeight: 600 }}>
            ←
          </button>
          <span style={{ fontSize: 13, color: C.inkMute }}>Page {page + 1} / {pages} — {filtered.length} mouvements</span>
          <button onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.hairline}`, background: C.surface, fontSize: 13, color: page >= pages - 1 ? C.inkFaint : C.ink, cursor: page >= pages - 1 ? 'default' : 'pointer', fontWeight: 600 }}>
            →
          </button>
        </div>
      )}
    </div>
  );
}
