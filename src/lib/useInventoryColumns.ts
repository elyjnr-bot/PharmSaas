// ════════════════════════════════════════════════════════════════════════════
//  useInventoryColumns — Gestion dynamique des colonnes de l'inventaire
//  Les colonnes sont définies à partir du schéma DB standard, mais leur
//  visibilité, label et ordre sont configurables par pharmacie.
//  Après chaque import, la config est mise à jour automatiquement.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useCallback, useEffect } from 'react';
import type { Mapping } from './ImportService';

// ── Mapping JungleField → champ DB ────────────────────────────────────────────
export const JUNGLE_TO_DB: Record<string, keyof StockMedication> = {
  designation: 'name',
  ean:         'code_produit',
  prix_achat:  'wholesale_price',
  prix_vente:  'price',
  stock:       'quantity',
  peremption:  'expiry_date',
};

// Sous-ensemble de Medication utilisé par l'inventaire
export interface StockMedication {
  id: string;
  name: string;
  dosage?: string;
  quantity: number;
  price?: number;
  wholesale_price?: number;
  code_produit?: string;
  expiry_date?: string | null;
  batch_number?: string;
  minimum_stock?: number;
  supplier?: string;
  name_rayon?: string;
  category?: string;
  forme_produit?: string;
}

export type ColType = 'text' | 'number' | 'currency' | 'date' | 'badge' | 'computed';
export type ColAlign = 'left' | 'right' | 'center';

export interface ColumnDef {
  /** Clé unique — stable, jamais localisée. */
  key: string;
  /** Label affiché dans le tableau (personnalisable). */
  label: string;
  /** Label par défaut (pour reset). */
  defaultLabel: string;
  /** Champ DB associé. null = colonne calculée. */
  dbField: keyof StockMedication | null;
  /** Champ JunglePharm correspondant (import mapping). */
  jungleField?: string;
  visible: boolean;
  sortable: boolean;
  type: ColType;
  align: ColAlign;
  minWidth?: number;
  /**
   * true si au moins un produit de la pharmacie a une valeur pour ce champ.
   * Mis à jour après import / chargement.
   */
  hasData: boolean;
  /** Peut être masquée par l'utilisateur (false = toujours visible). */
  hideable: boolean;
}

// ── Colonnes par défaut (schéma canonique) ────────────────────────────────────
export const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'designation',  defaultLabel: 'Désignation',   label: 'Désignation',   dbField: 'name',            jungleField: 'designation', visible: true,  sortable: true,  type: 'text',     align: 'left',   minWidth: 180, hasData: true,  hideable: false },
  { key: 'ref',          defaultLabel: 'Réf / EAN',     label: 'Réf / EAN',     dbField: 'code_produit',    jungleField: 'ean',         visible: true,  sortable: false, type: 'text',     align: 'left',   minWidth: 110, hasData: false, hideable: true  },
  { key: 'category',     defaultLabel: 'Catégorie',     label: 'Catégorie',     dbField: 'name_rayon',      jungleField: undefined,     visible: true,  sortable: true,  type: 'badge',    align: 'left',   minWidth: 100, hasData: false, hideable: true  },
  { key: 'stock',        defaultLabel: 'Stock',         label: 'Stock',         dbField: 'quantity',        jungleField: 'stock',       visible: true,  sortable: true,  type: 'number',   align: 'right',  minWidth: 70,  hasData: true,  hideable: false },
  { key: 'threshold',    defaultLabel: 'Seuil min',     label: 'Seuil min',     dbField: 'minimum_stock',   jungleField: undefined,     visible: true,  sortable: false, type: 'number',   align: 'center', minWidth: 80,  hasData: false, hideable: true  },
  { key: 'sell_price',   defaultLabel: 'Prix vente',    label: 'Prix vente',    dbField: 'price',           jungleField: 'prix_vente',  visible: true,  sortable: true,  type: 'currency', align: 'right',  minWidth: 100, hasData: false, hideable: true  },
  { key: 'buy_price',    defaultLabel: 'Prix achat',    label: 'Prix achat',    dbField: 'wholesale_price', jungleField: 'prix_achat',  visible: false, sortable: true,  type: 'currency', align: 'right',  minWidth: 100, hasData: false, hideable: true  },
  { key: 'expiry',       defaultLabel: 'Péremption',    label: 'Péremption',    dbField: 'expiry_date',     jungleField: 'peremption',  visible: true,  sortable: true,  type: 'date',     align: 'left',   minWidth: 110, hasData: false, hideable: true  },
  { key: 'batch',        defaultLabel: 'N° Lot',        label: 'N° Lot',        dbField: 'batch_number',    jungleField: undefined,     visible: true,  sortable: false, type: 'text',     align: 'left',   minWidth: 90,  hasData: false, hideable: true  },
  { key: 'supplier',     defaultLabel: 'Fournisseur',   label: 'Fournisseur',   dbField: 'supplier',        jungleField: undefined,     visible: false, sortable: true,  type: 'text',     align: 'left',   minWidth: 110, hasData: false, hideable: true  },
  { key: 'status',       defaultLabel: 'Statut',        label: 'Statut',        dbField: null,              jungleField: undefined,     visible: true,  sortable: false, type: 'computed', align: 'left',   minWidth: 80,  hasData: true,  hideable: true  },
];

