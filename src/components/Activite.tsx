import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Calendar, ChevronLeft, ChevronRight, Banknote, CreditCard, Smartphone, Clock, Package, Plus, Trash2, DollarSign, X, AlertTriangle, Tag, Percent, Check, FileText, Download, TrendingDown, ArrowUpCircle, ArrowDownCircle, Undo2 } from 'lucide-react';
import { offlineStorage, SalesJournalEntry } from '../lib/offlineStorage';
import { supabase, Expense, Medication, fetchAllMedications } from '../lib/supabase';
import { insertWithUserId, updateWithUserId } from '../lib/supabaseHelpers';
import { recordReturn } from '../lib/writeService';
import { getDaysUntilExpiry } from '../lib/dateUtils';
import { useResponsive } from '../lib/useResponsive';
import ZReportModal from './ZReportModal';
import ReturnModal, { ReturnableSale } from './ReturnModal';
import { printMonthlyReport } from '../lib/printMonthlyReport';
import { useAuth } from '../lib/auth';
import { getSellerPermissions } from '../lib/permissions';

type PeriodType = 'week' | 'month' | 'year';

interface DailyRevenue {
  date: string;
  dayName: string;
  total: number;
  expenses: number;
}

interface JournalEntry extends SalesJournalEntry {
  type: 'sale';
}

interface ExpenseJournalEntry {
  id: string;
  type: 'expense';
  description: string;
  category: string;
  amount: number;
  payment_method: string;
  expense_date: string;
  notes?: string;
}

interface Promotion {
  id: string;
  medication_id: string;
  medication_name: string;
  original_price: number;
  promo_price: number;
  discount_percent: number;
  start_date: string;
  end_date: string;
  active: boolean;
}

const EXPENSE_CATEGORIES = [
  'Electricite',
  'Loyer',
  'Salaires',
  'Fournitures',
  'Transport',
  'Maintenance',
  'Perte/Peremption',
  'Autre',
];

const PAYMENT_METHODS = [
  'Especes',
  'Carte Bancaire',
  'MTN Mobile Money',
  'Airtel Money',
  'Cheque',
  'Virement',
];

interface ActiviteProps {
  onHideNavigationChange?: (hidden: boolean) => void;
  /** Mode intégré dans l'Aperçu : masque le hero CA et l'onglet Alertes
   *  (évite le doublon avec le tableau de bord), retire le chrome de page. */
  embedded?: boolean;
}

