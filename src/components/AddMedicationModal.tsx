import { useState, useEffect, useRef } from 'react';
import { X, ShoppingCart, Plus, ScanLine, Package, Layers, CheckCircle, AlertCircle, Loader2, RefreshCw, Printer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { insertWithUserId } from '../lib/supabaseHelpers';
import { parseGS1Code } from '../lib/dataMatrixParser';
import { getLastSupplier, setLastSupplier } from '../lib/settings';
import { useUserSettings } from '../lib/userSettings';
import {
  reserveUnitCodes,
  formatUnitCode,
  offlineSafeInsertMedication,
  offlineSafeUpdateMedication,
  offlineSafeInsertInventoryUnits,
  offlineSafeInsertStockEntries,
  type OfflineInventoryUnit,
  type OfflineStockEntry,
} from '../lib/writeService';
import BarcodeScanner from './BarcodeScanner';
import PrintUnitsModal from './PrintUnitsModal';

export interface NewUnitResult {
  id: string;
  unit_code: string;
  batch_number: string;
  expiry_date: string | null;
}

export interface AddMedicationResult {
  medication: {
    id: string;
    name: string;
    price: number;
    quantity: number;
  };
  newUnits?: NewUnitResult[];
  isUnitMode: boolean;
}

interface ExistingMedication {
  id: string;
  name: string;
  dosage: string;
  quantity: number;
  price: number;
  supplier: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  unit_mode?: boolean;
}

interface AddMedicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result?: AddMedicationResult) => void;
  onAddToCart?: (medication: { id: string; name: string; dosage: string; quantity: number; price: number }) => void;
  prefillData?: {
    batch_number?: string;
    expiry_date?: string;
    gtin?: string;
  };
}

type ProductStatus = 'idle' | 'searching' | 'new' | 'existing';
type GestionMode = 'global' | 'unit';

function getDefaultExpiryDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().split('T')[0];
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function isWorkflowUnitMode(): boolean {
  return localStorage.getItem('workflow_mode') === 'unit';
}


function parseDateToISO(dateStr: string): string | null {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const ddmmyyyy = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  return dateStr;
}

