// ════════════════════════════════════════════════════════════════════════════
//  ImportService — Parsing & injection 100 % LOCAL (Congo-proof)
//  CSV  → papaparse   |   Excel (.xlsx/.xls) → xlsx (SheetJS)
//  Fonctionnalités : template, profils fournisseurs, multi-feuilles,
//  validation EAN, conflits, prix-only, historique.
// ════════════════════════════════════════════════════════════════════════════
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import { updateWithUserId, upsertWithUserId, getCurrentUserId } from './supabaseHelpers';
import { db } from './db';
import { syncProductsToLocal } from './syncManager';
import { fetchAllMedications } from './supabase';
import { offlineStorage } from './offlineStorage';

// ── Insert medications avec retour des lignes créées (id, name…) ──────────────
async function insertMedications(payload: Record<string, unknown>[], cols: string) {
  const userId = await getCurrentUserId();
  const withUser = payload.map(p => ({ ...p, user_id: userId }));
  return supabase.from('medications').insert(withUser).select(cols);
}

// ════════════════════════════════════════════════════════════════════════════
//  TYPES PUBLICS
// ════════════════════════════════════════════════════════════════════════════
export type JungleField = 'designation' | 'ean' | 'prix_achat' | 'prix_vente' | 'stock' | 'peremption' | 'fournisseur';

export interface FieldDef {
  key: JungleField;
  label: string;
  required: boolean;
  hint: string;
  aliases: string[];
}

export const JUNGLE_FIELDS: FieldDef[] = [
  { key: 'designation',  label: 'Désignation',    required: true,  hint: 'Nom du produit',         aliases: ['designation','désignation','nom','produit','libelle','libellé','article','name','description'] },
  { key: 'ean',          label: 'Code EAN',        required: false, hint: 'Code-barres EAN/GTIN',   aliases: ['ean','code barre','code-barre','codebarre','code_barre','barcode','gencod','gencode','cip','gtin','code produit','code_produit'] },
  { key: 'prix_achat',   label: 'Prix Achat',      required: false, hint: 'Prix de cession (gros)', aliases: ['prix achat','prix_achat','achat','cession','prix cession','prixcession','pa','cost','wholesale','prix gros','pamp'] },
  { key: 'prix_vente',   label: 'Prix Vente',      required: true,  hint: 'Prix public',            aliases: ['prix vente','prix_vente','vente','public','prix public','prixpublic','pv','ppc','price','prix','tarif','pu'] },
  { key: 'stock',        label: 'Stock initial',   required: false, hint: 'Quantité en stock',      aliases: ['stock','quantite','quantité','qte','qty','quantity','nombre','nb','dispo'] },
  { key: 'peremption',   label: 'Date péremption', required: false, hint: "Date d'expiration (JJ/MM/AAAA ou MM/AAAA)", aliases: ['peremption','péremption','expiration','expiry','exp','date exp','date_exp','dlc','dluo','echeance','échéance','date peremption','date péremption'] },
  { key: 'fournisseur',  label: 'Fournisseur',     required: false, hint: 'Nom du fournisseur',     aliases: ['fournisseur','supplier','fabricant','laboratoire','labo','marque','brand','fabricant'] },
];

export type Mapping = Partial<Record<JungleField, number>>;

export interface ParsedFile {
  headers: string[];
  rows: string[][];
  fileName: string;
  totalRows: number;
  /** Noms des feuilles (Excel multi-feuilles) */
  sheets?: string[];
  /** Feuille actuellement sélectionnée */
  selectedSheetIndex?: number;
}

export interface NormalizedRow {
  name: string;
  ean: string;
  /** Tous les codes-barres liés à ce produit : EAN principal + alias issus des colonnes supplémentaires */
  allBarcodes: string[];
  buyingPrice: number;
  sellingPrice: number;
  stock: number;
  expiry: string | null;
  supplier: string;
  _rowIndex: number;
  _errors: string[];        // champs critiques manquants → bloque l'import
  _warnings: string[];      // champs optionnels manquants ou suspects → avertissement
  _quality: 'clean' | 'no_ean' | 'no_expiry' | 'degraded'; // niveau qualité pour le rapport
  _requiresBarcodeConfig: boolean; // produit sans EAN → étiquette "Config douchette requise"
}

// ── Rapport de qualité pré-import ─────────────────────────────────────────────
export interface ValidationReport {
  total: number;
  valid: number;           // lignes sans erreur critique
  blocked: number;         // lignes avec erreur critique (ne seront pas importées)
  noEan: number;           // valides mais sans EAN → douchette non utilisable
  noExpiry: number;        // valides mais sans date péremption
  noPrice: number;         // prix manquant (critique)
  noName: number;          // désignation manquante (critique)
  noSupplier: number;      // sans fournisseur (mineur)
  clean: number;           // lignes complètes sans avertissement
  warnings: number;        // lignes avec avertissement non bloquant
}

export function buildValidationReport(rows: NormalizedRow[]): ValidationReport {
  let valid = 0, blocked = 0, noEan = 0, noExpiry = 0, noPrice = 0, noName = 0, noSupplier = 0, clean = 0, warnings = 0;
  for (const r of rows) {
    if (r._errors.length > 0) { blocked++; continue; }
    valid++;
    if (!r.ean)              noEan++;
    if (!r.expiry)           noExpiry++;
    if (!r.buyingPrice)      { /* non bloquant */ }
    if (!r.supplier)         noSupplier++;
    if (r._warnings.length > 0 || !r.ean || !r.expiry) warnings++;
    else                     clean++;
    // décompte des erreurs critiques (si forceImport = true, ces lignes n'ont pas _errors)
    r._errors.forEach(e => { if (e.includes('Prix')) noPrice++; if (e.includes('Désignation')) noName++; });
  }
  // Décompter aussi les blocked par type
  for (const r of rows.filter(r => r._errors.length > 0)) {
    r._errors.forEach(e => { if (e.includes('Prix')) noPrice++; if (e.includes('Désignation')) noName++; });
  }
  return { total: rows.length, valid, blocked, noEan, noExpiry, noPrice, noName, noSupplier, clean, warnings };
}

export interface ImportStats {
  created: number;
  updated: number;
  errors: number;
  unitsCreated: number;
  errorDetails: string[];
  pricesUpdated?: number; // mode prices_only
}

export type ImportMode = 'install' | 'delivery' | 'prices_only';
export type ProgressCallback = (current: number, total: number, message: string) => void;

// ── Profils de mapping par fournisseur ────────────────────────────────────────
export interface MappingProfile {
  id: string;
  name: string;
  headers: string[];
  mapping: Mapping;
}

