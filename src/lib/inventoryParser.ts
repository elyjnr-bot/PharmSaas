import * as XLSX from 'xlsx';

export interface ParsedInventoryRow {
  name: string;
  barcode: string | null;
  buyingPrice: number;
  sellingPrice: number;
  supplier: string | null;
  entry_date: string | null;
  expiry_date: string | null;
}

export interface ParseResult {
  rows: ParsedInventoryRow[];
  detectedColumns: string[];
  mappedColumns: {
    name: string | null;
    barcode: string | null;
    buyingPrice: string | null;
    sellingPrice: string | null;
    supplier: string | null;
    entry_date: string | null;
    expiry_date: string | null;
  };
  totalRawRows: number;
  skippedRows: number;
}

const COLUMN_ALIASES: Record<string, string[]> = {
  name: [
    'designation',
    'désignation',
    'nom',
    'libelle',
    'libellé',
    'name',
    'produit',
    'article',
    'description',
    'nom_produit',
    'nomproduit',
    'nom produit',
  ],
  barcode: [
    'code_barre',
    'codebarre',
    'code barre',
    'codeproduit',
    'code_produit',
    'code produit',
    'barcode',
    'ean',
    'ean13',
    'cip',
    'cip13',
    'gtin',
    'code',
    'ref',
    'reference',
    'référence',
  ],
  buyingPrice: [
    'prixcession',
    'prix_cession',
    'prix cession',
    'pa',
    'pac',
    'prixachat',
    'prix_achat',
    'prix achat',
    'buyingprice',
    'buying_price',
    'cout',
    'coût',
    'prix_ht',
    'prixht',
    'prix ht',
  ],
  sellingPrice: [
    'prixpublic',
    'prix_public',
    'prix public',
    'pv',
    'ppv',
    'prixvente',
    'prix_vente',
    'prix vente',
    'sellingprice',
    'selling_price',
    'prix_ttc',
    'prixttc',
    'prix ttc',
    'prix',
    'tarif',
  ],
  supplier: [
    'fournisseur',
    'supplier',
    'fourni',
    'distributeur',
    'grossiste',
    'labo',
    'laboratoire',
    'fabricant',
  ],
  entry_date: [
    'date_entree',
    'date entree',
    'dateentree',
    'entree',
    'date_reception',
    'date reception',
    'datereception',
    'reception',
    'date_arrivee',
    'date arrivee',
  ],
  expiry_date: [
    'date_expiration',
    'date expiration',
    'dateexpiration',
    'peremption',
    'date_peremption',
    'date peremption',
    'dlc',
    'date_dlc',
    'datedlc',
    'expiry',
    'expiry_date',
    'exp',
    'expiration',
  ],
};

function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_\-\.]+/g, '')
    .trim();
}

function findMatchingColumn(
  fileColumns: string[],
  aliases: string[]
): string | null {
  const normalizedAliases = aliases.map(normalizeColumnName);

  for (const col of fileColumns) {
    const normalized = normalizeColumnName(col);
    if (normalizedAliases.includes(normalized)) {
      return col;
    }
  }

  for (const col of fileColumns) {
    const normalized = normalizeColumnName(col);
    for (const alias of normalizedAliases) {
      if (normalized.includes(alias) || alias.includes(normalized)) {
        return col;
      }
    }
  }

  return null;
}

function parsePrice(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const str = String(val).trim();
  const cleaned = str
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function cleanText(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (str === 'undefined' || str === 'null' || str === '[object Object]') return '';
  return str;
}

function parseDate(val: string): string | null {
  if (!val || val.trim() === '') return null;
  const str = val.trim();

  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3].length === 2 ? `20${ddmmyyyy[3]}` : ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }

  const yyyymmdd = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (yyyymmdd) {
    const year = yyyymmdd[1];
    const month = yyyymmdd[2].padStart(2, '0');
    const day = yyyymmdd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const mmyyyy = str.match(/^(\d{1,2})[\/\-\.](\d{4})$/);
  if (mmyyyy) {
    const month = mmyyyy[1].padStart(2, '0');
    const year = mmyyyy[2];
    return `${year}-${month}-01`;
  }

  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().split('T')[0];
  }

  return null;
}

function getColumnValue(
  row: Record<string, unknown>,
  columnKey: string | null
): string {
  if (!columnKey) return '';
  const val = row[columnKey];
  if (val === undefined || val === null || val === '') return '';
  return cleanText(val);
}

