import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Clock, CheckCircle2, User, Phone,
  ChevronDown, ChevronUp, Banknote, CreditCard, Smartphone,
  AlertCircle, RefreshCw, X, Star, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { offlineStorage } from '../lib/offlineStorage';
import { offlineSafePayCredit } from '../lib/writeService';
import { insertWithUserId } from '../lib/supabaseHelpers';

interface CreditItem {
  medication_id: string;
  medication_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface Credit {
  id: string;
  client_name: string;
  client_phone?: string | null;
  due_date?: string | null;
  total_amount: number;
  amount_paid: number;
  status: 'unpaid' | 'paid';
  sale_date: string;
  paid_at?: string | null;
  payment_method?: string | null;
  items: CreditItem[];
  notes?: string | null;
  created_at: string;
}

type FilterType = 'unpaid' | 'paid' | 'all';

const PAYMENT_METHODS = [
  { method: 'Especes', icon: Banknote, label: 'Especes' },
  { method: 'Carte Bancaire', icon: CreditCard, label: 'Carte' },
  { method: 'MTN Mobile Money', icon: Smartphone, label: 'MTN' },
  { method: 'Airtel Money', icon: Smartphone, label: 'Airtel' },
] as const;

// ── Client History Sheet ────────────────────────────────────────────────────

interface ClientStats {
  name: string;
  phone?: string | null;
  totalDebts: number;
  totalOwed: number;
  totalPaid: number;
  totalRemaining: number;
  paidCount: number;
  unpaidCount: number;
  reliabilityPct: number;
}

function computeClientStats(credits: Credit[], clientName: string): ClientStats {
  const clientCredits = credits.filter(c => c.client_name === clientName);
  const phone = clientCredits[0]?.client_phone ?? null;
  const totalOwed = clientCredits.reduce((s, c) => s + c.total_amount, 0);
  const totalPaid = clientCredits.reduce((s, c) => s + (c.amount_paid || 0), 0);
  const paidCount = clientCredits.filter(c => c.status === 'paid').length;
  const unpaidCount = clientCredits.filter(c => c.status === 'unpaid').length;
  return {
    name: clientName,
    phone,
    totalDebts: clientCredits.length,
    totalOwed,
    totalPaid,
    totalRemaining: totalOwed - totalPaid,
    paidCount,
    unpaidCount,
    reliabilityPct: clientCredits.length > 0 ? Math.round((paidCount / clientCredits.length) * 100) : 0,
  };
}

function ReliabilityBadge({ pct }: { pct: number }) {
  if (pct >= 80) {
    return (
      <div className="flex items-center gap-1 px-2.5 py-1 bg-green-50 rounded-full">
        <Star className="w-3 h-3 text-emerald-600 fill-emerald-600" />
        <span className="text-[11px] font-bold text-emerald-600">Bon payeur ({pct}%)</span>
      </div>
    );
  }
  if (pct >= 50) {
    return (
      <div className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 rounded-full">
        <Minus className="w-3 h-3 text-amber-600" />
        <span className="text-[11px] font-bold text-amber-600">Payeur moyen ({pct}%)</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 px-2.5 py-1 bg-red-50 rounded-full">
      <TrendingDown className="w-3 h-3 text-red-500" />
      <span className="text-[11px] font-bold text-red-500">Mauvais payeur ({pct}%)</span>
    </div>
  );
}

interface ClientHistorySheetProps {
  clientName: string;
  credits: Credit[];
  onClose: () => void;
}

function ClientHistorySheet({ clientName, credits, onClose }: ClientHistorySheetProps) {
  const stats = computeClientStats(credits, clientName);
  const clientCredits = credits
    .filter(c => c.client_name === clientName)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center sm:justify-center sm:p-4" style={{ zIndex: 10000, paddingBottom: 'max(0, env(safe-area-inset-bottom, 0))' }}>
      <div
        className="bg-white rounded-t-[24px] sm:rounded-2xl w-full sm:max-w-[600px] flex flex-col"
        style={{ maxHeight: '90vh', boxShadow: '0 -4px 40px rgba(0,0,0,0.15)' }}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#F2F2F7]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-slate-500" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-slate-900">{stats.name}</h2>
              {stats.phone && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3 text-slate-500" strokeWidth={1.5} />
                  <span className="text-[12px] text-slate-500">{stats.phone}</span>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center active:scale-95">
            <X className="w-4 h-4 text-slate-500" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-shrink-0 px-5 py-4 border-b border-[#F2F2F7]">
          <div className="flex items-center justify-between mb-3">
            <ReliabilityBadge pct={stats.reliabilityPct} />
            <span className="text-[12px] text-slate-500">{stats.totalDebts} commande{stats.totalDebts > 1 ? 's' : ''}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-100 rounded-[12px] p-3 text-center">
              <p className="text-[11px] text-slate-500 mb-0.5">Total du</p>
              <p className="text-[14px] font-bold text-slate-900 tabular-nums">{Math.round(stats.totalOwed).toLocaleString()}</p>
              <p className="text-[10px] text-slate-500">FCFA</p>
            </div>
            <div className="bg-green-50 rounded-[12px] p-3 text-center">
              <p className="text-[11px] text-emerald-600 mb-0.5">Paye</p>
              <p className="text-[14px] font-bold text-green-700 tabular-nums">{Math.round(stats.totalPaid).toLocaleString()}</p>
              <p className="text-[10px] text-green-500">FCFA</p>
            </div>
            <div className={`rounded-[12px] p-3 text-center ${stats.totalRemaining > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
              <p className={`text-[11px] mb-0.5 ${stats.totalRemaining > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>Restant</p>
              <p className={`text-[14px] font-bold tabular-nums ${stats.totalRemaining > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                {Math.round(stats.totalRemaining).toLocaleString()}
              </p>
              <p className={`text-[10px] ${stats.totalRemaining > 0 ? 'text-amber-500' : 'text-green-500'}`}>FCFA</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pt-3 pb-6 space-y-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          {clientCredits.map(credit => {
            const remaining = credit.total_amount - (credit.amount_paid || 0);
            const hasPartial = (credit.amount_paid || 0) > 0 && credit.status === 'unpaid';
            return (
              <div key={credit.id} className="bg-slate-100 rounded-[12px] px-4 py-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      {credit.status === 'paid'
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" strokeWidth={2} />
                        : hasPartial
                          ? <TrendingUp className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" strokeWidth={2} />
                          : <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" strokeWidth={2} />
                      }
                      <span className="text-[12px] font-semibold text-slate-900">
                        {formatDate(credit.sale_date)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 ml-5">
                      {credit.items.map(i => i.medication_name).join(', ')}
                    </p>
                    {hasPartial && (
                      <p className="text-[11px] text-amber-600 font-semibold ml-5 mt-0.5">
                        Paye {Math.round(credit.amount_paid || 0).toLocaleString()} · Reste {Math.round(remaining).toLocaleString()} FCFA
                      </p>
                    )}
                    {credit.status === 'paid' && credit.paid_at && (
                      <p className="text-[11px] text-emerald-600 ml-5 mt-0.5">
                        Regle le {formatDate(credit.paid_at)}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[14px] font-bold text-slate-900 tabular-nums">
                      {Math.round(credit.total_amount).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-500">FCFA</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Partial Payment Panel ───────────────────────────────────────────────────

interface PaymentPanelProps {
  credit: Credit;
  onConfirm: (amount: number, method: string) => void;
  onCancel: () => void;
  loading: boolean;
}

function PaymentPanel({ credit, onConfirm, onCancel, loading }: PaymentPanelProps) {
  const remaining = credit.total_amount - (credit.amount_paid || 0);
  const [amountStr, setAmountStr] = useState(String(Math.round(remaining)));
  const [method, setMethod] = useState<string>('Especes');

  const amount = parseFloat(amountStr) || 0;
  const afterPayment = Math.max(0, remaining - amount);
  const isFull = amount >= remaining;
  const isValid = amount > 0 && amount <= remaining;

  return (
    <div className="mt-3 border-t border-[#F2F2F7] pt-3">
      <div className="mb-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Montant verse
          </p>
          <p className="text-[11px] text-slate-500">
            Reste : <span className="font-bold text-slate-900 tabular-nums">{Math.round(remaining).toLocaleString()}</span> FCFA
          </p>
        </div>
        <input
          type="number"
          inputMode="numeric"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          className="w-full py-2.5 px-3 bg-slate-100 rounded-[10px] text-[15px] font-bold text-center text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-400/30 focus:bg-white transition-all duration-200"
        />
        {amount > 0 && amount <= remaining && (
          <div className={`mt-1.5 flex items-center justify-between rounded-[8px] px-3 py-1.5 ${
            isFull ? 'bg-green-50' : 'bg-amber-50'
          }`}>
            <span className={`text-[10px] font-bold uppercase tracking-wide ${isFull ? 'text-emerald-600' : 'text-amber-600'}`}>
              {isFull ? 'Paiement complet' : 'Paiement partiel'}
            </span>
            {!isFull && (
              <span className="text-[12px] font-bold text-amber-700 tabular-nums">
                Reste {Math.round(afterPayment).toLocaleString()} FCFA
              </span>
            )}
          </div>
        )}
        {amount > remaining && (
          <div className="mt-1.5 flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 bg-red-50">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" strokeWidth={1.5} />
            <span className="text-[11px] text-red-500">Montant superieur a la dette</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {PAYMENT_METHODS.map(({ method: m, icon: Icon, label }) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-[10px] text-[11px] font-semibold transition-all duration-150 active:scale-95 ${
              method === m
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-400/40'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-2" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))' }}>
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-[10px] text-[13px] font-semibold text-slate-500 bg-slate-100 active:scale-95 transition-all duration-150"
        >
          Annuler
        </button>
        <button
          onClick={() => onConfirm(amount, method)}
          disabled={!isValid || loading}
          className="flex-1 py-2.5 rounded-[10px] text-[13px] font-bold text-white disabled:opacity-40 active:scale-95 transition-all duration-150"
          style={{ background: '#059669' }}
        >
          {loading ? 'Traitement...' : isFull ? 'Encaisser' : 'Valider partiel'}
        </button>
      </div>
    </div>
  );
}

// ── Main Carnet Component ───────────────────────────────────────────────────

export default function Carnet() {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('unpaid');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [clientHistoryName, setClientHistoryName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCredits = useCallback(async () => {
    setLoading(true);
    setError(null);

    const cached = offlineStorage.getCachedCredits();
    if (cached.length > 0) {
      setCredits(cached as Credit[]);
      setLoading(false);
    }

    if (navigator.onLine) {
      try {
        const { data, error: fetchError } = await supabase
          .from('credits')
          .select('*')
          .order('created_at', { ascending: false });

        if (!fetchError && data) {
          const parsed = data.map((c: any) => ({
            ...c,
            amount_paid: c.amount_paid ?? 0,
            items: Array.isArray(c.items) ? c.items : [],
          })) as Credit[];
          setCredits(parsed);
          offlineStorage.cacheCredits(parsed);
        } else if (fetchError) {
          setError('Impossible de charger les credits.');
        }
      } catch {
        setError('Erreur de connexion.');
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCredits();
  }, [loadCredits]);

  const handlePayment = async (credit: Credit, amount: number, method: string) => {
    setProcessingId(credit.id);
    const result = await offlineSafePayCredit(credit, amount, method);

    if (result.status === 'paid' && navigator.onLine) {
      try {
        await insertWithUserId('sales_journal', [{
          sale_date: new Date().toISOString(),
          medication_id: credit.items[0]?.medication_id || null,
          medication_name: credit.client_name,
          quantity_sold: credit.items.reduce((s, i) => s + i.quantity, 0),
          unit_price: amount,
          total_price: amount,
          payment_method: method,
          stock_after_sale: 0,
          seller_name: null,
          synced: true,
        }]);
      } catch {}
    }

    setCredits(prev =>
      prev.map(c =>
        c.id === credit.id
          ? {
              ...c,
              amount_paid: result.newAmountPaid,
              status: result.status,
              paid_at: result.status === 'paid' ? new Date().toISOString() : c.paid_at,
              payment_method: method,
            }
          : c
      )
    );
    setPayingId(null);
    setProcessingId(null);
  };

  const filtered = credits.filter(c => {
    if (filter === 'all') return true;
    return c.status === filter;
  });

  const totalUnpaid = credits
    .filter(c => c.status === 'unpaid')
    .reduce((sum, c) => sum + c.total_amount - (c.amount_paid || 0), 0);

  const unpaidCount = credits.filter(c => c.status === 'unpaid').length;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  const isOverdue = (credit: Credit) => {
    if (!credit.due_date || credit.status === 'paid') return false;
    return new Date(credit.due_date) < new Date();
  };

  return (
    <div className="min-h-full bg-slate-100">
      <div className="px-4 pt-4 pb-3">
        {unpaidCount > 0 && (
          <div
            className="rounded-[16px] p-4 mb-4"
            style={{
              background: '#d97706',
              boxShadow: '0 4px 16px rgba(245, 158, 11, 0.25)',
            }}
          >
            <p className="text-[11px] font-semibold text-amber-100 uppercase tracking-wide mb-0.5">
              Total impaye
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[28px] font-bold text-white tabular-nums">
                {Math.round(totalUnpaid).toLocaleString()}
              </span>
              <span className="text-[13px] text-amber-200 font-medium">FCFA</span>
            </div>
            <p className="text-[12px] text-amber-100 mt-1">
              {unpaidCount} dette{unpaidCount > 1 ? 's' : ''} en attente
            </p>
          </div>
        )}

        <div className="flex gap-2">
          {([
            { id: 'unpaid' as const, label: 'En attente' },
            { id: 'paid' as const, label: 'Regles' },
            { id: 'all' as const, label: 'Tous' },
          ]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`flex-1 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-200 active:scale-95 ${
                filter === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={loadCredits}
            className="w-8 h-8 bg-white rounded-full flex items-center justify-center active:scale-95 transition-all duration-200"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-3 flex items-center gap-2 px-3 py-2.5 bg-red-50 rounded-[10px] border border-red-100">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" strokeWidth={1.5} />
          <p className="text-[12px] text-red-600">{error}</p>
        </div>
      )}

      {loading && credits.length === 0 ? (
        <div className="py-16 text-center">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[14px] text-slate-500">Chargement...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center px-6">
          <BookOpen className="w-14 h-14 mx-auto mb-3 text-[#D1D1D6]" strokeWidth={1} />
          <p className="text-[15px] text-slate-500">
            {filter === 'unpaid' ? 'Aucune dette en attente' : filter === 'paid' ? 'Aucune dette reglee' : 'Aucun credit enregistre'}
          </p>
        </div>
      ) : (
        <div className="px-4 space-y-2 pb-6">
          {filtered.map((credit) => {
            const expanded = expandedId === credit.id;
            const overdue = isOverdue(credit);
            const amountPaid = credit.amount_paid || 0;
            const remaining = credit.total_amount - amountPaid;
            const hasPartialPayment = amountPaid > 0 && credit.status === 'unpaid';

            return (
              <div
                key={credit.id}
                className="bg-white rounded-[16px] overflow-hidden"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
              >
                <button
                  className="w-full px-4 py-3.5 text-left active:bg-slate-100 transition-colors"
                  onClick={() => {
                    setExpandedId(expanded ? null : credit.id);
                    if (expanded) setPayingId(null);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        credit.status === 'paid'
                          ? 'bg-green-100'
                          : overdue ? 'bg-red-100'
                          : hasPartialPayment ? 'bg-blue-100'
                          : 'bg-amber-100'
                      }`}>
                        {credit.status === 'paid'
                          ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" strokeWidth={1.5} />
                          : overdue
                            ? <AlertCircle className="w-4.5 h-4.5 text-red-500" strokeWidth={1.5} />
                            : hasPartialPayment
                              ? <TrendingUp className="w-4.5 h-4.5 text-blue-600" strokeWidth={1.5} />
                              : <Clock className="w-4.5 h-4.5 text-amber-600" strokeWidth={1.5} />
                        }
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={(e) => { e.stopPropagation(); setClientHistoryName(credit.client_name); }}
                            className="text-[14px] font-semibold text-green-700 hover:underline active:opacity-70 transition-opacity"
                          >
                            {credit.client_name}
                          </button>
                          {overdue && (
                            <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">
                              En retard
                            </span>
                          )}
                          {hasPartialPayment && (
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                              Partiel
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{formatDate(credit.sale_date)}</p>
                        {hasPartialPayment && (
                          <p className="text-[11px] text-blue-600 font-medium">
                            Paye {Math.round(amountPaid).toLocaleString()} · Reste {Math.round(remaining).toLocaleString()} FCFA
                          </p>
                        )}
                        {credit.due_date && credit.status === 'unpaid' && (
                          <p className="text-[11px] text-slate-500">
                            Echeance : {formatDate(credit.due_date)}
                          </p>
                        )}
                        {credit.status === 'paid' && credit.paid_at && (
                          <p className="text-[11px] text-emerald-600">
                            Regle le {formatDate(credit.paid_at)}
                            {credit.payment_method && ` · ${credit.payment_method}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-[15px] font-bold text-slate-900 tabular-nums">
                          {Math.round(credit.total_amount).toLocaleString()}
                        </p>
                        <p className="text-[10px] text-slate-500">FCFA</p>
                      </div>
                      {expanded
                        ? <ChevronUp className="w-4 h-4 text-slate-400" strokeWidth={2} />
                        : <ChevronDown className="w-4 h-4 text-slate-400" strokeWidth={2} />
                      }
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="px-4 pb-4 border-t border-[#F2F2F7]">
                    {credit.client_phone && (
                      <div className="flex items-center gap-2 pt-3 pb-1">
                        <Phone className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.5} />
                        <span className="text-[13px] text-slate-500">{credit.client_phone}</span>
                      </div>
                    )}

                    {credit.items.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Articles</p>
                        <div className="space-y-1">
                          {credit.items.map((item, i) => (
                            <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-slate-100 rounded-[8px]">
                              <div className="min-w-0 flex-1 mr-2">
                                <p className="text-[12px] font-medium text-slate-900 truncate">{item.medication_name}</p>
                                <p className="text-[10px] text-slate-500">x{item.quantity} · {item.unit_price.toLocaleString()} FCFA</p>
                              </div>
                              <p className="text-[13px] font-bold text-slate-900 tabular-nums flex-shrink-0">
                                {item.subtotal.toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {credit.notes && (
                      <div className="mt-2 px-3 py-2 bg-slate-100 rounded-[8px]">
                        <p className="text-[11px] text-slate-500 italic">{credit.notes}</p>
                      </div>
                    )}

                    {credit.status === 'unpaid' && (
                      payingId === credit.id ? (
                        <PaymentPanel
                          credit={credit}
                          onConfirm={(amount, method) => handlePayment(credit, amount, method)}
                          onCancel={() => setPayingId(null)}
                          loading={processingId === credit.id}
                        />
                      ) : (
                        <button
                          onClick={() => setPayingId(credit.id)}
                          className="mt-3 w-full py-2.5 rounded-[12px] text-[13px] font-bold text-white active:scale-[0.97] transition-all duration-200"
                          style={{
                            background: '#059669',
                            boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)',
                          }}
                        >
                          Encaisser {Math.round(credit.total_amount).toLocaleString()} FCFA
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {clientHistoryName && (
        <ClientHistorySheet
          clientName={clientHistoryName}
          credits={credits}
          onClose={() => setClientHistoryName(null)}
        />
      )}
    </div>
  );
}