const PROFILES_KEY = 'jp_import_profiles_v1';

export function loadMappingProfiles(): MappingProfile[] {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]') as MappingProfile[]; }
  catch { return []; }
}

export function saveMappingProfile(name: string, headers: string[], mapping: Mapping): void {
  try {
    const profiles = loadMappingProfiles().filter(p => p.name !== name);
    profiles.unshift({ id: `${Date.now()}`, name, headers, mapping });
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles.slice(0, 20)));
  } catch { /* ignore */ }
}

export function deleteMappingProfile(id: string): void {
  try {
    const profiles = loadMappingProfiles().filter(p => p.id !== id);
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch { /* ignore */ }
}

export function findMatchingProfile(headers: string[]): MappingProfile | null {
  const profiles = loadMappingProfiles();
  for (const p of profiles) {
    if (p.headers.length !== headers.length) continue;
    const match = p.headers.every((h, i) => normalizeHeader(h) === normalizeHeader(headers[i]));
    if (match) return p;
  }
  return null;
}

// ── Historique des imports ─────────────────────────────────────────────────────
export interface ImportHistoryEntry {
  id: string;
  date: string;
  fileName: string;
  mode: string;
  stats: ImportStats;
}

const HISTORY_KEY = 'jp_import_history_v1';

export function getImportHistory(): ImportHistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as ImportHistoryEntry[]; }
  catch { return []; }
}

export function addToImportHistory(entry: Omit<ImportHistoryEntry, 'id'>): void {
  try {
    const history = getImportHistory();
    history.unshift({ ...entry, id: `${Date.now()}` });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
  } catch { /* ignore */ }
}

// ── Legacy single-mapping persistence ────────────────────────────────────────
const MAPPING_KEY = 'jp_import_mapping_v1';

export function saveMapping(headers: string[], mapping: Mapping): void {
  try { localStorage.setItem(MAPPING_KEY, JSON.stringify({ headers, mapping })); } catch { /* ignore */ }
}