async function parseExcel(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const allRows: Record<string, unknown>[] = [];
        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            raw: false,
            defval: '',
          }) as Record<string, unknown>[];
          allRows.push(...jsonData);
        }
        resolve(allRows);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
    reader.readAsBinaryString(file);
  });
}

function parseCSVText(text: string): Record<string, unknown>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const separator = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0]
    .split(separator)
    .map((h) => h.trim().replace(/^["']|["']$/g, ''));
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    const values = trimmed
      .split(separator)
      .map((v) => v.trim().replace(/^["']|["']$/g, ''));
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

export async function parseInventoryFile(file: File): Promise<ParsedInventoryRow[]> {
  const result = await parseInventoryFileWithDebug(file);
  return result.rows;
}

export async function parseInventoryFileWithDebug(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  let rawRows: Record<string, unknown>[];

  if (ext === 'xlsx' || ext === 'xls') {
    rawRows = await parseExcel(file);
  } else if (ext === 'csv') {
    rawRows = parseCSVText(await file.text());
  } else {
    throw new Error('Format non supporté. Utilisez .csv, .xlsx ou .xls');
  }

  if (rawRows.length === 0) {
    return {
      rows: [],
      detectedColumns: [],
      mappedColumns: { name: null, barcode: null, buyingPrice: null, sellingPrice: null, supplier: null, entry_date: null, expiry_date: null },
      totalRawRows: 0,
      skippedRows: 0,
    };
  }

  const firstRow = rawRows[0];
  const allColumnKeys = Object.keys(firstRow);

  console.log('=== IMPORT DEBUG ===');
  console.log('[Parser] Colonnes du fichier:', allColumnKeys);

  const nameColumn = findMatchingColumn(allColumnKeys, COLUMN_ALIASES.name);
  const barcodeColumn = findMatchingColumn(allColumnKeys, COLUMN_ALIASES.barcode);
  const buyingPriceColumn = findMatchingColumn(allColumnKeys, COLUMN_ALIASES.buyingPrice);
  const sellingPriceColumn = findMatchingColumn(allColumnKeys, COLUMN_ALIASES.sellingPrice);
  const supplierColumn = findMatchingColumn(allColumnKeys, COLUMN_ALIASES.supplier);
  const entryDateColumn = findMatchingColumn(allColumnKeys, COLUMN_ALIASES.entry_date);
  const expiryDateColumn = findMatchingColumn(allColumnKeys, COLUMN_ALIASES.expiry_date);

  const mappedColumns = {
    name: nameColumn,
    barcode: barcodeColumn,
    buyingPrice: buyingPriceColumn,
    sellingPrice: sellingPriceColumn,
    supplier: supplierColumn,
    entry_date: entryDateColumn,
    expiry_date: expiryDateColumn,
  };

  console.log('[Parser] Mapping trouvé:', mappedColumns);

  if (!nameColumn) {
    console.warn('[Parser] ATTENTION: Aucune colonne NOM trouvée!');
    console.warn('[Parser] Colonnes disponibles:', allColumnKeys.join(', '));
    console.warn('[Parser] Alias recherchés:', COLUMN_ALIASES.name.join(', '));
  }

  const result: ParsedInventoryRow[] = [];
  let skippedRows = 0;

  for (const row of rawRows) {
    const rawName = nameColumn ? getColumnValue(row, nameColumn) : '';

    if (!rawName) {
      skippedRows++;
      continue;
    }

    const name = rawName;
    const barcode = barcodeColumn ? getColumnValue(row, barcodeColumn) || null : null;
    const buyingPrice = buyingPriceColumn ? parsePrice(row[buyingPriceColumn]) : 0;
    const sellingPrice = sellingPriceColumn ? parsePrice(row[sellingPriceColumn]) : 0;
    const supplier = supplierColumn ? getColumnValue(row, supplierColumn) || null : null;
    const entry_date = entryDateColumn ? parseDate(getColumnValue(row, entryDateColumn)) : null;
    const expiry_date = expiryDateColumn ? parseDate(getColumnValue(row, expiryDateColumn)) : null;

    result.push({ name, barcode, buyingPrice, sellingPrice, supplier, entry_date, expiry_date });
  }

  console.log(`[Parser] Resultat: ${result.length} lignes OK, ${skippedRows} ignorées`);

  if (result.length > 0) {
    console.log('[Parser] Exemple ligne 1:', result[0]);
  }

  return {
    rows: result,
    detectedColumns: allColumnKeys,
    mappedColumns,
    totalRawRows: rawRows.length,
    skippedRows,
  };
}
