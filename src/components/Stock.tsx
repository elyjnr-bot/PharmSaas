import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, SlidersHorizontal, X, CheckCircle, PackageOpen, Package, ChevronRight, ShoppingCart, Printer, Plus, Columns3, Eye, EyeOff, RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import InventoryRowActions from './InventoryRowActions';
import CategoryPicker from './CategoryPicker';
import { detectCategory } from '../lib/dciCategories';
import { useInventoryColumns, type ColumnDef } from '../lib/useInventoryColumns';
import { Medication, supabase } from '../lib/supabase';
import { useMedications } from '../lib/useMedications';
import { useAuth } from '../lib/auth';
import { getSellerPermissions } from '../lib/permissions';
import { useCart, InventoryUnit } from '../lib/cartContext';
import AddMedicationModal, { AddMedicationResult } from './AddMedicationModal';
import PrintUnitsModal from './PrintUnitsModal';
import ScanEntrySheet from './ScanEntrySheet';
import PharmacyIndicator from './PharmacyIndicator';
import { isExpired, expiresInThreeMonths } from '../lib/dateUtils';
import { parseGS1Code, type ParsedDataMatrix } from '../lib/dataMatrixParser';
import { barcodeCache } from '../lib/barcodeCache';
import { useResponsive } from '../lib/useResponsive';
import { getMinimumStockDefault, computeMargin, getMarginMethod } from '../lib/settings';

const PAGE_SIZE = 50;

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

// ── Rayon colours (deterministic hash) ───────────────────────────────────────
const PALETTE = [
  '#0651bc', '#10785a', '#6e44b0', '#b75f06', '#0891b2',
  '#dc2626', '#9333ea', '#0f766e', '#d97706', '#7c3aed', '#b91c1c', '#0369a1',
];
function rayonColor(rayon: string): string {
  let h = 0;
  for (const ch of rayon) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

// ── Stock status (Chalk) ──────────────────────────────────────────────────────
type ChalkColor = 'green' | 'amber' | 'red' | 'gray';
// ── Détection auto de catégorie via base DCI étendue + cache d'apprentissage ─
// Voir src/lib/dciCategories.ts
function matchKeywordCategory(med: Medication): string | null {
  return detectCategory(med.name);
}

function chalkStockStatus(med: Medication): { label: string; color: ChalkColor } {
  if (isExpired(med.expiry_date))            return { label: 'Périmé',     color: 'red'   };
  if (med.quantity === 0)                    return { label: 'Rupture',    color: 'red'   };
  const min = med.minimum_stock ?? 0;
  if (min > 0 && med.quantity <= min * 0.2)  return { label: 'Critique',   color: 'red'   };
  if (min > 0 && med.quantity <= min)        return { label: 'Faible',     color: 'amber' };
  if (expiresInThreeMonths(med.expiry_date)) return { label: 'Exp. proche', color: 'amber' };
  return { label: 'OK', color: 'green' };
}

// ── Legacy status (filter logic) ─────────────────────────────────────────────
type StockStatus = 'out' | 'low' | 'expiring' | 'expired' | 'ok';
function getMedStatus(med: Medication): StockStatus {
  const defaultMin = getMinimumStockDefault();
  // Si minimum_stock non configuré (0 ou undefined), utiliser le seuil par défaut des réglages
  const minQty = (med.minimum_stock && med.minimum_stock > 0)
    ? med.minimum_stock
    : defaultMin;
  if (isExpired(med.expiry_date))      return 'expired';
  if (med.quantity === 0)              return 'out';
  if (med.quantity < minQty)           return 'low';
  if (expiresInThreeMonths(med.expiry_date)) return 'expiring';
  return 'ok';
}
const STATUS_LABELS: Record<StockStatus, string> = {
  ok: 'Normal', low: 'Stock faible', out: 'Rupture', expiring: 'Périme bientôt', expired: 'Périmé',
};
const ALL_STATUTS: StockStatus[] = ['ok', 'low', 'out', 'expiring', 'expired'];

// ── Status Badge SaaS 2026 — dot + label avec ring coloré ────────────────────
function StatusBadge({ color, label }: { color: ChalkColor; label: string }) {
  const variants: Record<ChalkColor, {
    bg: string; border: string; dot: string; text: string; glow: string
  }> = {
    green: {
      bg: 'rgba(16,120,90,0.07)',
      border: 'rgba(16,120,90,0.2)',
      dot: '#10785a',
      text: '#0d5c44',
      glow: 'rgba(16,120,90,0.15)',
    },
    amber: {
      bg: 'rgba(217,119,6,0.07)',
      border: 'rgba(217,119,6,0.22)',
      dot: '#d97706',
      text: '#92400e',
      glow: 'rgba(217,119,6,0.15)',
    },
    red: {
      bg: 'rgba(220,38,38,0.07)',
      border: 'rgba(220,38,38,0.2)',
      dot: '#dc2626',
      text: '#991b1b',
      glow: 'rgba(220,38,38,0.15)',
    },
    gray: {
      bg: 'rgba(15,15,20,0.05)',
      border: 'rgba(15,15,20,0.1)',
      dot: '#9aa0a8',
      text: '#6b7280',
      glow: 'transparent',
    },
  };
  const v = variants[color];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: v.bg, border: `1px solid ${v.border}`,
      borderRadius: 6, padding: '3px 8px',
      fontSize: 11.5, fontWeight: 600, color: v.text,
      letterSpacing: '0.01em', whiteSpace: 'nowrap',
      fontFamily: 'inherit',
    }}>
      {/* Dot animé pour les états critiques */}
      <span style={{ position: 'relative', width: 6, height: 6, flexShrink: 0 }}>
        {(color === 'red' || color === 'amber') && (
          <span style={{
            position: 'absolute', inset: -2, borderRadius: 99,
            background: v.glow, animation: 'pulse-ring 2s ease-in-out infinite',
          }} />
        )}
        <span style={{
          position: 'absolute', inset: 0, borderRadius: 99,
          background: v.dot,
        }} />
      </span>
      {label}
    </span>
  );
}

// ── Prix formaté ──────────────────────────────────────────────────────────────
function PriceCell({ value, muted = false }: { value?: number | null; muted?: boolean }) {
  if (!value) return <span style={{ color: C.inkFaint, fontSize: 12 }}>—</span>;
  const parts = value.toLocaleString('fr-FR').split(',');
  return (
    <span style={{ fontFamily: C.fm, letterSpacing: '-0.02em' }}>
      <span style={{ fontSize: 13, fontWeight: muted ? 400 : 700, color: muted ? C.inkMute : C.ink }}>
        {parts[0]}
      </span>
      {parts[1] && <span style={{ fontSize: 11, color: C.inkFaint }}>,{parts[1]}</span>}
      <span style={{ fontSize: 10.5, color: C.inkFaint, marginLeft: 2 }}>F</span>
    </span>
  );
}

// ── Pill legacy (conservé pour compatibilité) ─────────────────────────────────
function Pill({ color, children }: { color: ChalkColor; children: React.ReactNode }) {
  return <StatusBadge color={color} label={String(children)} />;
}

// ── Interfaces ────────────────────────────────────────────────────────────────
interface Filters {
  forme: string;
  rayon: string;
  fournisseur: string;
  statuts: StockStatus[];
}
const EMPTY_FILTERS: Filters = { forme: '', rayon: '', fournisseur: '', statuts: [] };

function isUnitModeEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem('workflow_mode') === 'unit';
}

// ── Seuil minimum par médicament (localStorage) ───────────────────────────────
const MIN_STOCK_LS_PREFIX = 'jp_min_stock_';

function getLocalMinStock(medId: string): number | null {
  const val = parseInt(localStorage.getItem(MIN_STOCK_LS_PREFIX + medId) || '0', 10);
  return val > 0 ? val : null;
}

function setLocalMinStock(medId: string, value: number): void {
  if (value > 0) {
    localStorage.setItem(MIN_STOCK_LS_PREFIX + medId, value.toString());
  } else {
    localStorage.removeItem(MIN_STOCK_LS_PREFIX + medId);
  }
}

/**
 * Affichage + édition inline du seuil minimum pour un médicament.
 * Clic sur la valeur → input numérique → Entrée ou blur pour sauvegarder.
 */
function MinStockEditor({
  med,
  onSaved,
}: {
  med: Medication;
  onSaved?: (newMin: number) => void;
}) {
  // Priorité : localStorage > minimum_stock DB
  const localVal = getLocalMinStock(med.id);
  const dbVal    = med.minimum_stock ?? 0;
  const effective = localVal !== null ? localVal : dbVal;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState<string>(String(effective > 0 ? effective : ''));
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(String(effective > 0 ? effective : ''));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commit() {
    const num = parseInt(draft, 10);
    const safeNum = isNaN(num) || num < 0 ? 0 : num;
    setLocalMinStock(med.id, safeNum);
    setEditing(false);
    onSaved?.(safeNum);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  commit();
    if (e.key === 'Escape') setEditing(false);
    e.stopPropagation();
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={0}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        onClick={e => e.stopPropagation()}
        style={{
          width: 48, height: 22, padding: '0 4px',
          fontFamily: C.fm, fontSize: 11, fontWeight: 600,
          border: `1.5px solid ${C.brand}`, borderRadius: 5,
          background: '#fff', color: C.brand,
          outline: 'none', textAlign: 'center',
        }}
      />
    );
  }

  return (
    <span
      onClick={startEdit}
      title="Cliquer pour modifier le seuil minimum"
      style={{
        fontFamily: C.fm, fontSize: 11, fontWeight: 600,
        color: effective > 0 ? C.inkMute : C.inkFaint,
        cursor: 'pointer', padding: '2px 5px',
        borderRadius: 5,
        border: `1px dashed ${effective > 0 ? C.border : 'transparent'}`,
        transition: 'border-color 0.1s, color 0.1s',
        userSelect: 'none',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = C.brand;
        (e.currentTarget as HTMLElement).style.color = C.brand;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = effective > 0 ? C.border : 'transparent';
        (e.currentTarget as HTMLElement).style.color = effective > 0 ? C.inkMute : C.inkFaint;
      }}
    >
      {effective > 0 ? effective : '—'}
    </span>
  );
}

