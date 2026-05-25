import { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Trash2, CreditCard, Banknote, Smartphone, Receipt, AlertTriangle, X } from 'lucide-react';
import { supabase, fetchAllMedications, Medication } from '../lib/supabase';
import { insertWithUserId, updateWithUserId } from '../lib/supabaseHelpers';
import { offlineStorage } from '../lib/offlineStorage';

interface CartItem {
  medication: Medication;
  quantity: number;
}

interface LowStockAlert {
  id: string;
  name: string;
  stockAfter: number;
  minimumStock: number;
}

const TAX_RATE = 0.189;

export default function Sales() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Espèces' | 'Carte Bancaire' | 'MTN Mobile Money'>('Espèces');
  const [customerName, setCustomerName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [lowStockAlerts, setLowStockAlerts] = useState<LowStockAlert[]>([]);

  useEffect(() => {
    loadMedications();

    const handleOnlineSync = () => {
      syncPendingSales();
    };
    window.addEventListener('online-sync-required', handleOnlineSync);
    return () => window.removeEventListener('online-sync-required', handleOnlineSync);
  }, []);

  const loadMedications = async () => {
    const cached = offlineStorage.getCachedMedications();
    if (cached.length > 0) {
      setMedications(cached.filter(m => m.quantity > 0));
    }

    if (!offlineStorage.isOnline()) {
      return;
    }

    try {
      const data = await fetchAllMedications();
      const inStock = data.filter(med => med.quantity > 0);
      setMedications(inStock);
      offlineStorage.cacheMedications(inStock);
    } catch (error) {
      console.error('Error loading medications from cloud:', error);
    }
  };

  const syncPendingSales = async () => {
    const queue = offlineStorage.getQueue();
    const salesQueue = queue.filter(op => op.table === 'sales' && op.type === 'insert');

    for (const pendingSale of salesQueue) {
      try {
        const { data: saleData, error: saleError } = await insertWithUserId(
          'sales',
          [{
            total_amount: pendingSale.data.total_amount,
            tax_amount: pendingSale.data.tax_amount,
            grand_total: pendingSale.data.grand_total,
            payment_method: pendingSale.data.payment_method,
            customer_name: pendingSale.data.customer_name,
          }]
        )
          .select()
          .single();

        if (saleError) {
          console.error('Sync error:', saleError);
          continue;
        }

        const saleItems = pendingSale.data.cart.map((item: any) => ({
          sale_id: saleData.id,
          medication_id: item.medication_id,
          medication_name: item.medication_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
        }));

        await insertWithUserId('sale_items', saleItems);

        if (pendingSale.data.stock_updates) {
          for (const update of pendingSale.data.stock_updates) {
            await updateWithUserId(
              'medications',
              { quantity: update.newQty },
              { id: update.id }
            );
          }
        }

        const journalEntries = pendingSale.data.cart.map((item: any) => {
          const stockUpdate = pendingSale.data.stock_updates?.find((u: any) => u.id === item.medication_id);
          return {
            sale_date: pendingSale.data.sale_date,
            medication_id: item.medication_id,
            medication_name: item.medication_name,
            quantity_sold: item.quantity,
            unit_price: item.unit_price,
            total_price: item.subtotal,
            payment_method: pendingSale.data.payment_method,
            stock_after_sale: stockUpdate?.newQty ?? 0,
            synced: true,
          };
        });

        await insertWithUserId('sales_journal', journalEntries);

        offlineStorage.removeFromQueue(pendingSale.id);
      } catch (error) {
        console.error('Error syncing sale:', error);
      }
    }

    loadMedications();
  };

  const filteredMedications = medications.filter(med =>
    med.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    med.dosage.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addToCart = (medication: Medication) => {
    const existing = cart.find(item => item.medication.id === medication.id);
    if (existing) {
      if (existing.quantity < medication.quantity) {
        setCart(cart.map(item =>
          item.medication.id === medication.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        ));
      } else {
        alert('Stock insuffisant');
      }
    } else {
      setCart([...cart, { medication, quantity: 1 }]);
    }
  };

  const removeFromCart = (medicationId: string) => {
    setCart(cart.filter(item => item.medication.id !== medicationId));
  };

  const updateQuantity = (medicationId: string, quantity: number) => {
    const item = cart.find(i => i.medication.id === medicationId);
    if (item && quantity > 0 && quantity <= item.medication.quantity) {
      setCart(cart.map(i =>
        i.medication.id === medicationId ? { ...i, quantity } : i
      ));
    }
  };

  const calculateTotal = () => {
    const subtotal = cart.reduce((sum, item) => {
      const price = item.medication.price || 0;
      return sum + (price * item.quantity);
    }, 0);
    const tax = subtotal * TAX_RATE;
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const processSale = async () => {
    if (cart.length === 0) {
      alert('Le panier est vide');
      return;
    }

    setIsProcessing(true);
    const alerts: LowStockAlert[] = [];
    const saleDate = new Date().toISOString();
    const { subtotal, tax, total } = calculateTotal();

    const stockUpdates: { id: string; newQty: number; name: string; minimumStock: number }[] = [];
    for (const item of cart) {
      const newQty = Math.max(0, item.medication.quantity - item.quantity);
      stockUpdates.push({
        id: item.medication.id,
        newQty,
        name: item.medication.name,
        minimumStock: item.medication.minimum_stock || 0,
      });
    }

    const cachedMeds = offlineStorage.getCachedMedications();
    const updatedMeds = cachedMeds.map(med => {
      const update = stockUpdates.find(u => u.id === med.id);
      if (update) {
        return { ...med, quantity: update.newQty };
      }
      return med;
    });
    offlineStorage.cacheMedications(updatedMeds);

    for (const item of cart) {
      const stockAfter = Math.max(0, item.medication.quantity - item.quantity);
      offlineStorage.addToSalesJournal({
        sale_date: saleDate,
        medication_id: item.medication.id,
        medication_name: `${item.medication.name} ${item.medication.dosage}`,
        quantity_sold: item.quantity,
        unit_price: item.medication.price || 0,
        total_price: (item.medication.price || 0) * item.quantity,
        payment_method: paymentMethod,
        stock_after_sale: stockAfter,
        synced: false,
      });
    }

    offlineStorage.addToQueue({
      type: 'insert',
      table: 'sales',
      data: {
        cart: cart.map(item => ({
          medication_id: item.medication.id,
          medication_name: `${item.medication.name} ${item.medication.dosage}`,
          quantity: item.quantity,
          unit_price: item.medication.price || 0,
          subtotal: (item.medication.price || 0) * item.quantity,
        })),
        stock_updates: stockUpdates.map(u => ({ id: u.id, newQty: u.newQty })),
        total_amount: subtotal,
        tax_amount: tax,
        grand_total: total,
        payment_method: paymentMethod,
        customer_name: customerName || null,
        sale_date: saleDate,
      },
    });

    for (const update of stockUpdates) {
      if (update.newQty < update.minimumStock && update.minimumStock > 0) {
        alerts.push({
          id: update.id,
          name: update.name,
          stockAfter: update.newQty,
          minimumStock: update.minimumStock,
        });
      }
    }

    if (alerts.length > 0) {
      setLowStockAlerts(alerts);
    }

    setLastSale({
      sale_date: saleDate,
      total_amount: subtotal,
      tax_amount: tax,
      grand_total: total,
      payment_method: paymentMethod,
      items: cart.map(item => ({
        medication_name: `${item.medication.name} ${item.medication.dosage}`,
        quantity: item.quantity,
        subtotal: (item.medication.price || 0) * item.quantity,
      })),
    });

    setShowReceipt(true);
    setCart([]);
    setCustomerName('');
    setSearchTerm('');

    setMedications(updatedMeds.filter(m => m.quantity > 0));

    if (offlineStorage.isOnline()) {
      syncToCloud(saleDate, subtotal, tax, total, stockUpdates);
    }

    setIsProcessing(false);
  };

  const syncToCloud = async (
    saleDate: string,
    subtotal: number,
    tax: number,
    total: number,
    stockUpdates: { id: string; newQty: number }[]
  ) => {
    try {
      const queue = offlineStorage.getQueue();
      const pendingSale = queue[queue.length - 1];
      if (!pendingSale) return;

      const { data: saleData, error: saleError } = await insertWithUserId(
        'sales',
        [{
          total_amount: subtotal,
          tax_amount: tax,
          grand_total: total,
          payment_method: pendingSale.data.payment_method,
          customer_name: pendingSale.data.customer_name,
        }]
      )
        .select()
        .single();

      if (saleError) {
        console.error('Cloud sync failed for sale:', saleError);
        return;
      }

      const saleItems = pendingSale.data.cart.map((item: any) => ({
        sale_id: saleData.id,
        medication_id: item.medication_id,
        medication_name: item.medication_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
      }));

      await insertWithUserId('sale_items', saleItems);

      for (const update of stockUpdates) {
        await updateWithUserId(
          'medications',
          { quantity: update.newQty },
          { id: update.id }
        );
      }

      const journalEntries = pendingSale.data.cart.map((item: any) => {
        const stockUpdate = stockUpdates.find(u => u.id === item.medication_id);
        return {
          sale_date: saleDate,
          medication_id: item.medication_id,
          medication_name: item.medication_name,
          quantity_sold: item.quantity,
          unit_price: item.unit_price,
          total_price: item.subtotal,
          payment_method: pendingSale.data.payment_method,
          stock_after_sale: stockUpdate?.newQty ?? 0,
          synced: true,
        };
      });

      await insertWithUserId('sales_journal', journalEntries);

      offlineStorage.removeFromQueue(pendingSale.id);
    } catch (error) {
      console.error('Cloud sync error:', error);
    }
  };

  const printReceipt = () => {
    window.print();
  };

  const dismissAlert = (id: string) => {
    setLowStockAlerts(alerts => alerts.filter(a => a.id !== id));
  };

  const dismissAllAlerts = () => {
    setLowStockAlerts([]);
  };

  const { subtotal, tax, total } = calculateTotal();

  if (showReceipt && lastSale) {
    return (
      <div className="pb-20 px-1 pt-6 space-y-6 bg-gray-50 min-h-screen">
        {lowStockAlerts.length > 0 && (
          <div className="space-y-2">
            {lowStockAlerts.map(alert => (
              <div
                key={alert.id}
                className="bg-orange-50 border border-orange-300 rounded-xl p-4 flex items-start gap-3"
              >
                <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-orange-800">
                    Attention : Stock faible pour {alert.name}
                  </p>
                  <p className="text-sm text-orange-700 mt-0.5">
                    Stock restant: {alert.stockAfter} (seuil mini: {alert.minimumStock})
                  </p>
                </div>
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="p-1 text-orange-600 hover:bg-orange-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {lowStockAlerts.length > 1 && (
              <button
                onClick={dismissAllAlerts}
                className="w-full text-center text-sm text-orange-600 py-2 hover:underline"
              >
                Fermer toutes les alertes
              </button>
            )}
          </div>
        )}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="text-center mb-6">
            <Receipt className="w-12 h-12 text-green-600 mx-auto mb-2" />
            <h2 className="text-xl font-bold text-gray-900">Vente confirmée</h2>
            <p className="text-sm text-gray-600">
              {new Date(lastSale.sale_date).toLocaleString('fr-FR')}
            </p>
          </div>

          <div className="border-t border-b border-gray-200 py-4 mb-4 space-y-2">
            {cart.length > 0 ? cart.map((item, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span className="text-gray-700">
                  {item.medication.name} x{item.quantity}
                </span>
                <span className="font-medium text-gray-900">
                  {((item.medication.price || 0) * item.quantity).toFixed(0)} FCFA
                </span>
              </div>
            )) : lastSale.items?.map((item: any, index: number) => (
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

          <div className="flex gap-3">
            <button
              onClick={() => setShowReceipt(false)}
              className="flex-1 px-4 py-4 bg-blue-600 text-white rounded-xl font-bold text-base hover:bg-blue-700 active:scale-95 transition-all shadow-lg"
            >
              Nouvelle vente
            </button>
            <button
              onClick={printReceipt}
              className="px-6 py-4 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 active:scale-95 transition-all"
            >
              Imprimer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-20 px-1 pt-6 space-y-6 bg-gray-50 min-h-screen">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Point de Vente</h1>
        <p className="text-sm text-gray-600 mt-1">Effectuer une vente</p>
      </div>

      <div>
        <input
          type="text"
          placeholder="Rechercher un médicament..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {searchTerm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm max-h-60 overflow-y-auto">
          {filteredMedications.length === 0 ? (
            <p className="text-center py-6 text-gray-500 text-sm">Aucun produit trouvé</p>
          ) : (
            filteredMedications.map((med) => (
              <button
                key={med.id}
                onClick={() => addToCart(med)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
              >
                <div className="text-left">
                  <p className="font-medium text-gray-900">{med.name}</p>
                  <p className="text-sm text-gray-600">{med.dosage} • Stock: {med.quantity}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-blue-600">{(med.price || 0).toFixed(0)} FCFA</p>
                  <Plus className="w-5 h-5 text-gray-400 ml-auto" />
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {cart.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingCart className="w-5 h-5 text-gray-700" />
            <h3 className="font-semibold text-gray-900">Panier ({cart.length})</h3>
          </div>

          <div className="space-y-3 mb-4">
            {cart.map((item) => (
              <div key={item.medication.id} className="flex items-center gap-3 pb-3 border-b border-gray-100 last:border-b-0">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 text-sm">{item.medication.name}</p>
                  <p className="text-xs text-gray-600">{item.medication.dosage}</p>
                  <p className="text-xs font-medium text-blue-600 mt-1">
                    {(item.medication.price || 0).toFixed(0)} FCFA × {item.quantity}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min="1"
                    max={item.medication.quantity}
                    value={item.quantity}
                    onChange={(e) => updateQuantity(item.medication.id, parseInt(e.target.value))}
                    className="w-16 px-2 py-2 border-2 border-gray-300 rounded-lg text-center text-base font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={() => removeFromCart(item.medication.id)}
                    className="p-3 text-red-600 hover:bg-red-50 rounded-lg active:scale-95 transition-all"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 pt-3 border-t border-gray-200">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Sous-total:</span>
              <span className="font-medium text-gray-900">{subtotal.toFixed(0)} FCFA</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">TVA (18.9%):</span>
              <span className="font-medium text-gray-900">{tax.toFixed(0)} FCFA</span>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span className="text-gray-900">Total:</span>
              <span className="text-green-600">{total.toFixed(0)} FCFA</span>
            </div>
          </div>
        </div>
      )}

      {cart.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mode de paiement
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setPaymentMethod('Espèces')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 active:scale-95 transition-all ${
                  paymentMethod === 'Espèces'
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <Banknote className="w-7 h-7" />
                <span className="text-xs font-semibold">Espèces</span>
              </button>
              <button
                onClick={() => setPaymentMethod('Carte Bancaire')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 active:scale-95 transition-all ${
                  paymentMethod === 'Carte Bancaire'
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <CreditCard className="w-7 h-7" />
                <span className="text-xs font-semibold">Carte</span>
              </button>
              <button
                onClick={() => setPaymentMethod('MTN Mobile Money')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 active:scale-95 transition-all ${
                  paymentMethod === 'MTN Mobile Money'
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <Smartphone className="w-7 h-7" />
                <span className="text-xs font-semibold">MTN MM</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom du client (optionnel)
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nom du client"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={processSale}
            disabled={isProcessing}
            className="w-full bg-green-600 text-white py-5 rounded-xl font-bold text-lg hover:bg-green-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg"
          >
            <CreditCard className="w-6 h-6" />
            {isProcessing ? 'Traitement...' : `Vendre - ${total.toFixed(0)} FCFA`}
          </button>
        </div>
      )}
    </div>
  );
}