export function loadSavedMapping(headers: string[]): Mapping | null {
  try {
    const raw = localStorage.getItem(MAPPING_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { headers: string[]; mapping: Mapping };
    const same = saved.headers.length === headers.length &&
      saved.headers.every((h, i) => normalizeHeader(h) === normalizeHeader(headers[i]));
    return same ? saved.mapping : null;
  } catch { return null; }
}

// ════════════════════════════════════════════════════════════════════════════
//  1. TEMPLATE EXCEL TÉLÉCHARGEABLE
// ════════════════════════════════════════════════════════════════════════════
export function downloadTemplate(): void {
  const headers = ['Désignation', 'Code EAN', 'Prix Achat (FCFA)', 'Prix Vente (FCFA)', 'Stock initial', 'Date Péremption'];
  const examples = [
    ['DOLIPRANE 1000MG', '3400930000000', '1800', '2500', '15', '05/2027'],
    ['EFFERALGAN 500MG', '3400935555555', '1200', '1800', '8',  '31/12/2026'],
    ['AMOXICILLINE 500MG', '', '1500', '2200', '12', ''],
  ];
  const wsData = [headers, ...examples];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Largeurs colonnes
  ws['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 18 }];

  // Style en-tête (gras + fond vert) — SheetJS free ne supporte pas les styles XLSX, on utilise CSV
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Catalogue');

  // Deuxième feuille avec guide
  const guide = [
    ['GUIDE D\'UTILISATION'],
    [''],
    ['Colonne', 'Description', 'Obligatoire'],
    ['Désignation', 'Nom complet du produit', 'OUI'],
    ['Code EAN', 'Code-barres EAN-13 (si disponible)', 'Non'],
    ['Prix Achat', 'Prix de cession grossiste en FCFA', 'Non'],
    ['Prix Vente', 'Prix public en FCFA', 'OUI'],
    ['Stock initial', 'Quantité en stock (nombre entier)', 'Non'],
    ['Date Péremption', 'Format : MM/AAAA ou JJ/MM/AAAA', 'Non'],
    [''],
    ['Formats acceptés', 'CSV (séparateur virgule ou point-virgule), Excel .xlsx ou .xls', ''],
    ['Encodage CSV', 'UTF-8 recommandé pour les accents', ''],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide['!cols'] = [{ wch: 20 }, { wch: 50 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Guide');

  XLSX.writeFile(wb, 'JunglePharm_Modele_Import.xlsx');
}

// ════════════════════════════════════════════════════════════════════════════
//  2. PARSING LOCAL (CSV + Excel multi-feuilles)
// ════════════════════════════════════════════════════════════════════════════
export async function parseFile(file: File): Promise<ParsedFile> {
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);
  return isExcel ? parseExcelFile(file, 0) : parseCsvFile(file);
}

export async function parseFileWithSheet(file: File, sheetIndex: number): Promise<ParsedFile> {
  return parseExcelFile(file, sheetIndex);
}

async function parseCsvFile(file: File): Promise<ParsedFile> {
  const rawMatrix = await parseCsvRaw(file);
  return buildParsedFile(rawMatrix, file.name, undefined, undefined);
}

async function parseExcelFile(file: File, sheetIndex: number): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const sheetNames = wb.SheetNames;
  const idx = Math.max(0, Math.min(sheetIndex, sheetNames.length - 1));
  const sheet = wb.Sheets[sheetNames[idx]];
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false }) as string[][];
  return buildParsedFile(matrix, file.name, sheetNames, idx);
}

function buildParsedFile(
  rawMatrix: string[][],
  fileName: string,
  sheets?: string[],
  selectedSheetIndex?: number,
): ParsedFile {
  const matrix = rawMatrix.filter(r => r.some(c => String(c ?? '').trim() !== ''));
  if (matrix.length === 0) return { headers: [], rows: [], fileName, totalRows: 0, sheets, selectedSheetIndex };

  const firstRow = matrix[0].map(c => String(c ?? '').trim());
  const looksLikeHeader = firstRow.filter(c => c && isNaN(Number(c.replace(/[\s,]/g, '')))).length >= Math.ceil(firstRow.length / 2);
  let headers: string[], rows: string[][];
  if (looksLikeHeader) {
    headers = firstRow.map((c, i) => c || `Colonne ${i + 1}`);
    rows = matrix.slice(1).map(r => r.map(c => String(c ?? '')));
  } else {
    const colCount = Math.max(...matrix.map(r => r.length));
    headers = Array.from({ length: colCount }, (_, i) => `Colonne ${i + 1}`);
    rows = matrix.map(r => r.map(c => String(c ?? '')));
  }
  return { headers, rows, fileName, totalRows: rows.length, sheets, selectedSheetIndex };
}

function parseCsvRaw(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      delimiter: '', skipEmptyLines: 'greedy',
      complete: res => resolve(res.data as string[][]),
      error: err => reject(err),
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  3. AUTO-DÉTECTION DU MAPPING
// ════════════════════════════════════════════════════════════════════════════
function normalizeHeader(h: string): string {
  return h.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function autoDetectMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<number>();
  for (const field of JUNGLE_FIELDS) {
    let bestIdx = -1, bestScore = 0;
    headers.forEach((h, idx) => {
      if (used.has(idx)) return;
      const nh = normalizeHeader(h);
      for (const alias of field.aliases) {
        const na = normalizeHeader(alias);
        let score = 0;
        if (nh === na) score = 100;
        else if (nh.includes(na) || na.includes(nh)) score = 60;
        if (score > bestScore) { bestScore = score; bestIdx = idx; }
      }
    });
    if (bestIdx >= 0 && bestScore >= 60) { mapping[field.key] = bestIdx; used.add(bestIdx); }
  }
  return mapping;
}

// ════════════════════════════════════════════════════════════════════════════
//  4. NOMBRES & DATES
// ════════════════════════════════════════════════════════════════════════════
export function parseNumber(raw: string): number {
  if (!raw) return 0;
  let s = String(raw).trim().replace(/[^\d.,\s-]/g, '').replace(/\s/g, '');
  if (!s) return 0;
  const hasComma = s.includes(','), hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    const p = s.split(',');
    if (p.length === 2 && p[1].length <= 2) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasDot) {
    const p = s.split('.');
    if (!(p.length === 2 && p[1].length <= 2)) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const MONTHS_FR: Record<string, string> = {
  jan:'01',fév:'02',feb:'02',mar:'03',avr:'04',apr:'04',mai:'05',may:'05',
  jun:'06',jui:'06',jul:'07',aou:'08',aug:'08',sep:'09',oct:'10',nov:'11',déc:'12',dec:'12',
};

export function parseDate(raw: string): string | null {
  if (!raw && raw !== 0 as unknown as string) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // ── ISO YYYY-MM-DD (déjà bon) ─────────────────────────────────────────
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // ── Serial Excel (ex: 45320) ──────────────────────────────────────────
  if (/^\d{4,6}$/.test(s)) {
    const serial = parseInt(s, 10);
    if (serial > 20000 && serial < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return d.toISOString().slice(0, 10);
    }
  }

  // ── DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY ───────────────────────────
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = (parseInt(y, 10) > 50 ? '19' : '20') + y;
    const mNum = parseInt(m, 10), dNum = parseInt(d, 10);
    // Détection ambiguïté MM/DD : si mNum > 12 → c'est DD/MM
    if (mNum > 12 && dNum <= 12) return `${y}-${d.padStart(2,'0')}-${m.padStart(2,'0')}`;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // ── MM/YYYY ou MM-YYYY (ex: 06/2026) ─────────────────────────────────
  const my = s.match(/^(\d{1,2})[/\-.](\d{4})$/);
  if (my) {
    const [, m, y] = my;
    const last = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
    return `${y}-${m.padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  }

  // ── YYYY/MM ou YYYY-MM (ex: 2026-06) ─────────────────────────────────
  const ym = s.match(/^(\d{4})[/\-](\d{1,2})$/);
  if (ym) {
    const [, y, m] = ym;
    const last = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
    return `${y}-${m.padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  }

  // ── "jan 2026" / "06 jan 26" / "janv. 2026" ──────────────────────────
  const textMonth = s.toLowerCase().match(/(\d{1,2})?\s*([a-zéûôèàâ]{3,5})\.?\s*(\d{2,4})/);
  if (textMonth) {
    const [, d, mStr, yRaw] = textMonth;
    const mNum = MONTHS_FR[mStr.slice(0, 3)];
    if (mNum) {
      const y = yRaw.length === 2 ? '20' + yRaw : yRaw;
      const day = d ? d.padStart(2,'0') : String(new Date(parseInt(y), parseInt(mNum), 0).getDate()).padStart(2,'0');
      return `${y}-${mNum}-${day}`;
    }
  }

  // ── MM/YY avec 2 chiffres (ex: 12/26) ────────────────────────────────
  const myShort = s.match(/^(\d{1,2})[/\-](\d{2})$/);
  if (myShort) {
    const [, m, yy] = myShort;
    const y = '20' + yy;
    const last = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
    return `${y}-${m.padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  5. VALIDATION EAN
// ════════════════════════════════════════════════════════════════════════════
export function validateEan(ean: string): boolean {
  if (!ean) return true; // vide = pas d'erreur
  const digits = ean.replace(/\D/g, '');
  if (digits.length !== 8 && digits.length !== 12 && digits.length !== 13) return false;
  // Checksum Luhn modifié (EAN)
  let sum = 0;
  for (let i = 0; i < digits.length - 1; i++) {
    const d = parseInt(digits[i], 10);
    sum += i % 2 === (digits.length === 8 ? 0 : 1) ? d * 3 : d;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(digits[digits.length - 1], 10);
}

// ════════════════════════════════════════════════════════════════════════════
//  6. TRANSFORMATION + VALIDATION
// ════════════════════════════════════════════════════════════════════════════
/**
 * @param extraBarcodeCols Indices de colonnes supplémentaires dont les valeurs
 *   seront toutes ajoutées comme alias de codes-barres pour le produit.
 *   Le système est agnostique : peu importe le format (EAN, CIP, code interne…),
 *   tout code atterrit dans la table `barcodes` et devient scannable.
 */
export function applyMapping(parsed: ParsedFile, mapping: Mapping, extraBarcodeCols: number[] = []): NormalizedRow[] {
  const get = (row: string[], field: JungleField): string => {
    const idx = mapping[field];
    return idx === undefined ? '' : String(row[idx] ?? '').trim();
  };

  return parsed.rows.map((row, i) => {
    const name = get(row, 'designation');
    const sellingPrice = parseNumber(get(row, 'prix_vente'));
    const buyingPrice  = parseNumber(get(row, 'prix_achat'));
    const stockRaw = get(row, 'stock');
    const stock = stockRaw ? Math.max(0, Math.round(parseNumber(stockRaw))) : 1;
    const expiry    = parseDate(get(row, 'peremption'));
    const supplier  = get(row, 'fournisseur') || '';
    const eanRaw = get(row, 'ean');

    // ── Tous les codes-barres : EAN principal + colonnes alias ───────────────
    const extraCodes = extraBarcodeCols
      .map(idx => String(row[idx] ?? '').trim())
      .filter(Boolean);
    const allBarcodes = [...new Set([eanRaw, ...extraCodes].filter(Boolean))];

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!name) errors.push('Désignation manquante');
    if (sellingPrice <= 0) errors.push('Prix de vente manquant ou invalide');

    // ── Avertissements non bloquants ──────────────────────────────────────────
    if (eanRaw && !validateEan(eanRaw)) warnings.push(`EAN "${eanRaw}" invalide (checksum incorrect)`);
    if (buyingPrice > 0 && sellingPrice > 0 && buyingPrice > sellingPrice) warnings.push('Prix achat > prix vente');
    if (!expiry && errors.length === 0)  warnings.push('Date de péremption manquante');
    if (!supplier && errors.length === 0) warnings.push('Fournisseur non renseigné');

    // ── Niveau qualité ────────────────────────────────────────────────────────
    const requiresBarcodeConfig = errors.length === 0 && allBarcodes.length === 0;
    let quality: NormalizedRow['_quality'] = 'clean';
    if (errors.length === 0) {
      if (allBarcodes.length === 0 && !expiry) quality = 'degraded';
      else if (allBarcodes.length === 0)       quality = 'no_ean';
      else if (!expiry)                        quality = 'no_expiry';
      else                                     quality = 'clean';
    }

    return {
      name: name || 'Produit sans nom', ean: eanRaw, allBarcodes, buyingPrice, sellingPrice,
      stock, expiry, supplier, _rowIndex: i, _errors: errors, _warnings: warnings,
      _quality: quality, _requiresBarcodeConfig: requiresBarcodeConfig,
    };
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  6b. DÉTECTION AUTOMATIQUE DU MODE DE GESTION
// ════════════════════════════════════════════════════════════════════════════
export interface ModeDetectionResult {
  mode: 'unit' | 'global';
  confidence: number;          // 0–1
  /** Produit exemple avec plusieurs unités (pour la carte de confirmation) */
  example: { name: string; barcodes: string[]; count: number } | null;
  unitRatio: number;           // part des lignes à QTE=1
  multiBarcode: number;        // nb de produits ayant des EAN distincts
}

/**
 * Analyse les lignes normalisées du fichier et détermine si le pharmacien
 * travaille en mode Unitaire ou Global.
 *
 * Mode unitaire = QTE=1 sur ≥90 % des lignes ET même produit répété avec
 *                des EAN différents (= chaque ligne = 1 boîte physique).
 * Mode global   = QTE > 1 ou produits uniques (1 ligne = N boîtes).
 */
export function detectInventoryMode(rows: NormalizedRow[]): ModeDetectionResult {
  const valid = rows.filter(r => r._errors.length === 0 && r.name);
  if (valid.length < 5) return { mode: 'global', confidence: 0.5, example: null, unitRatio: 0, multiBarcode: 0 };

  // Signal 1 : proportion de lignes avec stock = 1
  const qty1 = valid.filter(r => r.stock === 1).length;
  const unitRatio = qty1 / valid.length;

  // Grouper par nom normalisé
  const byName = new Map<string, NormalizedRow[]>();
  for (const r of valid) {
    const key = r.name.toLowerCase().trim();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(r);
  }

  // Signal 2 : produits avec 2+ codes-barres distincts
  // ⚠️ On utilise allBarcodes (inclut EAN principal + colonnes alias)
  // pour être robuste même si l'EAN principal n'est pas mappé
  const multiEanGroups = Array.from(byName.entries()).filter(([, grp]) => {
    const barcodes = new Set([
      ...grp.map(r => r.ean),
      ...grp.flatMap(r => r.allBarcodes ?? []),
    ].filter(Boolean));
    return barcodes.size >= 2;
  });
  const multiBarcode = multiEanGroups.length;

  // Signal 3 : rapport lignes / noms uniques (mode unitaire = beaucoup de lignes, peu de noms)
  const linePerProduct = valid.length / byName.size;

  // DÉTECTION UNITAIRE — 3 signaux possibles :
  //  A) Signal fort : 88%+ qty=1 ET au moins 1 produit multi-codes (cas classique)
  //  B) Signal moyen : 95%+ qty=1 ET ratio > 1.3 lignes/produit (fichier unitaire sans EAN mappé)
  //  C) Signal fort pur ratio : 95%+ qty=1 ET fichier ≥ 20 lignes (inventaire boîte par boîte)
  const isUnit =
    (unitRatio >= 0.88 && multiBarcode >= 1) ||
    (unitRatio >= 0.95 && linePerProduct >= 1.3 && valid.length >= 10) ||
    (unitRatio >= 0.95 && valid.length >= 20);

  if (isUnit) {
    // Meilleur exemple : produit avec le plus de lignes parmi ceux avec multi-codes,
    // sinon tout groupe de 2+ lignes, sinon le premier groupe
    const rankedGroups = multiEanGroups.length > 0
      ? [...multiEanGroups].sort((a, b) => b[1].length - a[1].length)
      : Array.from(byName.entries()).filter(([, g]) => g.length >= 2).sort((a, b) => b[1].length - a[1].length);
    const best = (rankedGroups[0] ?? Array.from(byName.entries()).sort((a, b) => b[1].length - a[1].length)[0]);

    const barcodes = best
      ? [...new Set([
          ...best[1].map(r => r.ean),
          ...best[1].flatMap(r => r.allBarcodes ?? []),
        ].filter(Boolean))].slice(0, 3)
      : [];

    return {
      mode: 'unit',
      confidence: Math.min(0.98, 0.75 + (unitRatio - 0.88) * 2.0 + Math.min(multiBarcode, 50) / 100),
      example: best ? { name: best[0], barcodes, count: best[1].length } : null,
      unitRatio,
      multiBarcode,
    };
  }

  return { mode: 'global', confidence: 0.85, example: null, unitRatio, multiBarcode };
}

// ════════════════════════════════════════════════════════════════════════════
//  7. DÉTECTION DE CONFLITS (produits similaires déjà en base)
// ════════════════════════════════════════════════════════════════════════════
export interface Conflict {
  rowIndex: number;
  rowName: string;
  existingId: string;
  existingName: string;
  score: number;
  matchType: 'ean_match' | 'name_similar';
}

function tokenize(s: string): string[] {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
}

function similarity(a: string, b: string): number {
  const ta = new Set(tokenize(a)), tb = new Set(tokenize(b));
  let common = 0;
  ta.forEach(t => { if (tb.has(t)) common++; });
  return common / Math.max(ta.size, tb.size, 1);
}

export async function detectConflicts(rows: NormalizedRow[]): Promise<Conflict[]> {
  try {
    const { data: meds } = await supabase.from('medications').select('id, name, code_produit');
    if (!meds?.length) return [];

    const { data: barcodes } = await supabase.from('barcodes').select('barcode, medication_id');
    const eanToMedId = new Map<string, string>();
    for (const b of barcodes || []) eanToMedId.set(b.barcode, b.medication_id);

    const conflicts: Conflict[] = [];
    const THRESHOLD = 0.6;

    for (const row of rows) {
      if (row._errors.length > 0) continue;

      // Correspondance EAN exacte
      if (row.ean && eanToMedId.has(row.ean)) {
        const med = meds.find(m => m.id === eanToMedId.get(row.ean));
        if (med && med.name.toLowerCase() !== row.name.toLowerCase()) {
          conflicts.push({ rowIndex: row._rowIndex, rowName: row.name, existingId: med.id, existingName: med.name, score: 1, matchType: 'ean_match' });
        }
        continue; // EAN match = le système sait gérer, pas un vrai conflit
      }

      // Similarité de nom
      for (const med of meds) {
        const s = similarity(row.name, med.name);
        if (s >= THRESHOLD && s < 1 && med.name.toLowerCase() !== row.name.toLowerCase()) {
          conflicts.push({ rowIndex: row._rowIndex, rowName: row.name, existingId: med.id, existingName: med.name, score: s, matchType: 'name_similar' });
          break; // un seul conflit par ligne
        }
      }
    }
    return conflicts;
  } catch {
    return [];
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  8. DISPATCH IMPORT
// ════════════════════════════════════════════════════════════════════════════
export async function importData(
  rows: NormalizedRow[],
  mode: ImportMode,
  onProgress: ProgressCallback,
  forceInvalidRows = false,   // si true, importe aussi les lignes avec _errors (choix utilisateur)
): Promise<ImportStats> {
  // Filtre les lignes valides ; si forceInvalidRows, on passe les erreurs critiques
  const valid = forceInvalidRows ? rows : rows.filter(r => r._errors.length === 0);
  if (mode === 'install')     return installImport(valid, onProgress);
  if (mode === 'prices_only') return pricesOnlyImport(valid, onProgress);
  return deliveryImport(valid, onProgress);
}

// ════════════════════════════════════════════════════════════════════════════
//  9. MODE INSTALLATION — remplace tout le catalogue
// ════════════════════════════════════════════════════════════════════════════
async function installImport(rows: NormalizedRow[], onProgress: ProgressCallback): Promise<ImportStats> {
  const stats: ImportStats = { created: 0, updated: 0, errors: 0, unitsCreated: 0, errorDetails: [] };
  const unitMode = isUnitMode();
  if (!rows.length) { stats.errorDetails.push('Aucune ligne valide'); return stats; }

  onProgress(0, rows.length, 'Suppression des données existantes…');
  for (const [table, col, sentinel] of [
    ['inventory_units', 'id',      '00000000-0000-0000-0000-000000000000'],
    ['barcodes',        'barcode', '___DUMMY___'],
    ['medications',     'id',      '00000000-0000-0000-0000-000000000000'],
  ] as [string, string, string][]) {
    try { await supabase.from(table).delete().neq(col, sentinel); } catch { /* ignore */ }
  }
  try { await db.products.clear(); await db.barcodeLinks.clear(); } catch { /* ignore */ }

  onProgress(0, rows.length, 'Regroupement des produits…');
  const groups = groupByName(rows);
  const receptionBatch = `INSTALL-${Date.now()}`;
  const createdByName = new Map<string, string>();

  // ── Insertion produits par GROS batchs (500 vs 50 avant) ─────────────────
  // Performance × 10 : 10 round-trips pour 5000 produits au lieu de 100.
  const BATCH = 500;
  const allBarcodesToLink: Array<{ barcode: string; medication_id: string }> = [];

  for (let i = 0; i < groups.length; i += BATCH) {
    const slice = groups.slice(i, i + BATCH);
    onProgress(i, groups.length, `Insertion ${i + slice.length}/${groups.length}…`);

    const payload = slice.map(g => ({
      name: g.name, dosage: '',
      quantity: unitMode ? 0 : g.totalStock,
      price: g.sellingPrice, wholesale_price: g.buyingPrice,
      min_stock: 0, batch_number: receptionBatch,
      expiry_date: g.latestExpiry || null, supplier: g.supplier || null,
    }));
    const { data: inserted, error } = await insertMedications(payload, 'id, name');

    if (error || !inserted) {
      // Fallback : retry par paquets plus petits (100 au lieu de 1 par 1)
      const SMALL = 100;
      for (let j = 0; j < slice.length; j += SMALL) {
        const sub = slice.slice(j, j + SMALL);
        const subPayload = sub.map(g => ({
          name: g.name, dosage: '', quantity: unitMode ? 0 : g.totalStock,
          price: g.sellingPrice, wholesale_price: g.buyingPrice,
          min_stock: 0, batch_number: receptionBatch,
          expiry_date: g.latestExpiry || null, supplier: g.supplier || null,
        }));
        const { data: arr, error: e1 } = await insertMedications(subPayload, 'id, name');
        if (e1) {
          stats.errors += sub.length;
          if (stats.errorDetails.length < 10) stats.errorDetails.push(`Batch fallback "${sub[0].name.slice(0, 30)}": ${e1.message}`);
        } else if (arr) {
          const rows2 = arr as unknown as { id: string; name: string }[];
          stats.created += rows2.length;
          for (let k = 0; k < rows2.length; k++) {
            createdByName.set(sub[k].key, rows2[k].id);
            for (const bc of sub[k].barcodes) {
              if (bc) allBarcodesToLink.push({ barcode: bc, medication_id: rows2[k].id });
            }
          }
        }
      }
    } else {
      const rows2 = inserted as unknown as { id: string; name: string }[];
      stats.created += rows2.length;
      for (let j = 0; j < rows2.length; j++) {
        createdByName.set(slice[j].key, rows2[j].id);
        for (const bc of slice[j].barcodes) {
          if (bc) allBarcodesToLink.push({ barcode: bc, medication_id: rows2[j].id });
        }
      }
    }
  }

  // ── Insertion BULK des codes-barres en 1-3 requêtes ──────────────────────
  if (allBarcodesToLink.length > 0) {
    onProgress(groups.length, groups.length, `Liaison de ${allBarcodesToLink.length} codes-barres…`);
    await linkBarcodesBulk(allBarcodesToLink);
  }

  if (unitMode) await createUnitsForRows(rows, createdByName, receptionBatch, 0, stats, onProgress);

  onProgress(rows.length, rows.length, 'Synchronisation…');
  await syncLocal(true); // forceReplaceLocal = true (mode remplacer tout)
  return stats;
}

// ════════════════════════════════════════════════════════════════════════════
//  10. MODE LIVRAISON — ajoute au catalogue existant
// ════════════════════════════════════════════════════════════════════════════
async function deliveryImport(rows: NormalizedRow[], onProgress: ProgressCallback): Promise<ImportStats> {
  const stats: ImportStats = { created: 0, updated: 0, errors: 0, unitsCreated: 0, errorDetails: [] };
  const unitMode = isUnitMode();
  if (!rows.length) { stats.errorDetails.push('Aucune ligne valide'); return stats; }

  let counter = unitMode ? await nextUnitCounter() : 0;
  onProgress(0, rows.length, 'Chargement du catalogue…');

  // ── Filtrer par user_id pour ne récupérer QUE les données du user courant
  const importUserId = await getCurrentUserId();
  const { data: allBarcodes } = await supabase.from('barcodes').select('barcode, medication_id').eq('user_id', importUserId);
  const barcodeIndex = new Map<string, string>();
  for (const b of allBarcodes || []) barcodeIndex.set(b.barcode, b.medication_id);

  const { data: allMeds } = await supabase.from('medications').select('id, name, quantity').eq('user_id', importUserId);
  const medByName = new Map<string, { id: string; quantity: number }>();
  const medById   = new Map<string, { id: string; name: string; quantity: number }>();
  for (const m of allMeds || []) { medById.set(m.id, m); if (!medByName.has(m.name.toLowerCase().trim())) medByName.set(m.name.toLowerCase().trim(), m); }

  const receptionBatch = `REC-${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];
  const units: UnitInsert[] = [];
  const qtyAdd = new Map<string, number>();
  const newBarcodes: Array<{ barcode: string; medication_id: string }> = [];
  const rowsToCreate: Array<{ row: NormalizedRow; addQty: number }> = [];

  // ── PASSE 1 : tri en mémoire entre "à créer" vs "à mettre à jour" ────────
  onProgress(0, rows.length, 'Analyse des produits…');
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i % 500 === 0) onProgress(i, rows.length, `Analyse ${i}/${rows.length}…`);
    const addQty = unitMode ? 1 : row.stock;

    let medId: string | null = null;
    if (row.ean && barcodeIndex.has(row.ean)) medId = barcodeIndex.get(row.ean)!;
    if (!medId) { const m = medByName.get(row.name.toLowerCase().trim()); if (m) medId = m.id; }

    if (medId) {
      // Produit connu : on accumule en mémoire
      qtyAdd.set(medId, (qtyAdd.get(medId) || 0) + addQty);
      stats.updated++;
      // Lier tous les alias barcodes du produit existant
      for (const bc of row.allBarcodes) {
        if (bc && !barcodeIndex.has(bc)) {
          newBarcodes.push({ barcode: bc, medication_id: medId });
          barcodeIndex.set(bc, medId);
        }
      }
      if (unitMode) units.push(mkUnit(unitCode(++counter), medId, row, today, receptionBatch));
    } else {
      // Produit nouveau : on prépare pour insertion bulk
      rowsToCreate.push({ row, addQty });
    }
  }

  // ── PASSE 2 : INSERT bulk des nouveaux produits (groupés par nom) ───────────
  // ⚠️ CRITIQUE : sans regroupement, chaque ligne du fichier génère un médicament
  // distinct → ex. 14 lignes "DOLIPRANE" → 14 médicaments avec qty=1 chacun.
  // On regroupe par nom normalisé : 1 insertion par produit unique, tous les EAN
  // et unités du groupe sont rattachés à ce seul médicament.
  if (rowsToCreate.length > 0) {
    // Grouper les lignes par nom normalisé
    const newByName = new Map<string, { baseRow: NormalizedRow; totalQty: number; allRows: NormalizedRow[] }>();
    for (const { row, addQty } of rowsToCreate) {
      const key = row.name.toLowerCase().trim();
      if (!newByName.has(key)) {
        newByName.set(key, { baseRow: row, totalQty: 0, allRows: [] });
      }
      const g = newByName.get(key)!;
      g.totalQty += addQty;
      g.allRows.push(row);
    }
    const groupedNew = Array.from(newByName.values());

    const BATCH = 500;
    onProgress(0, groupedNew.length, `Création de ${groupedNew.length} produit${groupedNew.length > 1 ? 's' : ''} unique${groupedNew.length > 1 ? 's' : ''}…`);
    for (let i = 0; i < groupedNew.length; i += BATCH) {
      const slice = groupedNew.slice(i, i + BATCH);
      onProgress(i, groupedNew.length, `Nouveaux ${i + slice.length}/${groupedNew.length}…`);

      const payload = slice.map(({ baseRow, totalQty }) => ({
        name: baseRow.name, dosage: '',
        quantity: unitMode ? 0 : totalQty,           // en mode unité, qty=0 → géré par inventory_units
        price: baseRow.sellingPrice, wholesale_price: baseRow.buyingPrice,
        min_stock: 0, batch_number: receptionBatch,
        expiry_date: baseRow.expiry || null, supplier: baseRow.supplier || null,
      }));
      const { data: inserted, error } = await insertMedications(payload, 'id, name, quantity');

      if (error || !inserted) {
        stats.errors += slice.length;
        if (stats.errorDetails.length < 10) stats.errorDetails.push(`Batch création: ${error?.message}`);
        continue;
      }
      const rows2 = inserted as unknown as { id: string; name: string; quantity: number }[];
      stats.created += rows2.length;

      for (let j = 0; j < rows2.length; j++) {
        const created = rows2[j];
        const { allRows } = slice[j];
        medById.set(created.id, created);
        medByName.set(created.name.toLowerCase().trim(), created);

        // Lier TOUS les codes-barres (EAN + alias) du groupe à ce médicament unique
        for (const r of allRows) {
          for (const bc of r.allBarcodes) {
            if (bc && !barcodeIndex.has(bc)) {
              newBarcodes.push({ barcode: bc, medication_id: created.id });
              barcodeIndex.set(bc, created.id);
            }
          }
        }

        // Mode unitaire : créer une unité physique par ligne originale du groupe
        if (unitMode) {
          qtyAdd.set(created.id, allRows.length);
          for (const r of allRows) {
            units.push(mkUnit(unitCode(++counter), created.id, r, today, receptionBatch));
          }
        }
      }
    }
  }

  // ── PASSE 3 : Codes-barres en BULK ───────────────────────────────────────
  if (newBarcodes.length > 0) {
    onProgress(0, newBarcodes.length, `Liaison de ${newBarcodes.length} codes-barres…`);
    await linkBarcodesBulk(newBarcodes);
  }

  // ── PASSE 4 : Unités en BULK ─────────────────────────────────────────────
  if (unitMode && units.length) {
    onProgress(0, units.length, `Création de ${units.length} unités…`);
    const userId = await getCurrentUserId();
    const UB = 500; // 2.5× plus gros qu'avant
    for (let i = 0; i < units.length; i += UB) {
      const b = units.slice(i, i + UB).map(u => ({ ...u, user_id: userId }));
      const { error } = await supabase.from('inventory_units').insert(b);
      if (!error) stats.unitsCreated += b.length;
    }
  }

  // ── PASSE 5 : Updates des quantités EN PARALLÈLE ────────────────────────
  if (qtyAdd.size > 0) {
    onProgress(0, qtyAdd.size, `Mise à jour de ${qtyAdd.size} quantités…`);
    const qtyUpdates: Array<{ id: string; quantity: number }> = [];
    for (const [medId, add] of qtyAdd) {
      const m = medById.get(medId);
      if (m) qtyUpdates.push({ id: medId, quantity: m.quantity + add });
    }
    await bulkUpdateQuantities(qtyUpdates);
  }

  onProgress(rows.length, rows.length, 'Synchronisation…');
  await syncLocal();
  return stats;
}

// ════════════════════════════════════════════════════════════════════════════
//  11. MODE PRIX UNIQUEMENT — met à jour prix sans toucher au stock
// ════════════════════════════════════════════════════════════════════════════
async function pricesOnlyImport(rows: NormalizedRow[], onProgress: ProgressCallback): Promise<ImportStats> {
  const stats: ImportStats = { created: 0, updated: 0, errors: 0, unitsCreated: 0, errorDetails: [], pricesUpdated: 0 };
  if (!rows.length) { stats.errorDetails.push('Aucune ligne valide'); return stats; }

  onProgress(0, rows.length, 'Chargement du catalogue…');

  // ── Filtrer par user_id (isolation des comptes)
  const pricesUserId = await getCurrentUserId();
  const { data: allBarcodes } = await supabase.from('barcodes').select('barcode, medication_id').eq('user_id', pricesUserId);
  const barcodeIndex = new Map<string, string>();
  for (const b of allBarcodes || []) barcodeIndex.set(b.barcode, b.medication_id);

  const { data: allMeds } = await supabase.from('medications').select('id, name, price, wholesale_price').eq('user_id', pricesUserId);
  const medByName = new Map<string, string>(); // normalizedName → id
  for (const m of allMeds || []) medByName.set(m.name.toLowerCase().trim(), m.id);

  // ── PASSE 1 : tri en mémoire des prix à mettre à jour ──────────────────
  onProgress(0, rows.length, 'Analyse des prix…');
  const priceUpdates: Array<{ id: string; price?: number; wholesale_price?: number }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i % 500 === 0) onProgress(i, rows.length, `Analyse ${i}/${rows.length}…`);

    let medId: string | null = null;
    if (row.ean && barcodeIndex.has(row.ean)) medId = barcodeIndex.get(row.ean)!;
    if (!medId) medId = medByName.get(row.name.toLowerCase().trim()) ?? null;
    if (!medId) continue; // produit inconnu → ignorer

    const upd: { id: string; price?: number; wholesale_price?: number } = { id: medId };
    if (row.sellingPrice > 0) upd.price = row.sellingPrice;
    if (row.buyingPrice > 0)  upd.wholesale_price = row.buyingPrice;
    if (upd.price !== undefined || upd.wholesale_price !== undefined) {
      priceUpdates.push(upd);
    }
  }

  // ── PASSE 2 : updates en PARALLÈLE (20 simultanés) ─────────────────────
  if (priceUpdates.length > 0) {
    onProgress(0, priceUpdates.length, `Mise à jour de ${priceUpdates.length} prix…`);
    let processed = 0;
    const PARALLEL = 20;
    for (let i = 0; i < priceUpdates.length; i += PARALLEL) {
      const batch = priceUpdates.slice(i, i + PARALLEL);
      await Promise.all(batch.map(async u => {
        try {
          const patch: Record<string, number> = {};
          if (u.price !== undefined)           patch.price = u.price;
          if (u.wholesale_price !== undefined) patch.wholesale_price = u.wholesale_price;
          await updateWithUserId('medications', patch, { id: u.id });
          stats.pricesUpdated!++;
        } catch { stats.errors++; }
      }));
      processed += batch.length;
      if (processed % 100 === 0 || processed >= priceUpdates.length) {
        onProgress(processed, priceUpdates.length, `Prix ${processed}/${priceUpdates.length}…`);
      }
    }
  }

  onProgress(rows.length, rows.length, 'Synchronisation…');
  await syncLocal();
  return stats;
}

// ════════════════════════════════════════════════════════════════════════════
//  HELPERS INTERNES
// ════════════════════════════════════════════════════════════════════════════
function isUnitMode(): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem('workflow_mode') === 'unit';
}