export default function AddMedicationModal({
  isOpen,
  onClose,
  onSuccess,
  onAddToCart,
  prefillData,
}: AddMedicationModalProps) {
  const { settings: userSettings, update: updateUserSettings } = useUserSettings();
  const [showScanner, setShowScanner] = useState(false);
  const [eanInput, setEanInput] = useState('');
  const eanInputRef = useRef<HTMLInputElement>(null);
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const [productStatus, setProductStatus] = useState<ProductStatus>('idle');
  const [existingMed, setExistingMed] = useState<ExistingMedication | null>(null);
  const [selectedMode, setSelectedMode] = useState<GestionMode | null>(null);
  const [priceChanged, setPriceChanged] = useState(false);
  const [updatePriceInDB, setUpdatePriceInDB] = useState(false);
  const [successResult, setSuccessResult] = useState<AddMedicationResult | null>(null);
  const [showInternalPrint, setShowInternalPrint] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    dosage: '',
    quantity: '1',
    batch_number: prefillData?.batch_number || '',
    expiry_date: prefillData?.expiry_date || getDefaultExpiryDate(),
    price: '',
    supplier: userSettings.default_supplier || getLastSupplier() || '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setShowScanner(false);
      setEanInput('');
      setProductStatus('idle');
      setExistingMed(null);
      setSelectedMode(null);
      setPriceChanged(false);
      setUpdatePriceInDB(false);
      setError('');
      setSuccessResult(null);
      setShowInternalPrint(false);
      const defaultSupplier = userSettings.default_supplier || getLastSupplier() || '';
      setFormData({
        name: '',
        dosage: '',
        quantity: '1',
        batch_number: prefillData?.batch_number || '',
        expiry_date: prefillData?.expiry_date || getDefaultExpiryDate(),
        price: '',
        supplier: defaultSupplier,
      });

      if (prefillData?.gtin) {
        searchByGtin(prefillData.gtin);
      }

      // Sur desktop : focus auto sur le champ EAN pour capturer le scanner HID
      if (!isMobile) {
        setTimeout(() => eanInputRef.current?.focus(), 120);
      }
    }
  }, [isOpen]);

  const searchByGtin = async (gtin: string) => {
    setProductStatus('searching');
    const { data } = await supabase
      .from('medications')
      .select('id, name, dosage, quantity, price, supplier, batch_number, expiry_date')
      .eq('gtin', gtin)
      .maybeSingle();

    if (data) {
      fillFromExisting(data);
    } else {
      setProductStatus('new');
    }
  };

  const searchByBarcode = async (barcode: string) => {
    setProductStatus('searching');

    const { data: barcodeRow } = await supabase
      .from('barcodes')
      .select('medication_id')
      .eq('barcode', barcode.trim())
      .maybeSingle();

    if (barcodeRow?.medication_id) {
      const { data: med } = await supabase
        .from('medications')
        .select('id, name, dosage, quantity, price, supplier, batch_number, expiry_date')
        .eq('id', barcodeRow.medication_id)
        .maybeSingle();
      if (med) {
        fillFromExisting(med);
        return;
      }
    }

    setProductStatus('new');
  };

  const fillFromExisting = (med: ExistingMedication) => {
    setExistingMed(med);
    setProductStatus('existing');

    const parts = med.name.split(' ');
    let name = med.name;
    let dosage = med.dosage || '';

    if (!dosage && parts.length >= 2) {
      const lastPart = parts[parts.length - 1];
      if (/^\d/.test(lastPart)) {
        dosage = lastPart;
        name = parts.slice(0, -1).join(' ');
      }
    }

    setFormData(prev => ({
      ...prev,
      name,
      dosage,
      price: med.price.toString(),
      batch_number: prev.batch_number || med.batch_number || '',
      expiry_date: prev.expiry_date || med.expiry_date || getDefaultExpiryDate(),
      supplier: prev.supplier || med.supplier || getLastSupplier() || '',
    }));

    const currentMode = isWorkflowUnitMode() ? 'unit' : 'global';
    setSelectedMode(currentMode);
  };

  const handleScan = async (code: string) => {
    setShowScanner(false);
    const gs1 = parseGS1Code(code);

    if (gs1?.gtin) {
      setFormData(prev => ({
        ...prev,
        batch_number: gs1.lot || prev.batch_number,
        expiry_date: gs1.expiryFormatted || prev.expiry_date,
      }));
      await searchByGtin(gs1.gtin);
    } else {
      await searchByBarcode(code);
    }
  };

  const handleNameSearch = async () => {
    const name = formData.name.trim();
    if (!name) return;
    setProductStatus('searching');

    const mergedName = formData.dosage.trim()
      ? `${name.toUpperCase()} ${formData.dosage.trim().toUpperCase()}`
      : name.toUpperCase();

    const { data } = await supabase
      .from('medications')
      .select('id, name, dosage, quantity, price, supplier, batch_number, expiry_date')
      .ilike('name', `%${name}%`)
      .maybeSingle();

    if (data) {
      fillFromExisting(data);
    } else {
      const { data: byMerged } = await supabase
        .from('medications')
        .select('id, name, dosage, quantity, price, supplier, batch_number, expiry_date')
        .eq('name', mergedName)
        .maybeSingle();

      if (byMerged) {
        fillFromExisting(byMerged);
      } else {
        setProductStatus('new');
        setExistingMed(null);
        setSelectedMode(null);
      }
    }
  };

  const handlePriceChange = (newPrice: string) => {
    setFormData(prev => ({ ...prev, price: newPrice }));
    if (existingMed && newPrice && parseFloat(newPrice) !== existingMed.price) {
      setPriceChanged(true);
    } else {
      setPriceChanged(false);
      setUpdatePriceInDB(false);
    }
  };

  const resetForm = () => {
    setProductStatus('idle');
    setExistingMed(null);
    setSelectedMode(null);
    setPriceChanged(false);
    setUpdatePriceInDB(false);
    setSuccessResult(null);
    setShowInternalPrint(false);
    setEanInput('');
    setShowScanner(false);
    setFormData({
      name: '',
      dosage: '',
      quantity: '1',
      batch_number: '',
      expiry_date: getDefaultExpiryDate(),
      price: '',
      supplier: getLastSupplier() || '',
    });
  };

  const getMergedName = () => {
    const name = formData.name.trim().toUpperCase();
    const dosage = formData.dosage.trim().toUpperCase();
    return name && dosage ? `${name} ${dosage}` : name;
  };

  const effectiveMode: GestionMode = selectedMode ?? (isWorkflowUnitMode() ? 'unit' : 'global');

  const handleSubmit = async (e: React.FormEvent, sellDirectly = false) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('Le nom est obligatoire');
      return;
    }
    if (!formData.quantity || parseInt(formData.quantity) <= 0) {
      setError('La quantite est obligatoire');
      return;
    }
    if (!formData.price || parseFloat(formData.price) <= 0) {
      setError('Le prix est obligatoire');
      return;
    }
    if (productStatus === 'new' && !selectedMode) {
      setError('Choisissez le mode de gestion (Global ou Unitaire)');
      return;
    }

    setIsSubmitting(true);

    try {
      const mergedName = getMergedName();
      const quantity = parseInt(formData.quantity);
      const price = parseFloat(formData.price);
      const entryDate = getTodayDate();
      const expiryDateISO = parseDateToISO(formData.expiry_date);

      if (formData.supplier) {
        setLastSupplier(formData.supplier);
        updateUserSettings({ default_supplier: formData.supplier });
      }

      let medicationId: string;
      let finalQuantity: number;

      if (existingMed) {
        medicationId = existingMed.id;
        finalQuantity = existingMed.quantity + quantity;

        const updateFields: Record<string, unknown> = { quantity: finalQuantity };
        if (updatePriceInDB) updateFields.price = price;
        if (formData.batch_number) updateFields.batch_number = formData.batch_number;
        if (expiryDateISO) updateFields.expiry_date = expiryDateISO;
        if (formData.supplier !== undefined) updateFields.supplier = formData.supplier || null;

        await offlineSafeUpdateMedication(medicationId, updateFields);

        // ── Historique : réapprovisionnement ─────────────────────────────
        try {
          await insertWithUserId('stock_movements', {
            medication_id:   medicationId,
            medication_name: existingMed.name,
            dosage:          existingMed.dosage || null,
            movement_type:  'reception_bl',
            quantity_before: existingMed.quantity,
            quantity_change: quantity,
            quantity_after:  finalQuantity,
            supplier:        formData.supplier || null,
            reference:       formData.batch_number ? `Lot: ${formData.batch_number}` : null,
            notes:           'Réapprovisionnement manuel',
          });
        } catch (e) { console.error('[stock_movements] réappro:', e); }
      } else {
        const result = await offlineSafeInsertMedication({
          name: mergedName,
          dosage: formData.dosage || '',
          quantity,
          batch_number: formData.batch_number || null,
          expiry_date: expiryDateISO,
          minimum_stock: 0,
          price,
          supplier: formData.supplier || null,
        });
        medicationId = result.id;
        finalQuantity = quantity;
      }

      let newUnits: NewUnitResult[] | undefined;

      if (effectiveMode === 'unit') {
        const receptionBatch = `REC-${Date.now()}`;
        const startCounter = await reserveUnitCodes(quantity);

        const unitsToInsert: OfflineInventoryUnit[] = Array.from({ length: quantity }, (_, i) => ({
          medication_id: medicationId,
          unit_code: formatUnitCode(startCounter + i),
          batch_number: formData.batch_number || '',
          expiry_date: expiryDateISO || null,
          entry_date: entryDate,
          supplier: formData.supplier || '',
          reception_batch: receptionBatch,
          status: 'available',
        }));

        const createdUnits = await offlineSafeInsertInventoryUnits(unitsToInsert);
        newUnits = createdUnits;

        const actualCount = createdUnits.length;
        if (actualCount !== finalQuantity) {
          await offlineSafeUpdateMedication(medicationId, {
            quantity: (existingMed?.quantity ?? 0) + actualCount,
          });
          finalQuantity = (existingMed?.quantity ?? 0) + actualCount;
        }
      } else {
        if (formData.batch_number || expiryDateISO) {
          const stockEntries: OfflineStockEntry[] = Array(quantity).fill(null).map(() => ({
            medication_id: medicationId,
            entry_date: entryDate,
            batch_number: formData.batch_number || null,
            expiry_date: expiryDateISO || null,
            is_sold: false,
          }));
          await offlineSafeInsertStockEntries(stockEntries);
        }
      }

      if (sellDirectly && onAddToCart) {
        onAddToCart({
          id: medicationId,
          name: mergedName,
          dosage: formData.dosage || '',
          quantity: finalQuantity,
          price: price,
        });
      }

      const result: AddMedicationResult = {
        medication: { id: medicationId, name: mergedName, price, quantity: finalQuantity },
        newUnits,
        isUnitMode: effectiveMode === 'unit',
      };

      onSuccess(result);

      if (effectiveMode === 'unit' && newUnits && newUnits.length > 0) {
        setSuccessResult(result);
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Erreur complete lors de l\'ajout:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Erreur inconnue lors de l'ajout. Consultez la console pour plus de details.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const previewName = getMergedName();
  const qty = parseInt(formData.quantity) || 0;

  if (successResult && successResult.isUnitMode && successResult.newUnits) {
    const unitCount = successResult.newUnits.length;

    if (showInternalPrint) {
      return (
        <div className="fixed inset-0 z-[1000]">
          <PrintUnitsModal
            units={successResult.newUnits.map(u => ({
              id: u.id,
              unit_code: u.unit_code,
              medication_name: successResult.medication.name,
              batch_number: u.batch_number,
              expiry_date: u.expiry_date,
              entry_date: getTodayDate(),
              price: successResult.medication.price,
              supplier: formData.supplier || '',
              linked_barcode: null,
            }))}
            medicationName={successResult.medication.name}
            price={successResult.medication.price}
            supplier={formData.supplier || ''}
            onClose={() => {
              setShowInternalPrint(false);
              onClose();
            }}
            onUnitsUpdated={() => {}}
          />
        </div>
      );
    }

    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 z-[999] flex items-end sm:items-center justify-center">
        <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden">
          <div className="px-6 pt-8 pb-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-9 h-9 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              Entree validee !
            </h2>
            <p className="text-gray-500 text-sm">
              {unitCount} unite{unitCount > 1 ? 's' : ''} cree{unitCount > 1 ? 'es' : ''} avec succes
            </p>
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-left">
              <p className="text-sm font-bold text-green-800">{successResult.medication.name}</p>
              <p className="text-xs text-green-600 mt-1">
                {unitCount} code{unitCount > 1 ? 's' : ''} JP-XXXXX genere{unitCount > 1 ? 's' : ''} &bull; {successResult.medication.price.toLocaleString()} FCFA/unite
              </p>
            </div>
          </div>

          <div className="px-6 pb-8 flex flex-col gap-3">
            <button
              onClick={() => setShowInternalPrint(true)}
              className="w-full flex items-center justify-center gap-3 py-4 bg-green-600 text-white rounded-xl font-bold text-base hover:bg-green-700 active:scale-95 transition-all shadow-lg"
            >
              <Printer className="w-5 h-5" />
              Imprimer {unitCount} etiquette{unitCount > 1 ? 's' : ''}
            </button>

            <button
              onClick={resetForm}
              className="w-full flex items-center justify-center gap-3 py-3.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              Nouvelle entree
            </button>

            <button
              onClick={onClose}
              className="w-full py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 active:scale-95 transition-all"
            >
              Terminer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-[999] flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">

        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">Entree en stock</h2>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                effectiveMode === 'unit'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {effectiveMode === 'unit' ? 'Unitaire' : 'Global'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Reception & enregistrement produit</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* ── Saisie EAN / Code produit ─────────────────────────────────── */}
        <div className="px-5 pt-4 pb-2 space-y-2">
          {/* Champ EAN : fonctionne avec scanner HID (desktop) et saisie manuelle */}
          <div className="relative">
            <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              ref={eanInputRef}
              type="text"
              inputMode="text"
              placeholder={isMobile ? 'Saisir un code EAN / DataMatrix…' : 'Scanner physique ou saisir un code EAN…'}
              value={eanInput}
              onChange={(e) => setEanInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const code = eanInput.trim();
                  if (code) { handleScan(code); setEanInput(''); }
                }
              }}
              className="w-full pl-9 pr-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-gray-50 font-mono tracking-wide placeholder:font-sans placeholder:tracking-normal"
            />
          </div>

          {/* Bouton caméra — mobile uniquement */}
          {isMobile && (
            <button
              type="button"
              onClick={() => setShowScanner(v => !v)}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all border-2 ${
                showScanner
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600'
              }`}
            >
              <ScanLine className="w-4 h-4" />
              {showScanner ? 'Fermer la caméra' : 'Scanner avec la caméra'}
            </button>
          )}
        </div>

        {/* Caméra — mobile uniquement */}
        {isMobile && showScanner && (
          <div className="px-5 pb-3">
            <div className="rounded-xl overflow-hidden border-2 border-blue-200">
              <BarcodeScanner
                onScan={handleScan}
                onClose={() => setShowScanner(false)}
                continuous={false}
              />
            </div>
          </div>
        )}

        <form onSubmit={(e) => handleSubmit(e, false)} className="px-5 pb-5 space-y-4">

          {productStatus === 'searching' && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />
              <span className="text-sm text-blue-700 font-medium">Recherche du produit...</span>
            </div>
          )}

          {productStatus === 'existing' && existingMed && (
            <div className="bg-green-50 border-2 border-green-300 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-bold text-green-800">Produit existant</span>
                </div>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reinitialiser
                </button>
              </div>
              <p className="text-xs text-green-700 mt-1">
                Stock actuel : <span className="font-bold">{existingMed.quantity}</span> unites
                {existingMed.price && (
                  <span className="ml-2">— Prix : <span className="font-bold">{existingMed.price.toLocaleString()} FCFA</span></span>
                )}
              </p>
            </div>
          )}

          {productStatus === 'new' && (
            <div className="bg-orange-50 border-2 border-orange-300 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-bold text-orange-800">Nouveau produit</span>
              </div>
              <p className="text-xs text-orange-700 mt-1">
                Ce produit sera cree dans votre inventaire. Choisissez le mode de gestion.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p className="text-xs text-blue-600 font-medium mb-1">Nom final dans le stock :</p>
            <p className="text-sm font-bold text-blue-800">{previewName || 'Entrez un nom...'}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, name: e.target.value }));
                    if (productStatus !== 'idle') {
                      setProductStatus('idle');
                      setExistingMed(null);
                    }
                  }}
                  onBlur={() => {
                    if (formData.name.trim() && productStatus === 'idle') {
                      handleNameSearch();
                    }
                  }}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="PARACETAMOL"
                  readOnly={productStatus === 'existing'}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dosage</label>
              <input
                type="text"
                value={formData.dosage}
                onChange={(e) => setFormData(prev => ({ ...prev, dosage: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="500mg"
                readOnly={productStatus === 'existing'}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantite *</label>
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prix (FCFA) *</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={formData.price}
                onChange={(e) => handlePriceChange(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold text-base"
                placeholder="0"
              />
            </div>
          </div>

          {priceChanged && existingMed && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={updatePriceInDB}
                  onChange={(e) => setUpdatePriceInDB(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-amber-600 mt-0.5 flex-shrink-0"
                />
                <div>
                  <p className="text-sm font-bold text-amber-900">Mettre a jour le prix de reference ?</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Ancien prix : {existingMed.price.toLocaleString()} FCFA → Nouveau : {parseFloat(formData.price || '0').toLocaleString()} FCFA
                  </p>
                </div>
              </label>
            </div>
          )}

          {(productStatus === 'new' || productStatus === 'idle' || productStatus === 'existing') && (
            <div className="space-y-3 border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Details du lot</p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Numero de lot</label>
                <input
                  type="text"
                  value={formData.batch_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, batch_number: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-sm"
                  placeholder="LOT2024-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date de peremption</label>
                <input
                  type="date"
                  value={formData.expiry_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, expiry_date: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur</label>
                <input
                  type="text"
                  value={formData.supplier}
                  onChange={(e) => setFormData(prev => ({ ...prev, supplier: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-sm"
                  placeholder="Ex: Laborex Congo, Cophadom..."
                />
              </div>
            </div>
          )}

          {productStatus === 'new' && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-sm font-semibold text-gray-800 mb-3">
                Mode de gestion <span className="text-red-500">*</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedMode('global')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    selectedMode === 'global'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <Layers className={`w-6 h-6 ${selectedMode === 'global' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div className="text-center">
                    <p className={`text-sm font-bold ${selectedMode === 'global' ? 'text-blue-800' : 'text-gray-700'}`}>
                      Comptage Global
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Quantite totale uniquement</p>
                  </div>
                  {selectedMode === 'global' && (
                    <span className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <CheckCircle className="w-3.5 h-3.5 text-white" />
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedMode('unit')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    selectedMode === 'unit'
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <Package className={`w-6 h-6 ${selectedMode === 'unit' ? 'text-green-600' : 'text-gray-400'}`} />
                  <div className="text-center">
                    <p className={`text-sm font-bold ${selectedMode === 'unit' ? 'text-green-800' : 'text-gray-700'}`}>
                      Suivi Unitaire
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Codes JP-XXXXX par unite</p>
                  </div>
                  {selectedMode === 'unit' && (
                    <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                      <CheckCircle className="w-3.5 h-3.5 text-white" />
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

          {productStatus === 'existing' && existingMed && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-sm font-semibold text-gray-800 mb-3">Mode de gestion</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedMode('global')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    effectiveMode === 'global'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <Layers className={`w-6 h-6 ${effectiveMode === 'global' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div className="text-center">
                    <p className={`text-sm font-bold ${effectiveMode === 'global' ? 'text-blue-800' : 'text-gray-700'}`}>
                      Comptage Global
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Quantite totale uniquement</p>
                  </div>
                  {effectiveMode === 'global' && (
                    <span className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <CheckCircle className="w-3.5 h-3.5 text-white" />
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedMode('unit')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    effectiveMode === 'unit'
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <Package className={`w-6 h-6 ${effectiveMode === 'unit' ? 'text-green-600' : 'text-gray-400'}`} />
                  <div className="text-center">
                    <p className={`text-sm font-bold ${effectiveMode === 'unit' ? 'text-green-800' : 'text-gray-700'}`}>
                      Suivi Unitaire
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Codes JP-XXXXX par unite</p>
                  </div>
                  {effectiveMode === 'unit' && (
                    <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                      <CheckCircle className="w-3.5 h-3.5 text-white" />
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

          {effectiveMode === 'unit' && qty > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <p className="text-sm text-green-800 font-semibold">
                {qty} code(s) JP-XXXXX seront generes
              </p>
              <p className="text-xs text-green-600 mt-0.5">
                Impression d'etiquettes disponible immediatement apres validation
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3 pt-2 border-t border-gray-200">
            {onAddToCart && (
              <button
                type="button"
                onClick={(e) => handleSubmit(e, true)}
                disabled={isSubmitting}
                className="w-full px-4 py-4 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg flex items-center justify-center gap-2"
              >
                <ShoppingCart className="w-5 h-5" />
                {isSubmitting ? 'Traitement...' : 'Vendre directement'}
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full px-4 py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {effectiveMode === 'unit' ? `Creation de ${qty} unite(s)...` : 'Enregistrement...'}
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Valider l'entree
                  {effectiveMode === 'unit' && qty > 0 && ` (${qty} unites)`}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 active:scale-95 transition-all"
            >
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
