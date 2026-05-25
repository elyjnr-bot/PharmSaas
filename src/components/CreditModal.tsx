import { useState } from 'react';
import { X, User, Phone, Calendar, BookOpen } from 'lucide-react';

interface CreditModalProps {
  total: number;
  onConfirm: (clientName: string, clientPhone: string, dueDate: string | null, notes: string) => void;
  onCancel: () => void;
}

export default function CreditModal({ total, onConfirm, onCancel }: CreditModalProps) {
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  const handleConfirm = () => {
    const trimmed = clientName.trim();
    if (!trimmed) return;
    onConfirm(trimmed, clientPhone.trim(), dueDate || null, notes.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center sm:items-center sm:p-4" style={{ zIndex: 10000 }}>
      <div
        className="bg-white rounded-t-[24px] sm:rounded-2xl w-full sm:max-w-[520px] flex flex-col"
        style={{
          maxHeight: '90vh',
          boxShadow: '0 -4px 40px rgba(0,0,0,0.15)',
        }}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#F2F2F7]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center">
              <BookOpen className="w-4.5 h-4.5 text-amber-600" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-slate-900">Vente a Credit</h2>
              <p className="text-[12px] text-slate-500">Total : {Math.round(total).toLocaleString()} FCFA</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center active:scale-95"
          >
            <X className="w-4 h-4 text-slate-500" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pt-4 space-y-3 pb-2">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Nom du client <span className="text-red-600">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.5} />
              <input
                autoFocus
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Ex: Jean Mbeki"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-100 rounded-[10px] text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:bg-white transition-all duration-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Telephone (optionnel)
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.5} />
              <input
                type="tel"
                inputMode="numeric"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="Ex: 06 12 34 56 78"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-100 rounded-[10px] text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:bg-white transition-all duration-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Date d'echeance (optionnel)
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.5} />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-100 rounded-[10px] text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:bg-white transition-all duration-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Notes (optionnel)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Remarques..."
              rows={2}
              className="w-full px-4 py-2.5 bg-slate-100 rounded-[10px] text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:bg-white transition-all duration-200 resize-none"
            />
          </div>
        </div>

        <div className="flex-shrink-0 px-5 pt-3 pb-5 sm:pb-5 grid grid-cols-2 gap-3 border-t border-[#F2F2F7] bg-white sm:rounded-b-2xl" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' }}>
          <button
            onClick={onCancel}
            className="py-[12px] rounded-[14px] text-[15px] font-semibold text-slate-500 bg-slate-100 active:scale-[0.97] transition-all duration-200"
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={!clientName.trim()}
            className="py-[12px] rounded-[14px] text-[15px] font-bold text-white disabled:opacity-40 active:scale-[0.97] transition-all duration-200"
            style={{
              background: '#d97706',
              boxShadow: '0 4px 12px -2px rgba(245, 158, 11, 0.4)',
            }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