function unitCode(counter: number): string {
  return `JP-${String(counter).padStart(6, '0')}`;
}

async function nextUnitCounter(): Promise<number> {
  // ── Compter UNIQUEMENT les unités du user courant
  const uid = await getCurrentUserId();
  const { count } = await supabase
    .from('inventory_units')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', uid);
  return count || 0;
}

async function syncLocal(forceReplaceLocal = false): Promise<void> {
  try {
    const all = await fetchAllMedications();
    if (forceReplaceLocal) {
      // Mode "remplacer tout" : on vide IndexedDB d'abord pour court-circuiter
      // la garde anti-perte de syncProductsToLocal (qui bloquerait si le nouveau
      // catalogue est plus petit que l'ancien).
      await db.products.clear();
    }
    await syncProductsToLocal(all);
    // Mettre à jour le cache offline (utilisé par la Caisse)
    offlineStorage.cacheMedications(all);
    // Notifier tous les composants montés (Stock, Sales, Dashboard…) de recharger
    window.dispatchEvent(new CustomEvent('junglepharm:catalog-updated'));
  } catch { /* ignore */ }
}

interface UnitInsert {
  unit_code: string; medication_id: string; batch_number: string;
  expiry_date: string | null; entry_date: string; supplier: string;
  reception_batch: string; status: string; imported_code: string | null;
}