// ── Formatage date péremption (module-level pour renderCell) ─────────────────
function fmtExpiry(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ── renderCell : rendu SaaS 2026 avec hiérarchie visuelle ─────────────────────
function renderCell(
  col: ColumnDef,
  med: any,
  ctx: { isExpiredMed: boolean; isExpiringSoon: boolean; st: { label: string; color: string }; C: typeof import('./Stock').default extends never ? never : any; unitMode: boolean }
): React.ReactNode {
  const { isExpiredMed, isExpiringSoon, st } = ctx;

  switch (col.key) {

    // ── Désignation : nom bold + dosage secondaire + indicateur besoin config ──
    case 'designation':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 13.5, fontWeight: 700, color: C.ink,
              letterSpacing: '-0.02em', lineHeight: 1.25,
            }}>
              {med.name}
            </span>
            {med.needs_barcode_config && (
              <span style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                background: 'rgba(245,158,11,0.1)', color: '#b45309',
                border: '1px solid rgba(245,158,11,0.25)', borderRadius: 4,
                padding: '1px 5px', flexShrink: 0,
              }}>
                Config. douchette
              </span>
            )}
          </div>
          {med.dosage && (
            <span style={{ fontSize: 11.5, color: C.inkFaint, fontWeight: 400, letterSpacing: '0.005em' }}>
              {med.dosage}
            </span>
          )}
        </div>
      );

    // ── Réf : monospace discret ────────────────────────────────────────────────
    case 'ref':
      return med.code_produit
        ? (
          <span style={{
            display: 'inline-block', fontFamily: C.fm, fontSize: 11, fontWeight: 500,
            color: C.inkMute, background: 'rgba(15,15,20,0.04)',
            border: '1px solid rgba(15,15,20,0.07)', borderRadius: 4,
            padding: '2px 6px', letterSpacing: '0.03em',
          }}>
            {med.code_produit}
          </span>
        )
        : <span style={{ color: C.inkFaint, fontSize: 12 }}>—</span>;

    // ── Catégorie/rayon : dot coloré + label ──────────────────────────────────
    case 'category':
      return med.name_rayon ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 7, height: 7, borderRadius: 2,
            background: rayonColor(med.name_rayon), flexShrink: 0,
          }} />
          <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 500 }}>
            {med.name_rayon}
          </span>
        </div>
      ) : <span style={{ color: C.inkFaint, fontSize: 12 }}>—</span>;

    // ── Stock : chiffre proéminent + barre de progression contextuelle ─────────
    case 'stock': {
      const min = med.minimum_stock || 0;
      const qty = med.quantity ?? 0;
      const pct = min > 0 ? Math.min(100, Math.round((qty / min) * 100)) : 100;
      const stockColor = qty === 0 ? C.red
        : (min > 0 && qty <= min * 0.2) ? C.red
        : (min > 0 && qty <= min)       ? C.amber
        : C.brand;
      const barColor   = qty === 0 ? C.red
        : (min > 0 && qty <= min * 0.2) ? C.red
        : (min > 0 && qty <= min)       ? C.amber
        : C.brand;

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 50 }}>
          <span style={{
            fontFamily: C.fm, fontSize: 15, fontWeight: 800,
            color: stockColor, letterSpacing: '-0.03em',
            lineHeight: 1,
          }}>
            {qty}
          </span>
          {min > 0 && (
            <div style={{ height: 3, borderRadius: 99, background: 'rgba(15,15,20,0.07)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99,
                width: `${Math.min(100, pct)}%`,
                background: barColor,
                transition: 'width 0.4s ease',
              }} />
            </div>
          )}
        </div>
      );
    }

    // ── Seuil min : éditeur inline ─────────────────────────────────────────────
    case 'threshold':
      return <MinStockEditor med={med} />;

    // ── Prix vente : typographie hiérarchique ─────────────────────────────────
    case 'sell_price':
      return <PriceCell value={med.price} />;

    // ── Prix achat : discret ──────────────────────────────────────────────────
    case 'buy_price':
      return <PriceCell value={med.wholesale_price} muted />;

    // ── Péremption : badge d'urgence si proche/passée ─────────────────────────
    case 'expiry': {
      const txt = fmtExpiry(med.expiry_date);
      if (isExpiredMed) return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
          borderRadius: 5, padding: '2px 7px',
          fontSize: 11.5, fontWeight: 700, color: C.red, fontFamily: C.fm,
        }}>
          ⚠ {txt}
        </span>
      );
      if (isExpiringSoon) return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)',
          borderRadius: 5, padding: '2px 7px',
          fontSize: 11.5, fontWeight: 600, color: C.amber, fontFamily: C.fm,
        }}>
          {txt}
        </span>
      );
      return <span style={{ fontSize: 12, color: C.inkMute, fontFamily: C.fm }}>{txt}</span>;
    }

    // ── N° lot : code discret ─────────────────────────────────────────────────
    case 'batch':
      return med.batch_number
        ? <span style={{ fontFamily: C.fm, fontSize: 11, color: C.inkMute }}>{med.batch_number}</span>
        : <span style={{ color: C.inkFaint, fontSize: 12 }}>—</span>;

    // ── Fournisseur : texte tronqué avec tooltip ──────────────────────────────
    case 'supplier':
      return med.supplier
        ? (
          <span style={{
            display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontSize: 12.5, color: C.inkSoft, fontWeight: 500, maxWidth: 140,
          }} title={med.supplier}>
            {med.supplier}
          </span>
        )
        : <span style={{ color: C.inkFaint, fontSize: 12 }}>—</span>;

    // ── Statut : badge avec dot animé ─────────────────────────────────────────
    case 'status':
      return <StatusBadge color={st.color as ChalkColor} label={st.label} />;

    // ── Colonne générique ─────────────────────────────────────────────────────
    default:
      if (col.dbField) {
        const val = med[col.dbField];
        return val !== null && val !== undefined && val !== ''
          ? <span style={{ fontSize: 12, color: C.inkMute }}>{String(val)}</span>
          : <span style={{ color: C.inkFaint, fontSize: 12 }}>—</span>;
      }
      return <span style={{ color: C.inkFaint, fontSize: 12 }}>—</span>;
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Stock({ initialFilter, onNavigateToSales }: { initialFilter?: string; onNavigateToSales?: (medId: string) => void } = {}) {
  const { isDesktop } = useResponsive();
  const { medications: rawMedications, isLoading, reload: loadMedications } = useMedications();
  const { user, isManager } = useAuth();

  // ── Patch local optimiste — met à jour la ligne sans reload complet ──────────
  const [localPatches, setLocalPatches] = useState<Record<string, Partial<Medication>>>({});
  const medications = useMemo(() => rawMedications.map(m => localPatches[m.id] ? { ...m, ...localPatches[m.id] } : m), [rawMedications, localPatches]);
  const applyLocalPatch = useCallback((updated: Medication) => {
    setLocalPatches(p => ({ ...p, [updated.id]: updated }));
  }, []);

  // ── Ligne survolée (pour afficher les actions) ───────────────────────────────
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

  // ── Recharger après import CSV/Excel ────────────────────────────────────────
  useEffect(() => {
    const handleCatalogUpdated = () => {
      // Vider les patches locaux optimistes (données fraîches arrivent de Supabase)
      setLocalPatches({});
      loadMedications();
    };
    window.addEventListener('junglepharm:catalog-updated', handleCatalogUpdated);
    return () => window.removeEventListener('junglepharm:catalog-updated', handleCatalogUpdated);
  }, [loadMedications]);

  // Méthode de calcul marge (re-render quand l'utilisateur change le paramètre)
  const [marginMethod, setMarginMethodLocal] = useState(getMarginMethod());
  useEffect(() => {
    const refresh = () => setMarginMethodLocal(getMarginMethod());
    window.addEventListener('junglepharm:margin_method_updated', refresh);
    return () => window.removeEventListener('junglepharm:margin_method_updated', refresh);
  }, []);
  // Seuils colorés selon méthode (sur vente : 20-40% ; sur coût : 30-60%)
  const marginThresholds = marginMethod === 'on_sale'
    ? { good: 40, ok: 20 }
    : { good: 60, ok: 30 };

  // ── Sélection multi-lignes (checkbox) ────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  // ── Tour guidé (B8) — étape active, pilote l'affichage de cibles masquées ─────
  // Le guide lui-même est orchestré par <TourHost> (niveau App) ; Stock écoute
  // juste l'étape courante pour révéler les actions de ligne (visibles au survol)
  // et faire apparaître la barre d'actions groupées (en cochant la 1ʳᵉ ligne).
  const [tourStep, setTourStep] = useState<string | null>(null);
  const firstMedIdRef = useRef<string | null>(null);
  useEffect(() => {
    const onStep = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (detail.tourId !== 'inventory_v1') return;
      const sel: string | null = detail.selector ?? null;
      const key = sel ? sel.replace('[data-tour="', '').replace('"]', '') : null;
      setTourStep(key);
      if (key === 'bulk-bar') {
        const id = firstMedIdRef.current;
        if (id) setSelectedIds(new Set([id]));
      } else if (key === null) {
        setSelectedIds(new Set());
      } else {
        // On nettoie la sélection auto en quittant l'étape « actions groupées ».
        setSelectedIds(prev => (prev.size === 1 ? new Set() : prev));
      }
    };
    window.addEventListener('junglepharm:tour-step', onStep);
    return () => window.removeEventListener('junglepharm:tour-step', onStep);
  }, []);

  // ── Tri par colonne ────────────────────────────────────────────────────────
  type SortKey = 'name' | 'sku' | 'stock' | 'min' | 'buy' | 'sell' | 'margin' | 'expiry' | 'supplier' | null;
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      // Re-clic : asc → desc → null (reset)
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(null); setSortDir('asc'); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey, sortDir]);

  // ── Bulk actions (sur sélection multi-lignes) ─────────────────────────────
  type BulkAction = 'export' | 'priceChange' | 'supplier' | 'minStock' | 'delete' | null;
  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const [bulkValue, setBulkValue]   = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const selectedMeds = useMemo(
    () => medications.filter(m => selectedIds.has(m.id)),
    [medications, selectedIds]
  );

  const exportSelection = useCallback(() => {
    const rows = selectedMeds.map(m => [
      m.code_produit || '', m.name, m.dosage || '', m.name_rayon || '',
      m.quantity ?? 0, m.minimum_stock ?? 0,
      m.wholesale_price ?? '', m.price ?? '',
      m.expiry_date || '', m.supplier || '',
    ]);
    const csv = [
      ['SKU','Nom','Dosage','Catégorie','Stock','Seuil','Px Achat','Px Vente','Péremption','Fournisseur'],
      ...rows,
    ].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `inventaire-selection-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [selectedMeds]);

  const applyBulkPriceChange = useCallback(async () => {
    // bulkValue = "+10%" ou "-5%" ou "*2" ou "+500" (montant absolu)
    const txt = bulkValue.trim();
    if (!txt) return;
    setBulkLoading(true);
    try {
      const isPct = txt.includes('%');
      const sign = txt.startsWith('-') ? -1 : 1;
      const num = parseFloat(txt.replace(/[^0-9.]/g, ''));
      if (isNaN(num) || num === 0) { alert('Entrez une valeur valide (ex: +10%, -5%, +500)'); return; }

      for (const m of selectedMeds) {
        const current = m.price ?? 0;
        const newPrice = isPct
          ? Math.round(current * (1 + (sign * num) / 100))
          : Math.round(current + sign * num);
        if (newPrice > 0) {
          await supabase.from('medications')
            .update({ price: newPrice, updated_at: new Date().toISOString() })
            .eq('id', m.id);
          applyLocalPatch({ ...m, price: newPrice });
        }
      }
      setBulkAction(null); setBulkValue(''); setSelectedIds(new Set());
    } catch (e: any) {
      alert('Erreur : ' + (e.message || e));
    } finally {
      setBulkLoading(false);
    }
  }, [bulkValue, selectedMeds, applyLocalPatch]);

  const applyBulkSupplier = useCallback(async () => {
    const newSup = bulkValue.trim();
    if (!newSup) return;
    setBulkLoading(true);
    try {
      for (const m of selectedMeds) {
        await supabase.from('medications')
          .update({ supplier: newSup, updated_at: new Date().toISOString() })
          .eq('id', m.id);
        applyLocalPatch({ ...m, supplier: newSup });
      }
      setBulkAction(null); setBulkValue(''); setSelectedIds(new Set());
    } catch (e: any) {
      alert('Erreur : ' + (e.message || e));
    } finally { setBulkLoading(false); }
  }, [bulkValue, selectedMeds, applyLocalPatch]);

  const applyBulkMinStock = useCallback(async () => {
    const val = parseInt(bulkValue) || 0;
    if (val <= 0) return;
    setBulkLoading(true);
    try {
      for (const m of selectedMeds) {
        await supabase.from('medications')
          .update({ minimum_stock: val, updated_at: new Date().toISOString() })
          .eq('id', m.id);
        applyLocalPatch({ ...m, minimum_stock: val });
      }
      setBulkAction(null); setBulkValue(''); setSelectedIds(new Set());
    } catch (e: any) {
      alert('Erreur : ' + (e.message || e));
    } finally { setBulkLoading(false); }
  }, [bulkValue, selectedMeds, applyLocalPatch]);

  const applyBulkDelete = useCallback(async () => {
    if (!confirm(`Supprimer définitivement ${selectedMeds.length} produit(s) ? Cette action est irréversible.`)) return;
    setBulkLoading(true);
    try {
      const ids = Array.from(selectedIds);
      await supabase.from('barcodes').delete().in('medication_id', ids);
      await supabase.from('inventory_units').delete().in('medication_id', ids);
      await supabase.from('medications').delete().in('id', ids);
      setSelectedIds(new Set());
      setBulkAction(null);
      loadMedications();
    } catch (e: any) {
      alert('Erreur : ' + (e.message || e));
    } finally { setBulkLoading(false); }
  }, [selectedIds, selectedMeds, loadMedications]);
  // ── Suppression produit ───────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<Medication | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteMedication = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await supabase.from('barcodes').delete().eq('medication_id', deleteTarget.id);
      await supabase.from('inventory_units').delete().eq('medication_id', deleteTarget.id);
      const { error } = await supabase.from('medications').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      setDeleteTarget(null);
      loadMedications();
    } catch (e: any) {
      alert(`Erreur suppression : ${e.message}`);
    } finally {
      setIsDeleting(false);
    }
  };
  const { addUnitToCart, cart } = useCart();
  const [visibleCount, setVisibleCount]   = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery]     = useState('');
  const [activeCat, setActiveCat]         = useState(initialFilter || 'Tous');
  const [filters, setFilters]             = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters]     = useState(false);
  const [isModalOpen, setIsModalOpen]     = useState(false);
  // ── Scan state (remplace isHandlingScanRef / quickScanFallback / quickNotification) ──
  type ScanPhase =
    | { phase: 'loading' }
    | { phase: 'found';   code: string; medication: Medication; gs1: ParsedDataMatrix | null }
    | { phase: 'unknown'; code: string; gs1: ParsedDataMatrix | null };
  const [scanState, setScanState]         = useState<ScanPhase | null>(null);
  const [scanNotif, setScanNotif]         = useState<{ type: 'ok' | 'error'; message: string } | null>(null);
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null);
  const [medicationUnits, setMedicationUnits]       = useState<InventoryUnit[]>([]);
  const [loadingUnits, setLoadingUnits]             = useState(false);
  const [pendingPrint, setPendingPrint] = useState<{
    medicationName: string;
    price: number;
    units: Array<{
      id: string; unit_code: string; medication_name: string;
      batch_number: string; expiry_date: string | null;
      entry_date: string; price: number; supplier: string;
    }>;
  } | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const sentinelRef      = useRef<HTMLDivElement>(null);
  const filterPanelRef   = useRef<HTMLDivElement>(null);
  const scanInProgressRef = useRef(false);

  const unitMode = isUnitModeEnabled();

  // ── Colonnes dynamiques ───────────────────────────────────────────────────────
  const { visibleColumns, columns: allColumns, toggleColumn, resetAll: resetColumns, detectFromData } = useInventoryColumns();
  const [showColPanel, setShowColPanel] = useState(false);
  const colPanelRef = useRef<HTMLDivElement>(null);

  // Détecter les colonnes peuplées à partir des données chargées
  useEffect(() => { if (medications.length > 0) detectFromData(medications as any); }, [medications, detectFromData]);

  // Fermer le panel colonnes au clic extérieur
  useEffect(() => {
    const h = (e: MouseEvent) => { if (colPanelRef.current && !colPanelRef.current.contains(e.target as Node)) setShowColPanel(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Cart unit IDs set ────────────────────────────────────────────────────────
  const cartUnitIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of cart)
      for (const unit of item.units || []) ids.add(unit.id);
    return ids;
  }, [cart]);

  // ── Unit cart handler ────────────────────────────────────────────────────────
  const handleAddUnitToCart = useCallback((unit: InventoryUnit) => {
    if (selectedMedication) {
      addUnitToCart(selectedMedication, unit);
      setScanNotif({ type: 'ok', message: `Unité ${unit.unit_code} ajoutée au panier` });
      setTimeout(() => setScanNotif(null), 3500);
    }
  }, [selectedMedication, addUnitToCart]);

  // ── Barcode scan ─────────────────────────────────────────────────────────────
  const showScanNotif = (type: 'ok' | 'error', message: string) => {
    setScanNotif({ type, message });
    setTimeout(() => setScanNotif(null), 3500);
  };

  const handleQuickScan = async (code: string) => {
    // Ignorer si une sheet de scan est déjà ouverte
    if (scanInProgressRef.current) return;
    scanInProgressRef.current = true;
    setScanState({ phase: 'loading' });

    try {
      const gs1 = parseGS1Code(code);

      // 1. Cache mémoire
      const cachedId = barcodeCache.get(code) ?? (gs1?.gtin ? barcodeCache.get(gs1.gtin) : null);
      if (cachedId) {
        const found = medications.find(m => m.id === cachedId);
        if (found) {
          setScanState({ phase: 'found', code, medication: found, gs1 });
          return;
        }
      }

      // 2. Table barcodes
      const { data: barcodeRow } = await supabase
        .from('barcodes').select('medication_id').eq('barcode', code.trim()).maybeSingle();
      if (barcodeRow?.medication_id) {
        const found = medications.find(m => m.id === barcodeRow.medication_id);
        if (found) {
          barcodeCache.set(code, barcodeRow.medication_id);
          setScanState({ phase: 'found', code, medication: found, gs1 });
          return;
        }
      }

      // 3. GTIN (DataMatrix GS1)
      if (gs1?.gtin) {
        const { data: byGtin } = await supabase
          .from('medications').select('*').eq('gtin', gs1.gtin).maybeSingle();
        if (byGtin) {
          barcodeCache.set(code, byGtin.id);
          barcodeCache.set(gs1.gtin, byGtin.id);
          setScanState({ phase: 'found', code, medication: byGtin as Medication, gs1 });
          return;
        }
      }

      // 4. code_produit exact
      const { data: byCode } = await supabase
        .from('medications').select('*').eq('code_produit', code.trim()).maybeSingle();
      if (byCode) {
        barcodeCache.set(code, byCode.id);
        setScanState({ phase: 'found', code, medication: byCode as Medication, gs1 });
        return;
      }

      // 5. Inconnu
      setScanState({ phase: 'unknown', code, gs1 });
    } catch {
      setScanState(null);
      scanInProgressRef.current = false;
    }
  };

  const handleScanSuccess = useCallback((medication: Medication) => {
    setScanState(null);
    scanInProgressRef.current = false;
    loadMedications();
    showScanNotif('ok', `✓ ${medication.name}${medication.dosage ? ` ${medication.dosage}` : ''} — stock mis à jour`);
  }, [loadMedications]);

  const handleScanUnitsGenerated = useCallback((result: import('./ScanEntrySheet').ScanEntryUnitResult) => {
    setScanState(null);
    scanInProgressRef.current = false;
    loadMedications();
    const today = new Date().toISOString().split('T')[0];
    setPendingPrint({
      medicationName: result.medicationName,
      price: result.price,
      units: result.units.map(u => ({
        id: u.id,
        unit_code: u.unit_code,
        medication_name: result.medicationName,
        batch_number: u.batch_number,
        expiry_date: u.expiry_date,
        entry_date: today,
        price: result.price,
        supplier: '',
      })),
    });
  }, [loadMedications]);

  const handleScanDismiss = useCallback(() => {
    setScanState(null);
    scanInProgressRef.current = false;
  }, []);

  // ── Écoute les scans HID globaux (USB/Bluetooth) ────
  const handleQuickScanRef = useRef(handleQuickScan);
  handleQuickScanRef.current = handleQuickScan;

  useEffect(() => {
    const handler = (e: Event) => {
      const { barcode } = (e as CustomEvent<{ barcode: string }>).detail;
      handleQuickScanRef.current(barcode);
    };
    window.addEventListener('barcode-scanned', handler);
    return () => window.removeEventListener('barcode-scanned', handler);
  }, []);

  // ── Load units (unit mode) ───────────────────────────────────────────────────
  // ⚠️ Supabase plafonne à 1000 lignes par requête par défaut.
  // On pagine par blocs de 1000 jusqu'à tout récupérer.
  const loadUnitsForMedication = useCallback(async (medicationId: string) => {
    setLoadingUnits(true);
    try {
      const PAGE = 1000;
      const all: InventoryUnit[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('inventory_units').select('*')
          .eq('user_id', user?.id).eq('medication_id', medicationId)
          .eq('status', 'available').order('created_at', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) { setMedicationUnits([]); return; }
        all.push(...(data || []));
        if (!data || data.length < PAGE) break; // dernière page
        from += PAGE;
      }
      setMedicationUnits(all);
    } catch { setMedicationUnits([]); }
    finally   { setLoadingUnits(false); }
  }, [user?.id]);

  const handleMedicationClick = useCallback((medication: Medication) => {
    if (unitMode) {
      setSelectedMedication(medication);
      loadUnitsForMedication(medication.id);
    }
  }, [unitMode, loadUnitsForMedication]);

  // ── Filter options ───────────────────────────────────────────────────────────
  const formeOptions = useMemo(() =>
    [...new Set(medications.map(m => m.forme_produit).filter((v): v is string => !!v))].sort(),
    [medications]);
  const rayonOptions = useMemo(() =>
    [...new Set(medications.map(m => m.name_rayon).filter((v): v is string => !!v))].sort(),
    [medications]);
  const fournisseurOptions = useMemo(() =>
    [...new Set(medications.map(m => m.supplier).filter((v): v is string => !!v))].sort(),
    [medications]);

  // ── Category chips ───────────────────────────────────────────────────────────
  const rayons = useMemo(() =>
    [...new Set(medications.map(m => m.name_rayon).filter((v): v is string => !!v))].sort(),
    [medications]);
  const ruptureCount = useMemo(() =>
    medications.filter(m => getMedStatus(m) === 'out' || getMedStatus(m) === 'low').length,
    [medications]);

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filteredMedications = useMemo(() => {
    const rawQ = searchQuery.trim().toLowerCase();
    // ── Recherche fuzzy multi-critères ────────────────────────────────────
    // Normalise (enlève accents/ponctuation) + découpe en tokens
    const norm = (s: string) => (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire accents
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ').trim();

    const qTokens = rawQ ? norm(rawQ).split(' ').filter(Boolean) : [];

    // ── Mots-clés magiques : statut intégré dans la recherche ─────────────
    const STATUS_KEYWORDS: Record<string, StockStatus> = {
      'rupture': 'out', 'ruptures': 'out',
      'faible': 'low', 'bas': 'low', 'low': 'low',
      'expire': 'expiring', 'expirant': 'expiring', 'peremption': 'expiring',
      'perime': 'expired', 'expired': 'expired',
    };
    const statusFromQuery = qTokens.find(t => STATUS_KEYWORDS[t]);
    const realQTokens = qTokens.filter(t => !STATUS_KEYWORDS[t]);

    // Distance Levenshtein simplifiée (tolérance fautes de frappe < 5 chars)
    const lev = (a: string, b: string): number => {
      if (a === b) return 0;
      if (!a.length) return b.length;
      if (!b.length) return a.length;
      const m: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
      for (let i = 0; i <= a.length; i++) m[i][0] = i;
      for (let j = 0; j <= b.length; j++) m[0][j] = j;
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          m[i][j] = a[i-1] === b[j-1]
            ? m[i-1][j-1]
            : 1 + Math.min(m[i-1][j], m[i][j-1], m[i-1][j-1]);
        }
      }
      return m[a.length][b.length];
    };

    const matchToken = (haystack: string, token: string): boolean => {
      if (haystack.includes(token)) return true;
      // Tolérance fautes : 1 erreur pour 5+ chars, 2 pour 8+
      if (token.length < 5) return false;
      const allowedDist = token.length >= 8 ? 2 : 1;
      // Test contre chaque mot du haystack
      for (const w of haystack.split(' ')) {
        if (w.length >= 4 && lev(w, token) <= allowedDist) return true;
      }
      return false;
    };

    const filtered = medications.filter(med => {
      // ── Recherche multi-critères + fuzzy ──────────────────────────────
      if (qTokens.length > 0) {
        const haystack = norm([
          med.name, med.dosage, med.code_produit,
          med.batch_number, med.supplier, med.name_rayon,
          med.forme_produit, med.category,
        ].filter(Boolean).join(' '));

        // Chaque token texte doit matcher
        for (const token of realQTokens) {
          if (!matchToken(haystack, token)) return false;
        }

        // Filtre statut via mot-clé
        if (statusFromQuery) {
          const targetStatus = STATUS_KEYWORDS[statusFromQuery];
          if (getMedStatus(med) !== targetStatus) return false;
        }
      }

      // ── Filtres existants ─────────────────────────────────────────────
      if (activeCat === '__ruptures__') {
        const s = getMedStatus(med);
        if (s !== 'out' && s !== 'low') return false;
      } else if (activeCat === '__recent__') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        if (!med.created_at || new Date(med.created_at) < sevenDaysAgo) return false;
      } else if (activeCat !== 'Tous') {
        // Priorité : name_rayon ou category renseignés
        if (med.name_rayon === activeCat || med.category === activeCat) {
          // ok
        } else {
          // Fallback : détection auto par mots-clés
          const detected = matchKeywordCategory(med);
          if (detected !== activeCat) return false;
        }
      }
      if (filters.forme && med.forme_produit !== filters.forme) return false;
      if (filters.rayon && med.name_rayon !== filters.rayon) return false;
      if (filters.fournisseur && med.supplier !== filters.fournisseur) return false;
      if (filters.statuts.length > 0 && !filters.statuts.includes(getMedStatus(med))) return false;
      return true;
    });

    // ── Tri par colonne ───────────────────────────────────────────────────
    if (sortKey) {
      const factor = sortDir === 'asc' ? 1 : -1;
      const accessors: Record<NonNullable<SortKey>, (m: Medication) => string | number> = {
        name:     m => m.name.toLowerCase(),
        sku:      m => (m.code_produit || '').toLowerCase(),
        stock:    m => m.quantity ?? 0,
        min:      m => m.minimum_stock ?? 0,
        buy:      m => m.wholesale_price ?? 0,
        sell:     m => m.price ?? 0,
        margin:   m => computeMargin(m.price, m.wholesale_price) ?? -999,
        expiry:   m => m.expiry_date || '9999-12-31',
        supplier: m => (m.supplier || '').toLowerCase(),
      };
      const getter = accessors[sortKey];
      filtered.sort((a, b) => {
        const va = getter(a), vb = getter(b);
        if (va < vb) return -1 * factor;
        if (va > vb) return  1 * factor;
        return 0;
      });
    }

    return filtered;
  }, [searchQuery, activeCat, filters, medications, sortKey, sortDir]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchQuery, activeCat, filters]);

  // ── Infinite scroll ──────────────────────────────────────────────────────────
  const loadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filteredMedications.length));
  }, [filteredMedications.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '300px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // ── Outside click for filter panel ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node))
        setShowFilters(false);
    };
    if (showFilters) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFilters]);

  // ── Permission ajout produit (vendeur) ───────────────────────────────────────
  const canAddProducts = isManager || getSellerPermissions().allowManualProductAdd;

  // ── Topbar action listener ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { action } = (e as CustomEvent<{ action: string }>).detail;
      if (action === 'add-lot' && canAddProducts) setIsModalOpen(true);
    };
    window.addEventListener('topbar-action', handler);
    return () => window.removeEventListener('topbar-action', handler);
  }, [canAddProducts]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters(prev => ({ ...prev, [key]: value }));

  const toggleStatut = (s: StockStatus) =>
    setFilters(prev => ({
      ...prev,
      statuts: prev.statuts.includes(s) ? prev.statuts.filter(x => x !== s) : [...prev.statuts, s],
    }));

  const removeChip = (key: keyof Filters, value?: StockStatus) => {
    if (key === 'statuts' && value)
      setFilters(prev => ({ ...prev, statuts: prev.statuts.filter(s => s !== value) }));
    else
      setFilters(prev => ({ ...prev, [key]: '' }));
  };

  const activeFilterCount =
    (filters.forme ? 1 : 0) + (filters.rayon ? 1 : 0) +
    (filters.fournisseur ? 1 : 0) + filters.statuts.length;

  const formatExpiry = (d: string) => {
    try { return new Date(d).toISOString().slice(0, 7); } catch { return d; }
  };

  const visibleMedications = filteredMedications.slice(0, visibleCount);
  const hasMore = visibleCount < filteredMedications.length;
  // Garde la 1ʳᵉ ligne sous la main pour la démo « actions groupées » du guide.
  firstMedIdRef.current = visibleMedications[0]?.id ?? null;

  // toggleSelectAll — doit être après visibleMedications
  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => prev.size === visibleMedications.length
      ? new Set()
      : new Set(visibleMedications.map(m => m.id)));
  }, [visibleMedications]);

  // ── Category chip list ───────────────────────────────────────────────────────
  const chips = ['Tous', ...rayons, '__ruptures__'];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <div style={{
        display: 'flex', flexDirection: 'column',
        height: isDesktop ? '100%' : 'auto',
        minHeight: isDesktop ? 0 : undefined,
        fontFamily: C.f, color: C.ink,
      }}>
        {!isDesktop && <PharmacyIndicator pharmacyName="Brazzaville" />}

        {/* ── Search + filter bar ── */}
        <div style={{
          padding: isDesktop ? '12px 28px' : '12px 16px',
          display: 'flex', alignItems: 'center', gap: 8,
          background: C.panel,
          backdropFilter: 'saturate(180%) blur(28px)',
          WebkitBackdropFilter: 'saturate(180%) blur(28px)',
          borderBottom: `1px solid ${C.hairline}`,
          flexShrink: 0,
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, maxWidth: isDesktop ? 320 : undefined }}>
            <Search
              size={13} color={C.inkMute} strokeWidth={1.5}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
            <input
              type="text"
              placeholder="Nom, EAN, DCI, fournisseur… (ex: 'paracetamol rupture')"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', height: 34, paddingLeft: 30, paddingRight: 10,
                border: `1px solid ${C.border}`, borderRadius: 8,
                fontSize: 12.5, background: C.panelSolid, color: C.ink,
                fontFamily: C.f, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Filter button */}
          <div style={{ position: 'relative' }} ref={filterPanelRef}>
            <button
              onClick={() => setShowFilters(v => !v)}
              style={{
                height: 34, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6,
                border: `1px solid ${activeFilterCount > 0 ? C.brandMid : C.hairline}`,
                borderRadius: 8, background: activeFilterCount > 0 ? C.brandLt : 'transparent',
                color: activeFilterCount > 0 ? C.brand : C.inkMute,
                fontSize: 12.5, fontWeight: 500, cursor: 'pointer', position: 'relative',
              }}
            >
              <SlidersHorizontal size={13} strokeWidth={1.5} />
              Filtres
              {activeFilterCount > 0 && (
                <span style={{
                  position: 'absolute', top: -6, right: -6,
                  width: 16, height: 16, borderRadius: 99,
                  background: C.red, color: '#fff',
                  fontSize: 9, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Advanced filter panel */}
            {showFilters && (
              <div style={{
                position: 'absolute', right: 0, top: 42, width: 280,
                background: 'rgba(255,255,255,0.96)',
                backdropFilter: 'saturate(180%) blur(24px)',
                WebkitBackdropFilter: 'saturate(180%) blur(24px)',
                border: `1px solid ${C.hairline}`,
                borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                zIndex: 100, padding: '14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>Filtres avancés</span>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => setFilters(EMPTY_FILTERS)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, color: C.red, fontWeight: 500 }}
                    >
                      Effacer
                    </button>
                  )}
                </div>

                <FilterSelect label="Forme produit" value={filters.forme} onChange={v => setFilter('forme', v)} options={formeOptions} placeholder="Toutes" />
                <FilterSelect label="Rayon" value={filters.rayon} onChange={v => setFilter('rayon', v)} options={rayonOptions} placeholder="Tous" />
                <FilterSelect label="Fournisseur" value={filters.fournisseur} onChange={v => setFilter('fournisseur', v)} options={fournisseurOptions} placeholder="Tous" />

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: C.inkMute, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
                    Statut du stock
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {ALL_STATUTS.map(s => {
                      const active = filters.statuts.includes(s);
                      return (
                        <button
                          key={s}
                          onClick={() => toggleStatut(s)}
                          style={{
                            padding: '4px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 500,
                            cursor: 'pointer', border: `1px solid ${active ? C.brandMid : C.hairline}`,
                            background: active ? C.brandLt : 'transparent',
                            color: active ? C.brand : C.inkSoft,
                          }}
                        >
                          {STATUS_LABELS[s]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bouton Colonnes — desktop uniquement */}
          {isDesktop && (
            <div style={{ position: 'relative' }} ref={colPanelRef}>
              <button
                onClick={() => setShowColPanel(v => !v)}
                title="Afficher/masquer des colonnes"
                style={{
                  height: 34, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
                  border: `1px solid ${showColPanel ? C.brandMid : C.hairline}`,
                  borderRadius: 8, background: showColPanel ? C.brandLt : 'transparent',
                  color: showColPanel ? C.brand : C.inkMute,
                  fontSize: 12.5, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
                }}
              >
                <Columns3 size={13} strokeWidth={1.5} />
                <span>Colonnes</span>
              </button>
              {showColPanel && (
                <div style={{
                  position: 'absolute', right: 0, top: 42, width: 240, zIndex: 110,
                  background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(24px)',
                  border: `1px solid ${C.hairline}`, borderRadius: 12,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.12)', padding: '12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>Colonnes visibles</span>
                    <button onClick={resetColumns} title="Réinitialiser" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.inkMute, display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
                      <RotateCcw size={11} /> Reset
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {allColumns.filter(c => c.hideable).map(col => (
                      <button key={col.key} onClick={() => toggleColumn(col.key)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px',
                          borderRadius: 8, border: 'none', background: col.visible ? C.brandLt : 'transparent',
                          cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: C.f,
                        }}>
                        <span style={{ color: col.visible ? C.brand : C.inkFaint }}>
                          {col.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: 500, color: col.visible ? C.ink : C.inkMute, flex: 1 }}>{col.label}</span>
                        {col.hasData && <span style={{ width: 5, height: 5, borderRadius: 99, background: C.brand, flexShrink: 0 }} title="Données disponibles" />}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 10.5, color: C.inkFaint, margin: '8px 0 0', lineHeight: 1.4 }}>
                    Les points verts indiquent les colonnes avec des données importées.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Bouton Ajouter — mobile uniquement + permission requise */}
          {!isDesktop && canAddProducts && (
            <button
              onClick={() => setIsModalOpen(true)}
              style={{
                height: 34, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 5,
                background: C.brand, color: '#fff', border: 'none', borderRadius: 8,
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
              }}
            >
              <Plus size={14} strokeWidth={2.5} />
              Ajouter
            </button>
          )}
        </div>

        {/* ── Category filter chips ── */}
        <div style={{
          padding: '8px 28px',
          display: 'flex', gap: 6, flexShrink: 0,
          overflowX: 'auto', background: C.panel,
          borderBottom: `1px solid ${C.hairline}`,
        }}>
          {chips.map(c => {
            const isRuptures = c === '__ruptures__';
            const label = isRuptures
              ? `Ruptures (${ruptureCount})`
              : c === 'Tous'
              ? `Tous (${medications.length})`
              : c;
            const isActive = activeCat === c;
            return (
              <button
                key={c}
                onClick={() => setActiveCat(c)}
                style={{
                  padding: '5px 12px', borderRadius: 99,
                  fontSize: 11.5, fontWeight: 550, cursor: 'pointer',
                  whiteSpace: 'nowrap', flexShrink: 0,
                  border: `1px solid ${isActive ? (isRuptures ? 'rgba(200,30,30,0.35)' : C.brandMid) : C.hairline}`,
                  background: isActive ? (isRuptures ? 'rgba(200,30,30,0.08)' : C.brandLt) : 'transparent',
                  color: isActive ? (isRuptures ? C.red : C.brand) : C.inkSoft,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Active filter chips ── */}
        {activeFilterCount > 0 && (
          <div style={{ padding: '6px 28px', display: 'flex', flexWrap: 'wrap', gap: 5, flexShrink: 0 }}>
            {filters.forme && (
              <FilterBadge label={filters.forme} onRemove={() => removeChip('forme')} />
            )}
            {filters.rayon && (
              <FilterBadge label={filters.rayon} onRemove={() => removeChip('rayon')} />
            )}
            {filters.fournisseur && (
              <FilterBadge label={filters.fournisseur} onRemove={() => removeChip('fournisseur')} />
            )}
            {filters.statuts.map(s => (
              <FilterBadge key={s} label={STATUS_LABELS[s]} onRemove={() => removeChip('statuts', s)} />
            ))}
          </div>
        )}

        {/* ── Content ── */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: isDesktop ? '16px 28px 28px' : '12px 16px 88px',
        }}>
          {/* ══ HEADER CHALK PREMIUM ═════════════════════════════════════════ */}
          {isDesktop && !isLoading && medications.length > 0 && (() => {
            // ── KPI calculés ────────────────────────────────────────────────
            const totalRefs   = medications.length;
            const totalValue  = medications.reduce((s, m) => s + (m.price || 0) * (m.quantity || 0), 0);
            const ruptures    = medications.filter(m => m.quantity === 0).length;
            const lowStock    = medications.filter(m => {
              const min = m.minimum_stock || 0;
              return m.quantity > 0 && min > 0 && m.quantity <= min;
            }).length;
            const expiring30  = medications.filter(m => {
              if (!m.expiry_date) return false;
              const d = new Date(m.expiry_date);
              const now = new Date();
              const diff = (d.getTime() - now.getTime()) / 86400000;
              return diff > 0 && diff <= 30;
            }).length;

            // ── Catégories dynamiques ───────────────────────────────────────
            // Par médicament : priorité name_rayon/category, sinon détection auto DCI
            const catMap: Record<string, number> = {};
            medications.forEach(m => {
              const manualCat = m.name_rayon || m.category;
              if (manualCat) {
                catMap[manualCat] = (catMap[manualCat] || 0) + 1;
              } else {
                // Détection automatique via base DCI OMS (~300 substances ATC)
                const detected = matchKeywordCategory(m);
                if (detected) catMap[detected] = (catMap[detected] || 0) + 1;
              }
            });
            const categories = Object.entries(catMap)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 12);

            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const recentCount = medications.filter(m =>
              m.created_at && new Date(m.created_at) > sevenDaysAgo
            ).length;

            const fmtBig = (n: number) =>
              n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
              : n >= 1_000   ? `${(n / 1_000).toFixed(0)}k`
              : `${n}`;

            return (
              <>
                {/* ── KPI Strip — Chalk Premium, avec hover subtil ──── */}
                <style>{`
                  .jp-kpi-cell { transition: background 0.15s, transform 0.15s; cursor: default; }
                  .jp-kpi-cell:hover { background: #fafbfc; }
                  .jp-kpi-cell:hover .jp-kpi-value { transform: translateY(-1px); }
                  .jp-kpi-value { transition: transform 0.18s ease; display: inline-block; }
                `}</style>
                <div style={{
                  display: 'flex', alignItems: 'stretch',
                  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
                  marginBottom: 16, overflow: 'hidden',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                }}>
                  {[
                    { label: 'Valeur stock',      value: `${fmtBig(totalValue)}`, unit: 'FC',   sub: '+2.1% ce mois', subColor: '#10785a', color: '#0a0e14' },
                    { label: 'Références',         value: totalRefs.toLocaleString('fr-FR'), unit: '', sub: null, subColor: '', color: '#0a0e14' },
                    { label: 'Ruptures',           value: String(ruptures), unit: '',           sub: ruptures > 0 ? 'Critique' : 'Aucune', subColor: ruptures > 0 ? '#dc2626' : '#10785a', color: '#0a0e14' },
                    { label: 'Stock bas',          value: String(lowStock), unit: '',            sub: lowStock > 0 ? 'À surveiller' : 'OK', subColor: lowStock > 0 ? '#d97706' : '#10785a', color: '#0a0e14' },
                    { label: 'Péremption < 30j',   value: `${expiring30}`, unit: 'lots',         sub: null, subColor: '', color: expiring30 > 0 ? '#dc2626' : '#0a0e14' },
                    { label: 'Catégories',         value: String(categories.length), unit: '',   sub: null, subColor: '', color: '#0a0e14' },
                  ].map((kpi, idx, arr) => (
                    <div
                      key={kpi.label}
                      className="jp-kpi-cell"
                      style={{
                        flex: 1, padding: '16px 20px',
                        borderRight: idx < arr.length - 1 ? '1px solid #f3f4f6' : 'none',
                      }}
                    >
                      <div style={{ fontSize: 11.5, color: '#9ca3af', fontWeight: 500, marginBottom: 6 }}>{kpi.label}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span className="jp-kpi-value" style={{ fontSize: 24, fontWeight: 800, color: kpi.color, letterSpacing: '-0.03em', lineHeight: 1 }}>
                          {kpi.value}
                        </span>
                        {kpi.unit && <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 500 }}>{kpi.unit}</span>}
                      </div>
                      {kpi.sub && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: kpi.subColor, marginTop: 4 }}>{kpi.sub}</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* ── Category Tabs — Chalk Premium (fond blanc, bordure) ── */}
                <div style={{
                  display: 'flex', gap: 10, marginBottom: 14,
                  overflowX: 'auto', paddingBottom: 4, paddingTop: 2,
                  scrollbarWidth: 'thin',
                }}>
                  <button
                    onClick={() => setActiveCat('Tous')}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '8px 18px', borderRadius: 99,
                        background: activeCat === 'Tous' ? '#0a0e14' : '#ffffff',
                        border: activeCat === 'Tous' ? 'none' : '1px solid #e5e7eb',
                        color: activeCat === 'Tous' ? '#fff' : '#0a0e14',
                        fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        whiteSpace: 'nowrap', flexShrink: 0,
                        letterSpacing: '-0.01em',
                        boxShadow: activeCat === 'Tous'
                          ? '0 1px 2px rgba(0,0,0,0.06)'
                          : '0 1px 1px rgba(0,0,0,0.02)',
                        transition: 'all 0.15s',
                      }}
                    >
                      Tous <span style={{
                        fontWeight: 500, fontSize: 12.5,
                        color: activeCat === 'Tous' ? 'rgba(255,255,255,0.55)' : '#9ca3af',
                        fontVariantNumeric: 'tabular-nums',
                      }}>{totalRefs.toLocaleString('fr-FR')}</span>
                    </button>
                    {categories.map(([cat, count]) => {
                      const isActive = activeCat === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => setActiveCat(isActive ? 'Tous' : cat)}
                          onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; }}
                          onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = '#ffffff'; }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '8px 18px', borderRadius: 99,
                            background: isActive ? '#0a0e14' : '#ffffff',
                            border: isActive ? 'none' : '1px solid #e5e7eb',
                            color: isActive ? '#fff' : '#0a0e14',
                            fontSize: 14, fontWeight: 500, cursor: 'pointer',
                            whiteSpace: 'nowrap', flexShrink: 0,
                            letterSpacing: '-0.005em',
                            boxShadow: isActive
                              ? '0 1px 2px rgba(0,0,0,0.06)'
                              : '0 1px 1px rgba(0,0,0,0.02)',
                            transition: 'all 0.15s',
                          }}
                        >
                          {cat} <span style={{
                            fontWeight: 500, fontSize: 12.5,
                            color: isActive ? 'rgba(255,255,255,0.55)' : '#9ca3af',
                            fontVariantNumeric: 'tabular-nums',
                          }}>{count.toLocaleString('fr-FR')}</span>
                        </button>
                      );
                    })}

                    {/* ── Tab Récents ── */}
                    {recentCount > 0 && (() => {
                      const isActive = activeCat === '__recent__';
                      return (
                        <button
                          onClick={() => setActiveCat(isActive ? 'Tous' : '__recent__')}
                          onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,120,90,0.06)'; }}
                          onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = '#ffffff'; }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 7,
                            padding: '8px 18px', borderRadius: 99,
                            background: isActive ? '#10785a' : '#ffffff',
                            border: isActive ? 'none' : '1px solid rgba(16,120,90,0.3)',
                            color: isActive ? '#fff' : '#10785a',
                            fontSize: 14, fontWeight: 600, cursor: 'pointer',
                            whiteSpace: 'nowrap', flexShrink: 0,
                            letterSpacing: '-0.01em',
                            boxShadow: isActive ? '0 1px 3px rgba(16,120,90,0.25)' : 'none',
                            transition: 'all 0.15s',
                          }}
                        >
                          <span style={{
                            width: 7, height: 7, borderRadius: 99,
                            background: isActive ? 'rgba(255,255,255,0.7)' : '#10785a',
                            flexShrink: 0,
                            boxShadow: isActive ? 'none' : '0 0 0 2px rgba(16,120,90,0.15)',
                          }} />
                          Récents
                          <span style={{
                            fontWeight: 500, fontSize: 12.5,
                            color: isActive ? 'rgba(255,255,255,0.65)' : 'rgba(16,120,90,0.6)',
                            fontVariantNumeric: 'tabular-nums',
                          }}>{recentCount}</span>
                        </button>
                      );
                    })()}
                </div>
              </>
            );
          })()}

          {/* Count line */}
          <div style={{ fontSize: 12, color: C.inkMute, marginBottom: 10 }}>
            {isLoading ? 'Chargement…' : `${filteredMedications.length} produit${filteredMedications.length !== 1 ? 's' : ''}${hasMore ? ` · affichage ${visibleCount}` : ''}`}
            {unitMode && <span style={{ marginLeft: 8, color: C.brand, fontWeight: 600 }}>· Mode Unitaire</span>}
          </div>

          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0', gap: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 99,
                border: `2.5px solid ${C.brand}`,
                borderTopColor: 'transparent',
                animation: 'spin 0.7s linear infinite',
              }} />
              <span style={{ fontSize: 13, color: C.inkMute }}>Chargement de l'inventaire…</span>
            </div>
          ) : filteredMedications.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '56px 24px', gap: 12,
              background: C.panel, border: `1px solid ${C.hairline}`, borderRadius: 12,
            }}>
              {medications.length === 0 && !searchQuery && activeFilterCount === 0 ? (
                <>
                  <div style={{ width: 56, height: 56, borderRadius: 14, background: C.brandLt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <PackageOpen size={26} color={C.brand} strokeWidth={1.5} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>Inventaire vide</div>
                    <div style={{ fontSize: 13, color: C.inkMute, marginTop: 4 }}>Importez votre fichier Excel pour commencer.</div>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.inkFaint }}>Paramètres › Import Excel</div>
                </>
              ) : (
                <>
                  <Package size={22} color={C.inkFaint} strokeWidth={1.5} />
                  <span style={{ fontSize: 13, color: C.inkMute }}>Aucun produit ne correspond aux filtres</span>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => setFilters(EMPTY_FILTERS)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: C.brand, fontWeight: 500 }}
                    >
                      Effacer les filtres
                    </button>
                  )}
                </>
              )}
            </div>
          ) : isDesktop ? (
            /* ══════════════════════════════════════════════════════════════
               CHALK PREMIUM INVENTORY TABLE — copie exacte du screenshot
               ══════════════════════════════════════════════════════════ */
            <div style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
            }}>
              <style>{`
                @keyframes pulse-ring{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:0;transform:scale(2.2)}}
                .cp-row { border-bottom: 1px solid #f3f4f6; }
                .cp-row:last-child { border-bottom: none; }
                .cp-row:hover { background: #f9fafb !important; }
                .cp-row:hover .cp-cell { background: transparent !important; }
                .cp-chk { opacity: 0; transition: opacity 0.1s; }
                .cp-row:hover .cp-chk, .cp-row.cp-selected .cp-chk { opacity: 1 !important; }
              `}</style>
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%', borderCollapse: 'collapse',
                  fontFamily: `${C.f}`,
                  fontSize: 13,
                }}>

                  {/* ═══ HEADERS Chalk Premium ════════════════════════════ */}
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      {/* Checkbox tout sélectionner */}
                      <th style={{ width: 44, padding: '10px 0 10px 16px' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.size === visibleMedications.length && visibleMedications.length > 0}
                          ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < visibleMedications.length; }}
                          onChange={toggleSelectAll}
                          style={{ width: 15, height: 15, cursor: 'pointer', accentColor: C.brand }}
                        />
                      </th>
                      {[
                        { label: 'SKU',         align: 'left'  as const, w: 90,  k: 'sku'      as SortKey },
                        { label: 'Produit',      align: 'left'  as const, w: 220, k: 'name'     as SortKey },
                        { label: 'Catégorie',    align: 'left'  as const, w: 130, k: null      as SortKey },
                        { label: 'Stock',        align: 'right' as const, w: 80,  k: 'stock'    as SortKey },
                        { label: 'Seuil',        align: 'right' as const, w: 70,  k: 'min'      as SortKey },
                        { label: 'Px Achat',     align: 'right' as const, w: 90,  k: 'buy'      as SortKey },
                        { label: 'Px Vente',     align: 'right' as const, w: 90,  k: 'sell'     as SortKey },
                        { label: 'Marge',        align: 'right' as const, w: 75,  k: 'margin'   as SortKey },
                        { label: 'Péremption',   align: 'right' as const, w: 100, k: 'expiry'   as SortKey },
                        { label: 'Fournisseur',  align: 'left'  as const, w: 120, k: 'supplier' as SortKey },
                        { label: 'Statut',       align: 'left'  as const, w: 95,  k: null       as SortKey },
                        { label: '',             align: 'right' as const, w: isManager ? 120 : 85, k: null as SortKey },
                      ].map(h => {
                        const sortable = h.k !== null;
                        const isActive = sortable && sortKey === h.k;
                        return (
                          <th
                            key={h.label}
                            onClick={() => sortable && handleSort(h.k)}
                            style={{
                              padding: '10px 12px',
                              textAlign: h.align,
                              minWidth: h.w,
                              fontSize: 11,
                              fontWeight: 600,
                              color: isActive ? '#0a0e14' : '#6b7280',
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                              whiteSpace: 'nowrap',
                              userSelect: 'none',
                              cursor: sortable ? 'pointer' : 'default',
                              transition: 'color 0.1s',
                            }}
                            onMouseEnter={e => { if (sortable && !isActive) (e.currentTarget as HTMLTableCellElement).style.color = '#374151'; }}
                            onMouseLeave={e => { if (sortable && !isActive) (e.currentTarget as HTMLTableCellElement).style.color = '#6b7280'; }}
                          >
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              flexDirection: h.align === 'right' ? 'row-reverse' : 'row',
                            }}>
                              {h.label}
                              {sortable && (
                                <span style={{
                                  fontSize: 9,
                                  color: isActive ? C.brand : '#d1d5db',
                                  lineHeight: 1,
                                  transition: 'color 0.1s, transform 0.15s',
                                  transform: isActive && sortDir === 'desc' ? 'rotate(180deg)' : 'rotate(0deg)',
                                  display: 'inline-block',
                                }}>
                                  ▲
                                </span>
                              )}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  {/* ═══ BODY ═══════════════════════════════════════════════ */}
                  <tbody>
                    {visibleMedications.map((med, rowIndex) => {
                      const st  = chalkStockStatus(med);
                      const isExpiredMed  = getMedStatus(med) === 'expired';
                      const isExpiringSoon = getMedStatus(med) === 'expiring';
                      const isHovered  = hoveredRowId === (med.code_produit || med.id);
                      const isSelected = selectedIds.has(med.id);
                      const isNew = med.created_at && new Date(med.created_at) > sevenDaysAgo;

                      // Marge selon méthode configurée (sur vente ou sur coût)
                      const margin = computeMargin(med.price, med.wholesale_price);

                      // Fond de ligne contextuel
                      const rowBg = isSelected ? 'rgba(16,120,90,0.04)' : '#fff';

                      // Couleur stock
                      const min = med.minimum_stock || 0;
                      const qty = med.quantity ?? 0;
                      const stockColor = qty === 0 ? '#dc2626'
                        : (min > 0 && qty <= min * 0.2) ? '#dc2626'
                        : (min > 0 && qty <= min)       ? '#d97706'
                        : '#0a0e14';

                      return (
                        <tr
                          key={med.code_produit || med.id}
                          className={`cp-row${isSelected ? ' cp-selected' : ''}`}
                          onClick={() => handleMedicationClick(med)}
                          style={{
                            background: isSelected ? 'rgba(16,120,90,0.04)' : '#fff',
                            cursor: unitMode ? 'pointer' : 'default',
                          }}
                          onMouseEnter={() => setHoveredRowId(med.code_produit || med.id)}
                          onMouseLeave={() => setHoveredRowId(null)}
                        >
                          {/* Checkbox */}
                          <td style={{ padding: '0 0 0 16px', width: 44 }} onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(med.id)}
                              className="cp-chk"
                              style={{ width: 15, height: 15, cursor: 'pointer', accentColor: C.brand, display: 'block' }}
                            />
                          </td>

                          {/* SKU */}
                          <td style={{ padding: '16px 12px' }}>
                            {med.code_produit
                              ? <span style={{
                                  fontFamily: C.fm, fontSize: 11.5, fontWeight: 500,
                                  color: '#6b7280', letterSpacing: '0.02em',
                                }}>{med.code_produit}</span>
                              : <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>
                            }
                          </td>

                          {/* Produit — nom gras + DCI */}
                          <td style={{ padding: '16px 12px', minWidth: 220 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <span style={{
                                  fontSize: 14, fontWeight: 700, color: '#0a0e14',
                                  letterSpacing: '-0.02em', lineHeight: 1.2,
                                }}>
                                  {med.name}
                                </span>
                                {isNew && (
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                                    color: '#10785a', background: 'rgba(16,120,90,0.1)',
                                    padding: '2px 7px', borderRadius: 99,
                                    textTransform: 'uppercase', flexShrink: 0,
                                  }}>Nouveau</span>
                                )}
                              </div>
                              {med.dosage && (
                                <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 400 }}>
                                  {med.dosage}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Catégorie — sélecteur cliquable avec détection auto + apprentissage */}
                          <td style={{ padding: '16px 12px' }} onClick={e => e.stopPropagation()}
                              {...(rowIndex === 0 ? { 'data-tour': 'category-picker' } : {})}>
                            <CategoryPicker med={med} onUpdated={applyLocalPatch} />
                          </td>

                          {/* Stock — chiffre coloré selon seuil */}
                          <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                            <span style={{
                              fontFamily: C.fm, fontSize: 15, fontWeight: 800,
                              color: stockColor, letterSpacing: '-0.03em',
                            }}>
                              {qty}
                            </span>
                          </td>

                          {/* Seuil */}
                          <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                            <MinStockEditor med={med} />
                          </td>

                          {/* Prix achat */}
                          <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                            {med.wholesale_price
                              ? <span style={{ fontFamily: C.fm, fontSize: 13, color: '#6b7280' }}>
                                  {med.wholesale_price.toLocaleString('fr-FR')}
                                </span>
                              : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                            }
                          </td>

                          {/* Prix vente — gras */}
                          <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                            {med.price
                              ? <span style={{ fontFamily: C.fm, fontSize: 13, fontWeight: 700, color: '#0a0e14', letterSpacing: '-0.01em' }}>
                                  {med.price.toLocaleString('fr-FR')}
                                </span>
                              : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                            }
                          </td>

                          {/* Marge % */}
                          <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                            {margin !== null
                              ? <span style={{
                                  fontFamily: C.fm, fontSize: 13, fontWeight: 600,
                                  color: margin >= marginThresholds.good ? '#10785a' : margin >= marginThresholds.ok ? '#d97706' : '#dc2626',
                                }}>
                                  {margin}%
                                </span>
                              : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                            }
                          </td>

                          {/* Péremption */}
                          <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                            {isExpiredMed
                              ? <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.18)',
                                  borderRadius: 5, padding: '2px 7px',
                                  fontSize: 11.5, fontWeight: 700, color: '#dc2626', fontFamily: C.fm,
                                }}>⚠ {fmtExpiry(med.expiry_date)}</span>
                              : isExpiringSoon
                                ? <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.18)',
                                    borderRadius: 5, padding: '2px 7px',
                                    fontSize: 11.5, fontWeight: 600, color: '#d97706', fontFamily: C.fm,
                                  }}>{fmtExpiry(med.expiry_date)}</span>
                                : <span style={{ fontFamily: C.fm, fontSize: 12, color: '#9ca3af' }}>
                                    {fmtExpiry(med.expiry_date)}
                                  </span>
                            }
                          </td>

                          {/* Fournisseur */}
                          <td style={{ padding: '16px 12px' }}>
                            <span style={{
                              display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap', maxWidth: 130,
                              fontSize: 13, color: '#4b5563', fontWeight: 500,
                            }} title={med.supplier || ''}>
                              {med.supplier || <span style={{ color: '#d1d5db' }}>—</span>}
                            </span>
                          </td>

                          {/* Statut — badge avec dot */}
                          <td style={{ padding: '16px 12px' }}>
                            <StatusBadge color={st.color} label={st.label} />
                          </td>

                          {/* ── Colonne Actions ───────────────────────────── */}
                          <td
                            style={{
                              padding: '10px 16px', textAlign: 'right',
                              width: isManager ? 125 : 90, whiteSpace: 'nowrap',
                              background: rowBg,
                            }}
                            onClick={e => e.stopPropagation()}
                            {...(rowIndex === 0 ? { 'data-tour': 'row-actions' } : {})}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                              <InventoryRowActions
                                med={med}
                                isManager={isManager}
                                visible={isHovered || (rowIndex === 0 && tourStep === 'row-actions')}
                                onUpdated={applyLocalPatch}
                                onAddToCart={m => {
                                  // Vente rapide : navigue vers Caisse avec ce produit pré-sélectionné
                                  window.dispatchEvent(new CustomEvent('junglepharm:quick-sale', { detail: { medicationId: m.id, name: m.name, price: m.price } }));
                                  onNavigateToSales?.(m.id);
                                }}
                                onDelete={isManager ? m => setDeleteTarget(m) : undefined}
                              />
                              {/* Supprimer — visible uniquement manager + survol */}
                              {isManager && (
                                <button
                                  onClick={e => { e.stopPropagation(); setDeleteTarget(med); }}
                                  title="Supprimer"
                                  style={{
                                    width: 28, height: 28, borderRadius: 7, border: 'none',
                                    background: 'rgba(200,30,30,0.08)', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s',
                                  }}
                                >
                                  <Trash2 size={13} color="#c81e1e" strokeWidth={2} />
                                </button>
                              )}
                            </div>
                          </td>

                          {unitMode && (
                            <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                              <ChevronRight size={14} color={C.inkFaint} strokeWidth={1.5} />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} style={{ padding: '12px 14px', textAlign: 'center' }}>
                {hasMore && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: C.inkMute }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 99,
                      border: `2px solid ${C.brand}`, borderTopColor: 'transparent',
                      animation: 'spin 0.7s linear infinite',
                    }} />
                    Chargement de la suite…
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── Mobile card list ── */
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visibleMedications.map(med => {
                  const st = chalkStockStatus(med);
                  const isExpiredMed = getMedStatus(med) === 'expired';
                  const isExpiringSoon = getMedStatus(med) === 'expiring';
                  const isNew = med.created_at && new Date(med.created_at) > sevenDaysAgo;
                  return (
                    <div
                      key={med.code_produit || med.id}
                      onClick={() => handleMedicationClick(med)}
                      style={{
                        background: C.panel, border: `1px solid ${isNew ? 'rgba(16,120,90,0.2)' : C.hairline}`,
                        borderRadius: 10, padding: '12px 14px',
                        cursor: unitMode ? 'pointer' : 'default',
                        borderLeft: `3px solid ${st.color === 'red' ? C.red : st.color === 'amber' ? C.amber : C.brand}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, letterSpacing: '-0.01em' }}>
                              {med.name}
                            </div>
                            {isNew && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                                color: '#10785a', background: 'rgba(16,120,90,0.1)',
                                padding: '2px 7px', borderRadius: 99,
                                textTransform: 'uppercase', flexShrink: 0,
                              }}>Nouveau</span>
                            )}
                          </div>
                          {med.dosage && (
                            <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>{med.dosage}</div>
                          )}
                          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            {med.name_rayon && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 5, height: 5, borderRadius: 99, background: rayonColor(med.name_rayon) }} />
                                <span style={{ fontSize: 11, color: C.inkMute }}>{med.name_rayon}</span>
                              </span>
                            )}
                            {med.code_produit && (
                              <span style={{ fontFamily: C.fm, fontSize: 10.5, color: C.inkFaint }}>{med.code_produit}</span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                          <Pill color={st.color}>{st.label}</Pill>
                          <span style={{
                            fontFamily: C.fm, fontSize: 18, fontWeight: 700,
                            color: med.quantity === 0 ? C.red : (med.minimum_stock && med.quantity <= med.minimum_stock) ? C.amber : C.ink,
                          }}>
                            {med.quantity}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.hairline}`, alignItems: 'flex-end' }}>
                        <div>
                          <div style={{ fontSize: 10, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Exp.</div>
                          <div style={{
                            fontFamily: C.fm, fontSize: 11.5,
                            color: isExpiredMed ? C.red : isExpiringSoon ? C.amber : C.inkMute,
                            fontWeight: isExpiredMed || isExpiringSoon ? 600 : 400,
                          }}>
                            {formatExpiry(med.expiry_date)}
                          </div>
                        </div>
                        {/* Seuil min éditable */}
                        <div onClick={e => e.stopPropagation()}>
                          <div style={{ fontSize: 10, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Seuil min</div>
                          <MinStockEditor med={med} />
                        </div>
                        {med.supplier && (
                          <div>
                            <div style={{ fontSize: 10, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fourn.</div>
                            <div style={{ fontSize: 11.5, color: C.inkSoft }}>{med.supplier}</div>
                          </div>
                        )}
                        {med.price !== undefined && (
                          <div style={{ marginLeft: 'auto' }}>
                            <div style={{ fontSize: 10, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Prix</div>
                            <div style={{ fontFamily: C.fm, fontSize: 13, fontWeight: 600, color: C.ink }}>
                              {med.price.toLocaleString('fr-FR')}
                            </div>
                          </div>
                        )}
                        {unitMode && (
                          <div style={{ display: 'flex', alignItems: 'flex-end', marginLeft: 'auto' }}>
                            <ChevronRight size={16} color={C.brand} strokeWidth={1.5} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div ref={sentinelRef} style={{ padding: '16px 0', textAlign: 'center' }}>
                {hasMore && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: C.inkMute }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 99,
                      border: `2px solid ${C.brand}`, borderTopColor: 'transparent',
                      animation: 'spin 0.7s linear infinite',
                    }} />
                    Chargement…
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          BULK ACTIONS BAR — apparaît quand des lignes sont sélectionnées
          ══════════════════════════════════════════════════════════════ */}
      {selectedIds.size > 0 && (
        <div data-tour="bulk-bar" style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 150,
          display: 'flex', alignItems: 'center', gap: 0,
          background: '#0a0e14',
          borderRadius: 14,
          boxShadow: '0 12px 40px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.15)',
          color: '#fff',
          animation: 'jp-slide-up 0.18s ease',
          overflow: 'hidden',
        }}>
          <style>{`@keyframes jp-slide-up{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>

          {/* Compteur */}
          <div style={{
            padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10,
            borderRight: '1px solid rgba(255,255,255,0.1)',
          }}>
            <span style={{
              background: '#10785a', color: '#fff', borderRadius: 6,
              padding: '3px 8px', fontSize: 12.5, fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {selectedIds.size}
            </span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
          </div>

          {/* Actions */}
          {!bulkAction && (
            <>
              <BulkBtn label="Exporter CSV" onClick={exportSelection} icon="📥" />
              <BulkBtn label="Modifier prix" onClick={() => setBulkAction('priceChange')} icon="💰" />
              {isManager && <BulkBtn label="Fournisseur" onClick={() => setBulkAction('supplier')} icon="🏢" />}
              {isManager && <BulkBtn label="Seuil min" onClick={() => setBulkAction('minStock')} icon="📊" />}
              {isManager && <BulkBtn label="Supprimer" onClick={applyBulkDelete} icon="🗑️" danger />}
            </>
          )}

          {/* Mode édition prix */}
          {bulkAction === 'priceChange' && (
            <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                autoFocus
                value={bulkValue}
                onChange={e => setBulkValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyBulkPriceChange()}
                placeholder="+10% ou -500"
                style={{
                  height: 32, padding: '0 12px', borderRadius: 7,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(255,255,255,0.06)', color: '#fff',
                  fontSize: 13, outline: 'none', width: 130,
                }}
              />
              <button onClick={applyBulkPriceChange} disabled={bulkLoading}
                style={{ height: 32, padding: '0 14px', borderRadius: 7, border: 'none', background: '#10785a', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                {bulkLoading ? '...' : 'Appliquer'}
              </button>
              <button onClick={() => { setBulkAction(null); setBulkValue(''); }}
                style={{ height: 32, padding: '0 10px', borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5, cursor: 'pointer' }}>
                Annuler
              </button>
            </div>
          )}

          {/* Mode édition fournisseur */}
          {bulkAction === 'supplier' && (
            <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input autoFocus value={bulkValue} onChange={e => setBulkValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyBulkSupplier()}
                placeholder="Nom du fournisseur"
                style={{ height: 32, padding: '0 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 13, outline: 'none', width: 180 }} />
              <button onClick={applyBulkSupplier} disabled={bulkLoading}
                style={{ height: 32, padding: '0 14px', borderRadius: 7, border: 'none', background: '#10785a', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                {bulkLoading ? '...' : 'Appliquer'}
              </button>
              <button onClick={() => { setBulkAction(null); setBulkValue(''); }}
                style={{ height: 32, padding: '0 10px', borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5, cursor: 'pointer' }}>
                Annuler
              </button>
            </div>
          )}

          {/* Mode édition seuil min */}
          {bulkAction === 'minStock' && (
            <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input autoFocus type="number" value={bulkValue} onChange={e => setBulkValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyBulkMinStock()}
                placeholder="Seuil min"
                style={{ height: 32, padding: '0 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 13, outline: 'none', width: 120 }} />
              <button onClick={applyBulkMinStock} disabled={bulkLoading}
                style={{ height: 32, padding: '0 14px', borderRadius: 7, border: 'none', background: '#10785a', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                {bulkLoading ? '...' : 'Appliquer'}
              </button>
              <button onClick={() => { setBulkAction(null); setBulkValue(''); }}
                style={{ height: 32, padding: '0 10px', borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5, cursor: 'pointer' }}>
                Annuler
              </button>
            </div>
          )}

          {/* Désélectionner */}
          <button
            onClick={() => setSelectedIds(new Set())}
            title="Tout désélectionner"
            style={{
              padding: '12px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.6)', fontSize: 18, lineHeight: 1,
              borderLeft: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Modals & overlays ── */}
      {/* ── Modal "Ajouter manuellement" (bouton + du topbar) ── */}
      <AddMedicationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={(result?: AddMedicationResult) => {
          loadMedications();
          if (result?.isUnitMode && result.newUnits && result.newUnits.length > 0) {
            const today = new Date().toISOString().split('T')[0];
            setPendingPrint({
              medicationName: result.medication.name,
              price: result.medication.price,
              units: result.newUnits.map(u => ({
                id: u.id, unit_code: u.unit_code,
                medication_name: result.medication.name,
                batch_number: u.batch_number, expiry_date: u.expiry_date,
                entry_date: today, price: result.medication.price, supplier: '',
              })),
            });
          }
        }}
      />

      {/* ── Sheet scan (found / unknown) ── */}
      {scanState && scanState.phase !== 'loading' && (
        <ScanEntrySheet
          code={scanState.code}
          gs1={scanState.gs1}
          medication={scanState.phase === 'found' ? scanState.medication : null}
          onSuccess={handleScanSuccess}
          onDismiss={handleScanDismiss}
          onUnitsGenerated={handleScanUnitsGenerated}
        />
      )}

      {/* ── Loading scan indicator ── */}
      {scanState?.phase === 'loading' && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 200 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', borderRadius: 99,
            background: 'rgba(15,15,20,0.85)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.20)',
            color: '#fff', fontSize: 12.5, fontWeight: 500,
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: 99,
              border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
              animation: 'spin 0.7s linear infinite',
            }} />
            Recherche en cours…
          </div>
        </div>
      )}

      {/* ── Notification succès/erreur ── */}
      {scanNotif && (
        <div style={{ position: 'fixed', top: 16, left: 16, right: 16, zIndex: 50 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px', borderRadius: 12,
            background: scanNotif.type === 'ok' ? '#10785a' : C.red,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            color: '#fff',
          }}>
            <CheckCircle size={18} strokeWidth={1.5} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>{scanNotif.message}</span>
          </div>
        </div>
      )}

      {selectedMedication && (
        <UnitDetailsModal
          medication={selectedMedication}
          units={medicationUnits}
          loading={loadingUnits}
          onClose={() => setSelectedMedication(null)}
          onUnitStatusChanged={() => {
            loadMedications();
            loadUnitsForMedication(selectedMedication.id);
          }}
        />
      )}

      {pendingPrint && !showPrintModal && (
        <div style={{
          position: 'fixed', bottom: 88, left: 16, right: 16, zIndex: 50,
        }}>
          <div style={{
            background: '#10785a', color: '#fff', borderRadius: 16,
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <CheckCircle size={22} strokeWidth={1.5} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pendingPrint.medicationName}
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>
                {pendingPrint.units.length} unité(s) créée(s)
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
              <button
                onClick={() => setShowPrintModal(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 10px', background: '#fff', color: '#10785a',
                  border: 'none', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Printer size={13} strokeWidth={1.5} />
                Imprimer {pendingPrint.units.length}
              </button>
              <button
                onClick={() => setPendingPrint(null)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 11, cursor: 'pointer', textAlign: 'center' }}
              >
                Ignorer
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingPrint && showPrintModal && (
        <PrintUnitsModal
          units={pendingPrint.units}
          medicationName={pendingPrint.medicationName}
          price={pendingPrint.price}
          onClose={() => { setShowPrintModal(false); setPendingPrint(null); }}
          onUnitsUpdated={() => loadMedications()}
        />
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .inventory-row:hover .delete-med-btn { opacity: 1 !important; }
      `}</style>

      {/* ── Modal confirmation suppression ─────────────────────────────────── */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => !isDeleting && setDeleteTarget(null)}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420, padding: 28, boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(200,30,30,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={20} color="#c81e1e" strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0a0e14' }}>Supprimer ce produit ?</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>Cette action est irréversible.</div>
              </div>
            </div>
            <div style={{ padding: '12px 16px', background: 'rgba(200,30,30,0.05)', border: '1px solid rgba(200,30,30,0.15)', borderRadius: 10, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0a0e14' }}>{deleteTarget.name} {deleteTarget.dosage}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Stock actuel : {deleteTarget.quantity} unité(s)</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteTarget(null)} disabled={isDeleting}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid rgba(0,0,0,0.1)', background: 'transparent', fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleDeleteMedication} disabled={isDeleting}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: isDeleting ? '#e5e7eb' : '#c81e1e', color: isDeleting ? '#9ca3af' : '#fff', fontSize: 14, fontWeight: 700, cursor: isDeleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {isDeleting ? <div style={{ width: 14, height: 14, borderRadius: 99, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} /> : <Trash2 size={14} />}
                {isDeleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          B8 — Le guide de l'inventaire est piloté par <TourHost> (niveau App).
          Stock se contente d'écouter l'étape active pour révéler les cibles
          normalement masquées (actions de ligne au survol, barre d'actions
          groupées) — voir le useEffect « junglepharm:tour-step » plus haut.
          ══════════════════════════════════════════════════════════════ */}
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FilterSelect({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[]; placeholder: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: C.inkMute, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', height: 32, padding: '0 8px',
          border: `1px solid ${C.hairline}`, borderRadius: 7,
          fontSize: 12.5, background: C.panelSolid, color: C.ink,
          outline: 'none', boxSizing: 'border-box',
        }}
      >
        <option value="">{placeholder}</option>
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );
}

function FilterBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', background: C.brandLt, color: C.brand,
      borderRadius: 99, fontSize: 11.5, fontWeight: 500,
      border: `1px solid ${C.brandMid}`,
    }}>
      {label}
      <button
        onClick={onRemove}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: C.brand, display: 'flex' }}
      >
        <X size={11} strokeWidth={2} />
      </button>
    </span>
  );
}

interface UnitDetailsModalProps {
  medication: Medication;
  units: InventoryUnit[];
  loading: boolean;
  onClose: () => void;
  onUnitStatusChanged: () => void; // recharge la liste après modif
}

function UnitDetailsModal({ medication, units, loading, onClose, onUnitStatusChanged }: UnitDetailsModalProps) {
  const [printUnit, setPrintUnit] = useState<InventoryUnit | null>(null);
  const [confirmLost, setConfirmLost] = useState<InventoryUnit | null>(null);
  const [markingLost, setMarkingLost] = useState(false);

  const handleMarkLost = async (unit: InventoryUnit, status: 'damaged' | 'lost') => {
    setMarkingLost(true);
    try {
      await supabase
        .from('inventory_units')
        .update({ status })
        .eq('id', unit.id);
      // Décrémenter le stock du médicament
      await supabase
        .from('medications')
        .update({ quantity: Math.max(0, (medication.quantity ?? 1) - 1) })
        .eq('id', medication.id);
      setConfirmLost(null);
      onUnitStatusChanged();
    } finally {
      setMarkingLost(false);
    }
  };

  return (
    <>
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 520,
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'saturate(180%) blur(24px)',
        WebkitBackdropFilter: 'saturate(180%) blur(24px)',
        borderRadius: '16px 16px 0 0', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${C.hairline}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{medication.name}</div>
            <div style={{ fontSize: 12.5, color: C.inkMute, marginTop: 2 }}>
              {medication.dosage && `${medication.dosage} · `}
              Stock : <span style={{ fontWeight: 600, color: C.brand }}>{medication.quantity} unité(s)</span>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,0,0,0.05)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color={C.inkMute} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.inkMute, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Unités en stock ({units.length})
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
              <div style={{ width: 22, height: 22, borderRadius: 99, border: `2.5px solid ${C.brand}`, borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
            </div>
          ) : units.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: C.inkMute }}>
              <Package size={32} color={C.inkFaint} strokeWidth={1.5} style={{ margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13 }}>Aucune unité disponible</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {units.map(unit => {
                const isConfirming = confirmLost?.id === unit.id;
                const expiry = unit.expiry_date
                  ? new Date(unit.expiry_date).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
                  : null;
                const isExpiringSoon = unit.expiry_date
                  ? (new Date(unit.expiry_date).getTime() - Date.now()) < 30 * 24 * 3600 * 1000
                  : false;
                return (
                  <div key={unit.id} style={{
                    borderRadius: 10, border: `1px solid ${isConfirming ? 'rgba(220,38,38,0.25)' : C.hairline}`,
                    background: isConfirming ? 'rgba(220,38,38,0.03)' : C.panelSolid,
                    overflow: 'hidden', transition: '0.15s',
                  }}>
                    {/* Ligne principale */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px' }}>
                      <div>
                        <span style={{ fontFamily: C.fm, fontWeight: 700, color: C.brand, fontSize: 13 }}>
                          {unit.unit_code}
                        </span>
                        <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                          {unit.batch_number && (
                            <span style={{ fontSize: 10, color: C.inkFaint }}>Lot : {unit.batch_number}</span>
                          )}
                          {expiry && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: isExpiringSoon ? '#dc2626' : C.inkFaint }}>
                              Exp : {expiry}{isExpiringSoon ? ' ⚠️' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Actions */}
                      {!isConfirming && (
                        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                          <button
                            onClick={() => setPrintUnit(unit)}
                            title="Imprimer l'étiquette"
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 9px', background: 'rgba(16,120,90,0.08)', color: C.brand, border: 'none', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                          >
                            <Printer size={11} strokeWidth={1.5} />
                            Étiquette
                          </button>
                          <button
                            onClick={() => setConfirmLost(unit)}
                            title="Marquer comme perdue ou abîmée"
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 9px', background: 'rgba(220,38,38,0.07)', color: '#dc2626', border: 'none', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                          >
                            <AlertTriangle size={11} strokeWidth={1.5} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Confirmation perte / casse */}
                    {isConfirming && (
                      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(220,38,38,0.12)', background: 'rgba(220,38,38,0.04)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <p style={{ margin: 0, fontSize: 11.5, color: '#dc2626', fontWeight: 600 }}>
                          Retirer cette boîte du stock ?
                        </p>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            disabled={markingLost}
                            onClick={() => handleMarkLost(unit, 'damaged')}
                            style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', background: '#f59e0b', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                          >
                            🔨 Abîmée
                          </button>
                          <button
                            disabled={markingLost}
                            onClick={() => handleMarkLost(unit, 'lost')}
                            style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                          >
                            ❌ Perdue
                          </button>
                          <button
                            onClick={() => setConfirmLost(null)}
                            style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.hairline}`, background: 'transparent', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: C.inkMute }}
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.hairline}` }}>
          <button
            onClick={onClose}
            style={{
              width: '100%', height: 42, borderRadius: 10,
              border: `1px solid ${C.hairline}`, background: 'transparent',
              fontSize: 13.5, fontWeight: 500, color: C.inkSoft, cursor: 'pointer',
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>

    {/* Impression d'étiquette pour une boîte spécifique */}
    {printUnit && (
      <PrintUnitsModal
        units={[{
          id: printUnit.id,
          unit_code: printUnit.unit_code,
          medication_name: medication.name,
          batch_number: printUnit.batch_number,
          expiry_date: printUnit.expiry_date,
          price: medication.price,
          supplier: medication.supplier ?? undefined,
        }]}
        medicationName={medication.name}
        price={medication.price}
        supplier={medication.supplier ?? undefined}
        onClose={() => setPrintUnit(null)}
      />
    )}
    </>
  );
}

// ── Bouton bulk action ───────────────────────────────────────────────────────
function BulkBtn({ label, onClick, icon, danger }: {
  label: string; onClick: () => void; icon: string; danger?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '12px 16px',
        background: hover ? (danger ? 'rgba(200,30,30,0.15)' : 'rgba(255,255,255,0.06)') : 'transparent',
        border: 'none',
        borderRight: '1px solid rgba(255,255,255,0.1)',
        color: danger ? '#fca5a5' : '#fff',
        fontSize: 13, fontWeight: 600,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 7,
        transition: 'background 0.1s',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>
      {label}
    </button>
  );
}
