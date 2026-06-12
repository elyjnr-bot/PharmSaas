import { useState, useRef, useMemo } from 'react';
import { ShoppingCart, X, Trash2, Banknote, CreditCard, Smartphone, Check, Package, BookOpen } from 'lucide-react';
import { useCart } from '../lib/cartContext';
import { useSeller } from '../lib/sellerContext';
import { supabase } from '../lib/supabase';
import { insertWithUserId, updateWithUserId } from '../lib/supabaseHelpers';
import { offlineStorage } from '../lib/offlineStorage';
import { db } from '../lib/db';
import { offlineSafeInsertCredit } from '../lib/writeService';
import { getTaxRate } from '../lib/settings';
import CreditModal from './CreditModal';

const QUICK_AMOUNTS = [5000, 10000, 20000, 50000];

export default function Panier() {
  const { cart, removeUnitFromCart, clearCart, isUnitMode } = useCart();
  const { activeSeller } = useSeller();
  const [paymentMethod, setPaymentMethod] = useState<'Especes' | 'Carte Bancaire' | 'MTN Mobile Money' | 'Airtel Money'>('Especes');
  const [amountReceived, setAmountReceived] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSaleConfirm, setShowSaleConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [isCreditProcessing, setIsCreditProcessing] = useState(false);
  const paymentPanelRef = useRef<HTMLDivElement>(null);

  const subtotal = cart.reduce((sum, item) => sum + (item.medication.price || 0) * item.quantity, 0);
  const tax = subtotal * getTaxRate();
  const total = subtotal + tax;

  const changeAmount = useMemo(() => {
    const received = parseFloat(amountReceived) || 0;
    return received - total;
  }, [amountReceived, total]);

  const handleInputFocus = () => {
    setTimeout(() => {
      paymentPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 300);
  };

  const processSale = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    const saleDate = new Date().toISOString();

    const stockUpdates: { id: string; newQty: number }[] = [];
    const saleIds: string[] = [];
    const unitIdsToMarkSold: string[] = [];

    for (const item of cart) {
      stockUpdates.push({ id: item.medication.id, newQty: Math.max(0, item.medication.quantity - item.quantity) });

      if (isUnitMode && item.units) {
        for (const unit of item.units) {
          unitIdsToMarkSold.push(unit.id);
        }
      }
    }

    for (const item of cart) {
      const stockAfter = Math.max(0, item.medication.quantity - item.quantity);
      const saleId = `sale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      saleIds.push(saleId);

      const unitCodes = isUnitMode && item.units ? item.units.map(u => u.unit_code).join(', ') : null;

      offlineStorage.addToSalesJournal({
        sale_date: saleDate,
        medication_id: item.medication.id,
        medication_name: `${item.medication.name} ${item.medication.dosage}`,
        quantity_sold: item.quantity,
        unit_price: item.medication.price || 0,
        total_price: (item.medication.price || 0) * item.quantity,
        payment_method: paymentMethod,
        stock_after_sale: stockAfter,
        seller_name: activeSeller?.name,
        synced: false,
        unit_codes: unitCodes,
      });

      await db.sales.add({
        id: saleId,
        medication_id: item.medication.id,
        medication_name: `${item.medication.name} ${item.medication.dosage}`,
        quantity_sold: item.quantity,
        unit_price: item.medication.price || 0,
        total_price: (item.medication.price || 0) * item.quantity,
        payment_method: paymentMethod,
        seller_id: activeSeller?.id,
        seller_name: activeSeller?.name,
        sale_date: saleDate,
        synced: false,
        created_at: saleDate,
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
          unit_ids: isUnitMode && item.units ? item.units.map(u => u.id) : [],
        })),
        stock_updates: stockUpdates,
        total_amount: subtotal,
        tax_amount: tax,
        grand_total: total,
        payment_method: paymentMethod,
        sale_date: saleDate,
      },
    });

    for (const update of stockUpdates) {
      try {
        await db.products.update(update.id, { quantity: update.newQty, updated_at: saleDate });
      } catch {
      }
    }

    if (offlineStorage.isOnline()) {
      try {
        const { data: saleData, error: saleError } = await insertWithUserId(
          'sales',
          [{
            total_amount: subtotal,
            tax_amount: tax,
            grand_total: total,
            payment_method: paymentMethod,
            seller_name: activeSeller?.name || null,
          }]
        ).select()
          .single();

        if (!saleError && saleData) {
          const saleItems = cart.map(item => ({
            sale_id: saleData.id,
            medication_id: item.medication.id,
            medication_name: `${item.medication.name} ${item.medication.dosage}`,
            quantity: item.quantity,
            unit_price: item.medication.price || 0,
            subtotal: (item.medication.price || 0) * item.quantity,
          }));
          await insertWithUserId('sale_items', saleItems);

          for (const update of stockUpdates) {
            await updateWithUserId('medications', { quantity: update.newQty }, { id: update.id });
          }

          if (isUnitMode && unitIdsToMarkSold.length > 0) {
            await supabase
              .from('inventory_units')
              .update({ status: 'sold', sold_at: saleDate, sale_id: saleData.id })
              .in('id', unitIdsToMarkSold);
          }

          const journalEntries = cart.map(item => {
            const stockUpdate = stockUpdates.find(u => u.id === item.medication.id);
            return {
              sale_date: saleDate,
              medication_id: item.medication.id,
              medication_name: `${item.medication.name} ${item.medication.dosage}`,
              quantity_sold: item.quantity,
              unit_price: item.medication.price || 0,
              total_price: (item.medication.price || 0) * item.quantity,
              payment_method: paymentMethod,
              stock_after_sale: stockUpdate?.newQty ?? 0,
              seller_name: activeSeller?.name || null,
              synced: true,
            };
          });
          await insertWithUserId('sales_journal', journalEntries);

          for (const saleId of saleIds) {
            await db.sales.update(saleId, { synced: true });
          }
        }
      } catch (error) {
        console.error('Cloud sync error:', error);
      }
    }

    clearCart();
    setAmountReceived('');
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
    setIsProcessing(false);
    setShowSaleConfirm(false);
  };

  const processCreditSale = async (
    clientName: string,
    clientPhone: string,
    dueDate: string | null,
    notes: string
  ) => {
    if (cart.length === 0) return;
    setIsCreditProcessing(true);
    const saleDate = new Date().toISOString();

    const stockUpdates: { id: string; newQty: number }[] = [];
    const unitIdsToMarkSold: string[] = [];

    for (const item of cart) {
      stockUpdates.push({ id: item.medication.id, newQty: Math.max(0, item.medication.quantity - item.quantity) });
      if (isUnitMode && item.units) {
        for (const unit of item.units) unitIdsToMarkSold.push(unit.id);
      }
    }

    for (const update of stockUpdates) {
      try {
        await db.products.update(update.id, { quantity: update.newQty, updated_at: saleDate });
      } catch {}
    }

    const creditItems = cart.map(item => ({
      medication_id: item.medication.id,
      medication_name: `${item.medication.name} ${item.medication.dosage}`.trim(),
      quantity: item.quantity,
      unit_price: item.medication.price || 0,
      subtotal: (item.medication.price || 0) * item.quantity,
    }));

    await offlineSafeInsertCredit({
      client_name: clientName,
      client_phone: clientPhone || undefined,
      due_date: dueDate,
      total_amount: total,
      items: creditItems,
      notes: notes || undefined,
    });

    if (offlineStorage.isOnline()) {
      try {
        for (const update of stockUpdates) {
          await updateWithUserId('medications', { quantity: update.newQty }, { id: update.id });
        }
        if (isUnitMode && unitIdsToMarkSold.length > 0) {
          await supabase
            .from('inventory_units')
            .update({ status: 'sold', sold_at: saleDate })
            .in('id', unitIdsToMarkSold);
        }
      } catch {}
    } else {
      for (const update of stockUpdates) {
        offlineStorage.addToQueue({
          type: 'update',
          table: 'medications',
          data: { id: update.id, quantity: update.newQty },
        });
      }
    }

    setShowCreditModal(false);
    clearCart();
    setAmountReceived('');
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2500);
    setIsCreditProcessing(false);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>

      <div className="flex-shrink-0 flex items-center justify-between px-5 py-2.5 bg-white" style={{ borderBottom: '1px solid var(--color-border)', zIndex: 50 }}>
        <div>
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: 'var(--color-text)', letterSpacing: '-0.025em' }}>Vente en cours</h1>
          {isUnitMode && (
            <p className="text-[10px] text-blue-600 font-medium flex items-center gap-1">
              <Package className="w-3 h-3" />
              Mode Unitaire
            </p>
          )}
        </div>
        {cart.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-1 px-3 py-1 rounded-full active:scale-[0.96] transition-all duration-200"
            style={{ background: '#fef2f2' }}
          >
            <Trash2 className="w-3.5 h-3.5" style={{ color: '#dc2626' }} strokeWidth={1.5} />
            <span className="text-[12px] font-semibold" style={{ color: '#dc2626' }}>Vider</span>
          </button>
        )}
      </div>

      <div
        className="flex-1 overflow-y-auto smooth-scroll"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          willChange: 'scroll-position'
        }}
      >
        {cart.length === 0 ? (
          <div className="py-16 text-center">
            <ShoppingCart className="w-14 h-14 mx-auto mb-3" style={{ color: '#cbd5e1' }} strokeWidth={1} />
            <p className="text-[15px]" style={{ color: 'var(--color-text-muted)' }}>Panier vide</p>
            <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-faint)' }}>
              {isUnitMode
                ? 'Selectionnez des unites depuis l\'inventaire'
                : 'Ajoutez des produits depuis Gestion'}
            </p>
          </div>
        ) : (
          <div className="px-4 pt-3 pb-6">
            <div className="bg-white rounded-[16px] overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              {cart.map((item, index) => (
                <div key={item.medication.id}>
                  <div className="px-4 py-3">
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex-1 min-w-0 mr-2">
                        <p className="text-[14px] font-semibold text-slate-900">{item.medication.name}</p>
                        {item.medication.dosage && (
                          <p className="text-[11px] text-slate-500">{item.medication.dosage}</p>
                        )}
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-[13px] font-bold text-slate-900 tabular-nums">
                            {((item.medication.price || 0) * item.quantity).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-500">FCFA</span>
                          {!isUnitMode && (
                            <span className="text-[11px] text-slate-500 ml-2">
                              ({(item.medication.price || 0).toLocaleString()} x {item.quantity})
                            </span>
                          )}
                        </div>
                      </div>
                      {!isUnitMode && (
                        <button
                          onClick={() => removeUnitFromCart(item.medication.id, '')}
                          className="w-[28px] h-[28px] bg-red-50 rounded-full flex items-center justify-center active:scale-[0.96] transition-all duration-200"
                        >
                          <X className="w-3.5 h-3.5 text-red-600" strokeWidth={2} />
                        </button>
                      )}
                    </div>

                    {isUnitMode && item.units && item.units.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide mb-1.5">
                          {item.units.length} unite(s) selectionnee(s)
                        </p>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5" style={{ WebkitOverflowScrolling: 'touch' }}>
                          {item.units.map((unit) => (
                            <div
                              key={unit.id}
                              className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-2"
                            >
                              <div className="flex items-center gap-2">
                                <Package className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                                <span className="font-mono font-bold text-blue-700 text-[13px]">
                                  {unit.unit_code}
                                </span>
                              </div>
                              <button
                                onClick={() => removeUnitFromCart(item.medication.id, unit.id)}
                                className="w-[24px] h-[24px] bg-red-100 hover:bg-red-200 rounded-full flex items-center justify-center active:scale-[0.96] transition-all duration-200 flex-shrink-0"
                              >
                                <X className="w-3 h-3 text-red-600" strokeWidth={2.5} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {index < cart.length - 1 && <div className="mx-4 h-px bg-slate-200" />}
                </div>
              ))}
            </div>
            <div className="h-4" />
          </div>
        )}
      </div>

      <div
        ref={paymentPanelRef}
        className="flex-shrink-0 bg-white px-4 pt-2.5 pb-3"
        style={{
          boxShadow: '0 -1px 0 rgba(0,0,0,0.06), 0 -4px 16px rgba(0,0,0,0.06)',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
          zIndex: 100,
          position: 'relative'
        }}
      >
        <div className="flex items-center justify-between gap-4 mb-2 pb-2 border-b border-slate-100">
          <div className="flex gap-4 text-[11px] text-slate-500">
            <span>S/T <span className="tabular-nums text-slate-900 font-medium">{subtotal.toLocaleString()}</span></span>
            <span>TVA <span className="tabular-nums text-slate-900 font-medium">{Math.round(tax).toLocaleString()}</span></span>
          </div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">Total</span>
            <span className="text-[22px] font-bold text-slate-900 tracking-tight tabular-nums">{Math.round(total).toLocaleString()}</span>
            <span className="text-[10px] text-slate-500 font-medium ml-0.5">FCFA</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5 mb-2.5">
          {([
            { method: 'Especes' as const, icon: Banknote, label: 'Especes' },
            { method: 'Carte Bancaire' as const, icon: CreditCard, label: 'Carte' },
            { method: 'MTN Mobile Money' as const, icon: Smartphone, label: 'MTN' },
            { method: 'Airtel Money' as const, icon: Smartphone, label: 'Airtel' },
          ]).map(({ method, icon: Icon, label }) => (
            <button
              key={method}
              onClick={() => setPaymentMethod(method)}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-[10px] transition-all duration-200 active:scale-95 ${
                paymentMethod === method
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-400/40'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={paymentMethod === method ? 2 : 1.5} />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          ))}
        </div>

        {paymentMethod === 'Especes' && (
          <div className="mb-2.5">
            <input
              type="number"
              inputMode="numeric"
              value={amountReceived}
              onChange={(e) => setAmountReceived(e.target.value)}
              onFocus={handleInputFocus}
              placeholder={`Montant recu (${Math.round(total).toLocaleString()} FCFA)`}
              className="w-full py-2 bg-slate-100 rounded-[10px] text-[14px] font-bold text-center text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:bg-white transition-all duration-200 placeholder:text-slate-400 placeholder:font-normal placeholder:text-[12px]"
            />

            <div className="flex gap-1 mt-1.5 mb-1.5">
              {QUICK_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  onClick={() => setAmountReceived(amount.toString())}
                  className={`flex-1 py-1 rounded-full text-[10px] font-bold transition-all duration-200 active:scale-95 ${
                    amountReceived === amount.toString()
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-400/30'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {amount >= 1000 ? `${amount / 1000}k` : amount}
                </button>
              ))}
            </div>

            {parseFloat(amountReceived) > 0 && (
              <div className={`flex items-center justify-between rounded-[8px] py-1.5 px-3 ${
                changeAmount >= 0 ? 'bg-green-50' : 'bg-red-50'
              }`}>
                <span className={`text-[10px] font-bold uppercase tracking-wide ${
                  changeAmount >= 0 ? 'text-green-700' : 'text-red-600'
                }`}>
                  {changeAmount >= 0 ? 'Rendu monnaie' : 'Insuffisant'}
                </span>
                <span className={`text-[15px] font-bold tabular-nums ${
                  changeAmount >= 0 ? 'text-green-700' : 'text-red-600'
                }`}>
                  {Math.abs(changeAmount).toLocaleString()}
                  <span className="text-[10px] font-medium ml-0.5 opacity-70">FCFA</span>
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setShowSaleConfirm(true)}
            disabled={isProcessing || isCreditProcessing || cart.length === 0 || (paymentMethod === 'Especes' && parseFloat(amountReceived) > 0 && changeAmount < 0)}
            className="flex-1 text-white py-[12px] rounded-[14px] font-bold text-[15px] transition-all duration-200 disabled:opacity-40 active:scale-[0.97]"
            style={{
              background: '#537d14',
              boxShadow: '0 4px 12px -2px rgba(22, 163, 74, 0.4)',
            }}
          >
            {isProcessing ? 'Traitement...' : `Valider - ${Math.round(total).toLocaleString()}`}
          </button>
          <button
            onClick={() => setShowCreditModal(true)}
            disabled={isProcessing || isCreditProcessing || cart.length === 0}
            className="flex items-center gap-1.5 px-4 py-[12px] rounded-[14px] font-bold text-[13px] text-amber-700 bg-amber-50 border border-amber-200 disabled:opacity-40 active:scale-[0.97] transition-all duration-200 flex-shrink-0"
          >
            <BookOpen className="w-4 h-4" strokeWidth={1.5} />
            Credit
          </button>
        </div>
      </div>

      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-6" style={{ zIndex: 10000 }}>
          <div className="bg-white/95 rounded-[20px] w-full max-w-[280px] overflow-hidden" style={{ backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)' }}>
            <div className="px-5 pt-5 pb-4 text-center">
              <h3 className="text-[16px] font-bold text-slate-900 mb-1">Vider le panier ?</h3>
              <p className="text-[13px] text-slate-500">Tous les articles seront retires</p>
            </div>
            <div className="grid grid-cols-2 border-t border-slate-200">
              <button onClick={() => setShowClearConfirm(false)} className="py-3 text-[16px] font-medium text-slate-600 active:bg-black/5 transition-colors">
                Annuler
              </button>
              <button
                onClick={() => { clearCart(); setShowClearConfirm(false); }}
                className="py-3 text-[16px] font-semibold text-red-600 border-l border-slate-200 active:bg-black/5 transition-colors"
              >
                Vider
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaleConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-6" style={{ zIndex: 10000 }}>
          <div className="bg-white/95 rounded-[20px] w-full max-w-[280px] overflow-hidden" style={{ backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)' }}>
            <div className="px-5 pt-5 pb-4 text-center">
              <h3 className="text-[16px] font-bold text-slate-900 mb-1">Confirmer la vente ?</h3>
              <p className="text-[13px] text-slate-500">Total : {Math.round(total).toLocaleString()} FCFA</p>
              {isUnitMode && (
                <p className="text-[11px] text-blue-600 mt-1">
                  {cart.reduce((sum, item) => sum + (item.units?.length || 0), 0)} unite(s) seront vendues
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 border-t border-slate-200">
              <button onClick={() => setShowSaleConfirm(false)} className="py-3 text-[16px] font-medium text-slate-600 active:bg-black/5 transition-colors">
                Annuler
              </button>
              <button
                onClick={processSale}
                disabled={isProcessing}
                className="py-3 text-[16px] font-semibold text-emerald-600 border-l border-slate-200 active:bg-black/5 transition-colors disabled:opacity-50"
              >
                Valider
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 10001 }}>
          <div
            className="bg-white/95 rounded-[20px] px-8 py-6 flex flex-col items-center"
            style={{ backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}
          >
            <div className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center mb-3">
              <Check className="w-8 h-8 text-white" strokeWidth={3} />
            </div>
            <p className="text-[16px] font-bold text-slate-900">Vente enregistree</p>
          </div>
        </div>
      )}

      {showCreditModal && (
        <CreditModal
          total={total}
          onConfirm={processCreditSale}
          onCancel={() => setShowCreditModal(false)}
        />
      )}
    </div>
  );
}