function mkUnit(code: string, medId: string, row: NormalizedRow, today: string, batch: string): UnitInsert {
  return { unit_code: code, medication_id: medId, batch_number: code, expiry_date: row.expiry, entry_date: today, supplier: row.supplier || '', reception_batch: batch, status: 'available', imported_code: row.ean || null };
}

interface NameGroup { key: string; name: string; sellingPrice: number; buyingPrice: number; barcodes: string[]; totalStock: number; latestExpiry: string | null; supplier: string; }

function groupByName(rows: NormalizedRow[]): NameGroup[] {
  const map = new Map<string, NameGroup>();
  for (const r of rows) {
    const key = r.name.trim().toLowerCase();
    const g = map.get(key);
    if (g) {
      g.totalStock += r.stock;
      // Collecter TOUS les codes-barres (EAN + alias) du groupe, sans doublons
      for (const bc of r.allBarcodes) {
        if (bc && !g.barcodes.includes(bc)) g.barcodes.push(bc);
      }
      if (r.sellingPrice > 0 && !g.sellingPrice) g.sellingPrice = r.sellingPrice;
      if (r.buyingPrice > 0 && !g.buyingPrice)   g.buyingPrice  = r.buyingPrice;
      if (!g.supplier && r.supplier)              g.supplier     = r.supplier;
      if (r.expiry) {
        if (!g.latestExpiry || r.expiry > g.latestExpiry) g.latestExpiry = r.expiry;
      }
    } else {
      map.set(key, { key, name: r.name, sellingPrice: r.sellingPrice, buyingPrice: r.buyingPrice, barcodes: [...r.allBarcodes], totalStock: r.stock, latestExpiry: r.expiry, supplier: r.supplier || '' });
    }
  }
  return Array.from(map.values());
}

