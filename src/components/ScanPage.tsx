import { useState, useEffect, useRef } from 'react';
import { Scan, CheckCircle, AlertCircle, Plus, Package, ShieldAlert, Clock, ShoppingCart, Trash2, CreditCard, Banknote, Smartphone, Receipt, Camera, ScanLine } from 'lucide-react';
import { supabase, Medication, fetchAllMedications } from '../lib/supabase';
import { insertWithUserId, updateWithUserId } from '../lib/supabaseHelpers';
import AddMedicationModal from './AddMedicationModal';
import CameraScanner from './scanner/CameraScanner';
import InlineScanLink from './InlineScanLink';
import { parseDataMatrix, parseGS1Code, generateSampleDataMatrix, playBeepSound, getMedicationInfoByGtin } from '../lib/dataMatrixParser';
import { barcodeCache } from '../lib/barcodeCache';
import { getDaysUntilExpiry } from '../lib/dateUtils';
import { getTaxRate } from '../lib/settings';
import { offlineStorage } from '../lib/offlineStorage';
import { useAuth } from '../lib/auth';
import { useWorkflow } from '../lib/workflowContext';
import { useCart, InventoryUnit } from '../lib/cartContext';

interface ScannedData {
  gtin: string;
  lot: string;
  expiry: string;
  expiryFormatted: string;
}

interface CartItem {
  medication: Medication;
  quantity: number;
}

type ScanMode = 'stock' | 'sale';

