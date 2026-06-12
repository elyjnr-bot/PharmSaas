import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Printer, AlertTriangle, Calendar, Check, CreditCard as Edit3, Building2, Tag, Link2, ScanLine, PackagePlus } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { supabase } from '../lib/supabase';
import { getLastSupplier, setLastSupplier } from '../lib/settings';
import { useUserSettings } from '../lib/userSettings';

interface PrintUnit {
  id?: string;
  unit_code: string;
  medication_name: string;
  batch_number: string;
  expiry_date: string | null;
  entry_date?: string | null;
  price?: number;
  supplier?: string;
  linked_barcode?: string | null;
}

interface PrintUnitsModalProps {
  units: PrintUnit[];
  medicationName: string;
  price?: number;
  supplier?: string;
  onClose: () => void;
  onUnitsUpdated?: () => void;
}

function generateBarcodeDataUrl(code: string): string {
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, code, {
      format: 'CODE128',
      width: 1.5,
      height: 40,
      displayValue: false,
      margin: 2,
    });
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

function getDaysUntilExpiry(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getExpiryStatus(expiryDate: string | null): 'expired' | 'critical' | 'warning' | 'ok' | 'unknown' {
  const days = getDaysUntilExpiry(expiryDate);
  if (days === null) return 'unknown';
  if (days < 0) return 'expired';
  if (days <= 90) return 'critical';
  if (days <= 180) return 'warning';
  return 'ok';
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

export default function PrintUnitsModal({
  units: initialUnits,
  medicationName,
  price: initialPrice,
  supplier: initialSupplier,
  onClose,
  onUnitsUpdated
}: PrintUnitsModalProps) {
  const { settings: userSettings, update: updateUserSettings } = useUserSettings();
  const [units, setUnits] = useState<PrintUnit[]>(initialUnits);
  const [barcodes, setBarcodes] = useState<Record<string, string>>({});
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set(initialUnits.map(u => u.unit_code)));

  const [showValidationModal, setShowValidationModal] = useState(false);
  const [pharmacyName, setPharmacyNameState] = useState(userSettings.pharmacy_name);
  const [editSupplier, setEditSupplier] = useState(initialSupplier || userSettings.default_supplier || getLastSupplier() || '');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editEntryDate, setEditEntryDate] = useState(getTodayDate());
  const [editPrice, setEditPrice] = useState(initialPrice?.toString() || '');
  const [applyToAll, setApplyToAll] = useState(true);

  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [linkingBarcode, setLinkingBarcode] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');

  const printIframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (userSettings.pharmacy_name) {
      setPharmacyNameState(userSettings.pharmacy_name);
    }
  }, [userSettings.pharmacy_name]);

  useEffect(() => {
    const generated: Record<string, string> = {};
    for (const unit of units) {
      generated[unit.unit_code] = generateBarcodeDataUrl(unit.unit_code);
    }
    setBarcodes(generated);
  }, [units]);

  const toggleUnit = (code: string) => {
    setSelectedUnits(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const selectAll = () => setSelectedUnits(new Set(units.map(u => u.unit_code)));
  const deselectAll = () => setSelectedUnits(new Set());

  const openValidationModal = () => {
    if (selectedUnits.size === 0) return;
    const firstSelected = units.find(u => selectedUnits.has(u.unit_code));
    if (firstSelected) {
      setEditExpiryDate(firstSelected.expiry_date || '');
      setEditEntryDate(firstSelected.entry_date || getTodayDate());
      setEditSupplier(firstSelected.supplier || initialSupplier || getLastSupplier() || '');
      setEditPrice((firstSelected.price || initialPrice || 0).toString());
    }
    setShowValidationModal(true);
  };

  const saveAndPrint = async () => {
    setSaving(true);
    try {
      await updateUserSettings({ pharmacy_name: pharmacyName });
      if (editSupplier) {
        setLastSupplier(editSupplier);
        await updateUserSettings({ default_supplier: editSupplier });
      }

      const selectedUnitsList = units.filter(u => selectedUnits.has(u.unit_code));
      const firstSelectedUnit = selectedUnitsList[0];

      if (applyToAll && firstSelectedUnit) {
        const medicationId = firstSelectedUnit.id ?
          (await supabase.from('inventory_units').select('medication_id').eq('id', firstSelectedUnit.id).maybeSingle())?.data?.medication_id
          : null;

        if (medicationId) {
          const updateData: Record<string, any> = {};
          if (editExpiryDate) updateData.expiry_date = editExpiryDate;
          if (editEntryDate) updateData.entry_date = editEntryDate;
          if (editSupplier) updateData.supplier = editSupplier;

          if (Object.keys(updateData).length > 0) {
            await supabase
              .from('inventory_units')
              .update(updateData)
              .eq('medication_id', medicationId)
              .eq('status', 'available');
          }

          setUnits(prev => prev.map(u => ({
            ...u,
            expiry_date: editExpiryDate || u.expiry_date,
            entry_date: editEntryDate || u.entry_date,
            supplier: editSupplier || u.supplier,
            price: editPrice ? parseFloat(editPrice) : u.price,
          })));
        }
      } else {
        const idsToUpdate = selectedUnitsList.map(u => u.id).filter(Boolean) as string[];
        if (idsToUpdate.length > 0) {
          const updateData: Record<string, any> = {};
          if (editExpiryDate) updateData.expiry_date = editExpiryDate;
          if (editEntryDate) updateData.entry_date = editEntryDate;
          if (editSupplier) updateData.supplier = editSupplier;

          if (Object.keys(updateData).length > 0) {
            await supabase
              .from('inventory_units')
              .update(updateData)
              .in('id', idsToUpdate);
          }

          setUnits(prev => prev.map(u => {
            if (selectedUnits.has(u.unit_code)) {
              return {
                ...u,
                expiry_date: editExpiryDate || u.expiry_date,
                entry_date: editEntryDate || u.entry_date,
                supplier: editSupplier || u.supplier,
                price: editPrice ? parseFloat(editPrice) : u.price,
              };
            }
            return u;
          }));
        }
      }

      printLabels();
      setShowValidationModal(false);
      setSuccessMessage(`${selectedUnitsList.length} etiquette(s) preparee(s) pour impression`);
      setTimeout(() => setSuccessMessage(null), 4000);
      onUnitsUpdated?.();
    } catch (err) {
      console.error('Error saving units:', err);
    } finally {
      setSaving(false);
    }
  };

  const printLabels = useCallback(() => {
    const toPrint = units.filter(u => selectedUnits.has(u.unit_code));
    if (toPrint.length === 0) return;

    const labelHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Etiquettes - ${medicationName}</title>
          <style>
            @page {
              size: 50mm 30mm;
              margin: 0;
            }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body {
              width: 100%;
              height: 100%;
              font-family: Arial, Helvetica, sans-serif;
              background: #fff;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .label {
              width: 50mm;
              height: 30mm;
              padding: 1.5mm 2mm;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              page-break-after: always;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .label:last-child {
              page-break-after: auto;
            }
            .pharmacy-name {
              font-size: 8pt;
              font-weight: 900;
              text-align: center;
              color: #0d9488;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 0.5mm;
            }
            .product-section {
              text-align: center;
              line-height: 1.15;
            }
            .product-name {
              font-size: 7pt;
              font-weight: bold;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .unit-id {
              font-family: 'Courier New', monospace;
              font-size: 6pt;
              font-weight: bold;
              color: #1d4ed8;
            }
            .supplier-line {
              font-size: 5pt;
              color: #666;
            }
            .batch-line {
              font-family: 'Courier New', monospace;
              font-size: 5pt;
              color: #374151;
              font-weight: bold;
            }
            .dates-row {
              display: flex;
              justify-content: center;
              align-items: center;
              gap: 2mm;
              font-size: 5.5pt;
              margin-top: 0.3mm;
            }
            .entry-date {
              color: #6b7280;
            }
            .expiry-date {
              font-weight: 600;
            }
            .expiry-ok { color: #537d14; }
            .expiry-warning { color: #d97706; }
            .expiry-critical { color: #dc2626; }
            .expiry-missing { color: #dc2626; font-style: italic; }
            .barcode-section {
              text-align: center;
              margin: 0.5mm 0;
            }
            .barcode-section img {
              max-width: 44mm;
              height: 7mm;
            }
            .price-line {
              font-size: 9pt;
              font-weight: 900;
              text-align: center;
              color: #000;
            }
            @media print {
              body { margin: 0 !important; padding: 0 !important; }
              .label { border: none !important; }
            }
            @media screen {
              body { background: #e5e7eb; padding: 5mm; }
              .label {
                border: 1px dashed #9ca3af;
                margin-bottom: 3mm;
                background: #fff;
              }
            }
          </style>
        </head>
        <body>
          ${toPrint.map(u => {
            const expiryDateToUse = applyToAll && editExpiryDate ? editExpiryDate : u.expiry_date;
            const entryDateToUse = applyToAll && editEntryDate ? editEntryDate : (u.entry_date || getTodayDate());
            const status = getExpiryStatus(expiryDateToUse);
            const supplierToUse = applyToAll && editSupplier ? editSupplier : (u.supplier || initialSupplier || '');
            const priceToUse = applyToAll && editPrice ? parseFloat(editPrice) : (u.price || initialPrice || 0);

            let expiryClass = 'expiry-ok';
            let expiryText = 'Exp: A SAISIR';

            if (!expiryDateToUse) {
              expiryClass = 'expiry-missing';
            } else {
              expiryText = 'Exp: ' + new Date(expiryDateToUse).toLocaleDateString('fr-FR');
              if (status === 'expired' || status === 'critical') expiryClass = 'expiry-critical';
              else if (status === 'warning') expiryClass = 'expiry-warning';
            }

            const entryText = 'Entree: ' + new Date(entryDateToUse).toLocaleDateString('fr-FR');

            return `
              <div class="label">
                <div class="pharmacy-name">${pharmacyName}</div>
                <div class="product-section">
                  <div class="product-name">${u.medication_name}</div>
                  <div class="unit-id">${u.unit_code}</div>
                  ${u.batch_number ? `<div class="batch-line">Lot: ${u.batch_number}</div>` : ''}
                  ${supplierToUse ? `<div class="supplier-line">${supplierToUse}</div>` : ''}
                  <div class="dates-row">
                    <span class="entry-date">${entryText}</span>
                    <span class="expiry-date ${expiryClass}">${expiryText}</span>
                  </div>
                </div>
                <div class="barcode-section">
                  <img src="${barcodes[u.unit_code] || ''}" alt="${u.unit_code}" />
                </div>
                <div class="price-line">${priceToUse.toLocaleString()} FCFA</div>
              </div>
            `;
          }).join('')}
        </body>
      </html>
    `;

    const iframe = printIframeRef.current;
    if (iframe) {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(labelHtml);
        doc.close();

        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        }, 300);
      }
    }
  }, [units, selectedUnits, barcodes, pharmacyName, editSupplier, editExpiryDate, editEntryDate, editPrice, applyToAll, initialSupplier, initialPrice, medicationName]);

  const linkBarcode = async (unitCode: string, barcode: string) => {
    const unit = units.find(u => u.unit_code === unitCode);
    if (!unit?.id || !barcode.trim()) return;

    setSaving(true);
    try {
      await supabase
        .from('inventory_units')
        .update({ linked_barcode: barcode.trim() })
        .eq('id', unit.id);

      setUnits(prev => prev.map(u =>
        u.unit_code === unitCode ? { ...u, linked_barcode: barcode.trim() } : u
      ));
      setLinkingBarcode(null);
      setBarcodeInput('');
      setSuccessMessage(`Code ${barcode.slice(0, 12)}... lie`);
      setTimeout(() => setSuccessMessage(null), 3000);
      onUnitsUpdated?.();
    } catch (err) {
      console.error('Error linking barcode:', err);
    } finally {
      setSaving(false);
    }
  };

  const missingExpiryCount = units.filter(u => !u.expiry_date).length;
  const selectedMissingExpiry = units.filter(u => selectedUnits.has(u.unit_code) && !u.expiry_date).length;

  return (
    <>
      <iframe
        ref={printIframeRef}
        style={{ position: 'absolute', width: 0, height: 0, border: 'none', visibility: 'hidden' }}
        title="print-frame"
      />

      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[999] p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between p-5 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Controle & Etiquetage</h2>
              <p className="text-sm text-gray-500 mt-0.5">{units.length} unites - {medicationName}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {missingExpiryCount > 0 && (
            <div className="mx-5 mt-4 p-3 bg-red-50 border-2 border-red-300 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-red-800">
                  {missingExpiryCount} unite(s) sans date d'expiration
                </p>
                <p className="text-xs text-red-700 mt-1">
                  Les dates doivent etre saisies manuellement avant impression.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-5 py-2.5 bg-gray-50 border-b">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">{selectedUnits.size} selectionnee(s)</span>
              <button onClick={selectAll} className="text-xs text-green-600 hover:underline font-medium">Tout</button>
              <button onClick={deselectAll} className="text-xs text-gray-500 hover:underline">Aucun</button>
            </div>
            {initialPrice && (
              <span className="text-sm font-bold text-green-700">{initialPrice.toLocaleString()} FCFA</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-2">
              {units.map((unit, idx) => {
                const isSelected = selectedUnits.has(unit.unit_code);
                const hasNoExpiry = !unit.expiry_date;
                const expiryStatus = getExpiryStatus(unit.expiry_date);

                return (
                  <div
                    key={unit.unit_code}
                    className={`border-2 rounded-xl p-3 transition-all ${
                      isSelected
                        ? hasNoExpiry
                          ? 'bg-red-50 border-red-400'
                          : 'bg-green-50 border-green-300'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleUnit(unit.unit_code)}
                        className="w-5 h-5 text-green-600 rounded border-gray-300 focus:ring-green-500 mt-1"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-mono font-bold text-blue-700 text-sm">{unit.unit_code}</span>
                          <span className="text-xs text-gray-400">#{idx + 1}</span>
                          {unit.linked_barcode && (
                            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Link2 className="w-3 h-3" />
                              Lie
                            </span>
                          )}
                        </div>

                        {barcodes[unit.unit_code] && (
                          <img src={barcodes[unit.unit_code]} alt={unit.unit_code} className="h-6 mt-1" />
                        )}

                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {unit.entry_date && (
                            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded flex items-center gap-1">
                              <PackagePlus className="w-3 h-3" />
                              {new Date(unit.entry_date).toLocaleDateString('fr-FR')}
                            </span>
                          )}

                          <div
                            className={`text-xs px-2 py-1 rounded font-medium flex items-center gap-1 ${
                              hasNoExpiry
                                ? 'bg-red-200 text-red-800 border-2 border-red-400'
                                : expiryStatus === 'expired'
                                ? 'bg-red-100 text-red-700'
                                : expiryStatus === 'critical'
                                ? 'bg-orange-100 text-orange-700'
                                : expiryStatus === 'warning'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            <Calendar className="w-3 h-3" />
                            {hasNoExpiry ? 'A SAISIR' : new Date(unit.expiry_date!).toLocaleDateString('fr-FR')}
                          </div>

                          {unit.supplier && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {unit.supplier}
                            </span>
                          )}

                          {linkingBarcode === unit.unit_code ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={barcodeInput}
                                onChange={(e) => setBarcodeInput(e.target.value)}
                                placeholder="Scan/saisir code"
                                className="px-2 py-1 border border-gray-300 rounded text-xs w-28"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && barcodeInput.trim()) {
                                    linkBarcode(unit.unit_code, barcodeInput);
                                  } else if (e.key === 'Escape') {
                                    setLinkingBarcode(null);
                                    setBarcodeInput('');
                                  }
                                }}
                                autoFocus
                              />
                              <button
                                onClick={() => linkBarcode(unit.unit_code, barcodeInput)}
                                disabled={!barcodeInput.trim()}
                                className="p-1 bg-green-600 text-white rounded disabled:opacity-50"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => { setLinkingBarcode(null); setBarcodeInput(''); }}
                                className="p-1 bg-gray-200 text-gray-600 rounded"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setLinkingBarcode(unit.unit_code)}
                              className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded flex items-center gap-1 hover:bg-blue-100"
                            >
                              <ScanLine className="w-3 h-3" />
                              {unit.linked_barcode ? 'Modifier lien' : 'Lier code'}
                            </button>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedUnits(new Set([unit.unit_code]));
                          openValidationModal();
                        }}
                        className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Editer et imprimer cette unite"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-4 border-t border-gray-200 space-y-3">
            <button
              onClick={openValidationModal}
              disabled={selectedUnits.size === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Printer className="w-5 h-5" />
              Valider & Imprimer ({selectedUnits.size})
            </button>

            {selectedMissingExpiry > 0 && (
              <p className="text-xs text-center text-red-600 font-medium">
                Attention: {selectedMissingExpiry} unite(s) selectionnee(s) sans date d'expiration
              </p>
            )}
          </div>

          {successMessage && (
            <div className="px-4 pb-4 flex items-center gap-2 text-green-600 bg-green-50 mx-4 mb-4 rounded-lg py-2">
              <Check className="w-4 h-4" />
              <span className="text-sm font-medium">{successMessage}</span>
            </div>
          )}
        </div>
      </div>

      {showValidationModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Validation avant impression</h3>
              <p className="text-sm text-gray-500 mt-1">
                Verifiez et completez les informations pour {selectedUnits.size} etiquette(s)
              </p>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  <Building2 className="w-4 h-4 inline mr-1" />
                  Nom de la pharmacie
                </label>
                <input
                  type="text"
                  value={pharmacyName}
                  onChange={(e) => setPharmacyNameState(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 font-medium"
                />
                <p className="text-xs text-gray-500 mt-1">Ce nom sera memorise pour les prochaines impressions</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  <Tag className="w-4 h-4 inline mr-1" />
                  Fournisseur
                </label>
                <input
                  type="text"
                  value={editSupplier}
                  onChange={(e) => setEditSupplier(e.target.value)}
                  placeholder="Ex: LABOREX, COPHARMED..."
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  <PackagePlus className="w-4 h-4 inline mr-1" />
                  Date d'entree en stock
                </label>
                <input
                  type="date"
                  value={editEntryDate}
                  onChange={(e) => setEditEntryDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
                <p className="text-xs text-gray-500 mt-1">Par defaut: aujourd'hui. Modifiez si reception anterieure.</p>
              </div>

              <div>
                <label className={`block text-sm font-semibold mb-1.5 ${!editExpiryDate ? 'text-red-700' : 'text-gray-700'}`}>
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Date d'expiration
                  {!editExpiryDate && <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">OBLIGATOIRE</span>}
                </label>
                <input
                  type="date"
                  value={editExpiryDate}
                  onChange={(e) => setEditExpiryDate(e.target.value)}
                  className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                    !editExpiryDate ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Prix de vente (FCFA)
                </label>
                <input
                  type="number"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToAll}
                    onChange={(e) => setApplyToAll(e.target.checked)}
                    className="w-5 h-5 text-amber-600 rounded border-gray-300 focus:ring-amber-500 mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-bold text-amber-900">
                      Appliquer a TOUTES les unites du lot
                    </span>
                    <p className="text-xs text-amber-800 mt-0.5 font-medium">
                      Les dates (entree + expiration) et le fournisseur seront enregistres sur TOUTES les unites disponibles de {medicationName}, pas seulement les {selectedUnits.size} selectionnees
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="p-5 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowValidationModal(false)}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
              >
                Annuler
              </button>
              <button
                onClick={saveAndPrint}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? (
                  <>Enregistrement...</>
                ) : (
                  <>
                    <Printer className="w-4 h-4" />
                    Imprimer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