async function linkBarcodes(barcodes: string[], medId: string): Promise<void> {
  for (const bc of barcodes) {
    if (!bc) continue;
    try { await upsertWithUserId('barcodes', { barcode: bc, medication_id: medId, code_produit: bc }, { onConflict: 'barcode', ignoreDuplicates: true }); } catch { /* ignore */ }
  }
}

// ── Bulk barcodes : un seul upsert pour N codes-barres ────────────────────────
// Performance massive : 5000 codes en 1-3 requêtes au lieu de 5000.
async function linkBarcodesBulk(items: Array<{ barcode: string; medication_id: string }>): Promise<void> {
  if (!items.length) return;
  const userId = await getCurrentUserId();
  const BATCH = 500;
  for (let i = 0; i < items.length; i += BATCH) {
    const slice = items.slice(i, i + BATCH).map(it => ({
      barcode: it.barcode,
      medication_id: it.medication_id,
      code_produit: it.barcode,
      user_id: userId,
    }));
    try {
      await supabase.from('barcodes').upsert(slice, { onConflict: 'barcode', ignoreDuplicates: true });
    } catch { /* ignore — duplicates ignorés */ }
  }
}

// ── Bulk update quantities : 1 RPC en batch via SQL CASE WHEN ─────────────────
// Fallback : si l'app n'a pas d'RPC, on fait par paquets de 100 en parallèle (Promise.all).
async function bulkUpdateQuantities(updates: Array<{ id: string; quantity: number }>): Promise<number> {
  if (!updates.length) return 0;
  const PARALLEL = 20; // 20 requêtes simultanées max → safe pour Supabase
  let done = 0;
  for (let i = 0; i < updates.length; i += PARALLEL) {
    const batch = updates.slice(i, i + PARALLEL);
    await Promise.all(batch.map(async u => {
      try {
        await updateWithUserId('medications', { quantity: u.quantity }, { id: u.id });
        done++;
      } catch { /* ignore individual failures */ }
    }));
  }
  return done;
}