const STORAGE_KEY = 'jp_inventory_columns_v2';

function loadFromStorage(): ColumnDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COLUMNS.map(c => ({ ...c }));
    const saved = JSON.parse(raw) as Partial<ColumnDef>[];
    // Merger avec les défauts pour préserver les nouvelles colonnes ajoutées ultérieurement
    return DEFAULT_COLUMNS.map(def => {
      const s = saved.find(c => c.key === def.key);
      if (!s) return { ...def };
      return {
        ...def,
        label:   s.label   ?? def.defaultLabel,
        visible: s.visible ?? def.visible,
        hasData: s.hasData ?? def.hasData,
      };
    });
  } catch {
    return DEFAULT_COLUMNS.map(c => ({ ...c }));
  }
}

function persist(cols: ColumnDef[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(
      cols.map(({ key, label, visible, hasData }) => ({ key, label, visible, hasData }))
    ));
  } catch { /* ignore */ }
}

// ════════════════════════════════════════════════════════════════════════════
//  HOOK
// ════════════════════════════════════════════════════════════════════════════
export function useInventoryColumns() {
  const [columns, setColumns] = useState<ColumnDef[]>(() => loadFromStorage());

  // Persiste à chaque changement
  useEffect(() => { persist(columns); }, [columns]);

  /** Colonnes visibles, dans l'ordre courant. */
  const visibleColumns = columns.filter(c => c.visible);

  /** Afficher/masquer une colonne. */
  const toggleColumn = useCallback((key: string) => {
    setColumns(prev => prev.map(c => {
      if (c.key !== key || !c.hideable) return c;
      return { ...c, visible: !c.visible };
    }));
  }, []);

  /** Renommer un label de colonne. */
  const renameColumn = useCallback((key: string, label: string) => {
    setColumns(prev => prev.map(c => c.key === key ? { ...c, label } : c));
  }, []);

  /** Remettre à zéro tous les labels. */
  const resetLabels = useCallback(() => {
    setColumns(prev => prev.map(c => ({ ...c, label: c.defaultLabel })));
  }, []);

  /** Remettre à zéro toute la config (visibilité + labels). */
  const resetAll = useCallback(() => {
    const fresh = DEFAULT_COLUMNS.map(c => ({ ...c }));
    setColumns(fresh);
    persist(fresh);
  }, []);

  /**
   * Appelé après un import réussi.
   * Met à jour :
   *   - `hasData` de chaque colonne selon les champs mappés
   *   - `label`   de chaque colonne selon le nom de la colonne source du fichier
   *   - Rend visibles les colonnes nouvellement renseignées
   */
  const updateFromImport = useCallback((
    mapping: Mapping,
    fileHeaders: string[],
    stats: { created: number; updated: number }
  ) => {
    if (stats.created + stats.updated === 0) return;

    setColumns(prev => prev.map(col => {
      if (!col.jungleField) return col;
      const fieldKey = col.jungleField as keyof typeof mapping;
      const colIdx = mapping[fieldKey];
      if (colIdx === undefined) return col;

      const fileHeader = fileHeaders[colIdx] ?? '';
      const normalizedHeader = fileHeader.trim();

      return {
        ...col,
        hasData: true,
        visible: true,
        // Ne renomme que si le header du fichier est significatif
        label: normalizedHeader && normalizedHeader !== col.defaultLabel
          ? normalizedHeader
          : col.label,
      };
    }));
  }, []);

  /**
   * Scanne un tableau de médicaments et marque hasData=true
   * pour les colonnes qui ont au moins une valeur non vide.
   */
  const detectFromData = useCallback((meds: StockMedication[]) => {
    if (!meds.length) return;
    setColumns(prev => prev.map(col => {
      if (!col.dbField || col.hasData) return col;
      const hasValue = meds.some(m => {
        const v = m[col.dbField as keyof StockMedication];
        return v !== null && v !== undefined && v !== '' && v !== 0;
      });
      return hasValue ? { ...col, hasData: true } : col;
    }));
  }, []);

  return {
    columns,
    visibleColumns,
    toggleColumn,
    renameColumn,
    resetLabels,
    resetAll,
    updateFromImport,
    detectFromData,
  };
}

// ── Singleton pour usage hors-hook (ex: après import) ────────────────────────
export function updateColumnsAfterImport(
  mapping: Mapping,
  fileHeaders: string[],
  stats: { created: number; updated: number }
): void {
  if (stats.created + stats.updated === 0) return;
  try {
    const cols = loadFromStorage();
    const updated = cols.map(col => {
      if (!col.jungleField) return col;
      const colIdx = (mapping as Record<string, number | undefined>)[col.jungleField];
      if (colIdx === undefined) return col;
      const fileHeader = (fileHeaders[colIdx] ?? '').trim();
      return {
        ...col,
        hasData: true,
        visible: true,
        label: fileHeader && fileHeader !== col.defaultLabel ? fileHeader : col.label,
      };
    });
    persist(updated);
  } catch { /* ignore */ }
}
