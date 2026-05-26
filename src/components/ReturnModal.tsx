import { useState } from 'react';
import { X, Undo2, Minus, Plus } from 'lucide-react';
import { PAYMENT_METHODS } from '../lib/paymentMethods';

export interface ReturnableSale {
  medication_id: string;
  medication_name: string;
  unit_price: number;
  /** Quantité vendue à l'origine (borne max du retour). */
  quantity_sold: number;
  payment_method: string;
}

interface ReturnModalProps {
  sale: ReturnableSale;
  onConfirm: (quantity: number, refundMethod: string, reason: string) => void;
  onCancel: () => void;
  processing?: boolean;
}

export default function ReturnModal({ sale, onConfirm, onCancel, processing }: ReturnModalProps) {
  const maxQty = Math.max(1, sale.quantity_sold);
  const [quantity, setQuantity] = useState(1);
  const [refundMethod, setRefundMethod] = useState(sale.payment_method || 'Espèces');
  const [reason, setReason] = useState('');

  const refundAmount = (sale.unit_price || 0) * quantity;

  const clamp = (n: number) => Math.min(maxQty, Math.max(1, n));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center sm:items-center sm:p-4" style={{ zIndex: 10000 }}>
      <div
        className="bg-white rounded-t-[24px] sm:rounded-2xl w-full sm:max-w-[520px] flex flex-col"
        style={{ maxHeight: '90vh', boxShadow: '0 -4px 40px rgba(0,0,0,0.15)' }}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#F2F2F7]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center">
              <Undo2 className="w-4.5 h-4.5 text-orange-600" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-slate-900">Retour / Avoir</h2>
              <p className="text-[12px] text-slate-500 truncate max-w-[300px]">{sale.medication_name}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center active:scale-95"
          >
            <X className="w-4 h-4 text-slate-500" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pt-4 space-y-4 pb-2">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Quantité à retourner (max {maxQty})
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity((q) => clamp(q - 1))}
                disabled={quantity <= 1}
                className="w-10 h-10 rounded-[12px] bg-slate-100 flex items-center justify-center active:scale-95 disabled:opacity-40"
              >
                <Minus className="w-4 h-4 text-slate-600" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(clamp(parseInt(e.target.value, 10) || 1))}
                className="flex-1 py-2.5 bg-slate-100 rounded-[10px] text-[16px] font-bold text-center text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:bg-white"
              />
              <button
                onClick={() => setQuantity((q) => clamp(q + 1))}
                disabled={quantity >= maxQty}
                className="w-10 h-10 rounded-[12px] bg-slate-100 flex items-center justify-center active:scale-95 disabled:opacity-40"
              >
                <Plus className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Mode de remboursement
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setRefundMethod(m.value)}
                  className={`py-2.5 rounded-[10px] text-[13px] font-semibold transition-all active:scale-95 ${
                    refundMethod === m.value
                      ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-400/40'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {m.short}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Motif (optionnel)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: produit défectueux, erreur de délivrance..."
              rows={2}
              className="w-full px-4 py-2.5 bg-slate-100 rounded-[10px] text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:bg-white resize-none"
            />
          </div>

          <div className="flex items-center justify-between rounded-[12px] bg-orange-50 px-4 py-3">
            <span className="text-[12px] font-bold uppercase tracking-wide text-orange-700">Montant remboursé</span>
            <span className="text-[18px] font-bold text-orange-700 tabular-nums">
              {Math.round(refundAmount).toLocaleString()}
              <span className="text-[11px] font-medium ml-0.5">FCFA</span>
            </span>
          </div>
        </div>

        <div
          className="flex-shrink-0 px-5 pt-3 pb-5 grid grid-cols-2 gap-3 border-t border-[#F2F2F7] bg-white sm:rounded-b-2xl"
          style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' }}
        >
          <button
            onClick={onCancel}
            disabled={processing}
            className="py-[12px] rounded-[14px] text-[15px] font-semibold text-slate-500 bg-slate-100 active:scale-[0.97] transition-all duration-200 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={() => onConfirm(quantity, refundMethod, reason.trim())}
            disabled={processing || quantity < 1}
            className="py-[12px] rounded-[14px] text-[15px] font-bold text-white disabled:opacity-40 active:scale-[0.97] transition-all duration-200"
            style={{ background: '#ea580c', boxShadow: '0 4px 12px -2px rgba(234, 88, 12, 0.4)' }}
          >
            {processing ? 'Traitement...' : 'Valider le retour'}
          </button>
        </div>
      </div>
    </div>
  );
}