// ── Bulk update prix : même stratégie, 20 en parallèle ────────────────────────
async function bulkUpdatePrices(updates: Array<{ id: string; price?: number; wholesale_price?: number }>): Promise<number> {
  if (!updates.length) return 0;
  const PARALLEL = 20;
  let done = 0;
  for (let i = 0; i < updates.length; i += PARALLEL) {
    const batch = updates.slice(i, i + PARALLEL);
    await Promise.all(batch.map(async u => {
      try {
        const patch: Record<string, number> = {};
        if (u.price !== undefined)           patch.price = u.price;
        if (u.wholesale_price !== undefined) patch.wholesale_price = u.wholesale_price;
        if (Object.keys(patch).length) {
          await updateWithUserId('medications', patch, { id: u.id });
          done++;
        }
      } catch { /* ignore */ }
    }));
  }
  return done;
}

async function createUnitsForRows(
  rows: NormalizedRow[], createdByName: Map<string, string>,
  receptionBatch: string, startCounter: number,
  stats: ImportStats, onProgress: ProgressCallback,
): Promise<void> {
  onProgress(0, rows.length, 'Création des unités individuelles…');
  const today = new Date().toISOString().split('T')[0];
  const units: UnitInsert[] = [];
  let counter = startCounter;
  const qtyByMed = new Map<string, number>();

  for (const row of rows) {
    const medId = createdByName.get(row.name.trim().toLowerCase());
    if (!medId) continue;
    const copies = Math.max(1, row.stock);
    for (let c = 0; c < copies; c++) {
      units.push(mkUnit(unitCode(++counter), medId, row, today, receptionBatch));
      qtyByMed.set(medId, (qtyByMed.get(medId) || 0) + 1);
    }
  }

  // ── Optimisation : userId résolu UNE seule fois, batch 500, 3 inserts parallèles ──
  const userId2 = await getCurrentUserId();
  const UB = 500;
  const allBatches: Array<UnitInsert[]> = [];
  for (let i = 0; i < units.length; i += UB) allBatches.push(units.slice(i, i + UB));

  const PARALLEL = 3; // 3 inserts simultanés (Supabase tolère bien)
  for (let i = 0; i < allBatches.length; i += PARALLEL) {
    const slice = allBatches.slice(i, i + PARALLEL);
    onProgress(i * UB, units.length, `Unités ${Math.min((i + slice.length) * UB, units.length)}/${units.length}…`);
    await Promise.all(slice.map(async b => {
      try {
        const { error } = await supabase.from('inventory_units').insert(b.map(u => ({ ...u, user_id: userId2 })));
        if (error) { stats.errors++; if (stats.errorDetails.length < 10) stats.errorDetails.push(`Unités: ${error.message}`); }
        else stats.unitsCreated += b.length;
      } catch (e: any) {
        stats.errors++; if (stats.errorDetails.length < 10) stats.errorDetails.push(`Unités: ${e?.message || e}`);
      }
    }));
  }

  for (const [medId, count] of qtyByMed) {
    await updateWithUserId('medications', { quantity: count }, { id: medId });
  }
}
