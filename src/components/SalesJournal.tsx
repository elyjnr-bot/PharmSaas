import { useState, useEffect } from 'react';
import { BookOpen, Calendar, ChevronLeft, ChevronRight, Banknote, CreditCard, Smartphone, Package, Clock, TrendingUp } from 'lucide-react';
import { offlineStorage, SalesJournalEntry } from '../lib/offlineStorage';

export default function SalesJournal() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [entries, setEntries] = useState<SalesJournalEntry[]>([]);
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalItems: 0,
    transactionCount: 0,
    byPaymentMethod: {} as Record<string, number>,
  });

  useEffect(() => {
    loadJournalForDate(selectedDate);
  }, [selectedDate]);

  const loadJournalForDate = (date: Date) => {
    const dayEntries = offlineStorage.getJournalByDate(date);
    setEntries(dayEntries);

    const totalSales = dayEntries.reduce((sum, e) => sum + e.total_price, 0);
    const totalItems = dayEntries.reduce((sum, e) => sum + e.quantity_sold, 0);
    const byPaymentMethod = dayEntries.reduce((acc, e) => {
      acc[e.payment_method] = (acc[e.payment_method] || 0) + e.total_price;
      return acc;
    }, {} as Record<string, number>);

    setSummary({
      totalSales,
      totalItems,
      transactionCount: dayEntries.length,
      byPaymentMethod,
    });
  };

  const goToPreviousDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  };

  const goToNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    if (next <= new Date()) {
      setSelectedDate(next);
    }
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPaymentIcon = (method: string) => {
    switch (method) {
      case 'Espèces':
        return <Banknote className="w-4 h-4 text-green-600" />;
      case 'Carte Bancaire':
        return <CreditCard className="w-4 h-4 text-blue-600" />;
      case 'MTN Mobile Money':
        return <Smartphone className="w-4 h-4 text-yellow-600" />;
      case 'Airtel Money':
        return <Smartphone className="w-4 h-4 text-red-600" />;
      default:
        return <Banknote className="w-4 h-4 text-gray-600" />;
    }
  };

  return (
    <div className="pb-20 px-1 pt-6 space-y-6 bg-gray-50 min-h-screen">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen className="w-7 h-7 text-blue-600" />
          Journal de Caisse
        </h1>
        <p className="text-sm text-gray-600 mt-1">Historique des ventes</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={goToPreviousDay}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-gray-900 font-medium">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span className="capitalize">{formatDate(selectedDate)}</span>
            </div>
            {!isToday && (
              <button
                onClick={goToToday}
                className="text-xs text-blue-600 hover:underline mt-1"
              >
                Revenir a aujourd'hui
              </button>
            )}
          </div>
          <button
            onClick={goToNextDay}
            disabled={isToday}
            className={`p-2 rounded-lg transition-colors ${
              isToday ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-600 rounded-xl p-4 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-5 h-5 opacity-80" />
            <span className="text-sm font-medium opacity-90">Total Ventes</span>
          </div>
          <p className="text-2xl font-bold">{summary.totalSales.toFixed(0)}</p>
          <p className="text-xs opacity-80">FCFA</p>
        </div>
        <div className="bg-blue-600 rounded-xl p-4 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-5 h-5 opacity-80" />
            <span className="text-sm font-medium opacity-90">Articles vendus</span>
          </div>
          <p className="text-2xl font-bold">{summary.totalItems}</p>
          <p className="text-xs opacity-80">{summary.transactionCount} ventes</p>
        </div>
      </div>

      {Object.keys(summary.byPaymentMethod).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Par mode de paiement</h3>
          <div className="space-y-2">
            {Object.entries(summary.byPaymentMethod).map(([method, amount]) => (
              <div key={method} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getPaymentIcon(method)}
                  <span className="text-sm text-gray-700">{method}</span>
                </div>
                <span className="font-semibold text-gray-900">{amount.toFixed(0)} FCFA</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Detail des ventes</h3>
        </div>

        {entries.length === 0 ? (
          <div className="p-8 text-center">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Aucune vente pour cette date</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {entries.map((entry) => (
              <div key={entry.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{entry.medication_name}</p>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatTime(entry.sale_date)}
                      </span>
                      <span>Qte: {entry.quantity_sold}</span>
                      <span>x {entry.unit_price.toFixed(0)} FCFA</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {getPaymentIcon(entry.payment_method)}
                      <span className="text-xs text-gray-500">{entry.payment_method}</span>
                      {entry.stock_after_sale < 10 && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                          Stock: {entry.stock_after_sale}
                        </span>
                      )}
                      {!entry.synced && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                          Non synchronise
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">{entry.total_price.toFixed(0)}</p>
                    <p className="text-xs text-gray-500">FCFA</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
