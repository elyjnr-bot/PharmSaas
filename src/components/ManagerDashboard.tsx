import { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Package, AlertTriangle, ShoppingBag, Receipt, Banknote, CreditCard, Smartphone, Calendar, Clock, Download, Upload } from 'lucide-react';
import {
  getSalesStats,
  getPaymentMethodBreakdown,
  getCriticalStocks,
  getTopSelling,
  getRecentExpenses,
  getExpiringProducts,
  SalesStats,
  PaymentMethodBreakdown,
  TopSelling,
  ExpiringProduct,
} from '../lib/analytics';
import { Medication, Expense } from '../lib/supabase';
import CSVImport from './CSVImport';

export default function ManagerDashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'alertes' | 'import'>('dashboard');
  const [todayStats, setTodayStats] = useState<SalesStats | null>(null);
  const [weekStats, setWeekStats] = useState<SalesStats | null>(null);
  const [monthStats, setMonthStats] = useState<SalesStats | null>(null);
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentMethodBreakdown | null>(null);
  const [criticalStocks, setCriticalStocks] = useState<Medication[]>([]);
  const [topSelling, setTopSelling] = useState<TopSelling[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [expiringProducts, setExpiringProducts] = useState<ExpiringProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [today, week, month, payments, stocks, top, expenses, expiring] = await Promise.all([
        getSalesStats('today'),
        getSalesStats('week'),
        getSalesStats('month'),
        getPaymentMethodBreakdown(),
        getCriticalStocks(),
        getTopSelling(5),
        getRecentExpenses(5),
        getExpiringProducts(),
      ]);

      setTodayStats(today);
      setWeekStats(week);
      setMonthStats(month);
      setPaymentBreakdown(payments);
      setCriticalStocks(stocks);
      setTopSelling(top);
      setRecentExpenses(expenses);
      setExpiringProducts(expiring);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="pb-20 px-4 pt-6 bg-gray-50 min-h-screen">
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-gray-600 mt-3">Chargement des données...</p>
        </div>
      </div>
    );
  }

  const totalCaisse = (paymentBreakdown?.especes || 0) + (paymentBreakdown?.carte || 0) + (paymentBreakdown?.mtn || 0) + (paymentBreakdown?.airtel || 0);

  const totalPotentialLoss = expiringProducts.reduce((sum, product) => sum + product.potential_loss, 0);

  const generatePromotionList = () => {
    if (expiringProducts.length === 0) {
      alert('Aucun produit en alerte de péremption');
      return;
    }

    let report = 'LISTE PRODUITS EN PROMOTION - PERTES POTENTIELLES\n';
    report += '=================================================\n';
    report += `Date: ${new Date().toLocaleDateString('fr-FR')}\n`;
    report += `Total valeur en risque: ${totalPotentialLoss.toFixed(0)} FCFA\n\n`;
    report += 'Produits à vendre en priorité (expirent dans < 6 mois):\n\n';

    expiringProducts.forEach((product, index) => {
      const expiryStatus = product.days_until_expiry < 0 ? 'PÉRIMÉ' :
                          product.days_until_expiry < 30 ? 'URGENT' :
                          product.days_until_expiry < 90 ? 'PRIORITAIRE' : 'À SURVEILLER';

      report += `${index + 1}. ${product.name} ${product.dosage}\n`;
      report += `   Stock: ${product.quantity} unités\n`;
      report += `   Prix unitaire: ${product.price?.toFixed(0) || 'N/A'} FCFA\n`;
      report += `   Valeur totale: ${product.potential_loss.toFixed(0)} FCFA\n`;
      report += `   Lot: ${product.batch_number}\n`;
      report += `   Péremption: ${new Date(product.expiry_date).toLocaleDateString('fr-FR')}\n`;
      report += `   Jours restants: ${product.days_until_expiry} (${expiryStatus})\n\n`;
    });

    report += '\nRECOMMANDATIONS:\n';
    report += '- Appliquer remise 10-30% selon urgence\n';
    report += '- Placer en avant en magasin\n';
    report += '- Contacter clients réguliers\n';

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `promotion-pertes-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pb-20 px-1 pt-4 sm:pt-6 space-y-3 sm:space-y-6 bg-gray-50 min-h-screen">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard Gérant</h1>
        <p className="text-xs sm:text-sm text-gray-600 mt-1">Vue d'ensemble et analytics</p>
      </div>

      <div className="flex gap-1 sm:gap-2 bg-white rounded-lg sm:rounded-xl border border-gray-200 p-1">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 py-2 sm:py-3 px-2 sm:px-4 rounded-md sm:rounded-lg font-semibold text-xs sm:text-base transition-all ${
            activeTab === 'dashboard'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-center gap-1 sm:gap-2">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Dashboard</span>
            <span className="sm:hidden">Stats</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('alertes')}
          className={`flex-1 py-2 sm:py-3 px-2 sm:px-4 rounded-md sm:rounded-lg font-semibold text-xs sm:text-base transition-all ${
            activeTab === 'alertes'
              ? 'bg-red-600 text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-center gap-1 sm:gap-2">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Alertes</span>
            <span className="sm:hidden">Alertes</span>
            {expiringProducts.length > 0 && (
              <span className="bg-red-100 text-red-700 text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-full">
                {expiringProducts.length}
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => setActiveTab('import')}
          className={`flex-1 py-2 sm:py-3 px-2 sm:px-4 rounded-md sm:rounded-lg font-semibold text-xs sm:text-base transition-all ${
            activeTab === 'import'
              ? 'bg-green-600 text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-center gap-1 sm:gap-2">
            <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Import CSV</span>
            <span className="sm:hidden">Import</span>
          </div>
        </button>
      </div>

      {activeTab === 'dashboard' && (
        <>

      <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
          <h2 className="font-semibold text-sm sm:text-base text-gray-900">Chiffre d'Affaires</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
          <div className="bg-green-50 rounded-lg p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1 sm:mb-2">
              <Calendar className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" />
              <p className="text-xs font-medium text-green-700">Aujourd'hui</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-green-900">
              {todayStats?.grandTotal.toFixed(0) || 0}
            </p>
            <p className="text-xs text-green-700 mt-1">{todayStats?.count || 0} ventes</p>
          </div>

          <div className="bg-blue-50 rounded-lg p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1 sm:mb-2">
              <Calendar className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600" />
              <p className="text-xs font-medium text-blue-700">7 derniers jours</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-blue-900">
              {weekStats?.grandTotal.toFixed(0) || 0}
            </p>
            <p className="text-xs text-blue-700 mt-1">{weekStats?.count || 0} ventes</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1 sm:mb-2">
              <Calendar className="w-3 h-3 sm:w-4 sm:h-4 text-purple-600" />
              <p className="text-xs font-medium text-purple-700">30 derniers jours</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-purple-900">
              {monthStats?.grandTotal.toFixed(0) || 0}
            </p>
            <p className="text-xs text-purple-700 mt-1">{monthStats?.count || 0} ventes</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
          <h2 className="font-semibold text-sm sm:text-base text-gray-900">Montant en Caisse (Aujourd'hui)</h2>
        </div>

        <div className="mb-3 sm:mb-4">
          <p className="text-2xl sm:text-3xl font-bold text-gray-900">{totalCaisse.toFixed(0)} FCFA</p>
          <p className="text-xs sm:text-sm text-gray-600">Total toutes méthodes</p>
        </div>

        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between p-2 sm:p-3 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="bg-green-100 p-1.5 sm:p-2 rounded-lg">
                <Banknote className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
              </div>
              <span className="font-medium text-sm sm:text-base text-gray-900">Espèces</span>
            </div>
            <span className="font-bold text-sm sm:text-base text-green-700">
              {paymentBreakdown?.especes.toFixed(0) || 0}
            </span>
          </div>

          <div className="flex items-center justify-between p-2 sm:p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="bg-blue-100 p-1.5 sm:p-2 rounded-lg">
                <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              </div>
              <span className="font-medium text-sm sm:text-base text-gray-900">Carte</span>
            </div>
            <span className="font-bold text-sm sm:text-base text-blue-700">
              {paymentBreakdown?.carte.toFixed(0) || 0}
            </span>
          </div>

          <div className="flex items-center justify-between p-2 sm:p-3 bg-yellow-50 rounded-lg">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="bg-yellow-100 p-1.5 sm:p-2 rounded-lg">
                <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
              </div>
              <span className="font-medium text-sm sm:text-base text-gray-900">MTN</span>
            </div>
            <span className="font-bold text-sm sm:text-base text-yellow-700">
              {paymentBreakdown?.mtn.toFixed(0) || 0}
            </span>
          </div>

          <div className="flex items-center justify-between p-2 sm:p-3 bg-red-50 rounded-lg">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="bg-red-100 p-1.5 sm:p-2 rounded-lg">
                <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
              </div>
              <span className="font-medium text-sm sm:text-base text-gray-900">Airtel</span>
            </div>
            <span className="font-bold text-sm sm:text-base text-red-700">
              {paymentBreakdown?.airtel.toFixed(0) || 0}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
          <h2 className="font-semibold text-sm sm:text-base text-gray-900">Ruptures Critiques</h2>
        </div>

        {criticalStocks.length === 0 ? (
          <div className="text-center py-4 sm:py-6">
            <Package className="w-10 h-10 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-xs sm:text-sm text-gray-500">Aucune rupture de stock</p>
          </div>
        ) : (
          <div className="space-y-2">
            {criticalStocks.map((med) => (
              <div key={med.id} className="flex items-center justify-between p-2 sm:p-3 bg-red-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm sm:text-base text-gray-900 truncate">{med.name}</p>
                  <p className="text-xs sm:text-sm text-gray-600">{med.dosage}</p>
                </div>
                <span className="bg-red-600 text-white text-xs font-bold px-2 sm:px-3 py-1 rounded-full whitespace-nowrap ml-2">
                  Stock: 0
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
          <h2 className="font-semibold text-sm sm:text-base text-gray-900">Top Ventes (30 jours)</h2>
        </div>

        {topSelling.length === 0 ? (
          <div className="text-center py-4 sm:py-6">
            <ShoppingBag className="w-10 h-10 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-xs sm:text-sm text-gray-500">Aucune vente enregistrée</p>
          </div>
        ) : (
          <div className="space-y-2">
            {topSelling.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg gap-2">
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  <span className="bg-blue-600 text-white w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm sm:text-base text-gray-900 truncate">{item.medication_name}</p>
                    <p className="text-xs sm:text-sm text-gray-600">{item.total_quantity} unités</p>
                  </div>
                </div>
                <span className="font-bold text-xs sm:text-base text-blue-600 whitespace-nowrap">
                  {item.total_revenue.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
          <h2 className="font-semibold text-sm sm:text-base text-gray-900">Dépenses Récentes</h2>
        </div>

        {recentExpenses.length === 0 ? (
          <div className="text-center py-4 sm:py-6">
            <Receipt className="w-10 h-10 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-xs sm:text-sm text-gray-500">Aucune dépense enregistrée</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentExpenses.map((expense) => (
              <div key={expense.id} className="flex items-start justify-between p-2 sm:p-3 bg-gray-50 rounded-lg gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 sm:gap-2 mb-1 flex-wrap">
                    <span className="bg-orange-100 text-orange-700 text-xs font-semibold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded">
                      {expense.category}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(expense.expense_date).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">{expense.description}</p>
                  <p className="text-xs text-gray-600 mt-0.5 sm:mt-1">{expense.payment_method}</p>
                </div>
                <span className="font-bold text-xs sm:text-base text-red-600 whitespace-nowrap">
                  {expense.amount.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      </>
      )}

      {activeTab === 'alertes' && (
      <>
      <div className="bg-red-50 rounded-lg sm:rounded-xl border border-red-200 p-3 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
          <div className="bg-red-600 p-2 sm:p-3 rounded-lg sm:rounded-xl">
            <Clock className="w-5 h-5 sm:w-8 sm:h-8 text-white" />
          </div>
          <div>
            <h2 className="text-base sm:text-xl font-bold text-gray-900">Alertes Pertes & Péremptions</h2>
            <p className="text-xs sm:text-sm text-gray-600">{'<'} 6 mois</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
          <div className="bg-white rounded-lg p-3 sm:p-4 border border-red-200">
            <div className="flex items-center gap-2 mb-1 sm:mb-2">
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
              <p className="text-xs font-medium text-gray-700">Produits en alerte</p>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-red-600">{expiringProducts.length}</p>
          </div>

          <div className="bg-white rounded-lg p-3 sm:p-4 border border-red-200">
            <div className="flex items-center gap-2 mb-1 sm:mb-2">
              <Package className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
              <p className="text-xs font-medium text-gray-700">Unités concernées</p>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-orange-600">
              {expiringProducts.reduce((sum, p) => sum + p.quantity, 0)}
            </p>
          </div>

          <div className="bg-white rounded-lg p-3 sm:p-4 border border-red-200">
            <div className="flex items-center gap-2 mb-1 sm:mb-2">
              <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
              <p className="text-xs font-medium text-gray-700">Valeur en risque</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-red-600">
              {totalPotentialLoss.toFixed(0)}
            </p>
            <p className="text-xs text-gray-600 mt-0.5 sm:mt-1">FCFA</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 sm:mb-4 gap-1">
          <h2 className="font-semibold text-sm sm:text-base text-gray-900">Liste des produits</h2>
          <span className="text-xs sm:text-sm text-gray-500">Triés par date</span>
        </div>

        {expiringProducts.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <Clock className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-2 sm:mb-3" />
            <p className="text-sm sm:text-base text-gray-900 font-semibold mb-1">Aucun produit en alerte</p>
            <p className="text-xs sm:text-sm text-gray-500">Tous vos produits sont dans les délais</p>
          </div>
        ) : (
          <>
            <div className="space-y-2 sm:space-y-3 mb-3 sm:mb-4">
              {expiringProducts.map((product) => {
                const isExpired = product.days_until_expiry < 0;
                const isUrgent = product.days_until_expiry < 30;
                const isPriority = product.days_until_expiry < 90;

                let bgColor = 'bg-yellow-50 border-yellow-200';
                let statusColor = 'bg-yellow-600';
                let statusText = 'À SURVEILLER';

                if (isExpired) {
                  bgColor = 'bg-red-50 border-red-300';
                  statusColor = 'bg-red-600';
                  statusText = 'PÉRIMÉ';
                } else if (isUrgent) {
                  bgColor = 'bg-orange-50 border-orange-200';
                  statusColor = 'bg-orange-600';
                  statusText = 'URGENT';
                } else if (isPriority) {
                  bgColor = 'bg-amber-50 border-amber-200';
                  statusColor = 'bg-amber-600';
                  statusText = 'PRIORITAIRE';
                }

                return (
                  <div key={product.id} className={`border rounded-lg p-2 sm:p-3 ${bgColor}`}>
                    <div className="flex items-start justify-between mb-1 sm:mb-2 gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate">{product.name}</p>
                        <p className="text-xs text-gray-600">{product.dosage}</p>
                      </div>
                      <span className={`${statusColor} text-white text-xs font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded whitespace-nowrap`}>
                        {statusText}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-2 text-xs">
                      <div className="space-y-0.5">
                        <p className="text-gray-600">Stock: <span className="font-bold text-gray-900">{product.quantity}</span></p>
                        <p className="text-gray-600">Prix: <span className="font-bold text-gray-900">{product.price?.toFixed(0) || 'N/A'}</span></p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-gray-600">Expire: <span className="font-bold text-gray-900">{new Date(product.expiry_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span></p>
                        <p className="text-gray-600">Jours: <span className="font-bold text-gray-900">{product.days_until_expiry}</span></p>
                      </div>
                    </div>
                    <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-600">
                        Perte: <span className="font-bold text-red-600">{product.potential_loss.toFixed(0)} FCFA</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={generatePromotionList}
              className="w-full bg-red-600 text-white py-3 sm:py-5 rounded-lg sm:rounded-xl font-bold text-sm sm:text-base hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center gap-2 sm:gap-3 shadow-lg"
            >
              <Download className="w-5 h-5 sm:w-6 sm:h-6" />
              <span className="hidden sm:inline">Générer liste pour promotion</span>
              <span className="sm:hidden">Générer liste promo</span>
            </button>
          </>
        )}
      </div>
      </>
      )}

      {activeTab === 'import' && (
        <CSVImport />
      )}
    </div>
  );
}