export default function ScanPage() {
  const { isManager } = useAuth();
  const { isUnitMode } = useWorkflow();
  const { addUnitToCart: addUnitToGlobalCart } = useCart();
  const scannedUnitCodesRef = useRef<Record<string, string[]>>({});
  const [scanMode, setScanMode] = useState<ScanMode>('stock');
  const [isScanning, setIsScanning] = useState(false);
  const [scannedData, setScannedData] = useState<ScannedData | null>(null);
  const [foundMedication, setFoundMedication] = useState<Medication | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showScanSuccess, setShowScanSuccess] = useState(false);
  const [scanNotification, setScanNotification] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'Espèces' | 'Carte Bancaire' | 'MTN Mobile Money' | 'Airtel Money'>('Espèces');
  const [customerName, setCustomerName] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showBarcodeInput, setShowBarcodeInput] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [rawScanFallback, setRawScanFallback] = useState<{ code: string; gtin?: string; lot?: string } | null>(null);
  const [scanMedications, setScanMedications] = useState<Medication[]>([]);

  useEffect(() => {
    if (showCameraScanner && scanMedications.length === 0) {
      fetchAllMedications().then(setScanMedications).catch(() => {});
    }
  }, [showCameraScanner]);

  const triggerScanSuccess = () => {
    setShowScanSuccess(true);

    try {
      playBeepSound();
    } catch (error) {
      console.log('Audio not available:', error);
    }

    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]);
    }

    setTimeout(() => {
      setShowScanSuccess(false);
    }, 600);
  };

  const isUnitCode = (code: string) => /^JP-[A-Z0-9\-]+$/i.test(code.trim());

  const lookupUnitCodeAndAddToCart = async (code: string): Promise<boolean> => {
    let unit = null;

    const { data: unitByCode } = await supabase
      .from('inventory_units')
      .select('*, medications(*)')
      .eq('unit_code', code.trim())
      .eq('status', 'available')
      .maybeSingle();

    unit = unitByCode;

    if (!unit) {
      const { data: unitByLinked } = await supabase
        .from('inventory_units')
        .select('*, medications(*)')
        .eq('linked_barcode', code.trim())
        .eq('status', 'available')
        .limit(1)
        .maybeSingle();

      unit = unitByLinked;
    }

    if (!unit) {
      setScanNotification(`Code inconnu: ${code}`);
      setTimeout(() => setScanNotification(null), 3000);
      return false;
    }

    if (unit.status !== 'available') {
      const statusLabel = unit.status === 'sold' ? 'deja vendu' : unit.status;
      setScanNotification(`Code ${statusLabel}: ${code}`);
      setTimeout(() => setScanNotification(null), 3000);
      return false;
    }

    const med = (unit as any).medications as Medication;
    if (!med) return false;

    const inventoryUnit: InventoryUnit = {
      id: unit.id,
      unit_code: unit.unit_code,
      medication_id: unit.medication_id,
      batch_number: unit.batch_number,
      expiry_date: unit.expiry_date,
      status: unit.status,
      imported_code: unit.imported_code,
    };

    addUnitToGlobalCart(med, inventoryUnit);
    triggerScanSuccess();
    setScanNotification(`${med.name} (${unit.unit_code}) ajoute au panier`);
    setTimeout(() => setScanNotification(null), 3000);
    return true;
  };

  const lookupUnitCode = async (code: string): Promise<Medication | null> => {
    const { data: unit } = await supabase
      .from('inventory_units')
      .select('*, medications(*)')
      .eq('unit_code', code.trim())
      .maybeSingle();

    if (!unit) {
      setScanNotification(`Code unitaire inconnu: ${code}`);
      setTimeout(() => setScanNotification(null), 3000);
      return null;
    }

    if (unit.status !== 'available') {
      const statusLabel = unit.status === 'sold' ? 'deja vendu' : unit.status;
      setScanNotification(`Code ${statusLabel}: ${code}`);
      setTimeout(() => setScanNotification(null), 3000);
      return null;
    }

    const med = (unit as any).medications as Medication;
    if (!med) return null;

    if (!scannedUnitCodesRef.current[med.id]) {
      scannedUnitCodesRef.current[med.id] = [];
    }
    scannedUnitCodesRef.current[med.id].push(code.trim());

    return med;
  };

  const searchByBarcode = async (barcode: string) => {
    if (!barcode || barcode.trim().length === 0) {
      alert('Veuillez entrer un code-barres');
      return;
    }

    if (isUnitMode) {
      setIsLoading(true);
      try {
        const added = await lookupUnitCodeAndAddToCart(barcode.trim());
        if (added) {
          setShowBarcodeInput(false);
          setBarcodeInput('');
          return;
        }
      } finally {
        setIsLoading(false);
      }
      if (isUnitCode(barcode)) return;
    }

    setIsLoading(true);
    try {
      const { data: barcodeData } = await supabase
        .from('barcodes')
        .select('medication_id, code_produit')
        .eq('barcode', barcode.trim())
        .maybeSingle();

      if (barcodeData && barcodeData.medication_id) {
        const { data: medication } = await supabase
          .from('medications')
          .select('*')
          .eq('id', barcodeData.medication_id)
          .maybeSingle();

        if (medication) {
          setFoundMedication(medication);

          const parsed = {
            gtin: medication.gtin || '',
            lot: medication.batch_number,
            expiry: new Date(medication.expiry_date).toLocaleDateString('fr-FR'),
            expiryFormatted: medication.expiry_date
          };
          setScannedData(parsed);

          setScanNotification(`${medication.name} ${medication.dosage}`);
          setTimeout(() => setScanNotification(null), 3000);

          triggerScanSuccess();
          setShowBarcodeInput(false);
          setBarcodeInput('');
        } else {
          alert('Médicament non trouvé');
        }
      } else {
        alert(`Code-barres ${barcode} non trouvé dans la base de données`);
      }
    } catch (error) {
      console.error('Error searching barcode:', error);
      alert('Erreur lors de la recherche');
    } finally {
      setIsLoading(false);
    }
  };

  const applyFoundMedication = (medication: Medication, parsedGs1?: { gtin: string; lot: string; expiryFormatted: string; expiry: string }) => {
    triggerScanSuccess();

    const lotNum = parsedGs1?.lot || medication.batch_number || '';
    const label = `Produit détecté : ${medication.name} ${medication.dosage}${lotNum ? ` | Lot : ${lotNum}` : ''}`;

    if (scanMode === 'sale') {
      const existing = cart.find(item => item.medication.id === medication.id);
      const newQty = (existing?.quantity || 0) + 1;

      if (medication.quantity === 0) {
        setScanNotification(`Stock épuisé : ${medication.name}`);
        setTimeout(() => setScanNotification(null), 3000);
        return;
      }
      if (!medication.price || medication.price === 0) {
        setScanNotification(`Prix non défini : ${medication.name}`);
        setTimeout(() => setScanNotification(null), 3000);
        return;
      }
      if (newQty > medication.quantity) {
        setScanNotification(`Stock insuffisant : ${medication.name}`);
        setTimeout(() => setScanNotification(null), 3000);
        return;
      }

      if (existing) {
        setCart(prev => prev.map(item =>
          item.medication.id === medication.id ? { ...item, quantity: item.quantity + 1 } : item
        ));
      } else {
        setCart(prev => [...prev, { medication, quantity: 1 }]);
      }

      setScanNotification(label);
      setTimeout(() => setScanNotification(null), 4000);
    } else {
      const expDate = parsedGs1?.expiryFormatted || medication.expiry_date;
      const parsed = {
        gtin: parsedGs1?.gtin || medication.gtin || '',
        lot: parsedGs1?.lot || medication.batch_number,
        expiry: parsedGs1?.expiry || new Date(medication.expiry_date).toLocaleDateString('fr-FR'),
        expiryFormatted: expDate,
      };
      setScannedData(parsed);
      setFoundMedication(medication);
      setScanNotification(label);
      setTimeout(() => setScanNotification(null), 4000);
    }
  };

  const handleCameraScan = async (barcode: string) => {
    setRawScanFallback(null);

    if (isUnitMode) {
      if (isUnitCode(barcode)) {
        await lookupUnitCodeAndAddToCart(barcode.trim());
        return;
      }

      const foundByLinked = await lookupUnitCodeAndAddToCart(barcode.trim());
      if (foundByLinked) return;
    }

    const gs1Early = parseGS1Code(barcode);
    const cachedId = barcodeCache.get(barcode.trim()) ?? (gs1Early?.gtin ? barcodeCache.get(gs1Early.gtin) : null);
    if (cachedId) {
      const { data: cached } = await supabase.from('medications').select('*').eq('id', cachedId).maybeSingle();
      if (cached) {
        applyFoundMedication(cached, gs1Early ?? undefined);
        return;
      }
    }

    try {
      const { data: barcodeRow } = await supabase
        .from('barcodes')
        .select('medication_id')
        .eq('barcode', barcode.trim())
        .maybeSingle();

      if (barcodeRow?.medication_id) {
        const { data: medication } = await supabase
          .from('medications')
          .select('*')
          .eq('id', barcodeRow.medication_id)
          .maybeSingle();

        if (medication) {
          applyFoundMedication(medication);
          return;
        }
      }

      if (gs1Early?.gtin) {
        const { data: byGtin } = await supabase
          .from('medications')
          .select('*')
          .eq('gtin', gs1Early.gtin)
          .maybeSingle();

        if (byGtin) {
          applyFoundMedication(byGtin, gs1Early);
          return;
        }

        const { data: barcodeByGtin } = await supabase
          .from('barcodes')
          .select('medication_id')
          .eq('barcode', gs1Early.gtin)
          .maybeSingle();

        if (barcodeByGtin?.medication_id) {
          const { data: medication } = await supabase
            .from('medications')
            .select('*')
            .eq('id', barcodeByGtin.medication_id)
            .maybeSingle();

          if (medication) {
            applyFoundMedication(medication, gs1Early);
            return;
          }
        }
      }

      setRawScanFallback({
        code: barcode,
        gtin: gs1Early?.gtin,
        lot: gs1Early?.lot,
      });
    } catch {
      setScanNotification('Erreur lors de la recherche');
      setTimeout(() => setScanNotification(null), 2500);
    }
  };

  const addToCart = (medication: Medication) => {
    if (medication.quantity === 0) {
      return;
    }

    if (!medication.price || medication.price === 0) {
      return;
    }

    const existing = cart.find(item => item.medication.id === medication.id);
    if (existing) {
      const totalInCart = existing.quantity + 1;
      if (totalInCart <= medication.quantity) {
        setCart(cart.map(item =>
          item.medication.id === medication.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        ));
        setScanNotification(`Ajouté au panier: ${medication.name} (x${totalInCart})`);
        setTimeout(() => setScanNotification(null), 2000);
      } else {
        setScanNotification(`Stock insuffisant pour ${medication.name}`);
        setTimeout(() => setScanNotification(null), 2000);
      }
    } else {
      setCart([...cart, { medication, quantity: 1 }]);
      setScanNotification(`Ajouté au panier: ${medication.name}`);
      setTimeout(() => setScanNotification(null), 2000);
    }
  };

  const removeFromCart = (medicationId: string) => {
    setCart(cart.filter(item => item.medication.id !== medicationId));
  };

  const calculateTotal = () => {
    const subtotal = cart.reduce((sum, item) => {
      const price = item.medication.price || 0;
      return sum + (price * item.quantity);
    }, 0);
    const tax = subtotal * getTaxRate();
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const simulateScan = async () => {
    setIsScanning(true);
    setScannedData(null);
    setFoundMedication(null);
    setShowSuccess(false);

    setTimeout(async () => {
      setIsLoading(true);
      try {
        let selectedMed: Medication | null = null;

        if (scanMode === 'sale') {
          const { data: allMeds } = await supabase
            .from('medications')
            .select('*')
            .not('price', 'is', null)
            .gt('quantity', 0);

          const inStockMeds = allMeds || [];

          if (inStockMeds && inStockMeds.length > 0) {
            selectedMed = inStockMeds[Math.floor(Math.random() * inStockMeds.length)];
          } else {
            setIsScanning(false);
            setIsLoading(false);
            alert('Aucun médicament en stock pour la vente. Veuillez ajouter du stock d\'abord.');
            return;
          }
        } else {
          const rawDataMatrix = generateSampleDataMatrix();
          const parsed = parseDataMatrix(rawDataMatrix);

          if (!parsed) {
            setIsScanning(false);
            setIsLoading(false);
            alert('Erreur de lecture du code DataMatrix');
            return;
          }

          setScannedData(parsed);

          const medInfo = getMedicationInfoByGtin(parsed.gtin);
          if (medInfo) {
            setScanNotification(`${medInfo.name} ${medInfo.dosage}`);
            setTimeout(() => setScanNotification(null), 3000);
          }

          const { data: existingMed } = await supabase
            .from('medications')
            .select('*')
            .eq('batch_number', parsed.lot)
            .maybeSingle();

          if (existingMed) {
            selectedMed = existingMed;
          } else {
            if (medInfo) {
              const { data: newMed, error } = await insertWithUserId(
                'medications',
                [{
                  name: medInfo.name,
                  dosage: medInfo.dosage,
                  batch_number: parsed.lot,
                  expiry_date: parsed.expiryFormatted,
                  quantity: 0,
                  supplier: medInfo.supplier,
                  gtin: parsed.gtin,
                  price: medInfo.price,
                }]
              )
                .select()
                .single();

              if (error) throw error;
              selectedMed = newMed;
            }
          }
        }

        if (selectedMed) {
          if (scanMode === 'sale') {
            const parsed = {
              gtin: selectedMed.gtin || '',
              lot: selectedMed.batch_number,
              expiry: new Date(selectedMed.expiry_date).toLocaleDateString('fr-FR'),
              expiryFormatted: selectedMed.expiry_date
            };
            setScannedData(parsed);
            setScanNotification(`${selectedMed.name} ${selectedMed.dosage}`);
            setTimeout(() => setScanNotification(null), 3000);
          }

          setFoundMedication(selectedMed);
          triggerScanSuccess();
        }

        setIsScanning(false);
      } catch (error) {
        console.error('Error during scan simulation:', error);
        alert('Erreur lors de la simulation');
        setIsScanning(false);
      } finally {
        setIsLoading(false);
      }
    }, 1500);
  };

  const addToStock = async () => {
    if (!foundMedication) return;

    setIsLoading(true);
    try {
      const newQty = foundMedication.quantity + 1;
      const { error } = await updateWithUserId(
        'medications',
        { quantity: newQty },
        { id: foundMedication.id }
      );

      if (error) throw error;

      setFoundMedication({ ...foundMedication, quantity: newQty });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (error) {
      console.error('Error updating stock:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetScan = () => {
    setScannedData(null);
    setFoundMedication(null);
    setShowSuccess(false);
    setRawScanFallback(null);
  };

  const processSale = async () => {
    if (cart.length === 0) {
      alert('Le panier est vide');
      return;
    }

    setIsProcessing(true);
    try {
      const { subtotal, tax, total } = calculateTotal();
      const isOnline = offlineStorage.isOnline();

      if (isOnline) {
        const { data: saleData, error: saleError } = await insertWithUserId(
          'sales',
          [{
            total_amount: subtotal,
            tax_amount: tax,
            grand_total: total,
            payment_method: paymentMethod,
            customer_name: customerName || null,
          }]
        )
          .select()
          .single();

        if (saleError) throw saleError;

        const saleItems = cart.map(item => ({
          sale_id: saleData.id,
          medication_id: item.medication.id,
          medication_name: `${item.medication.name} ${item.medication.dosage}`,
          quantity: item.quantity,
          unit_price: item.medication.price || 0,
          subtotal: (item.medication.price || 0) * item.quantity,
        }));

        const { error: itemsError } = await insertWithUserId('sale_items', saleItems);

        if (itemsError) throw itemsError;

        const saleId = saleData.id;

        for (const item of cart) {
          if (isUnitMode) {
            const unitCodes = scannedUnitCodesRef.current[item.medication.id] || [];
            const toMark = unitCodes.slice(0, item.quantity);

            for (const unitCode of toMark) {
              await supabase
                .from('inventory_units')
                .update({ status: 'sold', sale_id: saleId, sold_at: new Date().toISOString() })
                .eq('unit_code', unitCode);
            }

            const { count: availableQty } = await supabase
              .from('inventory_units')
              .select('id', { count: 'exact', head: true })
              .eq('medication_id', item.medication.id)
              .eq('status', 'available');

            await updateWithUserId(
              'medications',
              { quantity: availableQty ?? 0 },
              { id: item.medication.id }
            );
          } else {
            const { data: currentMed } = await supabase
              .from('medications')
              .select('quantity')
              .eq('id', item.medication.id)
              .maybeSingle();

            const currentQty = currentMed?.quantity ?? 0;
            const newQty = Math.max(0, currentQty - item.quantity);

            const { error: updateError } = await updateWithUserId(
              'medications',
              { quantity: newQty },
              { id: item.medication.id }
            );

            if (updateError) throw updateError;
          }
        }

        // Journal des ventes : source unique pour les tableaux de bord.
        // ScanPage n'alimentait pas sales_journal → ses ventes étaient absentes
        // des dashboards. On l'ajoute pour rester cohérent avec Panier/Sales.
        const journalEntries = cart.map(item => ({
          sale_date: new Date().toISOString(),
          medication_id: item.medication.id,
          medication_name: `${item.medication.name} ${item.medication.dosage}`,
          quantity_sold: item.quantity,
          unit_price: item.medication.price || 0,
          total_price: (item.medication.price || 0) * item.quantity,
          payment_method: paymentMethod,
          stock_after_sale: Math.max(0, item.medication.quantity - item.quantity),
          synced: true,
        }));
        await insertWithUserId('sales_journal', journalEntries);

        scannedUnitCodesRef.current = {};
        setLastSale({ ...saleData, items: saleItems });
      } else {
        offlineStorage.addToQueue({
          type: 'insert',
          table: 'sales',
          data: {
            cart,
            total_amount: subtotal,
            tax_amount: tax,
            grand_total: total,
            payment_method: paymentMethod,
            customer_name: customerName || null,
          },
        });

        // Capture hors-ligne dans le journal local (rejoué par syncOfflineJournal)
        const saleDate = new Date().toISOString();
        for (const item of cart) {
          offlineStorage.addToSalesJournal({
            sale_date: saleDate,
            medication_id: item.medication.id,
            medication_name: `${item.medication.name} ${item.medication.dosage}`,
            quantity_sold: item.quantity,
            unit_price: item.medication.price || 0,
            total_price: (item.medication.price || 0) * item.quantity,
            payment_method: paymentMethod,
            stock_after_sale: Math.max(0, item.medication.quantity - item.quantity),
            synced: false,
          });
        }

        setLastSale({
          sale_date: new Date().toISOString(),
          total_amount: subtotal,
          tax_amount: tax,
          grand_total: total,
          payment_method: paymentMethod,
          items: cart.map(item => ({
            medication_name: `${item.medication.name} ${item.medication.dosage}`,
            quantity: item.quantity,
            unit_price: item.medication.price || 0,
            subtotal: (item.medication.price || 0) * item.quantity,
          })),
        });
      }

      setShowReceipt(true);
      setCart([]);
      setCustomerName('');
      resetScan();
    } catch (error) {
      console.error('Error processing sale:', error);
      alert('Erreur lors du traitement de la vente');
    } finally {
      setIsProcessing(false);
    }
  };

  if (showReceipt && lastSale) {
    return (
      <div className="pb-20 px-2 pt-6 space-y-6 bg-gray-50 min-h-screen">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="text-center mb-6">
            <Receipt className="w-12 h-12 text-green-600 mx-auto mb-2" />
            <h2 className="text-xl font-bold text-gray-900">Vente confirmée</h2>
            <p className="text-sm text-gray-600">
              {new Date(lastSale.sale_date).toLocaleString('fr-FR')}
            </p>
          </div>

          <div className="border-t border-b border-gray-200 py-4 mb-4 space-y-2">
            {lastSale.items?.map((item: any, index: number) => (
              <div key={index} className="flex justify-between text-sm">
                <span className="text-gray-700">
                  {item.medication_name} x{item.quantity}
                </span>
                <span className="font-medium text-gray-900">
                  {item.subtotal.toFixed(0)} FCFA
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-2 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Sous-total:</span>
              <span className="font-medium text-gray-900">
                {lastSale.total_amount.toFixed(0)} FCFA
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">TVA (18.9%):</span>
              <span className="font-medium text-gray-900">
                {lastSale.tax_amount.toFixed(0)} FCFA
              </span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span className="text-gray-900">Total:</span>
              <span className="text-green-600">
                {lastSale.grand_total.toFixed(0)} FCFA
              </span>
            </div>
          </div>

          <div className="text-center text-sm text-gray-600 mb-4">
            Mode de paiement: <span className="font-semibold">{lastSale.payment_method}</span>
          </div>

          <button
            onClick={() => {
              setShowReceipt(false);
              setLastSale(null);
            }}
            className="w-full px-4 py-4 bg-blue-600 text-white rounded-xl font-bold text-base hover:bg-blue-700 active:scale-95 transition-all shadow-lg"
          >
            Nouvelle vente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`px-1 pt-6 space-y-6 bg-gray-50 min-h-screen relative ${scanMode === 'sale' && cart.length > 0 ? 'pb-64' : 'pb-20'}`}>
      {showScanSuccess && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div className="absolute inset-0 bg-green-500 animate-flash-green"></div>
        </div>
      )}

      {scanNotification && (
        <div className="fixed top-4 left-4 right-4 z-50 animate-slide-down">
          <div className={`text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 ${
            scanNotification.startsWith('Stock') || scanNotification.startsWith('Prix')
              ? 'bg-orange-600'
              : 'bg-green-600'
          }`}>
            <CheckCircle className="w-6 h-6 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-sm leading-snug">{scanNotification}</p>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scanner</h1>
            <p className="text-sm text-gray-600 mt-1">
              {scanMode === 'stock' ? 'Scanner pour entrée de stock' : 'Scanner pour vente client'}
            </p>
          </div>
          {scanMode === 'sale' && cart.length > 0 && (
            <div className="bg-green-600 text-white px-4 py-2 rounded-full flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              <span className="font-bold">{cart.length}</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border-2 border-gray-200 p-1 shadow-sm">
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={() => setScanMode('stock')}
            className={`py-3 px-4 rounded-lg font-semibold text-sm transition-all ${
              scanMode === 'stock'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Entrée de Stock
          </button>
          <button
            onClick={() => setScanMode('sale')}
            className={`py-3 px-4 rounded-lg font-semibold text-sm transition-all ${
              scanMode === 'sale'
                ? 'bg-green-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Vente Client
          </button>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl overflow-hidden shadow-lg">
        <div className="relative aspect-square">
          <div className="absolute inset-0 flex items-center justify-center">
            {isScanning ? (
              <div className="relative">
                <div className="w-48 h-48 border-4 border-blue-500 rounded-lg animate-pulse"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full h-0.5 bg-blue-500 animate-scan"></div>
                </div>
              </div>
            ) : (
              <div className="w-48 h-48 border-4 border-gray-600 rounded-lg flex items-center justify-center">
                <Scan className="w-16 h-16 text-gray-600" />
              </div>
            )}
          </div>

          <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
            <div className="w-8 h-8 border-t-4 border-l-4 border-blue-500"></div>
            <div className="w-8 h-8 border-t-4 border-r-4 border-blue-500"></div>
          </div>
          <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
            <div className="w-8 h-8 border-b-4 border-l-4 border-blue-500"></div>
            <div className="w-8 h-8 border-b-4 border-r-4 border-blue-500"></div>
          </div>
        </div>

        <div className="p-4 bg-gray-900 border-t border-gray-700 space-y-2">
          <button
            onClick={() => setShowCameraScanner(true)}
            disabled={isScanning || isLoading}
            className="w-full bg-blue-600 text-white py-5 rounded-xl font-bold text-lg hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg"
          >
            <Camera className="w-6 h-6" />
            Scanner avec la caméra
          </button>
          <button
            onClick={() => setShowBarcodeInput(true)}
            disabled={isScanning || isLoading}
            className="w-full bg-gray-700 text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Package className="w-4 h-4" />
            Saisir le code manuellement
          </button>
          <button
            onClick={simulateScan}
            disabled={isScanning || isLoading}
            className="w-full text-gray-500 py-2 text-xs hover:text-gray-400 transition-colors flex items-center justify-center gap-1"
          >
            <Scan className="w-3 h-3" />
            {isScanning ? 'Simulation en cours...' : 'Mode démonstration'}
          </button>
        </div>
      </div>

      {scannedData && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Données scannées</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">GTIN:</span>
              <span className="font-mono font-semibold text-gray-900">{scannedData.gtin}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Lot:</span>
              <span className="font-mono font-semibold text-gray-900">{scannedData.lot}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Exp:</span>
              <span className="font-mono font-semibold text-gray-900">{scannedData.expiry}</span>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-6">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-gray-600 mt-3 text-sm">Recherche du produit...</p>
        </div>
      )}

      {rawScanFallback && (
        <InlineScanLink
          code={rawScanFallback.code}
          gtin={rawScanFallback.gtin}
          lot={rawScanFallback.lot}
          onLink={(medication) => {
            setRawScanFallback(null);
            applyFoundMedication(medication, rawScanFallback.gtin ? {
              gtin: rawScanFallback.gtin,
              lot: rawScanFallback.lot || '',
              expiryFormatted: '',
              expiry: '',
            } : undefined);
          }}
          onDismiss={() => setRawScanFallback(null)}
          onCreateNew={() => {
            setRawScanFallback(null);
            setIsModalOpen(true);
            if (rawScanFallback.gtin) {
              setScannedData({ gtin: rawScanFallback.gtin, lot: rawScanFallback.lot || '', expiry: '', expiryFormatted: '' });
            }
          }}
        />
      )}

      {!isLoading && scannedData && foundMedication && (() => {
        const daysUntilExpiry = getDaysUntilExpiry(foundMedication.expiry_date);
        const isExpired = daysUntilExpiry < 0;
        const isNearExpiry = daysUntilExpiry >= 0 && daysUntilExpiry < 90;
        const expiryStatus = isExpired ? 'PÉRIMÉ' : isNearExpiry ? 'PROCHE PÉREMPTION' : 'BON';

        return (
          <div className={isExpired ? 'bg-red-50 border-2 border-red-200 rounded-xl p-4 shadow-sm' : isNearExpiry ? 'bg-orange-50 border-2 border-orange-200 rounded-xl p-4 shadow-sm' : 'bg-green-50 border-2 border-green-200 rounded-xl p-4 shadow-sm'}>
            <div className="flex items-start gap-3 mb-4">
              <div className={isExpired ? 'bg-red-100 p-2 rounded-lg' : isNearExpiry ? 'bg-orange-100 p-2 rounded-lg' : 'bg-green-100 p-2 rounded-lg'}>
                <CheckCircle className={isExpired ? 'w-6 h-6 text-red-600' : isNearExpiry ? 'w-6 h-6 text-orange-600' : 'w-6 h-6 text-green-600'} />
              </div>
              <div className="flex-1">
                <h3 className={isExpired ? 'text-lg font-bold text-red-900' : isNearExpiry ? 'text-lg font-bold text-orange-900' : 'text-lg font-bold text-green-900'}>Produit scanné</h3>
                <p className={isExpired ? 'text-sm text-red-700' : isNearExpiry ? 'text-sm text-orange-700' : 'text-sm text-green-700'}>Médicament identifié avec succès</p>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 mb-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-gray-900 text-lg">{foundMedication.name}</h4>
                  <p className="text-sm text-gray-600">{foundMedication.dosage}</p>
                </div>
                {foundMedication.requires_verification && (
                  <span className="bg-orange-100 text-orange-700 text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    Vérification requise
                  </span>
                )}
              </div>

              <div className={isExpired ? 'bg-red-50 border border-red-200 rounded-lg p-3 mb-3' : isNearExpiry ? 'bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3' : 'bg-green-50 border border-green-200 rounded-lg p-3 mb-3'}>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className={isExpired ? 'w-4 h-4 text-red-600' : isNearExpiry ? 'w-4 h-4 text-orange-600' : 'w-4 h-4 text-green-600'} />
                  <span className="text-xs font-semibold text-gray-700">Statut péremption</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">Expire le:</p>
                    <p className="font-mono font-semibold text-gray-900">
                      {new Date(foundMedication.expiry_date).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <span className={isExpired ? 'bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full' : isNearExpiry ? 'bg-orange-600 text-white text-xs font-bold px-3 py-1 rounded-full' : 'bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full'}>
                    {expiryStatus}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {isExpired ? `Périmé depuis ${Math.abs(daysUntilExpiry)} jours` : `${daysUntilExpiry} jours restants`}
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Package className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-semibold text-gray-700">Traçabilité</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-gray-600">Fournisseur:</p>
                    <p className="font-semibold text-blue-900">{foundMedication.supplier || 'Non spécifié'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Lot:</p>
                    <p className="font-mono font-semibold text-gray-900">{foundMedication.batch_number}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Stock actuel:</span>
                  <span className="font-bold text-blue-600 text-xl">{foundMedication.quantity}</span>
                </div>
                {isManager && foundMedication.wholesale_price && foundMedication.wholesale_price > 0 && (
                  <div className="flex items-center justify-between py-2 px-3 bg-blue-50 rounded-lg">
                    <span className="text-sm text-gray-600">Prix d'achat (Gérant):</span>
                    <span className="font-bold text-blue-600 text-xl">{foundMedication.wholesale_price.toFixed(0)} FCFA</span>
                  </div>
                )}
                {foundMedication.price && (
                  <div className="flex items-center justify-between py-2 px-3 bg-green-50 rounded-lg">
                    <span className="text-sm text-gray-600">Prix de vente:</span>
                    <span className="font-bold text-green-600 text-xl">{foundMedication.price.toFixed(0)} FCFA</span>
                  </div>
                )}
                {isManager && foundMedication.price && foundMedication.wholesale_price && foundMedication.wholesale_price > 0 && (
                  <div className="flex items-center justify-between py-2 px-3 bg-purple-50 rounded-lg">
                    <span className="text-sm text-gray-600">Marge (Gérant):</span>
                    <span className="font-bold text-purple-600 text-xl">
                      {((foundMedication.price - foundMedication.wholesale_price) / foundMedication.wholesale_price * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
                {!foundMedication.price && scanMode === 'sale' && (
                  <div className="py-2 px-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="text-sm text-orange-800 font-medium">Prix non défini - Définir un prix dans Stock</p>
                  </div>
                )}
              </div>
            </div>

            {showSuccess && (
              <div className="bg-green-100 border border-green-300 text-green-800 px-4 py-2 rounded-lg mb-3 text-sm font-medium text-center">
                Stock mis à jour avec succès!
              </div>
            )}

            {scanMode === 'stock' && (
              <div className="flex gap-3">
                <button
                  onClick={addToStock}
                  disabled={isLoading}
                  className="flex-1 bg-green-600 text-white py-4 rounded-xl font-bold text-base hover:bg-green-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                >
                  <Plus className="w-5 h-5" />
                  Ajouter +1
                </button>
                <button
                  onClick={resetScan}
                  className="px-6 py-4 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 active:scale-95 transition-all"
                >
                  Nouveau
                </button>
              </div>
            )}

            {scanMode === 'sale' && (
              <div className="space-y-2">
                {foundMedication.quantity === 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                    <p className="text-sm text-red-800 font-medium">Stock épuisé - Veuillez ajouter du stock d'abord</p>
                  </div>
                )}
                {foundMedication.quantity > 0 && !foundMedication.price && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                    <p className="text-sm text-orange-800 font-medium">Prix non défini - Définir dans Stock</p>
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => addToCart(foundMedication)}
                    disabled={isLoading || foundMedication.quantity === 0 || !foundMedication.price}
                    className="flex-1 bg-green-600 text-white py-4 rounded-xl font-bold text-base hover:bg-green-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
                  >
                    <ShoppingCart className="w-5 h-5" />
                    Ajouter au panier
                  </button>
                  <button
                    onClick={resetScan}
                    className="px-6 py-4 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 active:scale-95 transition-all"
                  >
                    Nouveau
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {!isLoading && scannedData && !foundMedication && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-start gap-3 mb-4">
            <div className="bg-amber-100 p-2 rounded-lg">
              <AlertCircle className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-amber-900">Produit inconnu</h3>
              <p className="text-sm text-amber-700">Ce produit n'est pas dans votre base de données</p>
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 mb-4">
            <div className="flex items-center justify-center py-6">
              <Package className="w-16 h-16 text-gray-300" />
            </div>
            <p className="text-center text-gray-600 text-sm">
              GTIN <span className="font-mono font-semibold">{scannedData.gtin}</span> non reconnu
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex-1 bg-blue-600 text-white py-4 rounded-xl font-bold text-base hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <Plus className="w-5 h-5" />
              Créer fiche
            </button>
            <button
              onClick={resetScan}
              className="px-6 py-4 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 active:scale-95 transition-all"
            >
              Nouveau
            </button>
          </div>
        </div>
      )}

      {scanMode === 'sale' && cart.length > 0 && (
        <div className="fixed bottom-16 left-0 right-0 bg-white border-t-2 border-gray-200 shadow-2xl z-50">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-gray-700" />
                <h3 className="font-bold text-gray-900">Panier ({cart.length})</h3>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-600">Total TTC</p>
                <p className="text-lg font-bold text-green-600">
                  {calculateTotal().total.toFixed(0)} FCFA
                </p>
              </div>
            </div>

            <div className="max-h-32 overflow-y-auto mb-3 space-y-2">
              {cart.map((item) => (
                <div key={item.medication.id} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{item.medication.name}</p>
                    <p className="text-xs text-gray-600">
                      {(item.medication.price || 0).toFixed(0)} FCFA × {item.quantity}
                    </p>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.medication.id)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowPaymentModal(true)}
              disabled={isProcessing}
              className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-base hover:bg-green-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
            >
              <CreditCard className="w-5 h-5" />
              {isProcessing ? 'Traitement...' : 'Finaliser la vente'}
            </button>
          </div>
        </div>
      )}

      {showBarcodeInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full overflow-hidden">
            <div className="bg-green-600 px-6 py-4">
              <h3 className="text-xl font-bold text-white">
                {isUnitMode ? 'Scanner code unitaire' : 'Saisir le code-barres'}
              </h3>
              <p className="text-green-100 text-sm mt-1">
                {isUnitMode ? 'Entrez le code JP-... de la boite physique' : 'Entrez le code-barres du produit'}
              </p>
            </div>

            <div className="p-6 space-y-4">
              {isUnitMode && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-start gap-2">
                  <ScanLine className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-green-800">
                    Mode Unitaire — Scannez le code unique de la boite (format : JP-XXXXXX-...) ou un ancien code interne importé.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {isUnitMode ? 'Code unitaire' : 'Code-barres'}
                </label>
                <input
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && barcodeInput.trim()) {
                      searchByBarcode(barcodeInput);
                    }
                  }}
                  placeholder={isUnitMode ? 'Ex: JP-A1B2C3-1710000000000-0001' : 'Ex: 3401234567890'}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-green-600 focus:outline-none text-lg font-mono"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowBarcodeInput(false);
                    setBarcodeInput('');
                  }}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-all active:scale-95"
                >
                  Annuler
                </button>
                <button
                  onClick={() => searchByBarcode(barcodeInput)}
                  disabled={!barcodeInput.trim() || isLoading}
                  className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Recherche...' : 'Rechercher'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full overflow-hidden">
            <div className="bg-green-600 px-6 py-4">
              <h3 className="text-xl font-bold text-white">Finaliser la vente</h3>
              <p className="text-green-100 text-sm mt-1">
                Total à payer: <span className="font-bold text-white">{calculateTotal().total.toFixed(0)} FCFA</span>
              </p>
            </div>

            <div className="p-6 space-y-3">
              <p className="text-sm text-gray-600 mb-4">Choisissez le mode de paiement:</p>

              <button
                onClick={() => {
                  setPaymentMethod('Espèces');
                  setShowPaymentModal(false);
                  processSale();
                }}
                disabled={isProcessing}
                className="w-full flex items-center gap-4 p-4 bg-green-50 hover:bg-green-100 border-2 border-green-200 rounded-xl transition-all active:scale-95 disabled:opacity-50"
              >
                <div className="bg-green-600 p-3 rounded-lg">
                  <Banknote className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-bold text-gray-900">Espèces</p>
                  <p className="text-xs text-gray-600">Paiement en cash</p>
                </div>
              </button>

              <button
                onClick={() => {
                  setPaymentMethod('Carte Bancaire');
                  setShowPaymentModal(false);
                  processSale();
                }}
                disabled={isProcessing}
                className="w-full flex items-center gap-4 p-4 bg-blue-50 hover:bg-blue-100 border-2 border-blue-200 rounded-xl transition-all active:scale-95 disabled:opacity-50"
              >
                <div className="bg-blue-600 p-3 rounded-lg">
                  <CreditCard className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-bold text-gray-900">Carte Bancaire</p>
                  <p className="text-xs text-gray-600">Paiement par carte</p>
                </div>
              </button>

              <button
                onClick={() => {
                  setPaymentMethod('MTN Mobile Money');
                  setShowPaymentModal(false);
                  processSale();
                }}
                disabled={isProcessing}
                className="w-full flex items-center gap-4 p-4 bg-yellow-50 hover:bg-yellow-100 border-2 border-yellow-200 rounded-xl transition-all active:scale-95 disabled:opacity-50"
              >
                <div className="bg-yellow-600 p-3 rounded-lg">
                  <Smartphone className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-bold text-gray-900">MTN Mobile Money</p>
                  <p className="text-xs text-gray-600">Paiement mobile</p>
                </div>
              </button>

              <button
                onClick={() => {
                  setPaymentMethod('Airtel Money');
                  setShowPaymentModal(false);
                  processSale();
                }}
                disabled={isProcessing}
                className="w-full flex items-center gap-4 p-4 bg-red-50 hover:bg-red-100 border-2 border-red-200 rounded-xl transition-all active:scale-95 disabled:opacity-50"
              >
                <div className="bg-red-600 p-3 rounded-lg">
                  <Smartphone className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-bold text-gray-900">Airtel Money</p>
                  <p className="text-xs text-gray-600">Paiement mobile</p>
                </div>
              </button>

              <button
                onClick={() => setShowPaymentModal(false)}
                className="w-full mt-4 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-all active:scale-95"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {showCameraScanner && (
        <CameraScanner
          onScan={handleCameraScan}
          onClose={() => setShowCameraScanner(false)}
          onProductSelect={(med) => {
            if (scanMode === 'sale') {
              setScanNotification(`${med.name} ajouté au panier`);
              setTimeout(() => setScanNotification(null), 2500);
            } else {
              applyFoundMedication(med);
            }
          }}
          continuous={scanMode === 'sale'}
          title={scanMode === 'sale' ? 'Scanner — Vente' : 'Scanner — Stock'}
          subtitle={scanMode === 'sale' ? 'Scan nom — Ajout direct au panier' : 'Scan pour identifier le produit'}
          medications={scanMedications}
        />
      )}

      <AddMedicationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          setIsModalOpen(false);
          resetScan();
        }}
        prefillData={{
          batch_number: scannedData?.lot,
          expiry_date: scannedData?.expiryFormatted,
          gtin: scannedData?.gtin,
        }}
      />

    </div>
  );
}
