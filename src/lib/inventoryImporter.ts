import { supabase, fetchAllMedications } from './supabase';
import { insertWithUserId, updateWithUserId, upsertWithUserId } from './supabaseHelpers';
import { db } from './db';
import { syncProductsToLocal } from './syncManager';
import type { ParsedInventoryRow } from './inventoryParser';

export interface ImportStats {
  created: number;
  updated: number;
  errors: number;
  unitsCreated: number;
  errorDetails: string[];
}

export type ProgressCallback = (
  current: number,
  total: number,
  message: string
) => void;

const BATCH_SIZE = 50;

function isUnitModeEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem('workflow_mode') === 'unit';
}

async function syncLocalDB() {
  try {
    const allMeds = await fetchAllMedications();
    await syncProductsToLocal(allMeds);
  } catch (err) {
    console.error('[Importer] Erreur sync local:', err);
  }
}

interface GroupedProduct {
  name: string;
  sellingPrice: number;
  buyingPrice: number;
  barcodes: string[];
  count: number;
}

function groupRowsByName(rows: ParsedInventoryRow[]): GroupedProduct[] {
  const groups = new Map<string, GroupedProduct>();

  for (const row of rows) {
    const normalizedName = (row.name || 'Produit sans nom').trim().toLowerCase();

    if (groups.has(normalizedName)) {
      const group = groups.get(normalizedName)!;
      group.count++;
      if (row.barcode && !group.barcodes.includes(row.barcode)) {
        group.barcodes.push(row.barcode);
      }
      if (row.sellingPrice > 0 && group.sellingPrice === 0) {
        group.sellingPrice = row.sellingPrice;
      }
      if (row.buyingPrice > 0 && group.buyingPrice === 0) {
        group.buyingPrice = row.buyingPrice;
      }
    } else {
      groups.set(normalizedName, {
        name: row.name || 'Produit sans nom',
        sellingPrice: row.sellingPrice || 0,
        buyingPrice: row.buyingPrice || 0,
        barcodes: row.barcode ? [row.barcode] : [],
        count: 1,
      });
    }
  }

  return Array.from(groups.values());
}

async function getNextUnitCounter(): Promise<number> {
  const { count } = await supabase
    .from('inventory_units')
    .select('*', { count: 'exact', head: true });
  return count || 0;
}

function generateUnitCode(counter: number): string {
  return `JP-${String(counter).padStart(5, '0')}`;
}