export default function Activite({ onHideNavigationChange, embedded = false }: ActiviteProps = {}) {
  const { isDesktop } = useResponsive();
  const { user, isManager } = useAuth();
  const [activeTab, setActiveTab] = useState<'ventes' | 'depenses' | 'alertes'>('ventes');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('week');
  const [entries, setEntries] = useState<SalesJournalEntry[]>([]);
  const [periodData, setPeriodData] = useState<DailyRevenue[]>([]);
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalExpenses: 0,
    netAmount: 0,
    totalItems: 0,
    transactionCount: 0,
  });

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(true);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [returnSale, setReturnSale] = useState<ReturnableSale | null>(null);
  const [isReturnProcessing, setIsReturnProcessing] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: '',
    description: '',
    amount: '',
    payment_method: 'Especes',
    expense_date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [medications, setMedications] = useState<Medication[]>([]);
  const [isLoadingMedications, setIsLoadingMedications] = useState(true);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [selectedMedForPromo, setSelectedMedForPromo] = useState<Medication | null>(null);
  const [promoForm, setPromoForm] = useState({
    discount_percent: '10',
    end_date: '',
  });
  const [showLossModal, setShowLossModal] = useState(false);
  const [selectedMedForLoss, setSelectedMedForLoss] = useState<Medication | null>(null);
  const [lossQuantity, setLossQuantity] = useState('1');
  const [showZReport, setShowZReport] = useState(false);

  useEffect(() => {
    loadExpenses();
    loadMedications();
    loadPromotions();
  }, []);

  useEffect(() => {
    loadPeriodData();
  }, [selectedPeriod, expenses]);

  useEffect(() => {
    loadJournalForDate(selectedDate);
  }, [selectedDate, expenses]);

  useEffect(() => {
    if (onHideNavigationChange) {
      onHideNavigationChange(showZReport || showPromoModal || showLossModal);
    }
  }, [showZReport, showPromoModal, showLossModal, onHideNavigationChange]);

  const loadMedications = async () => {
    setIsLoadingMedications(true);
    try {
      const data = await fetchAllMedications();
      setMedications(data);
    } catch (error) {
      console.error('Error loading medications:', error);
    } finally {
      setIsLoadingMedications(false);
    }
  };

  const loadPromotions = () => {
    const saved = localStorage.getItem('promotions');
    if (saved) {
      const promos = JSON.parse(saved) as Promotion[];
      const now = new Date().toISOString().split('T')[0];
      const activePromos = promos.filter(p => p.end_date >= now);
      setPromotions(activePromos);
      localStorage.setItem('promotions', JSON.stringify(activePromos));
    }
  };

  const loadPeriodData = async () => {
    const today = new Date();
    const dailyData: DailyRevenue[] = [];

    if (selectedPeriod === 'week') {
      const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dayEntries = offlineStorage.getJournalByDate(date);
        const total = dayEntries.reduce((sum, e) => sum + e.total_price, 0);

        const dateStr = date.toISOString().split('T')[0];
        const dayExpenses = expenses.filter(e => e.expense_date.split('T')[0] === dateStr);
        const expenseTotal = dayExpenses.reduce((sum, e) => sum + e.amount, 0);

        dailyData.push({
          date: dateStr,
          dayName: dayNames[date.getDay()],
          total,
          expenses: expenseTotal,
        });
      }
    } else if (selectedPeriod === 'month') {
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);
        const dayEntries = offlineStorage.getJournalByDate(date);
        const total = dayEntries.reduce((sum, e) => sum + e.total_price, 0);

        const dateStr = date.toISOString().split('T')[0];
        const dayExpenses = expenses.filter(e => e.expense_date.split('T')[0] === dateStr);
        const expenseTotal = dayExpenses.reduce((sum, e) => sum + e.amount, 0);

        dailyData.push({
          date: dateStr,
          dayName: day.toString(),
          total,
          expenses: expenseTotal,
        });
      }
    } else if (selectedPeriod === 'year') {
      const currentYear = today.getFullYear();
      const monthNames = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];

      for (let month = 0; month < 12; month++) {
        const monthStart = new Date(currentYear, month, 1);
        const monthEnd = new Date(currentYear, month + 1, 0);
        let total = 0;
        let expenseTotal = 0;

        for (let day = 1; day <= monthEnd.getDate(); day++) {
          const date = new Date(currentYear, month, day);
          const dayEntries = offlineStorage.getJournalByDate(date);
          total += dayEntries.reduce((sum, e) => sum + e.total_price, 0);

          const dateStr = date.toISOString().split('T')[0];
          const dayExpenses = expenses.filter(e => e.expense_date.split('T')[0] === dateStr);
          expenseTotal += dayExpenses.reduce((sum, e) => sum + e.amount, 0);
        }

        dailyData.push({
          date: `${currentYear}-${String(month + 1).padStart(2, '0')}`,
          dayName: monthNames[month],
          total,
          expenses: expenseTotal,
        });
      }
    }

    setPeriodData(dailyData);
  };

  const loadJournalForDate = (date: Date) => {
    const dayEntries = offlineStorage.getJournalByDate(date);
    setEntries(dayEntries);

    const totalSales = dayEntries.reduce((sum, e) => sum + e.total_price, 0);
    const totalItems = dayEntries.reduce((sum, e) => sum + e.quantity_sold, 0);

    const dateStr = date.toISOString().split('T')[0];
    const dayExpenses = expenses.filter(e => e.expense_date.split('T')[0] === dateStr);
    const totalExpenses = dayExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Fond de caisse : ventes espèces uniquement entrent dans la caisse physique
    const fondDeCaisse = offlineStorage.getFondDeCaisse(dateStr);
    const fondVal = fondDeCaisse >= 0 ? fondDeCaisse : 0;
    const especes = dayEntries
      .filter(e => e.payment_method === 'Espèces')
      .reduce((sum, e) => sum + e.total_price, 0);
    const netAmount = fondVal + especes - totalExpenses;

    setSummary({
      totalSales,
      totalExpenses,
      netAmount,
      totalItems,
      transactionCount: dayEntries.length,
    });
  };

  const handleConfirmReturn = async (quantity: number, refundMethod: string, reason: string) => {
    if (!returnSale) return;
    setIsReturnProcessing(true);
    try {
      const res = await recordReturn({
        medication_id: returnSale.medication_id,
        medication_name: returnSale.medication_name,
        unit_price: returnSale.unit_price,
        quantity,
        refund_method: refundMethod,
        reason,
      });
      if (res.ok) {
        setReturnSale(null);
        loadJournalForDate(selectedDate);
      } else {
        alert('Le retour n\'a pas pu être enregistré.');
      }
    } catch (e) {
      console.error('Return error:', e);
      alert('Erreur lors du retour.');
    } finally {
      setIsReturnProcessing(false);
    }
  };

  const loadExpenses = async () => {
    setIsLoadingExpenses(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
      offlineStorage.cacheExpenses(data || []);
    } catch (error) {
      console.error('Error loading expenses:', error);
      const cached = offlineStorage.getCachedExpenses();
      setExpenses(cached);
    } finally {
      setIsLoadingExpenses(false);
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const isOnline = offlineStorage.isOnline();

      if (isOnline) {
        const { error } = await insertWithUserId('expenses', [{
          category: expenseForm.category,
          description: expenseForm.description,
          amount: parseFloat(expenseForm.amount),
          payment_method: expenseForm.payment_method,
          expense_date: expenseForm.expense_date,
          notes: expenseForm.notes || null,
        }]);

        if (error) throw error;
      } else {
        offlineStorage.addToQueue({
          type: 'insert',
          table: 'expenses',
          data: {
            category: expenseForm.category,
            description: expenseForm.description,
            amount: parseFloat(expenseForm.amount),
            payment_method: expenseForm.payment_method,
            expense_date: expenseForm.expense_date,
            notes: expenseForm.notes || null,
          },
        });
      }

      setExpenseForm({
        category: '',
        description: '',
        amount: '',
        payment_method: 'Especes',
        expense_date: new Date().toISOString().split('T')[0],
        notes: '',
      });
      setIsExpenseModalOpen(false);
      loadExpenses();
    } catch (error) {
      console.error('Error adding expense:', error);
      alert('Erreur lors de l\'ajout de la depense');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteExpense = async (id: string) => {
    if (!confirm('Supprimer cette depense ?')) return;

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const checkDailyReportExists = async () => {
    const reportDate = new Date().toISOString().split('T')[0];
    const { data: existingReport } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('report_date', reportDate)
      .maybeSingle();
    return existingReport !== null;
  };

  const handleClosureBtnClick = async () => {
    const exists = await checkDailyReportExists();
    if (exists) {
      alert('Un rapport existe déjà pour cette journée');
      return;
    }
    setShowZReport(true);
  };

  // ── Listener event 'open-z-report' (déclenché depuis le footer Dashboard) ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string }>).detail;
      if (detail?.action === 'open-z-report') handleClosureBtnClick();
    };
    window.addEventListener('topbar-action', handler);
    return () => window.removeEventListener('topbar-action', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeDailyReport = async () => {
    const reportDate = new Date().toISOString().split('T')[0];

    try {
      const { error } = await insertWithUserId('daily_reports', [{
        report_date: reportDate,
        total_sales: summary.totalSales,
        total_expenses: summary.totalExpenses,
        net_amount: summary.netAmount,
        transaction_count: summary.transactionCount,
        items_sold: summary.totalItems,
        closed_by: user?.email || 'Inconnu',
        is_locked: true,
      }]);

      if (error) throw error;

      alert(`Clôture effectuée avec succès !\n\nVentes: ${summary.totalSales.toLocaleString()} FCFA\nDépenses: ${summary.totalExpenses.toLocaleString()} FCFA\nNet: ${summary.netAmount.toLocaleString()} FCFA`);
      setShowZReport(false);
    } catch (error) {
      console.error('Error creating daily report:', error);
      alert('Erreur lors de la clôture');
    }
  };

  const expiringMedications = useMemo(() => {
    return medications
      .filter(med => {
        const days = getDaysUntilExpiry(med.expiry_date);
        return days <= 90 && med.quantity > 0;
      })
      .sort((a, b) => getDaysUntilExpiry(a.expiry_date) - getDaysUntilExpiry(b.expiry_date));
  }, [medications]);

  const expiredMedications = useMemo(() => {
    return medications.filter(med => getDaysUntilExpiry(med.expiry_date) < 0 && med.quantity > 0);
  }, [medications]);

  const nearExpiryMedications = useMemo(() => {
    return medications.filter(med => {
      const days = getDaysUntilExpiry(med.expiry_date);
      return days >= 0 && days <= 90 && med.quantity > 0;
    });
  }, [medications]);

  // Marge / bénéfice du jour : revenu net (sales_journal) - coût des produits vendus
  // (cost_price). Les retours (quantités négatives) sont nettés automatiquement.
  const dayProfit = useMemo(() => {
    const costById = new Map<string, number | undefined>();
    for (const m of medications) costById.set(m.id, m.cost_price);

    let revenue = 0;
    let cost = 0;
    let missingCost = 0;
    let linesWithSales = 0;

    for (const e of entries) {
      revenue += e.total_price;
      const unitCost = costById.get(e.medication_id);
      if (unitCost == null || unitCost <= 0) {
        if (e.quantity_sold > 0) missingCost++;
      } else {
        cost += unitCost * e.quantity_sold;
      }
      if (e.quantity_sold > 0) linesWithSales++;
    }

    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, cost, profit, margin, missingCost, linesWithSales };
  }, [entries, medications]);

  const createPromotion = () => {
    if (!selectedMedForPromo) return;

    const discountPercent = parseInt(promoForm.discount_percent);
    const originalPrice = selectedMedForPromo.price || 0;
    const promoPrice = Math.round(originalPrice * (1 - discountPercent / 100));

    const newPromo: Promotion = {
      id: Date.now().toString(),
      medication_id: selectedMedForPromo.id,
      medication_name: `${selectedMedForPromo.name} ${selectedMedForPromo.dosage}`,
      original_price: originalPrice,
      promo_price: promoPrice,
      discount_percent: discountPercent,
      start_date: new Date().toISOString().split('T')[0],
      end_date: promoForm.end_date,
      active: true,
    };

    const updatedPromos = [...promotions, newPromo];
    setPromotions(updatedPromos);
    localStorage.setItem('promotions', JSON.stringify(updatedPromos));

    setShowPromoModal(false);
    setSelectedMedForPromo(null);
    setPromoForm({ discount_percent: '10', end_date: '' });
  };

  const deletePromotion = (id: string) => {
    const updated = promotions.filter(p => p.id !== id);
    setPromotions(updated);
    localStorage.setItem('promotions', JSON.stringify(updated));
  };

  const registerLoss = async () => {
    if (!selectedMedForLoss) return;

    const qty = parseInt(lossQuantity);
    if (isNaN(qty) || qty <= 0 || qty > selectedMedForLoss.quantity) {
      alert('Quantite invalide');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await updateWithUserId(
        'medications',
        { quantity: selectedMedForLoss.quantity - qty },
        { id: selectedMedForLoss.id }
      );

      if (updateError) throw updateError;

      const lossAmount = (selectedMedForLoss.wholesale_price || selectedMedForLoss.price || 0) * qty;

      const { error: expenseError } = await insertWithUserId('expenses', [{
        category: 'Perte/Peremption',
        description: `${selectedMedForLoss.name} ${selectedMedForLoss.dosage} - Lot ${selectedMedForLoss.batch_number} (x${qty})`,
        amount: lossAmount,
        payment_method: 'Especes',
        expense_date: new Date().toISOString().split('T')[0],
        notes: `Peremption: ${new Date(selectedMedForLoss.expiry_date).toLocaleDateString('fr-FR')}`,
      }]);

      if (expenseError) throw expenseError;

      setShowLossModal(false);
      setSelectedMedForLoss(null);
      setLossQuantity('1');
      loadMedications();
      loadExpenses();
    } catch (error) {
      console.error('Error registering loss:', error);
      alert('Erreur lors de l\'enregistrement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const maxRevenue = useMemo(() => {
    const max = Math.max(...periodData.map(d => d.total), 1);
    return max;
  }, [periodData]);

  const periodTotal = useMemo(() => {
    return periodData.reduce((sum, d) => sum + d.total, 0);
  }, [periodData]);

  const periodExpensesTotal = useMemo(() => {
    return periodData.reduce((sum, d) => sum + d.expenses, 0);
  }, [periodData]);

  const periodNet = useMemo(() => {
    return periodTotal - periodExpensesTotal;
  }, [periodTotal, periodExpensesTotal]);

  const currentMonthExpenses = expenses
    .filter(exp => {
      const expDate = new Date(exp.expense_date);
      const now = new Date();
      return expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear();
    })
    .reduce((sum, exp) => sum + exp.amount, 0);

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
    loadWeeklyData();
  };

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
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
      case 'Especes':
        return <Banknote className="w-4 h-4 text-emerald-600" />;
      case 'Carte Bancaire':
        return <CreditCard className="w-4 h-4 text-blue-600" />;
      case 'MTN Mobile Money':
        return <Smartphone className="w-4 h-4 text-yellow-600" />;
      case 'Airtel Money':
        return <Smartphone className="w-4 h-4 text-red-600" />;
      default:
        return <Banknote className="w-4 h-4 text-slate-500" />;
    }
  };

  const getExpiryColor = (days: number) => {
    if (days < 0) return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' };
    if (days <= 30) return { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' };
    if (days <= 60) return { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' };
    return { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' };
  };

  // ════════════════════════════════════════════════════════════════════════════
  // VUE EMBEDDED — version épurée, anti-doublon avec le Dashboard
  // ════════════════════════════════════════════════════════════════════════════
  if (embedded) {
    const today    = new Date().toISOString().split('T')[0];
    const todayExpenses = expenses.filter(e => e.expense_date.split('T')[0] === today);
    const todayExpTotal = todayExpenses.reduce((s, e) => s + e.amount, 0);
    const monthExpTotal = currentMonthExpenses;
    return (
      <div className="flex flex-col gap-4">
        {/* Bouton Clôture Z déplacé dans le footer "Transactions récentes" du Dashboard
           — voir DashboardDesktop.tsx. Action déclenchée via évènement 'open-z-report'. */}

        {/* ── Bénéfice du jour — info unique non couverte par Dashboard ────── */}
        <div style={{
          background: 'rgba(255,255,255,0.72)',
          border: '1px solid rgba(255,255,255,0.55)',
          borderRadius: 14,
          padding: '14px 16px',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Percent className="w-3.5 h-3.5" style={{ color: '#7c3aed' }} />
              <h3 style={{ fontSize: 12.5, fontWeight: 700, color: '#0a0e14', letterSpacing: '-0.01em' }}>Bénéfice du jour</h3>
            </div>
            <div style={{ fontSize: 10.5, color: '#9aa0a8', fontWeight: 600 }}>
              {selectedDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { lbl: 'CA net',     val: Math.round(dayProfit.revenue).toLocaleString('fr-FR'),  col: '#0a0e14' },
              { lbl: 'Coût',       val: Math.round(dayProfit.cost).toLocaleString('fr-FR'),     col: '#6b7280' },
              { lbl: 'Dépenses',   val: Math.round(todayExpTotal).toLocaleString('fr-FR'),       col: '#dc2626' },
              { lbl: 'Marge',      val: `${dayProfit.margin.toFixed(0)}%`,                       col: '#7c3aed' },
            ].map(k => (
              <div key={k.lbl} style={{ background: 'rgba(15,15,20,0.025)', borderRadius: 9, padding: '8px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#9aa0a8', fontWeight: 600, marginBottom: 2 }}>{k.lbl}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: k.col, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{k.val}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: 'rgba(15,15,20,0.05)' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Bénéfice estimé</span>
            <span style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: (dayProfit.profit - todayExpTotal) >= 0 ? '#537d14' : '#dc2626', letterSpacing: '-0.02em' }}>
              {(dayProfit.profit - todayExpTotal) >= 0 ? '+' : ''}{Math.round(dayProfit.profit - todayExpTotal).toLocaleString('fr-FR')}
              <span style={{ fontSize: 10.5, fontWeight: 500, color: '#9aa0a8', marginLeft: 4 }}>FCFA</span>
            </span>
          </div>
          {dayProfit.missingCost > 0 && (
            <div className="flex items-start gap-2 mt-2.5 rounded-lg px-2.5 py-1.5" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
              <AlertTriangle className="w-3 h-3 text-amber-600 flex-shrink-0 mt-0.5" />
              <p style={{ fontSize: 10.5, color: '#92400e', lineHeight: 1.4 }}>
                {dayProfit.missingCost} produit(s) sans prix d'achat — bénéfice sous-estimé
              </p>
            </div>
          )}
        </div>

        {/* ── Dépenses annexes — CTA Chalk + résumé ────────────────────────── */}
        <div style={{
          background: 'rgba(255,255,255,0.72)',
          border: '1px solid rgba(255,255,255,0.55)',
          borderRadius: 14,
          padding: '14px 16px',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ArrowDownCircle className="w-3.5 h-3.5" style={{ color: '#dc2626' }} />
              <h3 style={{ fontSize: 12.5, fontWeight: 700, color: '#0a0e14', letterSpacing: '-0.01em' }}>Dépenses annexes</h3>
            </div>
            <span style={{ fontSize: 10.5, color: '#9aa0a8', fontWeight: 600 }}>
              {todayExpenses.length} aujourd'hui · {expenses.length} ce mois
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div style={{ background: 'rgba(220,38,38,0.05)', borderRadius: 9, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, color: '#9aa0a8', fontWeight: 600, marginBottom: 2 }}>Aujourd'hui</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#dc2626', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                {Math.round(todayExpTotal).toLocaleString('fr-FR')} <span style={{ fontSize: 10, fontWeight: 500, color: '#9aa0a8' }}>F</span>
              </div>
            </div>
            <div style={{ background: 'rgba(245,158,11,0.05)', borderRadius: 9, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, color: '#9aa0a8', fontWeight: 600, marginBottom: 2 }}>Ce mois</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#b45309', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                {Math.round(monthExpTotal).toLocaleString('fr-FR')} <span style={{ fontSize: 10, fontWeight: 500, color: '#9aa0a8' }}>F</span>
              </div>
            </div>
          </div>

          {/* Liste des dépenses du jour (max 3) */}
          {todayExpenses.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
              {todayExpenses.slice(0, 3).map(exp => (
                <div key={exp.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 10px', background: 'rgba(15,15,20,0.02)', borderRadius: 7,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#0a0e14', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{exp.description}</div>
                    <div style={{ fontSize: 10, color: '#9aa0a8' }}>{exp.category} · {exp.payment_method}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                    {exp.amount.toLocaleString('fr-FR')} F
                  </span>
                </div>
              ))}
              {todayExpenses.length > 3 && (
                <div style={{ fontSize: 10.5, color: '#9aa0a8', textAlign: 'center', paddingTop: 2 }}>
                  +{todayExpenses.length - 3} de plus
                </div>
              )}
            </div>
          )}

          {/* CTA Chalk : ajouter une dépense */}
          <button
            onClick={() => setIsExpenseModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all"
            style={{
              background: 'rgba(220,38,38,0.06)',
              border: '1.5px solid rgba(220,38,38,0.18)',
              color: '#dc2626',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '-0.01em',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.10)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(220,38,38,0.28)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.06)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(220,38,38,0.18)';
            }}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            Enregistrer une dépense
            <span style={{ fontSize: 10.5, color: '#9aa0a8', fontWeight: 500, marginLeft: 4 }}>(loyer, eau, salaires…)</span>
          </button>
        </div>

        {/* Z report modal toujours actif */}
        {showZReport && (
          <ZReportModal
            isOpen={showZReport}
            onClose={() => setShowZReport(false)}
            entries={entries}
            medications={medications}
            date={selectedDate}
            onConfirmClosure={closeDailyReport}
          />
        )}

        {/* Modal ajout dépense */}
        {isExpenseModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
                <h2 className="font-bold text-slate-800">Nouvelle dépense</h2>
                <button onClick={() => setIsExpenseModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Catégorie</label>
                  <select value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm">
                    <option>Loyer</option><option>Eau / Électricité</option><option>Salaires</option>
                    <option>Transport</option><option>Maintenance</option><option>Perte/Peremption</option>
                    <option>Autre</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Description</label>
                  <input value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                    placeholder="Ex: Facture eau Octobre"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Montant (FCFA)</label>
                    <input type="number" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono-num" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Paiement</label>
                    <select value={expenseForm.payment_method} onChange={e => setExpenseForm({ ...expenseForm, payment_method: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm">
                      <option>Espèces</option><option>Mobile Money</option><option>Virement</option><option>Carte</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Notes (optionnel)</label>
                  <input value={expenseForm.notes} onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
                </div>
                <button
                  onClick={(e) => handleExpenseSubmit(e as unknown as React.FormEvent)}
                  disabled={!expenseForm.description || !expenseForm.amount}
                  className="w-full py-3 rounded-xl text-white font-bold transition disabled:opacity-50"
                  style={{ background: '#dc2626' }}>
                  Enregistrer la dépense
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'bg-slate-50'}>
      <div className={embedded ? 'flex flex-col gap-6' : 'px-3 pt-5 pb-6 flex flex-col gap-6'}>
        {/* ── Hero CA Card (masqué en mode intégré : doublon avec l'Aperçu) ── */}
        {!embedded && (
        <div
          className="rounded-2xl p-4 text-white shadow-lg relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #030712 0%, #0f172a 50%, #0c1a2e 100%)' }}
        >
          {/* Emerald radial glow */}
          <div
            className="absolute top-0 right-0 pointer-events-none"
            style={{
              width: '200px',
              height: '200px',
              background: 'radial-gradient(circle at top right, rgba(83,125,20,0.2) 0%, transparent 65%)',
            }}
          />
          {/* Large background TrendingUp icon */}
          <TrendingUp
            className="absolute pointer-events-none"
            style={{
              width: '120px',
              height: '120px',
              right: '-16px',
              bottom: '-20px',
              opacity: 0.05,
              color: '#bcd96e',
            }}
          />

          <div className="flex items-center justify-between mb-3 relative z-10">
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center"
                  style={{ background: 'rgba(188,217,110,0.15)' }}
                >
                  <TrendingUp className="w-3 h-3" style={{ color: '#bcd96e' }} />
                </div>
                <span
                  className="text-[10px] font-bold tracking-[0.12em] uppercase"
                  style={{ color: '#d8ed96' }}
                >
                  {selectedPeriod === 'week' ? 'CA Semaine' : selectedPeriod === 'month' ? 'CA Mois' : 'CA Annee'}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="font-black leading-none font-mono-num"
                  style={{ fontSize: '2.25rem', letterSpacing: '-0.04em', color: '#f0fdf4' }}
                >
                  {periodTotal.toLocaleString()}
                </span>
                <span className="text-[13px] font-semibold" style={{ color: '#d8ed96' }}>FCFA</span>
              </div>
            </div>
            <div className="flex gap-1 rounded-full p-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {(['week', 'month', 'year'] as const).map((p, i) => (
                <button
                  key={p}
                  onClick={() => setSelectedPeriod(p)}
                  className="px-3 py-1 transition-all text-[10px] font-semibold rounded-full"
                  style={
                    selectedPeriod === p
                      ? { background: '#96c244', color: '#ffffff', boxShadow: '0 2px 8px rgba(16,185,129,0.3)' }
                      : { color: 'rgba(255,255,255,0.5)' }
                  }
                >
                  {['S', 'M', 'A'][i]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3 text-xs relative z-10">
            <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-1 mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <TrendingDown className="w-3 h-3" />
                <span>Dépenses</span>
              </div>
              <div className="font-bold font-mono-num text-white">{periodExpensesTotal.toLocaleString()} <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '10px' }}>FCFA</span></div>
            </div>
            <div className="rounded-lg p-2.5" style={{ background: 'rgba(188,217,110,0.1)', border: '1px solid rgba(188,217,110,0.15)' }}>
              <div className="flex items-center gap-1 mb-1" style={{ color: '#d8ed96' }}>
                <Banknote className="w-3 h-3" />
                <span>Net</span>
              </div>
              <div className="font-bold font-mono-num" style={{ color: '#bcd96e' }}>{periodNet.toLocaleString()} <span style={{ color: 'rgba(188,217,110,0.5)', fontSize: '10px' }}>FCFA</span></div>
            </div>
          </div>

          <div className="flex items-end justify-between gap-1 relative z-10" style={{ height: '80px' }}>
            {periodData.slice(selectedPeriod === 'year' ? 0 : -7).map((day) => {
              const height = maxRevenue > 0 ? (day.total / maxRevenue) * 100 : 0;
              const isSelected = selectedPeriod === 'week' && day.date === selectedDate.toISOString().split('T')[0];

              return (
                <button
                  key={day.date}
                  onClick={() => selectedPeriod === 'week' && setSelectedDate(new Date(day.date))}
                  className="flex-1 flex flex-col items-center gap-1 group"
                  disabled={selectedPeriod !== 'week'}
                >
                  <div className="w-full flex items-end justify-center" style={{ height: '60px' }}>
                    <div
                      className="w-full max-w-[28px] rounded-t-sm transition-all"
                      style={{
                        height: `${Math.max(height, 4)}%`,
                        background: isSelected ? '#bcd96e' : 'rgba(255,255,255,0.18)',
                      }}
                    />
                  </div>
                  <span
                    className="text-[9px] font-semibold mt-0.5 truncate max-w-full px-0.5"
                    style={{ color: isSelected ? '#bcd96e' : 'rgba(255,255,255,0.45)' }}
                  >
                    {day.dayName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-slate-100">
            <div className={`flex-1 grid gap-1 ${embedded ? 'grid-cols-2' : 'grid-cols-3'}`}>
              <button
                onClick={() => setActiveTab('ventes')}
                className={`py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  activeTab === 'ventes'
                    ? 'text-white shadow-md'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
                style={activeTab === 'ventes' ? { background: '#537d14' } : {}}
              >
                Ventes
              </button>
              <button
                onClick={() => setActiveTab('depenses')}
                className={`py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  activeTab === 'depenses'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                Depenses
              </button>
              {!embedded && (
              <button
                onClick={() => setActiveTab('alertes')}
                className={`py-2.5 rounded-xl font-semibold text-sm transition-all relative ${
                  activeTab === 'alertes'
                    ? 'bg-amber-500 text-white shadow-md'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                Alertes
                {expiringMedications.length > 0 && (
                  <span className={`absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${
                    activeTab === 'alertes' ? 'bg-white text-amber-600' : 'bg-amber-500 text-white'
                  }`}>
                    {expiringMedications.length}
                  </span>
                )}
              </button>
              )}
            </div>
            {isDesktop && (
              <button
                onClick={() => alert('Export PDF/Excel à implémenter')}
                className="ml-3 flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors"
                style={{ background: '#f7fce8', color: '#5a8520' }}
                onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = '#eef7cc'}
                onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = '#f7fce8'}
              >
                <Download className="w-4 h-4" />
                Exporter
              </button>
            )}
          </div>
        </div>

        {activeTab === 'ventes' && (
          <div className="flex flex-col gap-5">
            {/* Carte synthèse du jour (navigateur de date + Ventes/Dépenses/Solde).
                Masquée en mode intégré : doublon avec les KPI du tableau de bord (Aperçu). */}
            {!embedded && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between p-3 border-b border-slate-100">
                <button
                  onClick={goToPreviousDay}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-slate-500" />
                </button>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Calendar className="w-4 h-4" style={{ color: '#537d14' }} />
                    <span className="font-semibold text-slate-800 capitalize">{formatDate(selectedDate)}</span>
                  </div>
                  {!isToday && (
                    <button
                      onClick={goToToday}
                      className="text-xs hover:underline mt-0.5"
                      style={{ color: '#537d14' }}
                    >
                      Aujourd'hui
                    </button>
                  )}
                </div>
                <button
                  onClick={goToNextDay}
                  disabled={isToday}
                  className={`p-2 rounded-xl transition-colors ${
                    isToday ? 'text-slate-200 cursor-not-allowed' : 'hover:bg-slate-100 text-slate-500'
                  }`}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <ArrowUpCircle className="w-4 h-4" style={{ color: '#537d14' }} />
                    <p className="text-xs text-slate-500 font-medium">Ventes</p>
                  </div>
                  <p className="text-2xl font-bold font-mono-num" style={{ color: '#537d14' }}>{summary.totalSales.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">FCFA</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <ArrowDownCircle className="w-4 h-4 text-red-500" />
                    <p className="text-xs text-slate-500 font-medium">Dépenses</p>
                  </div>
                  <p className="text-2xl font-bold font-mono-num text-red-600">{summary.totalExpenses.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">FCFA</p>
                </div>
              </div>
              <div className="border-t border-slate-100 px-3 py-3 rounded-b-2xl" style={{ background: 'rgba(83,125,20,0.04)' }}>
                {(() => {
                  const dateStr = (() => { const d = new Date(selectedDate); return d.toISOString().split('T')[0]; })();
                  const fond = offlineStorage.getFondDeCaisse(dateStr);
                  return fond > 0 ? (
                    <div className="flex items-center justify-between mb-2 text-xs text-slate-500">
                      <span>Fond de caisse</span>
                      <span className="font-semibold text-slate-600">+{fond.toLocaleString()} FCFA</span>
                    </div>
                  ) : null;
                })()}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-5 h-5" style={{ color: '#537d14' }} />
                    <span className="font-semibold text-slate-700">Solde en Caisse</span>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold font-mono-num" style={{ color: '#537d14' }}>{summary.netAmount.toLocaleString()}</p>
                    <p className="text-xs text-slate-400">FCFA</p>
                  </div>
                </div>
              </div>

              {isToday && (
                <div className="px-3 pb-3 space-y-2">
                  <button
                    onClick={handleClosureBtnClick}
                    className="w-full text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-md"
                    style={{ background: '#537d14' }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = '#5a8520'}
                    onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = '#537d14'}
                  >
                    <FileText className="w-5 h-5" />
                    Cloturer la journee
                  </button>
                  <button
                    onClick={() => { const d = new Date(); printMonthlyReport(d.getFullYear(), d.getMonth()); }}
                    className="w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                    style={{ background: 'rgba(83,125,20,0.08)', color: '#537d14', border: '1.5px solid rgba(83,125,20,0.2)' }}
                  >
                    <Download className="w-4 h-4" />
                    Rapport mensuel PDF
                  </button>
                </div>
              )}
            </div>
            )}

            {/* En mode intégré, on conserve l'accès à la clôture (synthèse retirée). */}
            {embedded && isToday && (
              <button
                onClick={handleClosureBtnClick}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white active:scale-[0.98] transition-all shadow-md"
                style={{ background: '#537d14' }}
                onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = '#5a8520'}
                onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = '#537d14'}
              >
                <FileText className="w-4 h-4" />
                Clôturer la journée
              </button>
            )}

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <Percent className="w-4 h-4" style={{ color: '#7c3aed' }} />
                <h3 className="font-semibold text-slate-800">Bénéfice du jour</h3>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
                  <p className="text-[11px] text-slate-400 font-medium">CA net</p>
                  <p className="text-base font-bold font-mono-num text-slate-800">{Math.round(dayProfit.revenue).toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
                  <p className="text-[11px] text-slate-400 font-medium">Coût</p>
                  <p className="text-base font-bold font-mono-num text-slate-500">{Math.round(dayProfit.cost).toLocaleString()}</p>
                </div>
                <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: 'rgba(124,58,237,0.08)' }}>
                  <p className="text-[11px] font-medium" style={{ color: '#7c3aed' }}>Marge</p>
                  <p className="text-base font-bold font-mono-num" style={{ color: '#7c3aed' }}>{dayProfit.margin.toFixed(0)}%</p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: dayProfit.profit >= 0 ? 'rgba(83,125,20,0.06)' : 'rgba(239,68,68,0.06)' }}>
                <span className="text-sm font-semibold text-slate-700">Bénéfice estimé</span>
                <span className="text-xl font-bold font-mono-num" style={{ color: dayProfit.profit >= 0 ? '#537d14' : '#dc2626' }}>
                  {dayProfit.profit >= 0 ? '+' : ''}{Math.round(dayProfit.profit).toLocaleString()}
                  <span className="text-xs font-medium text-slate-400 ml-1">FCFA</span>
                </span>
              </div>
              {dayProfit.missingCost > 0 && (
                <div className="flex items-start gap-2 mt-3 rounded-xl bg-amber-50 px-3 py-2 border border-amber-100">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    {dayProfit.missingCost} produit(s) vendu(s) sans prix d'achat renseigné — bénéfice sous-estimé. Complétez le coût dans la fiche produit.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm" data-journal-section>
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">Journal d'activité</h3>
              </div>

              {(() => {
                const dateStr = selectedDate.toISOString().split('T')[0];
                const dayExpenses = expenses.filter(e => e.expense_date.split('T')[0] === dateStr);
                // ── Permission historique : vendeur restreint aux 5 dernières ventes
                const histPerm = isManager || getSellerPermissions().showTransactionHistory;
                const limitedEntries = histPerm ? entries : entries.slice(0, 5);
                const combinedEntries: Array<JournalEntry | ExpenseJournalEntry> = [
                  ...limitedEntries.map(e => ({ ...e, type: 'sale' as const })),
                  ...dayExpenses.map(e => ({
                    id: e.id,
                    type: 'expense' as const,
                    description: e.description,
                    category: e.category,
                    amount: e.amount,
                    payment_method: e.payment_method,
                    expense_date: e.expense_date,
                    notes: e.notes,
                  }))
                ].sort((a, b) => {
                  const dateA = new Date('sale' in a ? a.sale_date : a.expense_date);
                  const dateB = new Date('sale' in b ? b.sale_date : b.expense_date);
                  return dateB.getTime() - dateA.getTime();
                });

                if (combinedEntries.length === 0) {
                  return (
                    <div className="p-8 text-center">
                      <Package className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                      <p className="text-slate-400">Aucune activité pour cette date</p>
                    </div>
                  );
                }

                return (
                  <div className="divide-y divide-slate-50 max-h-[40vh] overflow-y-auto">
                    {combinedEntries.map((entry) => {
                      if (entry.type === 'sale') {
                        const isReturn = entry.is_return || entry.total_price < 0;
                        return (
                          <div key={`sale-${entry.id}`} className="px-4 py-3" style={isReturn ? { background: 'rgba(234,88,12,0.03)' } : undefined}>
                            <div className="flex items-start gap-3">
                              <div
                                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                                style={{ background: isReturn ? 'rgba(234,88,12,0.1)' : 'rgba(83,125,20,0.1)' }}
                              >
                                {isReturn
                                  ? <Undo2 className="w-5 h-5" style={{ color: '#ea580c' }} />
                                  : <ArrowUpCircle className="w-5 h-5" style={{ color: '#537d14' }} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-800 truncate">
                                  {entry.medication_name}
                                  {isReturn && (
                                    <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Retour</span>
                                  )}
                                </p>
                                <div className="flex items-center gap-2 mt-1 text-sm text-slate-400">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {formatTime(entry.sale_date)}
                                  </span>
                                  <span>x{Math.abs(entry.quantity_sold)}</span>
                                  <span className="font-mono-num">{entry.unit_price.toLocaleString()} FCFA</span>
                                </div>
                                {isReturn && entry.reason && (
                                  <p className="text-xs text-slate-400 mt-0.5 italic truncate">Motif : {entry.reason}</p>
                                )}
                                <div className="flex items-center gap-2 mt-1">
                                  {getPaymentIcon(entry.payment_method)}
                                  <span className="text-xs text-slate-400">{entry.payment_method}</span>
                                  {!entry.synced && (
                                    <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100">
                                      Non sync
                                    </span>
                                  )}
                                  {!isReturn && (
                                    <button
                                      onClick={() => setReturnSale({
                                        medication_id: entry.medication_id,
                                        medication_name: entry.medication_name,
                                        unit_price: entry.unit_price,
                                        quantity_sold: entry.quantity_sold,
                                        payment_method: entry.payment_method,
                                      })}
                                      className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2 py-0.5 rounded transition-colors"
                                    >
                                      <Undo2 className="w-3 h-3" />
                                      Retour
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold font-mono-num" style={{ color: isReturn ? '#ea580c' : '#537d14' }}>
                                  {isReturn ? '' : '+'}{entry.total_price.toLocaleString()}
                                </p>
                                <p className="text-xs text-slate-400">FCFA</p>
                              </div>
                            </div>
                          </div>
                        );
                      } else {
                        return (
                          <div key={`expense-${entry.id}`} className="px-4 py-3" style={{ background: 'rgba(239,68,68,0.02)' }}>
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-8 h-8 bg-red-50 rounded-full flex items-center justify-center">
                                <ArrowDownCircle className="w-5 h-5 text-red-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-800 truncate">{entry.description}</p>
                                <div className="flex items-center gap-2 mt-1 text-sm text-slate-400">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {formatTime(entry.expense_date)}
                                  </span>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                                    {entry.category}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  {getPaymentIcon(entry.payment_method)}
                                  <span className="text-xs text-slate-400">{entry.payment_method}</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold font-mono-num text-red-600">-{entry.amount.toLocaleString()}</p>
                                <p className="text-xs text-slate-400">FCFA</p>
                              </div>
                            </div>
                          </div>
                        );
                      }
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {activeTab === 'depenses' && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-red-500" />
                  <h3 className="text-sm font-medium text-slate-500">Total</h3>
                </div>
                <p className="text-xl font-bold text-slate-800 font-mono-num">{expenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString()} <span className="text-sm font-normal text-slate-400">FCFA</span></p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-amber-500" />
                  <h3 className="text-sm font-medium text-slate-500">Ce mois</h3>
                </div>
                <p className="text-xl font-bold text-slate-800 font-mono-num">{currentMonthExpenses.toLocaleString()} <span className="text-sm font-normal text-slate-400">FCFA</span></p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Historique</h3>
                <button
                  onClick={() => setIsExpenseModalOpen(true)}
                  className="bg-red-600 text-white p-2 rounded-xl hover:bg-red-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {isLoadingExpenses ? (
                <div className="p-8 text-center">
                  <div className="animate-spin w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full mx-auto"></div>
                </div>
              ) : expenses.length === 0 ? (
                <div className="p-8 text-center">
                  <DollarSign className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400">Aucune depense enregistree</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50 max-h-[40vh] overflow-y-auto">
                  {expenses.map((expense) => (
                    <div key={expense.id} className="px-4 py-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0 mr-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              expense.category === 'Perte/Peremption'
                                ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                : 'bg-red-50 text-red-700 border border-red-100'
                            }`}>
                              {expense.category}
                            </span>
                            <span className="text-xs text-slate-400">
                              {new Date(expense.expense_date).toLocaleDateString('fr-FR')}
                            </span>
                          </div>
                          <p className="font-medium text-slate-800">{expense.description}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{expense.payment_method}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold font-mono-num text-red-600">{expense.amount.toLocaleString()} <span className="text-xs font-normal text-slate-400">FCFA</span></p>
                          <button
                            onClick={() => deleteExpense(expense.id)}
                            className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'alertes' && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <h3 className="text-sm font-medium text-red-700">Perimes</h3>
                </div>
                <p className="text-2xl font-bold font-mono-num text-red-600">{expiredMedications.length}</p>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-amber-600" />
                  <h3 className="text-sm font-medium text-amber-700">Proches peremption</h3>
                </div>
                <p className="text-2xl font-bold font-mono-num text-amber-600">{nearExpiryMedications.length}</p>
              </div>
            </div>

            {promotions.length > 0 && (
              <div className="rounded-2xl p-4" style={{ background: 'rgba(83,125,20,0.06)', border: '1px solid rgba(83,125,20,0.15)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Tag className="w-5 h-5" style={{ color: '#537d14' }} />
                    <h3 className="font-semibold" style={{ color: '#253804' }}>Promotions actives</h3>
                  </div>
                  <span className="text-sm font-bold" style={{ color: '#537d14' }}>{promotions.length}</span>
                </div>
                <div className="space-y-2">
                  {promotions.map((promo) => (
                    <div key={promo.id} className="bg-white rounded-xl p-3 flex items-center justify-between border border-slate-100 shadow-sm">
                      <div>
                        <p className="font-medium text-slate-800 text-sm">{promo.medication_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-400 line-through font-mono-num">{promo.original_price} FCFA</span>
                          <span className="text-sm font-bold font-mono-num" style={{ color: '#537d14' }}>{promo.promo_price} FCFA</span>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(83,125,20,0.1)', color: '#5a8520' }}>
                            -{promo.discount_percent}%
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Jusqu'au {new Date(promo.end_date).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <button
                        onClick={() => deletePromotion(promo.id)}
                        className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">Produits a surveiller</h3>
              </div>

              {isLoadingMedications ? (
                <div className="p-8 text-center">
                  <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full mx-auto"></div>
                </div>
              ) : expiringMedications.length === 0 ? (
                <div className="p-8 text-center">
                  <Check className="w-12 h-12 mx-auto mb-3" style={{ color: '#bcd96e' }} />
                  <p className="text-slate-400">Aucun produit proche de la peremption</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50 max-h-[40vh] overflow-y-auto">
                  {expiringMedications.map((med) => {
                    const days = getDaysUntilExpiry(med.expiry_date);
                    const colors = getExpiryColor(days);

                    return (
                      <div key={med.id} className="px-4 py-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0 mr-3">
                            <p className="font-medium text-slate-800">{med.name} {med.dosage}</p>
                            <p className="text-xs text-slate-400">Lot: {med.batch_number} | Stock: <span className="font-mono-num">{med.quantity}</span></p>
                          </div>
                          <div className={`${colors.bg} ${colors.text} ${colors.border} border px-2 py-1 rounded-lg text-xs font-bold font-mono-num`}>
                            {days < 0 ? `Perime (${Math.abs(days)}j)` : `${days}j`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedMedForPromo(med);
                              const defaultEndDate = new Date();
                              defaultEndDate.setDate(defaultEndDate.getDate() + 14);
                              setPromoForm({
                                discount_percent: days < 30 ? '30' : days < 60 ? '20' : '10',
                                end_date: defaultEndDate.toISOString().split('T')[0],
                              });
                              setShowPromoModal(true);
                            }}
                            className="flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1"
                            style={{ background: 'rgba(83,125,20,0.08)', color: '#5a8520' }}
                            onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(83,125,20,0.14)'}
                            onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(83,125,20,0.08)'}
                          >
                            <Tag className="w-4 h-4" />
                            Promotion
                          </button>
                          <button
                            onClick={() => {
                              setSelectedMedForLoss(med);
                              setLossQuantity(med.quantity.toString());
                              setShowLossModal(true);
                            }}
                            className="flex-1 bg-red-50 text-red-700 py-2 px-3 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-1"
                          >
                            <Trash2 className="w-4 h-4" />
                            Perte
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {isExpenseModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center sm:justify-center sm:p-4">
          <div className="bg-white w-full rounded-t-3xl sm:rounded-2xl sm:max-w-[600px] max-h-[90vh] overflow-hidden animate-slide-up">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Nouvelle depense</h2>
              <button
                onClick={() => setIsExpenseModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleExpenseSubmit} className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Categorie</label>
                <select
                  required
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Selectionner...</option>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  required
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Ex: Facture electricite"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Montant (FCFA)</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="50000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mode de paiement</label>
                <select
                  required
                  value={expenseForm.payment_method}
                  onChange={(e) => setExpenseForm({ ...expenseForm, payment_method: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={expenseForm.expense_date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-red-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg"
              >
                {isSubmitting ? 'Ajout...' : 'Ajouter la depense'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showPromoModal && selectedMedForPromo && (
        <div className="fixed top-16 left-0 right-0 bottom-0 bg-black/60 z-50 flex items-end">
          <div className="bg-white w-full h-full overflow-hidden animate-slide-up flex flex-col">
            <div className="bg-white border-b border-slate-100 px-4 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Nouvelle promotion</h2>
              <button
                onClick={() => {
                  setShowPromoModal(false);
                  setSelectedMedForPromo(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-safe">
              <div className="space-y-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="font-semibold text-slate-800">{selectedMedForPromo.name} {selectedMedForPromo.dosage}</p>
                  <p className="text-sm text-slate-400">Prix actuel: {selectedMedForPromo.price?.toLocaleString()} FCFA</p>
                  <p className="text-sm text-slate-400">Stock: {selectedMedForPromo.quantity} | Exp: {new Date(selectedMedForPromo.expiry_date).toLocaleDateString('fr-FR')}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Reduction (%)</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['10', '15', '20', '30'].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setPromoForm({ ...promoForm, discount_percent: val })}
                        className={`py-3 rounded-xl font-semibold transition-all ${
                          promoForm.discount_percent === val
                            ? 'text-white shadow-md'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                        style={promoForm.discount_percent === val ? { background: '#537d14' } : {}}
                      >
                        -{val}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl p-4" style={{ background: 'rgba(83,125,20,0.08)', border: '1px solid rgba(83,125,20,0.2)' }}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium" style={{ color: '#253804' }}>Nouveau prix</span>
                    <span className="text-2xl font-bold font-mono-num" style={{ color: '#537d14' }}>
                      {Math.round((selectedMedForPromo.price || 0) * (1 - parseInt(promoForm.discount_percent) / 100)).toLocaleString()} FCFA
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date de fin</label>
                  <input
                    type="date"
                    required
                    value={promoForm.end_date}
                    onChange={(e) => setPromoForm({ ...promoForm, end_date: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white border-t border-slate-100 p-4 pb-safe">
              <button
                onClick={createPromotion}
                disabled={!promoForm.end_date}
                className="w-full text-white py-4 rounded-2xl font-bold text-lg active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg"
                style={{ background: '#537d14' }}
                onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = '#5a8520'}
                onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = '#537d14'}
              >
                Creer la promotion
              </button>
            </div>
          </div>
        </div>
      )}

      {showLossModal && selectedMedForLoss && (
        <div className="fixed top-16 left-0 right-0 bottom-0 bg-black/60 z-50 flex items-end">
          <div className="bg-white w-full h-full overflow-hidden animate-slide-up flex flex-col">
            <div className="bg-white border-b border-slate-100 px-4 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Enregistrer une perte</h2>
              <button
                onClick={() => {
                  setShowLossModal(false);
                  setSelectedMedForLoss(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-safe">
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="font-semibold text-slate-800">{selectedMedForLoss.name} {selectedMedForLoss.dosage}</p>
                  <p className="text-sm text-slate-500">Lot: {selectedMedForLoss.batch_number}</p>
                  <p className="text-sm text-red-600 font-medium">
                    Peremption: {new Date(selectedMedForLoss.expiry_date).toLocaleDateString('fr-FR')}
                  </p>
                  <p className="text-sm text-slate-400">Stock actuel: {selectedMedForLoss.quantity}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantite a retirer</label>
                  <input
                    type="number"
                    min="1"
                    max={selectedMedForLoss.quantity}
                    value={lossQuantity}
                    onChange={(e) => setLossQuantity(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-center text-xl font-bold"
                  />
                </div>

                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Perte estimee</span>
                    <span className="text-xl font-bold text-red-600">
                      {((selectedMedForLoss.wholesale_price || selectedMedForLoss.price || 0) * parseInt(lossQuantity || '0')).toLocaleString()} FCFA
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border-t border-slate-100 p-4 pb-safe">
              <button
                onClick={registerLoss}
                disabled={isSubmitting || !lossQuantity || parseInt(lossQuantity) <= 0}
                className="w-full bg-red-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg"
              >
                {isSubmitting ? 'Enregistrement...' : 'Confirmer la perte'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ZReportModal
        isOpen={showZReport}
        onClose={() => setShowZReport(false)}
        entries={entries}
        medications={medications}
        date={selectedDate}
        onConfirmClosure={closeDailyReport}
      />

      {returnSale && (
        <ReturnModal
          sale={returnSale}
          processing={isReturnProcessing}
          onConfirm={handleConfirmReturn}
          onCancel={() => setReturnSale(null)}
        />
      )}
    </div>
  );
}