function generateUniqueUnitId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${timestamp}-${random}`.toUpperCase();
}

export async function performInstallationImport(
  rows: ParsedInventoryRow[],
  onProgress: ProgressCallback
): Promise<ImportStats> {
  const stats: ImportStats = { created: 0, updated: 0, errors: 0, unitsCreated: 0, errorDetails: [] };
  const unitMode = isUnitModeEnabled();

  console.log('=== INSTALLATION IMPORT ===');
  console.log(`[Importer] ${rows.length} lignes a importer, Mode unitaire: ${unitMode}`);

  if (rows.length === 0) {
    stats.errorDetails.push('Aucune ligne valide a importer');
    return stats;
  }

  onProgress(0, rows.length, 'Suppression des donnees existantes...');

  try {
    await supabase.from('inventory_units').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (err) {
    console.warn('[Importer] Erreur suppression inventory_units:', err);
  }

  try {
    await supabase.from('barcodes').delete().neq('barcode', '___DUMMY___');
  } catch (err) {
    console.warn('[Importer] Erreur suppression barcodes:', err);
  }

  try {
    await supabase.from('medications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (err) {
    console.warn('[Importer] Erreur suppression medications:', err);
  }

  try {
    await db.products.clear();
    await db.barcodeLinks.clear();
  } catch (err) {
    console.warn('[Importer] Erreur clear IndexedDB:', err);
  }

  onProgress(0, rows.length, 'Regroupement des produits...');
  const groupedProducts = groupRowsByName(rows);
  console.log(`[Importer] ${groupedProducts.length} produits uniques identifies`);

  const receptionBatch = `INSTALL-${Date.now()}`;
  let unitCounter = 0;
  const createdMedications: Map<string, { id: string; count: number }> = new Map();

  for (let i = 0; i < groupedProducts.length; i += BATCH_SIZE) {
    const batch = groupedProducts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(groupedProducts.length / BATCH_SIZE);

    onProgress(i, groupedProducts.length, `Produits ${batchNum}/${totalBatches}...`);

    const medsToInsert = batch.map((product) => ({
      name: product.name,
      dosage: '',
      quantity: unitMode ? 0 : product.count,
      price: product.sellingPrice,
      wholesale_price: product.buyingPrice,
      min_stock: 0,
      batch_number: receptionBatch,
      expiry_date: null,
    }));

    const { data: inserted, error } = await insertWithUserId(
      'medications',
      medsToInsert
    ).select('id, name');

    if (error) {
      console.error(`[Importer] Erreur batch ${batchNum}:`, error.message);

      for (let j = 0; j < batch.length; j++) {
        const product = batch[j];
        const { data: singleResult, error: singleErr } = await insertWithUserId(
          'medications',
          [{
            name: product.name,
            dosage: '',
            quantity: unitMode ? 0 : product.count,
            price: product.sellingPrice,
            wholesale_price: product.buyingPrice,
            min_stock: 0,
            batch_number: receptionBatch,
            expiry_date: null,
          }]
        )
          .select('id')
          .maybeSingle();

        if (singleErr) {
          stats.errors++;
          if (stats.errorDetails.length < 10) {
            stats.errorDetails.push(`"${product.name?.substring(0, 30)}": ${singleErr.message}`);
          }
        } else if (singleResult) {
          stats.created++;
          createdMedications.set(product.name.toLowerCase().trim(), {
            id: singleResult.id,
            count: product.count
          });

          for (const barcode of product.barcodes) {
            try {
              await upsertWithUserId(
                'barcodes',
                { barcode, medication_id: singleResult.id, code_produit: barcode },
                { onConflict: 'barcode', ignoreDuplicates: true }
              );
            } catch {
              // Ignore
            }
          }
        }
      }
    } else if (inserted) {
      stats.created += inserted.length;

      for (let j = 0; j < inserted.length; j++) {
        const med = inserted[j];
        const product = batch[j];
        createdMedications.set(product.name.toLowerCase().trim(), {
          id: med.id,
          count: product.count
        });

        for (const barcode of product.barcodes) {
          try {
            await upsertWithUserId(
              'barcodes',
              { barcode, medication_id: med.id, code_produit: barcode },
              { onConflict: 'barcode', ignoreDuplicates: true }
            );
          } catch {
            // Ignore
          }
        }
      }
    }
  }

  if (unitMode) {
    onProgress(0, rows.length, 'Creation des unites individuelles...');
    console.log(`[Importer] Creation des unites pour ${rows.length} lignes...`);

    const todayDate = new Date().toISOString().split('T')[0];
    const unitsToInsert: Array<{
      unit_code: string;
      medication_id: string;
      batch_number: string;
      expiry_date: string | null;
      entry_date: string;
      supplier: string;
      reception_batch: string;
      status: string;
      imported_code: string | null;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const normalizedName = (row.name || 'Produit sans nom').trim().toLowerCase();
      const medication = createdMedications.get(normalizedName);

      if (medication) {
        unitCounter++;
        const unitCode = generateUnitCode(unitCounter);

        unitsToInsert.push({
          unit_code: unitCode,
          medication_id: medication.id,
          batch_number: unitCode,
          expiry_date: row.expiry_date || null,
          entry_date: row.entry_date || todayDate,
          supplier: row.supplier || '',
          reception_batch: receptionBatch,
          status: 'available',
          imported_code: row.barcode || null,
        });
      }

      if (i % 500 === 0) {
        onProgress(i, rows.length, `Preparation unites ${i}/${rows.length}...`);
      }
    }

    console.log(`[Importer] Insertion de ${unitsToInsert.length} unites...`);

    const UNIT_BATCH_SIZE = 200;
    for (let i = 0; i < unitsToInsert.length; i += UNIT_BATCH_SIZE) {
      const unitBatch = unitsToInsert.slice(i, i + UNIT_BATCH_SIZE);
      const batchNum = Math.floor(i / UNIT_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(unitsToInsert.length / UNIT_BATCH_SIZE);

      onProgress(i, unitsToInsert.length, `Insertion unites ${batchNum}/${totalBatches}...`);

      const { error: unitError } = await insertWithUserId('inventory_units', unitBatch);

      if (unitError) {
        console.error('[Importer] Erreur insertion unites:', unitError);
        stats.errors++;
        if (stats.errorDetails.length < 10) {
          stats.errorDetails.push(`Unites batch ${batchNum}: ${unitError.message}`);
        }
      } else {
        stats.unitsCreated += unitBatch.length;
      }
    }

    onProgress(rows.length, rows.length, 'Mise a jour des quantites...');
    const unitCountByMed = new Map<string, number>();
    for (const unit of unitsToInsert) {
      const current = unitCountByMed.get(unit.medication_id) || 0;
      unitCountByMed.set(unit.medication_id, current + 1);
    }

    for (const [medId, count] of unitCountByMed) {
      await updateWithUserId('medications', { quantity: count }, { id: medId });
    }
  }

  onProgress(rows.length, rows.length, 'Synchronisation...');
  await syncLocalDB();

  console.log(`[Importer] Termine: ${stats.created} produits, ${stats.unitsCreated} unites, ${stats.errors} erreurs`);
  return stats;
}

export async function performDeliveryImport(
  rows: ParsedInventoryRow[],
  onProgress: ProgressCallback
): Promise<ImportStats> {
  const stats: ImportStats = { created: 0, updated: 0, errors: 0, unitsCreated: 0, errorDetails: [] };

  const unitMode = isUnitModeEnabled();
  console.log('=== DELIVERY IMPORT ===');
  console.log(`[Importer] ${rows.length} lignes a traiter, Mode unitaire: ${unitMode}`);

  if (rows.length === 0) {
    stats.errorDetails.push('Aucune ligne valide a importer');
    return stats;
  }

  let unitCounter = 0;
  if (unitMode) {
    unitCounter = await getNextUnitCounter();
  }

  onProgress(0, rows.length, 'Chargement du catalogue...');

  const { data: allBarcodes } = await supabase.from('barcodes').select('barcode, medication_id');
  const barcodeIndex = new Map<string, string>();
  for (const b of allBarcodes || []) {
    barcodeIndex.set(b.barcode, b.medication_id);
  }

  const { data: allMeds } = await supabase
    .from('medications')
    .select('id, name, quantity, price, wholesale_price');

  const medById = new Map<string, { id: string; name: string; quantity: number; price: number; wholesale_price: number }>();
  const medByName = new Map<string, { id: string; name: string; quantity: number; price: number; wholesale_price: number }>();

  for (const m of allMeds || []) {
    medById.set(m.id, m);
    const normalizedName = m.name.toLowerCase().trim();
    if (!medByName.has(normalizedName)) {
      medByName.set(normalizedName, m);
    }
  }

  console.log(`[Importer] Catalogue: ${medById.size} produits, ${barcodeIndex.size} codes-barres`);

  const receptionBatch = `REC-${Date.now()}`;
  const todayDate = new Date().toISOString().split('T')[0];
  const unitsToInsert: Array<{
    unit_code: string;
    medication_id: string;
    batch_number: string;
    expiry_date: string | null;
    entry_date: string;
    supplier: string;
    reception_batch: string;
    status: string;
    imported_code: string | null;
  }> = [];

  const quantityUpdates = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (i % 100 === 0) {
      onProgress(i, rows.length, `${i}/${rows.length}...`);
    }

    try {
      let existingMedId: string | null = null;

      if (row.barcode && barcodeIndex.has(row.barcode)) {
        existingMedId = barcodeIndex.get(row.barcode)!;
      }

      if (!existingMedId) {
        const normalizedName = (row.name || '').toLowerCase().trim();
        const byName = medByName.get(normalizedName);
        if (byName) existingMedId = byName.id;
      }

      if (existingMedId) {
        const existing = medById.get(existingMedId);
        const currentUpdate = quantityUpdates.get(existingMedId) || 0;
        quantityUpdates.set(existingMedId, currentUpdate + 1);
        stats.updated++;

        if (row.barcode && !barcodeIndex.has(row.barcode)) {
          try {
            await supabase.from('barcodes').upsert(
              { barcode: row.barcode, medication_id: existingMedId, code_produit: row.barcode },
              { onConflict: 'barcode', ignoreDuplicates: true }
            );
          } catch {
            // Ignore
          }
          barcodeIndex.set(row.barcode, existingMedId);
        }

        if (unitMode) {
          unitCounter++;
          const unitCode = generateUnitCode(unitCounter);
          unitsToInsert.push({
            unit_code: unitCode,
            medication_id: existingMedId,
            batch_number: unitCode,
            expiry_date: row.expiry_date || null,
            entry_date: row.entry_date || todayDate,
            supplier: row.supplier || '',
            reception_batch: receptionBatch,
            status: 'available',
            imported_code: row.barcode || null,
          });
        }
      } else {
        const { data: newMed, error } = await insertWithUserId(
          'medications',
          [{
            name: row.name || 'Produit sans nom',
            dosage: '',
            quantity: unitMode ? 0 : 1,
            price: row.sellingPrice || 0,
            wholesale_price: row.buyingPrice || 0,
            min_stock: 0,
            batch_number: receptionBatch,
            expiry_date: null,
          }]
        )
          .select('id, name, quantity, price, wholesale_price')
          .maybeSingle();

        if (error) {
          stats.errors++;
          if (stats.errorDetails.length < 10) {
            stats.errorDetails.push(`Create "${row.name?.substring(0, 30)}": ${error.message}`);
          }
        } else if (newMed) {
          medById.set(newMed.id, newMed);
          medByName.set(newMed.name.toLowerCase().trim(), newMed);

          if (row.barcode) {
            try {
              await upsertWithUserId(
                'barcodes',
                { barcode: row.barcode, medication_id: newMed.id, code_produit: row.barcode },
                { onConflict: 'barcode', ignoreDuplicates: true }
              );
            } catch {
              // Ignore
            }
            barcodeIndex.set(row.barcode, newMed.id);
          }

          stats.created++;

          if (unitMode) {
            unitCounter++;
            const unitCode = generateUnitCode(unitCounter);
            quantityUpdates.set(newMed.id, 1);
            unitsToInsert.push({
              unit_code: unitCode,
              medication_id: newMed.id,
              batch_number: unitCode,
              expiry_date: row.expiry_date || null,
              entry_date: row.entry_date || todayDate,
              supplier: row.supplier || '',
              reception_batch: receptionBatch,
              status: 'available',
              imported_code: row.barcode || null,
            });
          }
        }
      }
    } catch (err) {
      stats.errors++;
      if (stats.errorDetails.length < 10) {
        stats.errorDetails.push(`Exception "${row.name?.substring(0, 30)}": ${String(err)}`);
      }
    }
  }

  if (unitMode && unitsToInsert.length > 0) {
    onProgress(rows.length, rows.length, 'Creation des unites...');
    console.log(`[Importer] Creation de ${unitsToInsert.length} unites...`);

    const UNIT_BATCH_SIZE = 200;
    for (let i = 0; i < unitsToInsert.length; i += UNIT_BATCH_SIZE) {
      const batch = unitsToInsert.slice(i, i + UNIT_BATCH_SIZE);
      const { error: unitError } = await insertWithUserId('inventory_units', batch);

      if (unitError) {
        console.error('[Importer] Erreur insertion unites:', unitError);
        stats.errors++;
        if (stats.errorDetails.length < 10) {
          stats.errorDetails.push(`Unites batch ${Math.floor(i / UNIT_BATCH_SIZE)}: ${unitError.message}`);
        }
      } else {
        stats.unitsCreated += batch.length;
      }
    }
  }

  onProgress(rows.length, rows.length, 'Mise a jour des quantites...');
  for (const [medId, addedQty] of quantityUpdates) {
    const existing = medById.get(medId);
    if (existing) {
      const newQty = unitMode ? (existing.quantity + addedQty) : (existing.quantity + addedQty);
      await updateWithUserId('medications', { quantity: newQty }, { id: medId });
    }
  }

  onProgress(rows.length, rows.length, 'Synchronisation...');
  await syncLocalDB();

  console.log(`[Importer] Termine: ${stats.created} crees, ${stats.updated} maj, ${stats.unitsCreated} unites, ${stats.errors} erreurs`);
  return stats;
}
