import { useState, useEffect, useRef, useMemo } from 'react';
import { ShoppingCart, Plus, Trash2, CreditCard, Banknote, Smartphone, Receipt, AlertTriangle, X, BookOpen, Search, User, Shield, Undo2, ClipboardCheck } from 'lucide-react';
import { supabase, fetchAllMedications, Medication } from '../lib/supabase';
import { insertWithUserId, updateWithUserId } from '../lib/supabaseHelpers';
import { offlineStorage } from '../lib/offlineStorage';
import { getTaxRate, loadSettings } from '../lib/settings';
import { useResponsive } from '../lib/useResponsive';
import { offlineSafeInsertCredit, recordReturn } from '../lib/writeService';
import { printThermalReceipt } from '../lib/printThermalReceipt';
import ReturnModal, { ReturnableSale } from './ReturnModal';
import FondDeCaisseModal from './FondDeCaisseModal';
import ZReportModal from './ZReportModal';
import StupefiantModal, { StupefiantFormData } from './StupefiantModal';
import BarcodeScanner from './BarcodeScanner';
import { detectCategory } from '../lib/dciCategories';
import { useSeller } from '../lib/sellerContext';
import { useWorkflow } from '../lib/workflowContext';
import { getSellerPermissions } from '../lib/permissions';
import { usePatients } from '../lib/usePatients';
import { useInsuranceOrgs } from '../lib/useInsuranceOrgs';

/**
 * La table `sales` a une contrainte CHECK stricte sur payment_method
 * (Espèces/Carte/MTN/Airtel uniquement). Les libellés dynamiques comme
 * "Assurance CNSS", "Crédit" ou "Mixte" la violeraient et feraient échouer
 * tout le sync cloud. On normalise donc UNIQUEMENT pour la table `sales`
 * (agrégat technique non lu par les rapports). Le libellé complet reste
 * intact dans `sales_journal` (sans contrainte) pour les rapports.
 */
const SALES_ALLOWED_METHODS = ['Espèces', 'Especes', 'Carte Bancaire', 'MTN Mobile Money', 'Airtel Money'];

// ── Palette pastel par catégorie thérapeutique ─────────────────────────────
// Inspirée du design Chalk Premium — cartes pastel sur fond clair
const CATEGORY_GRADIENTS: Record<string, { bg: string; border: string; chevron: string; shadow: string }> = {
  'Antibiotiques':     { bg: 'linear-gradient(135deg, #d8f5e6 0%, #e9faf0 100%)', border: 'rgba(16,120,90,0.18)',  chevron: '#10785a', shadow: 'rgba(16,120,90,0.18)' },
  'Antipaludéens':     { bg: 'linear-gradient(135deg, #ede7fb 0%, #f4f0fc 100%)', border: 'rgba(124,58,237,0.18)', chevron: '#7c3aed', shadow: 'rgba(124,58,237,0.18)' },
  'Analgésiques':      { bg: 'linear-gradient(135deg, #dceaff 0%, #ebf3ff 100%)', border: 'rgba(37,99,235,0.18)',  chevron: '#2563eb', shadow: 'rgba(37,99,235,0.18)' },
  'Anti-inflammatoires':{ bg: 'linear-gradient(135deg, #dceaff 0%, #ebf3ff 100%)', border: 'rgba(37,99,235,0.18)', chevron: '#2563eb', shadow: 'rgba(37,99,235,0.18)' },
  'Vitamines':         { bg: 'linear-gradient(135deg, #fdebd0 0%, #fdf2dd 100%)', border: 'rgba(217,119,6,0.18)',  chevron: '#d97706', shadow: 'rgba(217,119,6,0.18)' },
  'Minéraux':          { bg: 'linear-gradient(135deg, #fdebd0 0%, #fdf2dd 100%)', border: 'rgba(217,119,6,0.18)',  chevron: '#d97706', shadow: 'rgba(217,119,6,0.18)' },
  'Gastro':            { bg: 'linear-gradient(135deg, #e6dffb 0%, #efe9fc 100%)', border: 'rgba(99,102,241,0.18)', chevron: '#6366f1', shadow: 'rgba(99,102,241,0.18)' },
  'Respiratoire':      { bg: 'linear-gradient(135deg, #d9eef4 0%, #e8f4f8 100%)', border: 'rgba(8,145,178,0.18)',  chevron: '#0891b2', shadow: 'rgba(8,145,178,0.18)' },
  'Cardiovasculaires': { bg: 'linear-gradient(135deg, #d8e8f0 0%, #e6efd6 100%)', border: 'rgba(37,99,235,0.18)',  chevron: '#2563eb', shadow: 'rgba(37,99,235,0.18)' },
  'Antihypertenseurs': { bg: 'linear-gradient(135deg, #d8e8f0 0%, #e6efd6 100%)', border: 'rgba(37,99,235,0.18)',  chevron: '#2563eb', shadow: 'rgba(37,99,235,0.18)' },
  'Diabète':           { bg: 'linear-gradient(135deg, #fbe0e3 0%, #fce9eb 100%)', border: 'rgba(220,38,38,0.18)',  chevron: '#dc2626', shadow: 'rgba(220,38,38,0.18)' },
  'Dermato':           { bg: 'linear-gradient(135deg, #ffe5d6 0%, #fff0e3 100%)', border: 'rgba(234,88,12,0.18)',  chevron: '#ea580c', shadow: 'rgba(234,88,12,0.18)' },
  'Gynécologie':       { bg: 'linear-gradient(135deg, #fde4ec 0%, #feeef3 100%)', border: 'rgba(236,72,153,0.18)', chevron: '#ec4899', shadow: 'rgba(236,72,153,0.18)' },
  'Contraception':     { bg: 'linear-gradient(135deg, #fde4ec 0%, #feeef3 100%)', border: 'rgba(236,72,153,0.18)', chevron: '#ec4899', shadow: 'rgba(236,72,153,0.18)' },
  'Ophtalmologie':     { bg: 'linear-gradient(135deg, #d9eef4 0%, #e8f4f8 100%)', border: 'rgba(8,145,178,0.18)',  chevron: '#0891b2', shadow: 'rgba(8,145,178,0.18)' },
  'ORL':               { bg: 'linear-gradient(135deg, #d9eef4 0%, #e8f4f8 100%)', border: 'rgba(8,145,178,0.18)',  chevron: '#0891b2', shadow: 'rgba(8,145,178,0.18)' },
  'Antiparasitaires':  { bg: 'linear-gradient(135deg, #ede7fb 0%, #f4f0fc 100%)', border: 'rgba(124,58,237,0.18)', chevron: '#7c3aed', shadow: 'rgba(124,58,237,0.18)' },
  'Antiviraux':        { bg: 'linear-gradient(135deg, #d8f5e6 0%, #e9faf0 100%)', border: 'rgba(16,120,90,0.18)',  chevron: '#10785a', shadow: 'rgba(16,120,90,0.18)' },
  'Antifongiques':     { bg: 'linear-gradient(135deg, #fdebd0 0%, #fdf2dd 100%)', border: 'rgba(217,119,6,0.18)',  chevron: '#d97706', shadow: 'rgba(217,119,6,0.18)' },
  'Neuro / Psy':       { bg: 'linear-gradient(135deg, #e6dffb 0%, #efe9fc 100%)', border: 'rgba(99,102,241,0.18)', chevron: '#6366f1', shadow: 'rgba(99,102,241,0.18)' },
  'Hormones':          { bg: 'linear-gradient(135deg, #fde4ec 0%, #feeef3 100%)', border: 'rgba(236,72,153,0.18)', chevron: '#ec4899', shadow: 'rgba(236,72,153,0.18)' },
  'Pédiatrie':         { bg: 'linear-gradient(135deg, #dceaff 0%, #ebf3ff 100%)', border: 'rgba(37,99,235,0.18)',  chevron: '#2563eb', shadow: 'rgba(37,99,235,0.18)' },
  'Maternité':         { bg: 'linear-gradient(135deg, #fde4ec 0%, #feeef3 100%)', border: 'rgba(236,72,153,0.18)', chevron: '#ec4899', shadow: 'rgba(236,72,153,0.18)' },
  'Solutés / Perf':    { bg: 'linear-gradient(135deg, #d9eef4 0%, #e8f4f8 100%)', border: 'rgba(8,145,178,0.18)',  chevron: '#0891b2', shadow: 'rgba(8,145,178,0.18)' },
  'Cosmétique':        { bg: 'linear-gradient(135deg, #ffe5d6 0%, #fff0e3 100%)', border: 'rgba(234,88,12,0.18)',  chevron: '#ea580c', shadow: 'rgba(234,88,12,0.18)' },
  'Vaccins':           { bg: 'linear-gradient(135deg, #d8f5e6 0%, #e9faf0 100%)', border: 'rgba(16,120,90,0.18)',  chevron: '#10785a', shadow: 'rgba(16,120,90,0.18)' },
  'Hématologie':       { bg: 'linear-gradient(135deg, #fbe0e3 0%, #fce9eb 100%)', border: 'rgba(220,38,38,0.18)',  chevron: '#dc2626', shadow: 'rgba(220,38,38,0.18)' },
  'Urologie':          { bg: 'linear-gradient(135deg, #d8e8f0 0%, #e6efd6 100%)', border: 'rgba(37,99,235,0.18)',  chevron: '#2563eb', shadow: 'rgba(37,99,235,0.18)' },
  'Anesthésie':        { bg: 'linear-gradient(135deg, #ede9f5 0%, #f3f0f9 100%)', border: 'rgba(107,114,128,0.2)', chevron: '#6b7280', shadow: 'rgba(107,114,128,0.18)' },
  'Autre':             { bg: 'linear-gradient(135deg, #ede9f5 0%, #f3f0f9 100%)', border: 'rgba(107,114,128,0.2)', chevron: '#6b7280', shadow: 'rgba(107,114,128,0.18)' },
  default:             { bg: 'linear-gradient(135deg, #ede9f5 0%, #f3f0f9 100%)', border: 'rgba(107,114,128,0.2)', chevron: '#6b7280', shadow: 'rgba(107,114,128,0.18)' },
};
function normalizeSalesPaymentMethod(pm: string | null | undefined): string {
  if (pm && SALES_ALLOWED_METHODS.includes(pm)) return pm;
  return 'Espèces';
}

interface CartItem {
  medication: Medication;
  quantity: number;
  /** Unités spécifiques scannées (MODE UNITAIRE) */
  units?: { id: string; unit_code: string; batch_number: string; expiry_date: string | null }[];
}

interface LowStockAlert {
  id: string;
  name: string;
  stockAfter: number;
  minimumStock: number;
}

export default function Sales() {
  const { isDesktop } = useResponsive();
  const { activeSeller } = useSeller();
  const { pendingOrdCart, setPendingOrdCart, isUnitMode } = useWorkflow();
  const { patients } = usePatients();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('junglepharm_cart');
      return saved ? (JSON.parse(saved) as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'Espèces' | 'Carte Bancaire' | 'MTN Mobile Money' | 'Airtel Money'>('Espèces');
  const [customerName, setCustomerName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [lowStockAlerts, setLowStockAlerts] = useState<LowStockAlert[]>([]);

  // ── Crédit client ────────────────────────────────────────────────────────────
  const [paymentMode, setPaymentMode] = useState<'direct' | 'credit' | 'insurance'>('direct');
  const [creditClientName, setCreditClientName] = useState('');
  const [creditClientPhone, setCreditClientPhone] = useState('');
  const [creditDueDate, setCreditDueDate] = useState('');

  // ── Paiement mixte ────────────────────────────────────────────────────────────
  const [mixedMode, setMixedMode] = useState(false);
  const [mixedMethod1, setMixedMethod1] = useState<string>('Espèces');
  const [mixedAmount1, setMixedAmount1] = useState('');
  const [mixedMethod2, setMixedMethod2] = useState<string>('MTN Mobile Money');
  const [mixedAmount2, setMixedAmount2] = useState('');

  // ── Assurance / Mutuelle ──────────────────────────────────────────────────────
  const { orgs: insuranceOrgs, addOrg: addInsuranceOrg, removeOrg: removeInsuranceOrg } = useInsuranceOrgs();
  const [insuranceOrg,            setInsuranceOrg]            = useState('');
  const [insuranceCard,           setInsuranceCard]           = useState('');
  const [insuranceRate,           setInsuranceRate]           = useState(80);
  const [insuranceResidualMethod, setInsuranceResidualMethod] = useState('Espèces');
  const [showAddOrgForm,          setShowAddOrgForm]          = useState(false);
  const [newOrgName,              setNewOrgName]              = useState('');
  const [newOrgRate,              setNewOrgRate]              = useState('80');

  // ── Patient CRM ───────────────────────────────────────────────────────────────
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedPatientName, setSelectedPatientName] = useState('');
  const [patSearch, setPatSearch] = useState('');
  const [showPatDrop, setShowPatDrop] = useState(false);
  const patRef = useRef<HTMLDivElement>(null);

  // ── Scanner ───────────────────────────────────────────────────────────────────
  const [showScanner, setShowScanner] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ msg: string; ok: boolean } | null>(null);

  // ── Scan JP obligatoire (mode unitaire) ───────────────────────────────────────
  // Quand un produit JP-tracké est cliqué, on demande le scan de la boîte physique
  const [pendingJpScan, setPendingJpScan] = useState<{
    medication: Medication;
    jpInput: string;
    availableCount: number;
  } | null>(null);
  const jpInputRef = useRef<HTMLInputElement>(null);

  // ── Calculatrice monnaie ──────────────────────────────────────────────────────
  const [cashGiven, setCashGiven] = useState('');

  // ── Taux de TVA (réactif aux changements de paramètres) ──────────────────────
  const [taxRate, setTaxRate] = useState(() => getTaxRate());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'tax_rate') setTaxRate(getTaxRate());
    };
    window.addEventListener('storage', onStorage);
    // Écoute aussi les changements dans le même onglet
    const onLocal = () => setTaxRate(getTaxRate());
    window.addEventListener('junglepharm:tax_updated', onLocal);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('junglepharm:tax_updated', onLocal); };
  }, []);

  // ── Recharger le catalogue après import CSV/Excel ─────────────────────────
  useEffect(() => {
    const handleCatalogUpdated = () => { loadMedications(); };
    window.addEventListener('junglepharm:catalog-updated', handleCatalogUpdated);
    return () => window.removeEventListener('junglepharm:catalog-updated', handleCatalogUpdated);
  }, []);

  // ── Fond de caisse ────────────────────────────────────────────────────────────
  const [showFondModal, setShowFondModal] = useState(false);
  // Valeur affichée en temps réel (re-lit le localStorage à chaque fermeture du modal)
  const [fondDuJour, setFondDuJour] = useState<number>(() => offlineStorage.getFondDeCaisse());

  // ── Rapport Z ─────────────────────────────────────────────────────────────────
  const [showZReport, setShowZReport] = useState(false);
  const todayEntries = useMemo(() => offlineStorage.getJournalByDate(new Date()), [showZReport]);  // re-calcule à l'ouverture
  const closeDailyReport = async () => {
    const reportDate = new Date().toISOString().split('T')[0];
    const totalSales      = todayEntries.reduce((s, e) => s + e.total_price, 0);
    const transactionCount = todayEntries.length;
    const itemsSold        = todayEntries.reduce((s, e) => s + e.quantity_sold, 0);
    const fondVal          = Math.max(0, offlineStorage.getFondDeCaisse(reportDate));
    const especes          = todayEntries.filter(e => e.payment_method === 'Espèces').reduce((s, e) => s + e.total_price, 0);
    try {
      await insertWithUserId('daily_reports', [{
        report_date:       reportDate,
        total_sales:       totalSales,
        total_expenses:    0,
        net_amount:        fondVal + especes,
        transaction_count: transactionCount,
        items_sold:        itemsSold,
        closed_by:         activeSeller?.name || 'Vendeur',
        is_locked:         true,
      }]);
      setShowZReport(false);
    } catch (err) {
      console.error('Clôture Z:', err);
      alert('Erreur lors de la clôture');
    }
  };

  // ── Retour / Avoir ────────────────────────────────────────────────────────────
  const [showReturnPanel, setShowReturnPanel] = useState(false);
  const [returnSearch, setReturnSearch] = useState('');
  const [returnJournal, setReturnJournal] = useState<any[]>([]);
  const [returnJournalLoading, setReturnJournalLoading] = useState(false);
  const [returnSale, setReturnSale] = useState<ReturnableSale | null>(null);
  const [returnProcessing, setReturnProcessing] = useState(false);
  const [returnSuccess, setReturnSuccess] = useState<string | null>(null);

  // ── Stupéfiants ───────────────────────────────────────────────────────────────
  const [stupefiantPending, setStupefiantPending] = useState<{
    medication: Medication;
    resolve: (data: StupefiantFormData | null) => void;
  } | null>(null);

  useEffect(() => {
    loadMedications();

    // Fond de caisse — demander si non saisi aujourd'hui ET pas déjà demandé cette session
    if (!offlineStorage.hasFondDeCaisseToday() && !sessionStorage.getItem('fond_caisse_prompted')) {
      sessionStorage.setItem('fond_caisse_prompted', '1');
      setShowFondModal(true);
    }
    // Mettre à jour l'affichage du fond du jour
    setFondDuJour(offlineStorage.getFondDeCaisse());

    const handleOnlineSync = () => {
      syncPendingSales();
    };
    window.addEventListener('online-sync-required', handleOnlineSync);
    return () => window.removeEventListener('online-sync-required', handleOnlineSync);
  }, []);

  // ── Pre-fill cart from ordonnance workflow ────────────────────────────────────
  useEffect(() => {
    if (!pendingOrdCart || medications.length === 0) return;
    const newCart: CartItem[] = [];
    for (const pending of pendingOrdCart) {
      const med = medications.find(m => m.name.toLowerCase() === pending.name.toLowerCase());
      if (!med || med.quantity <= 0) continue;
      const existing = newCart.find(i => i.medication.id === med.id);
      if (existing) {
        existing.quantity = Math.min(existing.quantity + pending.qty, med.quantity);
      } else {
        newCart.push({ medication: med, quantity: Math.min(pending.qty, med.quantity) });
      }
    }
    if (newCart.length > 0) setCart(newCart);
    setPendingOrdCart(null);
  }, [pendingOrdCart, medications]);

  // ── Nettoyage pendingJpScan au démontage ─────────────────────────────────────
  useEffect(() => {
    return () => setPendingJpScan(null);
  }, []);

  // ── Persistance du panier dans localStorage ──────────────────────────────────
  // Sauvegarde à chaque modification → survit aux changements d'onglet
  useEffect(() => {
    if (cart.length === 0) {
      localStorage.removeItem('junglepharm_cart');
    } else {
      try {
        localStorage.setItem('junglepharm_cart', JSON.stringify(cart));
      } catch {
        // localStorage plein → on ignore silencieusement
      }
    }
  }, [cart]);

  // ── Patient dropdown outside-click close ─────────────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (patRef.current && !patRef.current.contains(e.target as Node)) setShowPatDrop(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const patSuggestions = useMemo(() => {
    const q = patSearch.trim().toLowerCase();
    if (!q) return patients.slice(0, 5);
    return patients.filter(p => p.name.toLowerCase().includes(q) || p.phone.includes(q)).slice(0, 6);
  }, [patSearch, patients]);

  // Détecte si un médicament est une substance contrôlée
  // (flag is_controlled sur l'objet, ou mots-clés dans le nom)
  const isControlled = (med: Medication): boolean => {
    if ((med as any).is_controlled) return true;
    const name = (med.name + ' ' + (med.dosage || '')).toLowerCase();
    const keywords = [
      'morphine','codeine','codéine','tramadol','fentanyl','oxycodone',
      'methadone','méthadone','buprenorphine','buprénorphine','hydromorphone',
      'diazepam','midazolam','alprazolam','lorazepam','clonazepam',
      'phenobarbital','phénobarbital','ketamine','kétamine',
    ];
    return keywords.some(k => name.includes(k));
  };

  // Demande les infos stupéfiant avant d'ajouter au panier
  const askStupefiantInfo = (med: Medication): Promise<StupefiantFormData | null> =>
    new Promise(resolve => setStupefiantPending({ medication: med, resolve }));

  // ── Gestion scan code-barres ──────────────────────────────────────────────────
  const [desktopScanInput, setDesktopScanInput] = useState('');
  const desktopScanRef = useRef<HTMLInputElement>(null);

  // Ouvre le modal desktop et focus l'input après le rendu
  const openDesktopScanner = () => {
    setDesktopScanInput('');
    setShowScanner(true);
    setTimeout(() => desktopScanRef.current?.focus(), 80);
  };

  const handleBarcodeScan = async (barcode: string) => {
    setShowScanner(false);
    setDesktopScanInput('');

    // Si un prompt JP est ouvert → router le scan vers handleJpEntry
    if (pendingJpScan && barcode.startsWith('JP-')) {
      await handleJpEntry(barcode);
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RÉSOLUTION HIÉRARCHIQUE — indépendante du mode Global/Unitaire
    //
    // 1. Code JP-XXXXX  → inventory_units (débit unitaire : marquer l'unité vendue)
    // 2. Code EAN/GS1   → medications par code_produit/barcode (débit global)
    // 3. Texte libre    → medications par nom (débit global)
    // ─────────────────────────────────────────────────────────────────────────

    // ── 1. CODE JP : unité spécifique ────────────────────────────────────────
    if (barcode.startsWith('JP-')) {
      const { data: unitRows, error } = await supabase
        .from('inventory_units')
        .select('id, unit_code, batch_number, expiry_date, medication_id, status')
        .eq('unit_code', barcode)
        .limit(1);

      if (error || !unitRows || unitRows.length === 0) {
        setScanFeedback({ msg: `Code JP introuvable : ${barcode}`, ok: false });
        setTimeout(() => setScanFeedback(null), 3500);
        return;
      }
      const unit = unitRows[0];
      if (unit.status !== 'available') {
        setScanFeedback({ msg: `Unité déjà vendue ou indisponible : ${barcode}`, ok: false });
        setTimeout(() => setScanFeedback(null), 3500);
        return;
      }
      // Chercher dans le cache local en priorité, sinon Supabase
      let med = medications.find(m => m.id === unit.medication_id);
      if (!med) {
        const { data: medRow } = await supabase
          .from('medications')
          .select('*')
          .eq('id', unit.medication_id)
          .single();
        med = medRow ?? undefined;
      }
      if (!med) {
        setScanFeedback({ msg: `Médicament introuvable pour ${barcode}`, ok: false });
        setTimeout(() => setScanFeedback(null), 3500);
        return;
      }
      // Ajouter au panier avec tracking d'unité (débit = marquer sold à la vente)
      const finalMed = med;
      setCart(prev => {
        const existing = prev.find(i => i.medication.id === finalMed.id);
        const newUnit = { id: unit.id, unit_code: unit.unit_code, batch_number: unit.batch_number, expiry_date: unit.expiry_date };
        if (existing) {
          if (existing.units?.some(u => u.id === unit.id)) {
            setScanFeedback({ msg: `Unité déjà dans le panier : ${barcode}`, ok: false });
            setTimeout(() => setScanFeedback(null), 3000);
            return prev;
          }
          return prev.map(i => i.medication.id === finalMed.id
            ? { ...i, quantity: i.quantity + 1, units: [...(i.units || []), newUnit] }
            : i
          );
        }
        return [...prev, { medication: finalMed, quantity: 1, units: [newUnit] }];
      });
      setScanFeedback({ msg: `✓ ${med.name} ${med.dosage} — unité ${barcode}`, ok: true });
      setTimeout(() => setScanFeedback(null), 3000);
      return;
    }

    // ── 2. CODE EAN / code_produit (cache local d'abord) ─────────────────────
    const eanMatch = medications.find(m =>
      m.code_produit === barcode ||
      (m as any).barcode === barcode ||
      m.batch_number === barcode
    );
    if (eanMatch) {
      await addToCart(eanMatch);
      setScanFeedback({ msg: `✓ ${eanMatch.name} ${eanMatch.dosage} ajouté`, ok: true });
      setTimeout(() => setScanFeedback(null), 3000);
      return;
    }

    // ── 2b. LOOKUP EAN via Supabase (barcodes + inventory_units) ─────────────
    // Nécessaire en mode unitaire : chaque boîte a son EAN stocké dans
    // inventory_units.imported_code et dans la table barcodes.
    if (offlineStorage.isOnline()) {
      try {
        // Mode unitaire : chercher l'unité physique par son EAN d'import
        if (isUnitMode) {
          const { data: unitByEan } = await supabase
            .from('inventory_units')
            .select('id, unit_code, batch_number, expiry_date, medication_id, status')
            .eq('imported_code', barcode)
            .eq('status', 'available')
            .limit(1);

          if (unitByEan && unitByEan.length > 0) {
            const unit = unitByEan[0];
            let med = medications.find(m => m.id === unit.medication_id);
            if (!med) {
              const { data: medRow } = await supabase
                .from('medications').select('*').eq('id', unit.medication_id).single();
              med = medRow ?? undefined;
            }
            if (med) {
              const finalMed = med;
              const newUnit = { id: unit.id, unit_code: unit.unit_code, batch_number: unit.batch_number, expiry_date: unit.expiry_date };
              setCart(prev => {
                const existing = prev.find(i => i.medication.id === finalMed.id);
                if (existing) {
                  if (existing.units?.some(u => u.id === unit.id)) {
                    setScanFeedback({ msg: `Unité déjà dans le panier`, ok: false });
                    setTimeout(() => setScanFeedback(null), 3000);
                    return prev;
                  }
                  return prev.map(i => i.medication.id === finalMed.id
                    ? { ...i, quantity: i.quantity + 1, units: [...(i.units || []), newUnit] }
                    : i);
                }
                return [...prev, { medication: finalMed, quantity: 1, units: [newUnit] }];
              });
              setScanFeedback({ msg: `✓ ${med.name} — unité scannée (${barcode})`, ok: true });
              setTimeout(() => setScanFeedback(null), 3000);
              return;
            }
          }
        }

        // Mode global ou unité non trouvée : chercher via table barcodes
        const { data: bcRows } = await supabase
          .from('barcodes')
          .select('medication_id')
          .eq('barcode', barcode)
          .limit(1);

        if (bcRows && bcRows.length > 0) {
          const medId = bcRows[0].medication_id;
          let med = medications.find(m => m.id === medId);
          if (!med) {
            const { data: medRow } = await supabase
              .from('medications').select('*').eq('id', medId).single();
            med = medRow ?? undefined;
          }
          if (med) {
            await addToCart(med);
            setScanFeedback({ msg: `✓ ${med.name} ${med.dosage} ajouté`, ok: true });
            setTimeout(() => setScanFeedback(null), 3000);
            return;
          }
        }
      } catch { /* ignore — fallback texte ci-dessous */ }
    }

    // ── 3. RECHERCHE TEXTUELLE par nom (fallback) ─────────────────────────────
    const textMatch = medications.find(m =>
      m.name.toLowerCase().includes(barcode.toLowerCase())
    );
    if (textMatch) {
      await addToCart(textMatch);
      setScanFeedback({ msg: `✓ ${textMatch.name} ${textMatch.dosage} trouvé par nom`, ok: true });
    } else {
      setScanFeedback({ msg: `Code non reconnu : ${barcode}`, ok: false });
    }
    setTimeout(() => setScanFeedback(null), 3000);
  };

  // ── Écoute les scans HID globaux (USB/Bluetooth, sans ouvrir le modal) ────
  const handleBarcodeScanRef = useRef(handleBarcodeScan);
  handleBarcodeScanRef.current = handleBarcodeScan;

  useEffect(() => {
    const handler = (e: Event) => {
      const { barcode } = (e as CustomEvent<{ barcode: string }>).detail;
      handleBarcodeScanRef.current(barcode);
    };
    window.addEventListener('barcode-scanned', handler);
    return () => window.removeEventListener('barcode-scanned', handler);
  }, []);

  // ── Vente rapide depuis l'inventaire (event 'junglepharm:quick-sale') ─────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { medicationId } = (e as CustomEvent<{ medicationId: string }>).detail;
      // Cherche le produit dans les médicaments chargés
      import('../lib/supabase').then(async ({ supabase: sb }) => {
        const { data: med } = await sb.from('medications').select('*').eq('id', medicationId).maybeSingle();
        if (!med) return;
        setCart(prev => {
          const existing = prev.find(item => item.medication.id === medicationId);
          if (existing) {
            return prev.map(item => item.medication.id === medicationId
              ? { ...item, quantity: item.quantity + 1 } : item);
          }
          return [...prev, { medication: med, quantity: 1 }];
        });
      });
    };
    window.addEventListener('junglepharm:quick-sale', handler);
    return () => window.removeEventListener('junglepharm:quick-sale', handler);
  }, []);

  // ── Retour : charger le journal des 30 derniers jours ──────────────────────
  const loadReturnJournal = async () => {
    setReturnJournalLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from('sales_journal')
        .select('id,sale_date,medication_id,medication_name,quantity_sold,unit_price,total_price,payment_method')
        .gte('sale_date', since.toISOString())
        .gt('quantity_sold', 0)
        .order('sale_date', { ascending: false })
        .limit(200);
      setReturnJournal(data ?? []);
    } catch { /* silent */ } finally {
      setReturnJournalLoading(false);
    }
  };

  const handleConfirmReturn = async (quantity: number, refundMethod: string, reason: string) => {
    if (!returnSale) return;
    setReturnProcessing(true);
    try {
      const res = await recordReturn({
        medication_id:   returnSale.medication_id,
        medication_name: returnSale.medication_name,
        unit_price:      returnSale.unit_price,
        quantity,
        refund_method:   refundMethod,
        reason,
      });
      if (res.ok) {
        setReturnSale(null);
        setReturnSuccess(`Retour enregistré — ${quantity} × ${returnSale.medication_name} remboursé(s)`);
        // Rafraîchir le stock local
        loadMedications();
        setTimeout(() => setReturnSuccess(null), 4000);
      } else {
        alert('Le retour n\'a pas pu être enregistré.');
      }
    } catch { alert('Erreur lors du retour.'); }
    finally { setReturnProcessing(false); }
  };

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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    for (const pendingSale of salesQueue) {
      try {
        // insertWithUserId est async → pas de .select() chaîné. Requête directe.
        const { data: saleData, error: saleError } = await supabase
          .from('sales')
          .insert([{
            user_id: user.id,
            total_amount: pendingSale.data.total_amount,
            tax_amount: pendingSale.data.tax_amount,
            grand_total: pendingSale.data.grand_total,
            payment_method: normalizeSalesPaymentMethod(pendingSale.data.payment_method),
            customer_name: pendingSale.data.customer_name,
          }])
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

        const isInsuranceSale = pendingSale.data.payment_mode === 'insurance';
        const insRate = pendingSale.data.insurance_rate ?? 0;
        const journalEntries = pendingSale.data.cart.map((item: any) => {
          const stockUpdate = pendingSale.data.stock_updates?.find((u: any) => u.id === item.medication_id);
          const insuranceAmt = isInsuranceSale ? Math.round((item.subtotal || 0) * insRate / 100) : null;
          const patientAmt   = isInsuranceSale ? Math.round((item.subtotal || 0) - (insuranceAmt || 0)) : null;
          return {
            sale_date: pendingSale.data.sale_date,
            medication_id: item.medication_id,
            medication_name: item.medication_name,
            quantity_sold: item.quantity,
            unit_price: item.unit_price,
            total_price: item.subtotal,
            payment_method: pendingSale.data.payment_method,
            stock_after_sale: stockUpdate?.newQty ?? 0,
            seller_name: activeSeller?.name ?? null,
            insurance_name:   isInsuranceSale ? pendingSale.data.insurance_name : null,
            insurance_card:   isInsuranceSale ? pendingSale.data.insurance_card : null,
            insurance_rate:   isInsuranceSale ? insRate : null,
            insurance_amount: insuranceAmt,
            patient_amount:   patientAmt,
            synced: true,
          };
        });

        await insertWithUserId('sales_journal', journalEntries);
        offlineStorage.markJournalSyncedByDate(pendingSale.data.sale_date);

        offlineStorage.removeFromQueue(pendingSale.id);
      } catch (error) {
        console.error('Error syncing sale:', error);
      }
    }

    loadMedications();
  };

  const filteredMedications = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return medications.filter(med => {
      // Filtre recherche texte
      if (q && !med.name.toLowerCase().includes(q) && !med.dosage.toLowerCase().includes(q)) return false;
      // Filtre catégorie active
      if (categoryFilter) {
        const cat = med.name_rayon || med.category || detectCategory(med.name);
        if (cat !== categoryFilter) return false;
      }
      return true;
    });
  }, [medications, searchTerm, categoryFilter]);

  // ── Catégories disponibles dans l'inventaire (avec compteurs) ──────────────
  const availableCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    medications.forEach(m => {
      if (m.quantity <= 0) return; // exclure ruptures
      const cat = m.name_rayon || m.category || detectCategory(m.name);
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8); // top 8 catégories pour grille 4x2
  }, [medications]);

  const addToCart = async (medication: Medication) => {
    // Substances contrôlées : collecter les infos avant d'ajouter
    if (isControlled(medication) && !cart.find(i => i.medication.id === medication.id)) {
      const data = await askStupefiantInfo(medication);
      if (!data) return; // annulé
      // Enregistrer immédiatement dans le registre
      offlineStorage.addStupefiantEntry({
        date: new Date().toISOString(),
        medication_id: medication.id,
        medication_name: `${medication.name} ${medication.dosage}`,
        quantity: 1,
        unit_price: medication.price || 0,
        patient_name: data.patient_name,
        doctor_name: data.doctor_name,
        ordonnance_number: data.ordonnance_number,
        notes: data.notes,
      });
    }

    // ── Détection produit JP-tracké ──────────────────────────────────────────────
    // Si le produit a des unités JP disponibles → ouvrir le prompt de scan.
    // Le pharmacien doit scanner la boîte physique pour garantir la traçabilité.
    // Hors-ligne ou aucune unité JP → débit global classique.
    if (offlineStorage.isOnline()) {
      try {
        const { data: availableUnits, error } = await supabase
          .from('inventory_units')
          .select('id', { count: 'exact', head: false })
          .eq('medication_id', medication.id)
          .eq('status', 'available')
          .limit(1);

        if (!error && availableUnits && availableUnits.length > 0) {
          // Produit JP-tracké → demander le scan de la boîte
          const { count } = await supabase
            .from('inventory_units')
            .select('*', { count: 'exact', head: true })
            .eq('medication_id', medication.id)
            .eq('status', 'available');

          setPendingJpScan({ medication, jpInput: '', availableCount: count ?? 0 });
          setTimeout(() => jpInputRef.current?.focus(), 80);
          return; // ne pas ajouter au panier — attendre le scan
        }
      } catch {
        // Hors-ligne ou erreur → débit global classique
      }
    }

    // ── Débit global classique (pas de JP ou hors-ligne) ─────────────────────────
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

  // ── Validation du code JP scanné / saisi manuellement ────────────────────────
  const handleJpEntry = async (rawCode: string) => {
    if (!pendingJpScan) return;
    const code = rawCode.trim().toUpperCase();
    if (!code) return;

    // Normaliser : accepter "000003" ou "JP-000003"
    const jpCode = code.startsWith('JP-') ? code : `JP-${code}`;

    const { data: unitRows, error } = await supabase
      .from('inventory_units')
      .select('id, unit_code, batch_number, expiry_date, medication_id, status')
      .eq('unit_code', jpCode)
      .limit(1);

    if (error || !unitRows || unitRows.length === 0) {
      setScanFeedback({ msg: `Code JP introuvable : ${jpCode}`, ok: false });
      setTimeout(() => setScanFeedback(null), 3000);
      setPendingJpScan(prev => prev ? { ...prev, jpInput: '' } : null);
      setTimeout(() => jpInputRef.current?.focus(), 50);
      return;
    }

    const unit = unitRows[0];

    if (unit.medication_id !== pendingJpScan.medication.id) {
      setScanFeedback({ msg: `Ce code JP appartient à un autre produit`, ok: false });
      setTimeout(() => setScanFeedback(null), 3000);
      setPendingJpScan(prev => prev ? { ...prev, jpInput: '' } : null);
      setTimeout(() => jpInputRef.current?.focus(), 50);
      return;
    }

    if (unit.status !== 'available') {
      setScanFeedback({ msg: `Boîte déjà vendue ou indisponible`, ok: false });
      setTimeout(() => setScanFeedback(null), 3000);
      setPendingJpScan(prev => prev ? { ...prev, jpInput: '' } : null);
      setTimeout(() => jpInputRef.current?.focus(), 50);
      return;
    }

    // Vérifier que ce code n'est pas déjà dans le panier
    const alreadyInCart = cart
      .flatMap(i => i.units || [])
      .some(u => u.id === unit.id);
    if (alreadyInCart) {
      setScanFeedback({ msg: `Cette boîte est déjà dans le panier`, ok: false });
      setTimeout(() => setScanFeedback(null), 3000);
      setPendingJpScan(prev => prev ? { ...prev, jpInput: '' } : null);
      setTimeout(() => jpInputRef.current?.focus(), 50);
      return;
    }

    const scannedUnit = { id: unit.id, unit_code: unit.unit_code, batch_number: unit.batch_number, expiry_date: unit.expiry_date };
    const med = pendingJpScan.medication;

    const existing = cart.find(item => item.medication.id === med.id);
    if (existing) {
      setCart(cart.map(item =>
        item.medication.id === med.id
          ? { ...item, quantity: item.quantity + 1, units: [...(item.units || []), scannedUnit] }
          : item
      ));
    } else {
      setCart([...cart, { medication: med, quantity: 1, units: [scannedUnit] }]);
    }

    setScanFeedback({ msg: `✓ ${unit.unit_code} ajouté`, ok: true });
    setTimeout(() => setScanFeedback(null), 2000);
    setPendingJpScan(null);
  };

  const removeFromCart = (medicationId: string) => {
    setCart(cart.filter(item => item.medication.id !== medicationId));
  };

  const updateQuantity = (medicationId: string, quantity: number) => {
    const item = cart.find(i => i.medication.id === medicationId);
    if (!item) return;

    // ── Produit JP-tracké : la quantité = nombre de boîtes scannées ──────────
    // Le + doit ouvrir le prompt de scan, pas incrémenter librement.
    // Le - retire la dernière boîte scannée de units[].
    if (item.units && item.units.length > 0) {
      if (quantity > item.quantity) {
        // Incrément : demander le scan d'une nouvelle boîte
        const liveMed = medications.find(m => m.id === medicationId) ?? item.medication;
        setPendingJpScan({ medication: liveMed, jpInput: '', availableCount: 0 });
        // Mettre à jour le count disponible en arrière-plan
        supabase
          .from('inventory_units')
          .select('*', { count: 'exact', head: true })
          .eq('medication_id', medicationId)
          .eq('status', 'available')
          .then(({ count }) => {
            setPendingJpScan(prev => prev ? { ...prev, availableCount: count ?? 0 } : null);
          });
        setTimeout(() => jpInputRef.current?.focus(), 80);
        return;
      } else if (quantity < item.quantity && quantity >= 0) {
        // Décrément : retirer la dernière unité scannée
        const newUnits = item.units.slice(0, quantity);
        if (quantity === 0) {
          setCart(cart.filter(i => i.medication.id !== medicationId));
        } else {
          setCart(cart.map(i =>
            i.medication.id === medicationId ? { ...i, quantity, units: newUnits } : i
          ));
        }
        return;
      }
      return;
    }

    // ── Produit global (pas de JP) : incrément libre ─────────────────────────
    const liveMed = medications.find(m => m.id === medicationId);
    const maxQty  = liveMed?.quantity ?? item.medication.quantity ?? 0;
    if (quantity > 0 && quantity <= maxQty) {
      setCart(cart.map(i =>
        i.medication.id === medicationId ? { ...i, quantity } : i
      ));
    } else if (quantity > maxQty) {
      setScanFeedback({ msg: `Stock max disponible : ${maxQty} unité(s)`, ok: false });
      setTimeout(() => setScanFeedback(null), 2500);
    }
  };

  const calculateTotal = () => {
    const subtotal = cart.reduce((sum, item) => {
      const price = item.medication.price || 0;
      return sum + (price * item.quantity);
    }, 0);
    const tax = subtotal * taxRate;
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const processSale = async () => {
    if (cart.length === 0) {
      alert('Le panier est vide');
      return;
    }

    if (paymentMode === 'credit' && !creditClientName.trim()) {
      alert('Le nom du client est obligatoire pour un crédit');
      return;
    }

    if (paymentMode === 'insurance' && !insuranceOrg.trim()) {
      alert('Veuillez sélectionner un organisme assureur');
      return;
    }

    if (mixedMode && paymentMode !== 'credit') {
      const a1 = parseFloat(mixedAmount1 || '0');
      const a2 = parseFloat(mixedAmount2 || '0');
      const { total: tot } = calculateTotal();
      if (isNaN(a1) || isNaN(a2) || a1 <= 0 || a2 <= 0) {
        alert('Veuillez saisir les deux montants du paiement partagé');
        return;
      }
      if (Math.abs(a1 + a2 - tot) > 1) {
        alert(`Le total des paiements (${(a1+a2).toFixed(0)} FCFA) ne correspond pas au total de la vente (${tot.toFixed(0)} FCFA)`);
        return;
      }
    }

    // Validation montant remis en espèces
    if (paymentMode === 'direct' && paymentMethod === 'Espèces' && !mixedMode) {
      const given = parseFloat(cashGiven);
      if (cashGiven.trim() !== '' && !isNaN(given)) {
        const { total } = calculateTotal();
        if (given < total) {
          alert(`Montant insuffisant !\n• Total à payer : ${Math.round(total).toLocaleString('fr-FR')} FCFA\n• Montant remis : ${Math.round(given).toLocaleString('fr-FR')} FCFA\n• Manque : ${Math.round(total - given).toLocaleString('fr-FR')} FCFA`);
          return;
        }
      }
    }

    // ── Validation finale du stock (en temps réel) ────────────────────────────
    for (const item of cart) {
      const liveMed = medications.find(m => m.id === item.medication.id);
      const available = liveMed?.quantity ?? item.medication.quantity;
      if (item.quantity > available) {
        alert(`Stock insuffisant pour "${item.medication.name}"\n• Dans le panier : ${item.quantity}\n• Disponible : ${available}`);
        return;
      }
    }

    setIsProcessing(true);
    const alerts: LowStockAlert[] = [];
    const saleDate = new Date().toISOString();
    const { subtotal, tax, total } = calculateTotal();
    const effectivePaymentMethod = paymentMode === 'credit'
      ? 'Crédit'
      : paymentMode === 'insurance'
        ? `Assurance ${insuranceOrg}`
        : mixedMode
          ? `${mixedMethod1} + ${mixedMethod2}`
          : paymentMethod;

    // ── Mise à jour stock (commune direct + crédit) ───────────────────────────
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
      if (update) return { ...med, quantity: update.newQty };
      return med;
    });
    offlineStorage.cacheMedications(updatedMeds);

    // ── Journal des ventes (pour le reporting Activité/Dashboard) ─────────────
    if (mixedMode && paymentMode !== 'credit') {
      // Paiement mixte : 2 entrées journal (proportionnelles aux montants)
      const a1 = parseFloat(mixedAmount1 || '0');
      const a2 = parseFloat(mixedAmount2 || '0');
      const mixedTotal = a1 + a2;
      for (const item of cart) {
        const stockAfter = Math.max(0, item.medication.quantity - item.quantity);
        const itemTotal = (item.medication.price || 0) * item.quantity;
        offlineStorage.addToSalesJournal({
          sale_date: saleDate,
          medication_id: item.medication.id,
          medication_name: `${item.medication.name} ${item.medication.dosage}`,
          quantity_sold: item.quantity,
          unit_price: item.medication.price || 0,
          total_price: itemTotal * (a1 / mixedTotal),
          payment_method: mixedMethod1,
          stock_after_sale: stockAfter,
          synced: false,
        });
        offlineStorage.addToSalesJournal({
          sale_date: saleDate,
          medication_id: item.medication.id,
          medication_name: `${item.medication.name} ${item.medication.dosage}`,
          quantity_sold: 0, // déjà compté dans la 1ère entrée
          unit_price: item.medication.price || 0,
          total_price: itemTotal * (a2 / mixedTotal),
          payment_method: mixedMethod2,
          stock_after_sale: stockAfter,
          synced: false,
        });
      }
    } else {
      for (const item of cart) {
        const stockAfter = Math.max(0, item.medication.quantity - item.quantity);
        const itemTotal  = (item.medication.price || 0) * item.quantity;
        offlineStorage.addToSalesJournal({
          sale_date: saleDate,
          medication_id: item.medication.id,
          medication_name: `${item.medication.name} ${item.medication.dosage}`,
          quantity_sold: item.quantity,
          unit_price: item.medication.price || 0,
          total_price: itemTotal,
          payment_method: effectivePaymentMethod,
          stock_after_sale: stockAfter,
          synced: false,
          ...(paymentMode === 'insurance' && {
            insurance_name:   insuranceOrg,
            insurance_card:   insuranceCard || null,
            insurance_rate:   insuranceRate,
            insurance_amount: Math.round(itemTotal * insuranceRate / 100),
            patient_amount:   Math.round(itemTotal * (1 - insuranceRate / 100)),
          }),
        } as any);
      }
    }

    if (paymentMode === 'credit') {
      // ── Crédit : enregistrement dans credits + mise à jour stock en file ────
      await offlineSafeInsertCredit({
        client_name: creditClientName.trim(),
        client_phone: creditClientPhone.trim() || undefined,
        due_date: creditDueDate || null,
        total_amount: total,
        items: cart.map(item => ({
          medication_id: item.medication.id,
          medication_name: `${item.medication.name} ${item.medication.dosage}`,
          quantity: item.quantity,
          unit_price: item.medication.price || 0,
          subtotal: (item.medication.price || 0) * item.quantity,
        })),
        notes: customerName || undefined,
      });

      // Stock sync offline (les mêmes que la vente directe)
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
          payment_method: 'Crédit',
          customer_name: creditClientName.trim(),
          sale_date: saleDate,
        },
      });
    } else {
      // ── Vente directe / assurance ────────────────────────────────────────────
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
          payment_method: effectivePaymentMethod,
          customer_name: customerName || selectedPatientName || null,
          sale_date: saleDate,
          // ── Métadonnées assurance (pour sales_journal Supabase) ──────────────
          payment_mode: paymentMode,
          ...(paymentMode === 'insurance' && {
            insurance_name: insuranceOrg,
            insurance_card: insuranceCard || null,
            insurance_rate: insuranceRate,
          }),
        },
      });
    }

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

    // ── Débit unitaire : marquer comme vendues les unités JP scannées ─────────
    // Déclenché si AU MOINS UN article du panier a des unités trackées (JP-XXXXX).
    // Indépendant du mode Global/Unitaire — c'est la présence de `units[]` qui décide.
    const unitIds = cart.flatMap(item => (item.units || []).map(u => u.id));
    if (unitIds.length > 0) {
      if (!offlineStorage.isOnline()) {
        // Hors-ligne : mettre en file de synchro
        offlineStorage.addToQueue({
          type: 'update',
          table: 'inventory_units',
          data: { ids: unitIds, status: 'sold' },
        });
        setScanFeedback({ msg: '⚠️ Hors-ligne — boîtes JP marquées sold à la reconnexion', ok: false });
        setTimeout(() => setScanFeedback(null), 4000);
      } else {
        try {
          const { error: unitError } = await supabase
            .from('inventory_units')
            .update({ status: 'sold' })
            .in('id', unitIds);
          if (unitError) throw unitError;
        } catch (err) {
          console.error('Erreur mise à jour inventory_units:', err);
          // Bloquer la vente ? Non — le stock est déjà décrémenté.
          // On informe le pharmacien et on met en file de synchro.
          offlineStorage.addToQueue({
            type: 'update',
            table: 'inventory_units',
            data: { ids: unitIds, status: 'sold' },
          });
          setScanFeedback({ msg: '⚠️ Erreur réseau — boîtes JP seront synchronisées automatiquement', ok: false });
          setTimeout(() => setScanFeedback(null), 5000);
        }
      }
    }

    if (alerts.length > 0) setLowStockAlerts(alerts);

    setLastSale({
      sale_date: saleDate,
      total_amount: subtotal,
      tax_amount: tax,
      grand_total: total,
      payment_method: effectivePaymentMethod,
      client_name: paymentMode === 'credit' ? creditClientName.trim() : (customerName || selectedPatientName || null),
      is_credit: paymentMode === 'credit',
      is_insurance: paymentMode === 'insurance',
      insurance_org: paymentMode === 'insurance' ? insuranceOrg : null,
      insurance_card: paymentMode === 'insurance' ? insuranceCard : null,
      insurance_rate: paymentMode === 'insurance' ? insuranceRate : null,
      insurance_amount: paymentMode === 'insurance' ? insuranceAmount : null,
      patient_amount_insurance: paymentMode === 'insurance' ? patientAmount : null,
      insurance_residual_method: paymentMode === 'insurance' && patientAmount > 0 ? insuranceResidualMethod : null,
      patient_name: selectedPatientName || null,
      items: cart.map(item => ({
        medication_name: `${item.medication.name} ${item.medication.dosage}`,
        quantity: item.quantity,
        subtotal: (item.medication.price || 0) * item.quantity,
      })),
    });

    // ── Auto-create patient_purchase in CRM ────────────────────────────────────
    if (selectedPatientId) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('patient_purchases').insert({
            patient_id:     selectedPatientId,
            user_id:        user.id,
            date:           saleDate.split('T')[0],
            ticket:         `VNT-${String(Date.now()).slice(-6)}`,
            items:          cart.map(i => `${i.medication.name} ${i.medication.dosage} × ${i.quantity}`),
            total,
            payment_method: effectivePaymentMethod,
          });
        }
      } catch { /* non-bloquant — historique patient */ }
    }

    setShowReceipt(true);
    window.dispatchEvent(new CustomEvent('sale-completed'));
    setCart([]);
    setCustomerName('');
    setSearchTerm('');
    // Reset crédit
    setPaymentMode('direct');
    setCreditClientName('');
    setCreditClientPhone('');
    setCreditDueDate('');
    // Reset mixte
    setMixedMode(false);
    setMixedAmount1('');
    setMixedAmount2('');
    // Reset patient CRM
    setSelectedPatientId(null);
    setSelectedPatientName('');
    setPatSearch('');
    // Reset assurance
    setInsuranceOrg('');
    setInsuranceCard('');
    setInsuranceRate(80);
    setInsuranceResidualMethod('Espèces');
    setShowAddOrgForm(false);
    setNewOrgName('');
    setNewOrgRate('80');

    setMedications(updatedMeds.filter(m => m.quantity > 0));

    if (offlineStorage.isOnline() && paymentMode !== 'credit') {
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

      // insertWithUserId est async → on ne peut PAS chaîner .select() dessus.
      // On récupère l'userId puis on construit la requête directement.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert([{
          user_id: user.id,
          total_amount: subtotal,
          tax_amount: tax,
          grand_total: total,
          payment_method: normalizeSalesPaymentMethod(pendingSale.data.payment_method),
          customer_name: pendingSale.data.customer_name,
        }])
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

      // ── Tracer chaque ligne vendue dans stock_movements ─────────────────────
      const movementRows = pendingSale.data.cart
        .filter((item: any) => item.quantity > 0)
        .map((item: any) => {
          const qtyBefore = (stockUpdates.find(u => u.id === item.medication_id)?.newQty ?? 0) + item.quantity;
          const qtyAfter  = stockUpdates.find(u => u.id === item.medication_id)?.newQty ?? 0;
          return {
            medication_id:   item.medication_id,
            medication_name: item.medication_name,
            dosage:          null,
            movement_type:   'vente',
            quantity_before: qtyBefore,
            quantity_change: -item.quantity,
            quantity_after:  qtyAfter,
            reference:       saleData.id,
            supplier:        null,
            unit_cost:       item.unit_price,
            notes:           null,
            seller_id:       activeSeller?.id ?? null,
            seller_name:     activeSeller?.name ?? null,
          };
        });
      if (movementRows.length) {
        await insertWithUserId('stock_movements', movementRows);
      }

      const isInsuranceSale = pendingSale.data.payment_mode === 'insurance';
      const insRate = pendingSale.data.insurance_rate ?? 0;
      const journalEntries = pendingSale.data.cart.map((item: any) => {
        const stockUpdate = stockUpdates.find(u => u.id === item.medication_id);
        const insuranceAmt = isInsuranceSale ? Math.round((item.subtotal || 0) * insRate / 100) : null;
        const patientAmt   = isInsuranceSale ? Math.round((item.subtotal || 0) - (insuranceAmt || 0)) : null;
        return {
          sale_date: saleDate,
          medication_id: item.medication_id,
          medication_name: item.medication_name,
          quantity_sold: item.quantity,
          unit_price: item.unit_price,
          total_price: item.subtotal,
          payment_method: pendingSale.data.payment_method,
          stock_after_sale: stockUpdate?.newQty ?? 0,
          seller_name: activeSeller?.name ?? null,
          // ── Champs assurance (pour rapports & bordereaux) ───────────────────
          insurance_name:   isInsuranceSale ? pendingSale.data.insurance_name : null,
          insurance_card:   isInsuranceSale ? pendingSale.data.insurance_card : null,
          insurance_rate:   isInsuranceSale ? insRate : null,
          insurance_amount: insuranceAmt,
          patient_amount:   patientAmt,
          synced: true,
        };
      });

      await insertWithUserId('sales_journal', journalEntries);

      // Marquer les entrées locales de cette vente comme synchronisées pour
      // éviter un double envoi par syncOfflineJournal (toutes les 30s).
      offlineStorage.markJournalSyncedByDate(saleDate);

      offlineStorage.removeFromQueue(pendingSale.id);
    } catch (error) {
      console.error('Cloud sync error:', error);
    }
  };

  const printReceipt = () => {
    if (!lastSale) return;
    const settings = loadSettings();
    printThermalReceipt({
      sale_date:        lastSale.sale_date,
      total_amount:     lastSale.total_amount,
      tax_amount:       lastSale.tax_amount,
      grand_total:      lastSale.grand_total,
      payment_method:   lastSale.payment_method,
      client_name:      lastSale.client_name,
      is_credit:        lastSale.is_credit,
      is_insurance:     lastSale.is_insurance,
      insurance_org:    lastSale.insurance_org,
      insurance_card:   lastSale.insurance_card,
      insurance_rate:   lastSale.insurance_rate,
      insurance_amount: lastSale.insurance_amount,
      patient_amount:   lastSale.patient_amount_insurance,
      items:            lastSale.items,
      pharmacy_name:    settings.pharmacy_name || 'JunglePharm',
      pharmacy_address: settings.pharmacy_address || '',
      pharmacy_phone:   settings.pharmacy_phone   || '',
    });
  };

  // ── Stats du vendeur connecté (aujourd'hui) ──────────────────────────────────
  const sellerStats = useMemo(() => {
    if (!isDesktop) return null;
    const today = new Date().toISOString().split('T')[0];
    const entries = offlineStorage.getSalesJournal().filter(e => {
      if (e.sale_date.split('T')[0] !== today) return false;
      if (e.is_return) return false;
      // Si un vendeur est actif, filtrer sur son nom
      if (activeSeller && e.seller_name && e.seller_name !== activeSeller.name) return false;
      return true;
    });
    const revenue = entries.reduce((s, e) => s + e.total_price, 0);
    const tickets = new Set(entries.map(e => e.id.split('-')[0])).size || entries.length;
    const units   = entries.reduce((s, e) => s + e.quantity_sold, 0);
    const avg     = tickets > 0 ? Math.round(revenue / tickets) : 0;
    return { revenue, tickets, units, avg, name: activeSeller?.name || 'Caisse' };
  }, [activeSeller, showReceipt, isDesktop]);

  // ── Top produits du mois (accès rapide Caisse) ───────────────────────────────
  // Recalculé quand medications change (rechargement) ou après une vente (showReceipt → false)
  const topProducts = useMemo(() => {
    if (!isDesktop) return [];
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString();
    const journal = offlineStorage.getSalesJournal()
      .filter(e => e.sale_date >= sinceStr && !e.is_return);

    const map: Record<string, { medication_id: string; name: string; dosage: string; qty: number; revenue: number }> = {};
    for (const entry of journal) {
      if (!map[entry.medication_id]) {
        map[entry.medication_id] = {
          medication_id: entry.medication_id,
          name: entry.medication_name,
          dosage: '',
          qty: 0,
          revenue: 0,
        };
      }
      map[entry.medication_id].qty      += entry.quantity_sold;
      map[entry.medication_id].revenue  += entry.total_price;
    }

    const medsById = new Map(medications.map(m => [m.id, m]));

    return Object.values(map)
      .filter(p => {
        const med = medsById.get(p.medication_id);
        return med && med.quantity > 0;
      })
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8)
      .map(p => {
        const med = medsById.get(p.medication_id)!;
        return { ...p, dosage: med.dosage || '', price: med.price || 0, stock: med.quantity, med };
      });
  }, [medications, showReceipt, isDesktop]);

  const dismissAlert = (id: string) => {
    setLowStockAlerts(alerts => alerts.filter(a => a.id !== id));
  };

  const dismissAllAlerts = () => {
    setLowStockAlerts([]);
  };

  const { subtotal, tax, total } = calculateTotal();
  const insuranceAmount = paymentMode === 'insurance' ? Math.round(total * insuranceRate / 100) : 0;
  const patientAmount   = paymentMode === 'insurance' ? Math.round(total - insuranceAmount) : 0;

  // ── Retour panel filtered list ─────────────────────────────────────────────
  const returnFiltered = useMemo(() => {
    const q = returnSearch.toLowerCase();
    return returnJournal.filter(r =>
      !q || r.medication_name.toLowerCase().includes(q)
    ).slice(0, 40);
  }, [returnJournal, returnSearch]);

  // ── Contenu partagé : modaux ─────────────────────────────────────────────────
  const GlobalModals = (
    <>
      {showFondModal && (
        <FondDeCaisseModal
          onConfirm={() => { setShowFondModal(false); setFondDuJour(offlineStorage.getFondDeCaisse()); }}
          onSkip={() => { setShowFondModal(false); setFondDuJour(offlineStorage.getFondDeCaisse()); }}
        />
      )}
      <ZReportModal
        isOpen={showZReport}
        onClose={() => setShowZReport(false)}
        entries={todayEntries}
        medications={medications}
        date={new Date()}
        onConfirmClosure={closeDailyReport}
      />
      {stupefiantPending && (
        <StupefiantModal
          medicationName={`${stupefiantPending.medication.name} ${stupefiantPending.medication.dosage}`}
          onConfirm={(data) => { stupefiantPending.resolve(data); setStupefiantPending(null); }}
          onCancel={() => { stupefiantPending.resolve(null); setStupefiantPending(null); }}
        />
      )}
      {/* ── Panneau Retour / Avoir ──────────────────────────────────────────── */}
      {showReturnPanel && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10,14,20,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowReturnPanel(false); }}
        >
          <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Undo2 size={16} color="#ea580c" strokeWidth={1.8} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0a0e14', letterSpacing: '-0.02em' }}>Retour / Avoir</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>Sélectionnez la vente à annuler</div>
                </div>
              </div>
              <button onClick={() => setShowReturnPanel(false)} style={{ width: 30, height: 30, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} color="#6b7280" />
              </button>
            </div>

            {/* Feedback succès */}
            {returnSuccess && (
              <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: 'rgba(5,150,105,0.07)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#059669' }}>
                ✓ {returnSuccess}
              </div>
            )}

            {/* Recherche */}
            <div style={{ padding: '12px 16px 8px', position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                value={returnSearch}
                onChange={e => setReturnSearch(e.target.value)}
                placeholder="Rechercher un produit vendu…"
                style={{ width: '100%', padding: '9px 10px 9px 34px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: 13, color: '#0a0e14', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Liste */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
              {returnJournalLoading ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>Chargement…</div>
              ) : returnFiltered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>Aucune vente trouvée sur les 30 derniers jours</div>
              ) : returnFiltered.map((row: any) => (
                <div
                  key={row.id}
                  onClick={() => {
                    setReturnSale({ medication_id: row.medication_id, medication_name: row.medication_name, unit_price: row.unit_price, quantity_sold: row.quantity_sold, payment_method: row.payment_method });
                    setShowReturnPanel(false);
                  }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 12px', borderRadius: 10, marginBottom: 6, background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.12s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fff7ed'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(234,88,12,0.3)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0a0e14', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.medication_name}</div>
                    <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>
                      {new Date(row.sale_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {' · '}{row.quantity_sold} unité(s){' · '}{row.payment_method}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0a0e14' }}>{Math.round(row.total_price).toLocaleString()} F</div>
                    <div style={{ fontSize: 11, color: '#ea580c', fontWeight: 600, marginTop: 2 }}>Retourner →</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ReturnModal — affiché quand une vente est sélectionnée */}
      {returnSale && (
        <ReturnModal
          sale={returnSale}
          onConfirm={handleConfirmReturn}
          onCancel={() => setReturnSale(null)}
          processing={returnProcessing}
        />
      )}

      {/* Scanner desktop */}
      {showScanner && isDesktop && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowScanner(false); setDesktopScanInput(''); } }}
        >
          <div style={{ background: '#fff', borderRadius: 20, padding: '28px 28px 24px', width: 360, boxShadow: '0 24px 64px rgba(0,0,0,0.22)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#0a0e14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14M21 5v2M21 17v2M1 5v2M1 17v2"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0a0e14' }}>Scanner un produit</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>Scanner USB / Bluetooth</div>
                </div>
              </div>
              <button onClick={() => { setShowScanner(false); setDesktopScanInput(''); }} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#15803d', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Passez le scanner sur le code-barres — il sera saisi automatiquement
            </div>
            <input
              ref={desktopScanRef}
              type="text"
              value={desktopScanInput}
              onChange={(e) => setDesktopScanInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && desktopScanInput.trim()) handleBarcodeScan(desktopScanInput.trim()); }}
              placeholder="Code-barres…"
              style={{ width: '100%', padding: '12px 16px', fontSize: 18, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.06em', border: '2px solid #e5e7eb', borderRadius: 12, outline: 'none', color: '#0a0e14', background: '#f9fafb', boxSizing: 'border-box' }}
              onFocus={(e) => { e.target.style.borderColor = '#10785a'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; }}
              autoComplete="off" autoCorrect="off" spellCheck={false}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={() => { setShowScanner(false); setDesktopScanInput(''); }} style={{ flex: 1, padding: '11px 0', borderRadius: 12, fontSize: 14, fontWeight: 600, background: '#f3f4f6', border: 'none', color: '#6b7280', cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => { if (desktopScanInput.trim()) handleBarcodeScan(desktopScanInput.trim()); }} disabled={!desktopScanInput.trim()} style={{ flex: 2, padding: '11px 0', borderRadius: 12, fontSize: 14, fontWeight: 700, background: desktopScanInput.trim() ? '#0a0e14' : '#e5e7eb', border: 'none', color: desktopScanInput.trim() ? '#fff' : '#9ca3af', cursor: desktopScanInput.trim() ? 'pointer' : 'default' }}>Valider</button>
            </div>
          </div>
        </div>
      )}
      {/* Scanner mobile */}
      {showScanner && !isDesktop && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
          title="Scanner un médicament"
          subtitle="Pointez la caméra vers le code-barres"
          continuous={false}
        />
      )}
    </>
  );

  // ── Alertes stock faible (partagé) ───────────────────────────────────────────
  const LowStockAlerts = lowStockAlerts.length > 0 ? (
    <div className="space-y-2">
      {lowStockAlerts.map(alert => (
        <div key={alert.id} className="bg-orange-50 border border-orange-300 rounded-xl p-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-orange-800 text-sm">Stock faible — {alert.name}</p>
            <p className="text-xs text-orange-700 mt-0.5">Restant : {alert.stockAfter} (seuil : {alert.minimumStock})</p>
          </div>
          <button onClick={() => dismissAlert(alert.id)} className="p-1 text-orange-600 hover:bg-orange-100 rounded-lg">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-2 mt-1">
        <button
          onClick={() => {
            const date = new Date().toLocaleDateString('fr-FR');
            let msg = `⚠️ *ALERTE STOCK BAS — ${date}*\n\n`;
            lowStockAlerts.forEach((a, i) => {
              msg += `${i + 1}. *${a.name}* — ${a.stockAfter} restant(s) (seuil: ${a.minimumStock})\n`;
            });
            msg += `\n_🌿 JunglePharm_`;
            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
          }}
          className="flex-1 bg-green-50 border border-green-300 rounded-lg py-1.5 text-xs font-semibold text-green-700 flex items-center justify-center gap-1.5"
        >
          📲 WhatsApp
        </button>
        <button onClick={dismissAllAlerts} className="flex-1 text-center text-xs text-orange-600 py-1.5 hover:underline">
          Fermer tout
        </button>
      </div>
    </div>
  ) : null;

  // ── Section paiement (partagé desktop + mobile) ──────────────────────────────
  const METHODS = ['Espèces', 'Carte Bancaire', 'MTN Mobile Money', 'Airtel Money'];
  const a1 = parseFloat(mixedAmount1 || '0') || 0;
  const a2 = parseFloat(mixedAmount2 || '0') || 0;
  const mixedDiff = total - a1 - a2;
  const mixedBalanced = Math.abs(mixedDiff) <= 1;
  const mixedReady = mixedMode && paymentMode !== 'credit' ? mixedBalanced : true;
  const submitDisabled = isProcessing
    || (paymentMode === 'credit' && !creditClientName.trim())
    || (mixedMode && paymentMode !== 'credit' && !mixedReady)
    || (paymentMode === 'insurance' && !insuranceOrg.trim());

  const PatientSelector = (
    <div ref={patRef} style={{ position: 'relative', marginBottom: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        Patient CRM <span style={{ fontWeight: 400, color: '#d1d5db' }}>(optionnel)</span>
      </div>
      <div style={{ position: 'relative' }}>
        <Search style={{ width: 12, height: 12, color: '#9ca3af', position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          value={selectedPatientId ? selectedPatientName : patSearch}
          onChange={e => {
            setPatSearch(e.target.value);
            if (selectedPatientId) { setSelectedPatientId(null); setSelectedPatientName(e.target.value); }
            setShowPatDrop(true);
          }}
          onFocus={() => setShowPatDrop(true)}
          placeholder="Rechercher un patient…"
          style={{
            width: '100%', height: 34, paddingLeft: 30, paddingRight: selectedPatientId ? 30 : 10,
            border: `1.5px solid ${selectedPatientId ? 'rgba(16,120,90,0.4)' : 'rgba(0,0,0,0.1)'}`,
            borderRadius: 9, fontSize: 12.5, outline: 'none', boxSizing: 'border-box',
            background: selectedPatientId ? 'rgba(16,120,90,0.06)' : 'rgba(255,255,255,0.7)',
            fontWeight: selectedPatientId ? 600 : 400, color: '#0a0e14',
          }}
        />
        {selectedPatientId && (
          <button onClick={() => { setSelectedPatientId(null); setSelectedPatientName(''); setPatSearch(''); }}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: '#9ca3af' }}>
            <X style={{ width: 12, height: 12 }} />
          </button>
        )}
      </div>
      {showPatDrop && patSuggestions.length > 0 && !selectedPatientId && (
        <div style={{ position: 'absolute', top: 62, left: 0, right: 0, background: '#fff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, overflow: 'hidden' }}>
          {patSuggestions.map(p => (
            <button key={p.id} onClick={() => { setSelectedPatientId(p.id); setSelectedPatientName(p.name); setPatSearch(''); setShowPatDrop(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(0,0,0,0.05)', cursor: 'pointer' }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg,#10785a,#149a73)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <User style={{ width: 12, height: 12, color: '#fff' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0a0e14' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{p.phone || '—'}</div>
              </div>
              {p.allergies.length > 0 && (
                <span style={{ fontSize: 9.5, color: '#c81e1e', background: 'rgba(200,30,30,0.08)', borderRadius: 4, padding: '1px 5px', fontWeight: 600, whiteSpace: 'nowrap' }}>⚠ Allergies</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const PaymentSection = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Patient CRM */}
      {PatientSelector}
      {/* 4 modes directs */}
      <div style={{ opacity: (paymentMode === 'credit' || paymentMode === 'insurance') ? 0.4 : 1, pointerEvents: (paymentMode === 'credit' || paymentMode === 'insurance') ? 'none' : 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { value: 'Espèces',          icon: <Banknote className="w-5 h-5" />,  label: 'Espèces'   },
            { value: 'Carte Bancaire',   icon: <CreditCard className="w-5 h-5" />, label: 'Carte'     },
            { value: 'MTN Mobile Money', icon: <Smartphone className="w-5 h-5" />, label: 'MTN MM'    },
            { value: 'Airtel Money',     icon: <Smartphone className="w-5 h-5" />, label: 'Airtel'    },
          ].map(({ value, icon, label }) => {
            const active = paymentMode === 'direct' && paymentMethod === value;
            return (
              <button
                key={value}
                onClick={() => { setPaymentMethod(value as any); setPaymentMode('direct'); setMixedMode(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                  borderRadius: 10, border: `2px solid ${active ? '#10785a' : 'rgba(0,0,0,0.08)'}`,
                  background: active ? 'rgba(16,120,90,0.07)' : 'rgba(255,255,255,0.7)',
                  cursor: 'pointer', transition: 'all 0.12s',
                  color: active ? '#10785a' : '#374151',
                }}
              >
                {icon}
                <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Calculatrice monnaie (Espèces uniquement) ──────────────────────── */}
      {paymentMode === 'direct' && paymentMethod === 'Espèces' && !mixedMode && (() => {
        const total     = calculateTotal().total;
        const given     = parseFloat(cashGiven) || 0;
        const change    = given - total;
        const isEnough  = given >= total;
        return (
          <div style={{
            background: 'rgba(16,120,90,0.05)',
            border: '1px solid rgba(16,120,90,0.18)',
            borderRadius: 10, padding: '10px 12px',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#10785a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              💵 Calculatrice monnaie
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'center' }}>
              <div>
                <label style={{ fontSize: 10.5, color: '#6b7280', fontWeight: 600, display: 'block', marginBottom: 3 }}>Remis par le client</label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  placeholder={`min. ${Math.round(total).toLocaleString('fr-FR')} F`}
                  value={cashGiven}
                  onChange={e => setCashGiven(e.target.value)}
                  style={{
                    width: '100%', height: 36, padding: '0 8px',
                    border: `1.5px solid ${isEnough || !cashGiven ? 'rgba(16,120,90,0.25)' : '#dc2626'}`,
                    borderRadius: 8, fontSize: 14, fontWeight: 700,
                    background: '#fff', outline: 'none', textAlign: 'right',
                    color: '#0a0e14', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10.5, color: '#6b7280', fontWeight: 600, marginBottom: 3 }}>
                  {change >= 0 ? 'Monnaie à rendre' : 'Manque'}
                </div>
                <div style={{
                  fontSize: 20, fontWeight: 800,
                  color: !cashGiven ? '#9ca3af' : change >= 0 ? '#10785a' : '#dc2626',
                  fontFamily: '"SF Mono", monospace',
                }}>
                  {!cashGiven ? '—' : `${Math.abs(Math.round(change)).toLocaleString('fr-FR')} F`}
                </div>
              </div>
            </div>
            {/* Raccourcis montants ronds */}
            {total > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {[...new Set([
                  Math.ceil(total / 1000) * 1000,
                  Math.ceil(total / 2000) * 2000,
                  Math.ceil(total / 5000) * 5000,
                  Math.ceil(total / 10000) * 10000,
                ]).values()].slice(0, 4).map(amount => (
                  <button
                    key={amount}
                    onClick={() => setCashGiven(String(amount))}
                    style={{
                      padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                      border: `1px solid ${cashGiven === String(amount) ? '#10785a' : 'rgba(16,120,90,0.25)'}`,
                      background: cashGiven === String(amount) ? 'rgba(16,120,90,0.10)' : 'rgba(16,120,90,0.04)',
                      color: '#10785a', cursor: 'pointer',
                    }}
                  >
                    {amount.toLocaleString('fr-FR')} F
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Séparateur */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.07)' }} />
        <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>ou</span>
        <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.07)' }} />
      </div>

      {/* Paiement mixte + Assurance + Crédit */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <button
          onClick={() => { setMixedMode(m => !m); if (paymentMode === 'credit' || paymentMode === 'insurance') setPaymentMode('direct'); }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '9px 8px', borderRadius: 10, border: `2px solid ${mixedMode ? '#2563eb' : 'rgba(37,99,235,0.2)'}`,
            background: mixedMode ? 'rgba(37,99,235,0.07)' : 'rgba(255,255,255,0.7)',
            cursor: 'pointer', transition: 'all 0.12s', color: mixedMode ? '#1d4ed8' : '#2563eb',
          }}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span style={{ fontSize: 11, fontWeight: 600 }}>Mixte</span>
        </button>
        <button
          onClick={() => { setPaymentMode(paymentMode === 'insurance' ? 'direct' : 'insurance'); setMixedMode(false); }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '9px 8px', borderRadius: 10, border: `2px solid ${paymentMode === 'insurance' ? '#4f46e5' : 'rgba(79,70,229,0.22)'}`,
            background: paymentMode === 'insurance' ? 'rgba(79,70,229,0.07)' : 'rgba(255,255,255,0.7)',
            cursor: 'pointer', transition: 'all 0.12s', color: paymentMode === 'insurance' ? '#3730a3' : '#4f46e5',
          }}
        >
          <Shield className="w-3.5 h-3.5" />
          <span style={{ fontSize: 11, fontWeight: 600 }}>Assurance</span>
        </button>
        <button
          onClick={() => { setPaymentMode(paymentMode === 'credit' ? 'direct' : 'credit'); setMixedMode(false); }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '9px 8px', borderRadius: 10, border: `2px solid ${paymentMode === 'credit' ? '#d97706' : 'rgba(217,119,6,0.25)'}`,
            background: paymentMode === 'credit' ? 'rgba(217,119,6,0.07)' : 'rgba(255,255,255,0.7)',
            cursor: 'pointer', transition: 'all 0.12s', color: paymentMode === 'credit' ? '#b45309' : '#d97706',
          }}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span style={{ fontSize: 11, fontWeight: 600 }}>Crédit</span>
        </button>
      </div>

      {/* Formulaire assurance / mutuelle */}
      {paymentMode === 'insurance' && (
        <div style={{ background: 'rgba(79,70,229,0.04)', border: '1px solid rgba(79,70,229,0.18)', borderRadius: 12, padding: '12px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#3730a3', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
            Organisme assureur
          </p>
          {/* Chips organismes */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {insuranceOrgs.map(org => {
              const active = insuranceOrg === org.name;
              return (
                <button
                  key={org.id}
                  onClick={() => { setInsuranceOrg(org.name); setInsuranceRate(org.default_rate); }}
                  style={{
                    padding: '4px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: active ? 700 : 500,
                    border: `1.5px solid ${active ? '#4f46e5' : 'rgba(79,70,229,0.22)'}`,
                    background: active ? 'rgba(79,70,229,0.10)' : 'rgba(255,255,255,0.8)',
                    color: active ? '#3730a3' : '#4f46e5', cursor: 'pointer', transition: 'all 0.1s',
                  }}
                >
                  {org.name}
                  {org.custom && (
                    <span
                      onClick={e => { e.stopPropagation(); removeInsuranceOrg(org.id); if (insuranceOrg === org.name) setInsuranceOrg(''); }}
                      style={{ marginLeft: 5, fontSize: 10, color: '#6b7280', cursor: 'pointer' }}
                    >×</span>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setShowAddOrgForm(s => !s)}
              style={{
                padding: '4px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 600,
                border: '1.5px dashed rgba(79,70,229,0.3)', background: 'transparent',
                color: '#6366f1', cursor: 'pointer',
              }}
            >+ Ajouter</button>
          </div>
          {/* Formulaire ajout organisme inline */}
          {showAddOrgForm && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input
                value={newOrgName} onChange={e => setNewOrgName(e.target.value)}
                placeholder="Nom (ex. SUNU Assurance)"
                style={{ flex: 1, padding: '6px 10px', border: '1px solid rgba(79,70,229,0.3)', borderRadius: 8, fontSize: 12, outline: 'none', background: '#fff' }}
              />
              <div style={{ position: 'relative', width: 68 }}>
                <input
                  type="number" min={0} max={100} value={newOrgRate} onChange={e => setNewOrgRate(e.target.value)}
                  placeholder="80"
                  style={{ width: '100%', padding: '6px 22px 6px 8px', border: '1px solid rgba(79,70,229,0.3)', borderRadius: 8, fontSize: 12, outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                />
                <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#9ca3af', pointerEvents: 'none' }}>%</span>
              </div>
              <button
                onClick={() => {
                  const name = newOrgName.trim();
                  const rate = Math.min(100, Math.max(0, parseFloat(newOrgRate) || 80));
                  if (!name) return;
                  const org = addInsuranceOrg(name, rate);
                  setInsuranceOrg(org.name);
                  setInsuranceRate(org.default_rate);
                  setShowAddOrgForm(false);
                  setNewOrgName('');
                  setNewOrgRate('80');
                }}
                disabled={!newOrgName.trim()}
                style={{ padding: '6px 12px', borderRadius: 8, background: newOrgName.trim() ? '#4f46e5' : '#e5e7eb', color: newOrgName.trim() ? '#fff' : '#9ca3af', border: 'none', fontSize: 12, fontWeight: 600, cursor: newOrgName.trim() ? 'pointer' : 'default' }}
              >OK</button>
            </div>
          )}
          {/* N° carte + taux */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 8 }}>
            <input
              value={insuranceCard} onChange={e => setInsuranceCard(e.target.value)}
              placeholder="N° carte / matricule (optionnel)"
              style={{ padding: '7px 10px', border: '1px solid rgba(79,70,229,0.25)', borderRadius: 8, fontSize: 12, outline: 'none', background: '#fff' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 600, whiteSpace: 'nowrap' }}>Taux :</span>
              <div style={{ position: 'relative', width: 68 }}>
                <input
                  type="number" min={0} max={100} value={insuranceRate}
                  onChange={e => setInsuranceRate(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                  style={{ width: '100%', padding: '7px 22px 7px 8px', border: '1px solid rgba(79,70,229,0.25)', borderRadius: 8, fontSize: 13, fontWeight: 700, outline: 'none', background: '#fff', boxSizing: 'border-box', color: '#3730a3' }}
                />
                <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#9ca3af', pointerEvents: 'none' }}>%</span>
              </div>
            </div>
          </div>
          {/* Répartition */}
          {total > 0 && (
            <div style={{ background: 'rgba(79,70,229,0.07)', borderRadius: 8, padding: '8px 10px', marginBottom: patientAmount > 0 ? 8 : 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: '#4f46e5', fontWeight: 600 }}>Part assurance ({insuranceRate}%)</span>
                <span style={{ fontWeight: 700, color: '#3730a3' }}>{insuranceAmount.toLocaleString('fr-FR')} F</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#6b7280', fontWeight: 600 }}>Part patient</span>
                <span style={{ fontWeight: 700, color: patientAmount > 0 ? '#b45309' : '#059669' }}>{patientAmount.toLocaleString('fr-FR')} F</span>
              </div>
            </div>
          )}
          {/* Méthode de règlement de la part patient */}
          {patientAmount > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 5 }}>Mode de règlement patient :</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {METHODS.map(m => (
                  <button
                    key={m}
                    onClick={() => setInsuranceResidualMethod(m)}
                    style={{
                      padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                      border: `1.5px solid ${insuranceResidualMethod === m ? '#374151' : 'rgba(0,0,0,0.12)'}`,
                      background: insuranceResidualMethod === m ? '#0a0e14' : 'rgba(255,255,255,0.8)',
                      color: insuranceResidualMethod === m ? '#fff' : '#6b7280', cursor: 'pointer',
                    }}
                  >{m}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Formulaire paiement mixte */}
      {mixedMode && paymentMode !== 'credit' && (
        <div style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.15)', borderRadius: 12, padding: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Paiement partagé</span>
            {mixedBalanced
              ? <span style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>✓ Équilibré</span>
              : <span style={{ fontSize: 11, color: '#dc2626' }}>Reste : {Math.abs(mixedDiff).toFixed(0)} F</span>
            }
          </div>
          {[
            { method: mixedMethod1, setMethod: setMixedMethod1, amount: mixedAmount1, setAmount: setMixedAmount1, label: '1' },
            { method: mixedMethod2, setMethod: setMixedMethod2, amount: mixedAmount2, setAmount: setMixedAmount2, label: '2' },
          ].map(({ method, setMethod, amount, setAmount, label }) => (
            <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <select value={method} onChange={e => setMethod(e.target.value)} style={{ flex: 1, padding: '7px 8px', border: '1px solid rgba(37,99,235,0.25)', borderRadius: 8, fontSize: 12, background: '#fff', outline: 'none' }}>
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <div style={{ position: 'relative' }}>
                <input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" style={{ width: 110, padding: '7px 28px 7px 8px', border: '1px solid rgba(37,99,235,0.25)', borderRadius: 8, fontSize: 13, fontWeight: 600, textAlign: 'right', background: '#fff', outline: 'none' }} />
                <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#9ca3af', pointerEvents: 'none' }}>F</span>
              </div>
            </div>
          ))}
          {a1 > 0 && a2 === 0 && (
            <button onClick={() => setMixedAmount2(Math.max(0, total - a1).toFixed(0))} style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Compléter auto : {Math.max(0, total - a1).toFixed(0)} FCFA
            </button>
          )}
        </div>
      )}

      {/* Formulaire crédit */}
      {paymentMode === 'credit' && (
        <div style={{ background: 'rgba(217,119,6,0.05)', border: '1px solid rgba(217,119,6,0.2)', borderRadius: 12, padding: '12px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Informations client</p>
          <input type="text" value={creditClientName} onChange={e => setCreditClientName(e.target.value)} placeholder="Nom complet *" style={{ width: '100%', padding: '8px 10px', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 8, fontSize: 13, background: '#fff', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input type="tel" value={creditClientPhone} onChange={e => setCreditClientPhone(e.target.value)} placeholder="+242 06 …" style={{ padding: '8px 10px', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 8, fontSize: 13, background: '#fff', outline: 'none' }} />
            <input type="date" value={creditDueDate} onChange={e => setCreditDueDate(e.target.value)} min={new Date().toISOString().split('T')[0]} style={{ padding: '8px 10px', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 8, fontSize: 13, background: '#fff', outline: 'none' }} />
          </div>
        </div>
      )}

      {/* Nom client optionnel (vente directe) */}
      {paymentMode === 'direct' && !mixedMode && (
        <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nom du client (optionnel)" style={{ width: '100%', padding: '9px 12px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, fontSize: 13, background: 'rgba(255,255,255,0.7)', outline: 'none', boxSizing: 'border-box' }} />
      )}

      {/* Bouton valider */}
      <button
        onClick={processSale}
        disabled={submitDisabled}
        style={{
          width: '100%', padding: '14px 0', borderRadius: 12, fontSize: 15, fontWeight: 700,
          border: 'none', cursor: submitDisabled ? 'not-allowed' : 'pointer',
          opacity: submitDisabled ? 0.5 : 1, transition: 'all 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          color: '#fff',
          background: paymentMode === 'credit'
            ? '#d97706'
            : paymentMode === 'insurance'
              ? '#4f46e5'
              : mixedMode
                ? '#2563eb'
                : '#10785a',
          boxShadow: submitDisabled ? 'none' : '0 4px 16px rgba(0,0,0,0.15)',
        }}
      >
        {paymentMode === 'credit'
          ? <BookOpen className="w-5 h-5" />
          : paymentMode === 'insurance'
            ? <Shield className="w-5 h-5" />
            : <CreditCard className="w-5 h-5" />
        }
        {isProcessing
          ? 'Traitement…'
          : paymentMode === 'credit'
            ? `Enregistrer crédit — ${total.toLocaleString('fr-FR')} F`
            : paymentMode === 'insurance'
              ? `Assurance ${insuranceOrg || '…'} — ${total.toLocaleString('fr-FR')} F`
              : mixedMode
                ? `Paiement mixte — ${total.toLocaleString('fr-FR')} F`
                : `Encaisser — ${total.toLocaleString('fr-FR')} F`
        }
      </button>
    </div>
  );

  // ── Colonne gauche catalogue (partagée entre vue principale et vue reçu) ─────
  const CatalogColumn = (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Stats du vendeur — masquées si la permission est désactivée ─────── */}
      {sellerStats && getSellerPermissions().showDailyTotal && (
        <div data-tour="sales-stats" style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'CA du jour',    value: sellerStats.revenue === 0 ? '—' : `${Math.round(sellerStats.revenue).toLocaleString('fr-FR')} F`, accent: '#10785a' },
            { label: 'Tickets',       value: String(sellerStats.tickets), accent: '#0a0e14' },
            { label: 'Unités vendues',value: String(sellerStats.units),   accent: '#0a0e14' },
            { label: 'Panier moyen',  value: sellerStats.avg === 0 ? '—' : `${sellerStats.avg.toLocaleString('fr-FR')} F`, accent: '#0651bc' },
          ].map(stat => (
            <div
              key={stat.label}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(255,255,255,0.55)',
                borderRadius: 10, padding: '9px 12px', textAlign: 'center',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: stat.accent, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, fontWeight: 500, letterSpacing: '0.01em' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Barre recherche + scanner */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div data-tour="sales-search" style={{ position: 'relative', flex: 1 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            placeholder="Rechercher un médicament…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '10px 12px 10px 36px', fontSize: 14, border: '1.5px solid rgba(255,255,255,0.55)', borderRadius: 10, background: 'rgba(255,255,255,0.7)', color: '#0a0e14', outline: 'none', boxSizing: 'border-box' }}
            onFocus={e => { e.target.style.borderColor = '#10785a'; }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.55)'; }}
          />
        </div>
        <button
          data-tour="sales-scanner"
          onClick={openDesktopScanner}
          title="Scanner un code-barres (USB/Bluetooth)"
          style={{ padding: '10px 14px', borderRadius: 10, background: '#0a0e14', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14M21 5v2M21 17v2M1 5v2M1 17v2"/></svg>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Scanner</span>
        </button>
        <button
          data-tour="sales-return"
          onClick={() => { setShowReturnPanel(true); loadReturnJournal(); setReturnSearch(''); }}
          title="Retour / Avoir"
          style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(234,88,12,0.1)', color: '#ea580c', border: '1px solid rgba(234,88,12,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
        >
          <Undo2 size={15} strokeWidth={1.8} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>Retour</span>
        </button>
      </div>

      {/* Feedback scan */}
      {scanFeedback && (
        <div style={{ padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, background: scanFeedback.ok ? 'rgba(5,150,105,0.08)' : 'rgba(220,38,38,0.07)', color: scanFeedback.ok ? '#059669' : '#dc2626', border: `1px solid ${scanFeedback.ok ? 'rgba(5,150,105,0.2)' : 'rgba(220,38,38,0.15)'}` }}>
          {scanFeedback.msg}
        </div>
      )}

      {/* Alertes stock faible */}
      {LowStockAlerts}

      {/* ── Accès rapide : top produits du mois ─────────────────────────────── */}
      {topProducts.length >= 3 && !searchTerm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Accès rapide · 30 jours
            </span>
          </div>
          <div
            style={{
              display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4,
              scrollbarWidth: 'none', msOverflowStyle: 'none',
            }}
          >
            {topProducts.map(p => {
              const inCart = cart.find(i => i.medication.id === p.medication_id);
              const isLow = p.stock > 0 && p.stock < (p.med.minimum_stock || 5);
              return (
                <button
                  key={p.medication_id}
                  onClick={() => addToCart(p.med)}
                  style={{
                    flexShrink: 0, minWidth: 140, maxWidth: 200,
                    padding: '10px 12px', borderRadius: 12, textAlign: 'left',
                    background: inCart ? 'rgba(16,120,90,0.09)' : 'rgba(255,255,255,0.82)',
                    border: `1.5px solid ${inCart ? '#10785a' : 'rgba(255,255,255,0.6)'}`,
                    cursor: 'pointer',
                    boxShadow: inCart
                      ? '0 0 0 3px rgba(16,120,90,0.12)'
                      : '0 1px 4px rgba(0,0,0,0.06)',
                    transition: 'all 0.12s',
                    position: 'relative',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'none'; }}
                >
                  {/* Rang badge */}
                  <div style={{
                    position: 'absolute', top: 8, right: 8,
                    fontSize: 9, fontWeight: 800, color: '#f59e0b',
                    background: 'rgba(245,158,11,0.1)', borderRadius: 99,
                    padding: '1px 6px', letterSpacing: '0.03em',
                  }}>
                    ×{p.qty}
                  </div>

                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0a0e14', paddingRight: 28, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1, marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.dosage || '—'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99,
                      background: isLow ? 'rgba(245,158,11,0.1)' : 'rgba(5,150,105,0.09)',
                      color: isLow ? '#b45309' : '#059669',
                    }}>
                      {p.stock}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0a0e14' }}>
                      {p.price.toLocaleString('fr-FR')} F
                    </span>
                  </div>
                  {inCart && (
                    <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: '#10785a', textAlign: 'center', background: 'rgba(16,120,90,0.09)', borderRadius: 6, padding: '2px 0' }}>
                      × {inCart.quantity} dans le panier
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {/* Séparateur */}
          <div style={{ height: 1, background: 'rgba(0,0,0,0.05)', margin: '2px 0' }} />
        </div>
      )}

      {/* ── PARCOURIR PAR CATÉGORIE — visible quand pas de recherche ni filtre ── */}
      {!searchTerm && !categoryFilter && availableCategories.length > 0 && (
        <div data-tour="sales-categories" style={{ marginTop: 4 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#9ca3af',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}>
            Parcourir par catégorie
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
          }}>
            {availableCategories.map(([cat, count]) => {
              const palette = CATEGORY_GRADIENTS[cat] || CATEGORY_GRADIENTS.default;
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  style={{
                    position: 'relative',
                    padding: '14px 16px',
                    paddingRight: 36,
                    borderRadius: 14,
                    border: `1px solid ${palette.border}`,
                    background: palette.bg,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                    fontFamily: 'inherit',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 12px ${palette.shadow}`;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
                  }}
                >
                  <div style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#0a0e14',
                    letterSpacing: '-0.02em',
                    marginBottom: 3,
                    lineHeight: 1.2,
                  }}>
                    {cat}
                  </div>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#6b7280',
                  }}>
                    {count} {count > 1 ? 'références' : 'référence'}
                  </div>
                  {/* Chevron */}
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke={palette.chevron} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Filtre catégorie actif ── */}
      {categoryFilter && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px',
          background: 'rgba(16,120,90,0.08)',
          border: '1px solid rgba(16,120,90,0.18)',
          borderRadius: 10,
          fontSize: 12.5,
        }}>
          <span style={{ color: '#10785a', fontWeight: 600 }}>Catégorie :</span>
          <strong style={{ color: '#0a0e14' }}>{categoryFilter}</strong>
          <span style={{ color: '#9ca3af', marginLeft: 'auto' }}>
            {filteredMedications.length} produit{filteredMedications.length > 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setCategoryFilter(null)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#9ca3af', padding: 2, display: 'flex', alignItems: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Compteur (caché si filtre catégorie actif) */}
      {!categoryFilter && (
        <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>
          {filteredMedications.length} produit{filteredMedications.length > 1 ? 's' : ''}
          {searchTerm && ` pour "${searchTerm}"`}
        </div>
      )}

      {/* Grille produits */}
      {filteredMedications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <p style={{ fontSize: 14, fontWeight: 600 }}>Aucun produit trouvé</p>
          {searchTerm && <p style={{ fontSize: 12, marginTop: 4 }}>Essayez un autre terme</p>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
          {filteredMedications.map(med => {
            const inCart = cart.find(i => i.medication.id === med.id);
            const isOut = med.quantity <= 0;
            const isLow = !isOut && med.quantity < (med.minimum_stock || 5);
            return (
              <button
                key={med.id}
                onClick={() => !isOut && addToCart(med)}
                disabled={isOut}
                style={{
                  padding: '12px', borderRadius: 12, textAlign: 'left',
                  background: inCart ? 'rgba(16,120,90,0.08)' : 'rgba(255,255,255,0.7)',
                  border: `1.5px solid ${inCart ? '#10785a' : 'rgba(255,255,255,0.55)'}`,
                  cursor: isOut ? 'not-allowed' : 'pointer',
                  opacity: isOut ? 0.45 : 1,
                  transition: 'all 0.12s',
                  boxShadow: inCart ? '0 0 0 2px rgba(16,120,90,0.15)' : 'none',
                }}
                onMouseEnter={e => { if (!isOut) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'none'; }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0a0e14', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{med.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{med.dosage || '—'}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: isOut ? 'rgba(220,38,38,0.1)' : isLow ? 'rgba(245,158,11,0.12)' : 'rgba(5,150,105,0.1)', color: isOut ? '#dc2626' : isLow ? '#b45309' : '#059669' }}>
                    {isOut ? 'Rupture' : `${med.quantity}`}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0a0e14' }}>{(med.price || 0).toLocaleString('fr-FR')} F</span>
                </div>
                {inCart && (
                  <div style={{ marginTop: 7, fontSize: 10, fontWeight: 700, color: '#10785a', textAlign: 'center', background: 'rgba(16,120,90,0.1)', borderRadius: 6, padding: '2px 0' }}>
                    × {inCart.quantity} dans le panier
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Vue reçu ─────────────────────────────────────────────────────────────────
  if (showReceipt && lastSale) {
    const receiptCard = (
      <div style={{ background: 'rgba(255,255,255,0.85)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.55)', padding: 28, backdropFilter: 'blur(20px)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          {lastSale.is_credit
            ? <BookOpen style={{ width: 44, height: 44, color: '#d97706', margin: '0 auto 8px' }} />
            : lastSale.is_insurance
              ? <Shield style={{ width: 44, height: 44, color: '#4f46e5', margin: '0 auto 8px' }} />
              : <Receipt style={{ width: 44, height: 44, color: '#10785a', margin: '0 auto 8px' }} />
          }
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0a0e14', margin: 0 }}>
            {lastSale.is_credit ? 'Crédit enregistré' : lastSale.is_insurance ? 'Vente assurance' : 'Vente confirmée'}
          </h2>
          {lastSale.is_credit && lastSale.client_name && (
            <p style={{ fontSize: 13, fontWeight: 600, color: '#b45309', marginTop: 4 }}>Client : {lastSale.client_name}</p>
          )}
          {lastSale.is_insurance && lastSale.insurance_org && (
            <p style={{ fontSize: 13, fontWeight: 600, color: '#4f46e5', marginTop: 4 }}>Organisme : {lastSale.insurance_org}</p>
          )}
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
            {new Date(lastSale.sale_date).toLocaleString('fr-FR')}
          </p>
        </div>

        <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '14px 0', marginBottom: 16 }}>
          {(lastSale.items || []).map((item: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: '#374151' }}>{item.medication_name} × {item.quantity}</span>
              <span style={{ fontWeight: 600, color: '#0a0e14' }}>{Math.round(item.subtotal).toLocaleString('fr-FR')} F</span>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
            <span>Sous-total</span><span>{Math.round(lastSale.total_amount).toLocaleString('fr-FR')} F</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
            <span>TVA (18.9%)</span><span>{Math.round(lastSale.tax_amount).toLocaleString('fr-FR')} F</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 700, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 8 }}>
            <span style={{ color: '#0a0e14' }}>Total</span>
            <span style={{ color: lastSale.is_insurance ? '#4f46e5' : '#10785a' }}>
              {Math.round(lastSale.grand_total).toLocaleString('fr-FR')} F
            </span>
          </div>

          {/* Détail assurance */}
          {lastSale.is_insurance && (
            <div style={{ marginTop: 12, background: 'rgba(79,70,229,0.05)', border: '1px solid rgba(79,70,229,0.15)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Shield style={{ width: 13, height: 13, color: '#4f46e5' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#3730a3', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Prise en charge assurance
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 3 }}>
                <span>Organisme</span>
                <span style={{ fontWeight: 600, color: '#3730a3' }}>{lastSale.insurance_org}</span>
              </div>
              {lastSale.insurance_card && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 3 }}>
                  <span>N° carte</span>
                  <span style={{ fontWeight: 600, color: '#374151', fontFamily: 'monospace', letterSpacing: '0.04em' }}>{lastSale.insurance_card}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 3 }}>
                <span>Taux de couverture</span>
                <span style={{ fontWeight: 700, color: '#4f46e5' }}>{lastSale.insurance_rate}%</span>
              </div>
              <div style={{ borderTop: '1px solid rgba(79,70,229,0.12)', marginTop: 6, paddingTop: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ color: '#4f46e5', fontWeight: 600 }}>Part assurance</span>
                  <span style={{ fontWeight: 700, color: '#3730a3' }}>{Math.round(lastSale.insurance_amount).toLocaleString('fr-FR')} F</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: lastSale.patient_amount_insurance > 0 ? '#b45309' : '#059669', fontWeight: 600 }}>
                    Part patient{lastSale.insurance_residual_method ? ` (${lastSale.insurance_residual_method})` : ''}
                  </span>
                  <span style={{ fontWeight: 700, color: lastSale.patient_amount_insurance > 0 ? '#b45309' : '#059669' }}>
                    {Math.round(lastSale.patient_amount_insurance).toLocaleString('fr-FR')} F
                  </span>
                </div>
              </div>
            </div>
          )}

          <p style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
            {lastSale.payment_method}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setShowReceipt(false)}
            style={{ flex: 1, padding: '13px 0', borderRadius: 12, fontSize: 14, fontWeight: 700, background: '#10785a', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            Nouvelle vente
          </button>
          <button
            onClick={() => {
              const pharmacyName = localStorage.getItem('pharmacy_name') || 'JunglePharm';
              const dateStr = new Date(lastSale.sale_date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
              const itemLines = (lastSale.items || []).map((item: any) =>
                `${item.name} × ${item.quantity} → ${Math.round(item.total_price ?? item.unit_price * item.quantity).toLocaleString('fr-FR')} F`
              ).join('\n');
              const msg = [
                `🧾 *REÇU - ${pharmacyName}*`,
                `📅 ${dateStr}`,
                '',
                itemLines,
                '',
                '──────────────',
                `Sous-total : ${Math.round(lastSale.total_amount).toLocaleString('fr-FR')} F`,
                `TVA : ${Math.round(lastSale.tax_amount).toLocaleString('fr-FR')} F`,
                `*TOTAL : ${Math.round(lastSale.grand_total).toLocaleString('fr-FR')} F*`,
                `Règlement : ${lastSale.payment_method}`,
                '',
                'Merci de votre confiance 🌿',
                `Pharmacie ${pharmacyName}`,
              ].join('\n');
              window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
            }}
            style={{ padding: '13px 14px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: '#25D366', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            title="Partager sur WhatsApp"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </button>
          <button
            onClick={printReceipt}
            style={{ padding: '13px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: 'rgba(255,255,255,0.7)', color: '#374151', border: '1px solid rgba(0,0,0,0.1)', cursor: 'pointer' }}
          >
            Imprimer
          </button>
        </div>
      </div>
    );

    if (isDesktop) {
      return (
        <>
          {GlobalModals}
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            {/* Grille produits — reste visible pour préparer la vente suivante */}
            {CatalogColumn}

            {/* Reçu dans la colonne droite (sticky, même largeur que le panier) */}
            <div style={{
              width: 360, flexShrink: 0,
              position: 'sticky', top: 0,
              maxHeight: 'calc(100vh - 100px)', overflowY: 'auto',
            }}>
              {/* Badge "Vente confirmée" en haut de colonne */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', marginBottom: 12,
                background: lastSale.is_credit ? 'rgba(217,119,6,0.08)' : lastSale.is_insurance ? 'rgba(79,70,229,0.08)' : 'rgba(16,120,90,0.08)',
                border: `1px solid ${lastSale.is_credit ? 'rgba(217,119,6,0.2)' : lastSale.is_insurance ? 'rgba(79,70,229,0.2)' : 'rgba(16,120,90,0.2)'}`,
                borderRadius: 12,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: 99, background: lastSale.is_credit ? '#d97706' : lastSale.is_insurance ? '#4f46e5' : '#10785a', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: lastSale.is_credit ? '#b45309' : lastSale.is_insurance ? '#3730a3' : '#10785a' }}>
                  {lastSale.is_credit ? 'Crédit enregistré' : lastSale.is_insurance ? `Assurance ${lastSale.insurance_org}` : 'Vente confirmée'}
                </span>
                <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
                  {new Date(lastSale.sale_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {receiptCard}
            </div>
          </div>
        </>
      );
    }

    return (
      <div className="pb-20 px-1 pt-6 space-y-6">
        {GlobalModals}
        {LowStockAlerts}
        {receiptCard}
      </div>
    );
  }

  // ── Vue principale desktop : 2 colonnes ──────────────────────────────────────
  if (isDesktop) {
    return (
      <>
        {GlobalModals}
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

          {/* Colonne gauche : catalogue (partagé) */}
          {CatalogColumn}

          {/* ── Colonne droite : panier + paiement (sticky) ──────────────── */}
          <div data-tour="sales-cart" style={{
            width: 360, flexShrink: 0,
            position: 'sticky', top: 0,
            maxHeight: 'calc(100vh - 100px)', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 12,
            scrollbarWidth: 'thin',
          }}>

            {/* ── Widget Fond de caisse ── */}
            <div data-tour="sales-fond" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px',
              background: fondDuJour >= 0 ? 'rgba(16,120,90,0.07)' : 'rgba(234,179,8,0.08)',
              borderRadius: 12,
              border: `1px solid ${fondDuJour >= 0 ? 'rgba(16,120,90,0.2)' : 'rgba(234,179,8,0.3)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Banknote size={15} color={fondDuJour >= 0 ? '#10785a' : '#b45309'} />
                <div>
                  <div style={{ fontSize: 10, color: fondDuJour >= 0 ? '#10785a' : '#b45309', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Fond de caisse
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: fondDuJour >= 0 ? '#0a0e14' : '#b45309', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                    {fondDuJour >= 0
                      ? `${Math.round(fondDuJour).toLocaleString('fr-FR')} FCFA`
                      : 'Non défini'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowFondModal(true)}
                title="Modifier le fond de caisse"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 11, fontWeight: 600,
                  color: fondDuJour >= 0 ? '#10785a' : '#b45309',
                  background: fondDuJour >= 0 ? 'rgba(16,120,90,0.1)' : 'rgba(234,179,8,0.15)',
                  border: `1px solid ${fondDuJour >= 0 ? 'rgba(16,120,90,0.25)' : 'rgba(234,179,8,0.35)'}`,
                  borderRadius: 7, padding: '5px 10px', cursor: 'pointer',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>
                </svg>
                {fondDuJour >= 0 ? 'Modifier' : 'Définir'}
              </button>
            </div>

            {/* Header panier */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(255,255,255,0.7)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.55)', backdropFilter: 'blur(20px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShoppingCart style={{ width: 16, height: 16, color: '#10785a' }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0a0e14' }}>
                  Panier
                </span>
                {cart.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, background: '#10785a', color: '#fff', padding: '1px 7px', borderRadius: 99 }}>
                    {cart.length}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  data-tour="sales-rapportz"
                  onClick={() => setShowZReport(true)}
                  title="Rapport Z — Clôture de journée"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#fff', fontWeight: 700, background: '#10785a', border: '1px solid #0d6349', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', boxShadow: '0 1px 4px rgba(16,120,90,0.3)' }}
                >
                  <ClipboardCheck size={13} strokeWidth={2.5} />
                  Rapport Z
                </button>
                {cart.length > 0 && (
                  <button
                    onClick={() => setCart([])}
                    style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, background: 'rgba(220,38,38,0.07)', border: 'none', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}
                  >
                    Vider
                  </button>
                )}
              </div>
            </div>

            {/* ── Prompt scan JP obligatoire ────────────────────────────── */}
            {pendingJpScan && (
              <div style={{ background: 'rgba(255,255,255,0.95)', borderRadius: 14, border: '2px solid #10785a', padding: '14px 16px', flexShrink: 0, boxShadow: '0 4px 20px rgba(16,120,90,0.15)' }}>
                {/* En-tête */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#10785a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      📱 Scannez la boîte
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0a0e14', marginTop: 2 }}>
                      {pendingJpScan.medication.name}
                      {pendingJpScan.medication.dosage && <span style={{ color: '#6b7280', fontWeight: 400 }}> · {pendingJpScan.medication.dosage}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                      {pendingJpScan.availableCount} boîte{pendingJpScan.availableCount > 1 ? 's' : ''} disponible{pendingJpScan.availableCount > 1 ? 's' : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => setPendingJpScan(null)}
                    style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(0,0,0,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X style={{ width: 12, height: 12, color: '#6b7280' }} />
                  </button>
                </div>
                {/* Input JP */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', pointerEvents: 'none', userSelect: 'none' }}>JP-</span>
                    <input
                      ref={jpInputRef}
                      type="text"
                      value={pendingJpScan.jpInput.replace(/^JP-/i, '')}
                      onChange={e => setPendingJpScan(prev => prev ? { ...prev, jpInput: e.target.value } : null)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleJpEntry(pendingJpScan.jpInput || e.currentTarget.value);
                        if (e.key === 'Escape') setPendingJpScan(null);
                      }}
                      placeholder="000000"
                      style={{ width: '100%', height: 36, paddingLeft: 34, paddingRight: 10, borderRadius: 8, border: '1.5px solid rgba(16,120,90,0.35)', fontSize: 13, fontFamily: 'monospace', fontWeight: 600, outline: 'none', boxSizing: 'border-box', background: 'rgba(16,120,90,0.04)' }}
                      autoFocus
                    />
                  </div>
                  <button
                    onClick={() => handleJpEntry(pendingJpScan.jpInput)}
                    style={{ height: 36, padding: '0 14px', borderRadius: 8, background: '#10785a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
                  >
                    Ajouter
                  </button>
                </div>
                <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 7, lineHeight: 1.4 }}>
                  Scannez le code-barres JP sur la boîte, ou saisissez-le manuellement · ESC pour annuler
                </p>
              </div>
            )}

            {/* Panier vide */}
            {cart.length === 0 && !pendingJpScan ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(255,255,255,0.7)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.55)' }}>
                <ShoppingCart style={{ width: 32, height: 32, color: '#d1d5db', margin: '0 auto 10px' }} />
                <p style={{ fontSize: 13, color: '#9ca3af', fontWeight: 500 }}>Panier vide</p>
                <p style={{ fontSize: 11, color: '#d1d5db', marginTop: 4 }}>Cliquez sur un produit pour l'ajouter</p>
              </div>
            ) : cart.length > 0 ? (
              <>
                {/* Liste articles */}
                <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.55)', overflow: 'hidden', backdropFilter: 'blur(20px)', flexShrink: 0 }}>
                  {cart.map((item, i) => (
                    <div key={item.medication.id} style={{ padding: '11px 14px', borderBottom: i < cart.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>

                      {/* ── En-tête ligne : nom + poubelle ── */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0a0e14', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.medication.name}
                            {item.medication.dosage && <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 11, marginLeft: 5 }}>{item.medication.dosage}</span>}
                          </div>
                          {/* Lot global (sans JP) */}
                          {(!item.units || item.units.length === 0) && item.medication.batch_number && (
                            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>
                              Lot {item.medication.batch_number}
                              {item.medication.expiry_date && ` · exp. ${new Date(item.medication.expiry_date).toLocaleDateString('fr-FR', { month: '2-digit', year: '2-digit' })}`}
                            </div>
                          )}
                        </div>
                        <button onClick={() => removeFromCart(item.medication.id)}
                          style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(220,38,38,0.07)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Trash2 style={{ width: 11, height: 11, color: '#dc2626' }} />
                        </button>
                      </div>

                      {/* ── MODE JP : une ligne par boîte scannée ── */}
                      {item.units && item.units.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
                          {item.units.map((u) => (
                            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,120,90,0.05)', borderRadius: 7, padding: '4px 8px', border: '1px solid rgba(16,120,90,0.12)' }}>
                              <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: '#10785a', flex: 1 }}>{u.unit_code}</span>
                              {u.batch_number && <span style={{ fontSize: 9, color: '#9ca3af' }}>lot {u.batch_number}</span>}
                              {u.expiry_date && <span style={{ fontSize: 9, color: '#9ca3af' }}>exp. {new Date(u.expiry_date).toLocaleDateString('fr-FR', { month: '2-digit', year: '2-digit' })}</span>}
                              {/* × retire cette boîte précise */}
                              <button
                                onClick={() => {
                                  const newUnits = item.units!.filter(x => x.id !== u.id);
                                  if (newUnits.length === 0) {
                                    removeFromCart(item.medication.id);
                                  } else {
                                    setCart(cart.map(ci => ci.medication.id === item.medication.id
                                      ? { ...ci, quantity: newUnits.length, units: newUnits }
                                      : ci
                                    ));
                                  }
                                }}
                                style={{ width: 18, height: 18, borderRadius: 4, background: 'rgba(220,38,38,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                              >
                                <X style={{ width: 9, height: 9, color: '#dc2626' }} />
                              </button>
                            </div>
                          ))}
                          {/* + Ajouter une boîte */}
                          <button
                            onClick={() => updateQuantity(item.medication.id, item.quantity + 1)}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 7, border: '1px dashed rgba(16,120,90,0.3)', background: 'transparent', cursor: 'pointer', fontSize: 10, color: '#10785a', fontWeight: 600 }}
                          >
                            <span style={{ fontSize: 13 }}>📱</span> Scanner une autre boîte
                          </button>
                        </div>
                      ) : (
                        /* ── MODE GLOBAL : contrôles −/+/× classiques ── */
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                          <button onClick={() => updateQuantity(item.medication.id, item.quantity - 1)}
                            style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(0,0,0,0.06)', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}>−</button>
                          <span style={{ width: 28, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#0a0e14' }}>{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.medication.id, item.quantity + 1)}
                            style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(0,0,0,0.06)', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}>+</button>
                        </div>
                      )}

                      {/* Prix */}
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#10785a' }}>
                        {(item.medication.price || 0).toLocaleString('fr-FR')} F × {item.quantity} = {((item.medication.price || 0) * item.quantity).toLocaleString('fr-FR')} F
                      </div>
                    </div>
                  ))}
                </div>

                {/* -- ligne fantôme pour fermer l'ancien flex row -- */}
                {/* Totaux */}
                <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.55)', padding: '14px 16px', backdropFilter: 'blur(20px)', flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 5 }}>
                    <span>Sous-total</span><span>{Math.round(subtotal).toLocaleString('fr-FR')} F</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                    <span>TVA ({(taxRate * 100).toFixed(1).replace('.0', '')} %)</span><span>{Math.round(tax).toLocaleString('fr-FR')} F</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: 10 }}>
                    <span style={{ color: '#0a0e14' }}>Total</span>
                    <span style={{ color: '#10785a' }}>{Math.round(total).toLocaleString('fr-FR')} F</span>
                  </div>
                </div>

                {/* Section paiement */}
                <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.55)', padding: '16px', backdropFilter: 'blur(20px)' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Mode de paiement</p>
                  {PaymentSection}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </>
    );
  }

  // ── Vue principale mobile (inchangée) ────────────────────────────────────────
  return (
    <div className="pb-20 px-1 pt-6 space-y-6">
      {GlobalModals}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Point de Vente</h1>
          <p className="text-sm text-gray-600 mt-1">Effectuer une vente</p>
        </div>
        <button
          onClick={() => setShowZReport(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-bold active:scale-95 transition-all"
          style={{ background: '#10785a', border: '1px solid #0d6349', boxShadow: '0 1px 4px rgba(16,120,90,0.3)' }}
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          Rapport Z
        </button>
      </div>

      {/* ── Widget Fond de caisse mobile ── */}
      <button
        onClick={() => setShowFondModal(true)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl active:scale-[0.98] transition-all"
        style={{
          background: fondDuJour >= 0 ? 'rgba(16,120,90,0.07)' : 'rgba(234,179,8,0.08)',
          border: `1px solid ${fondDuJour >= 0 ? 'rgba(16,120,90,0.2)' : 'rgba(234,179,8,0.3)'}`,
        }}
      >
        <div className="flex items-center gap-3">
          <Banknote size={17} color={fondDuJour >= 0 ? '#10785a' : '#b45309'} />
          <div className="text-left">
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: fondDuJour >= 0 ? '#10785a' : '#b45309' }}>
              Fond de caisse
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: fondDuJour >= 0 ? '#0a0e14' : '#b45309', letterSpacing: '-0.02em' }}>
              {fondDuJour >= 0 ? `${Math.round(fondDuJour).toLocaleString('fr-FR')} FCFA` : 'Non défini — Appuyer pour définir'}
            </div>
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={fondDuJour >= 0 ? '#10785a' : '#b45309'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>
        </svg>
      </button>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Rechercher un médicament..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => setShowScanner(true)}
          title="Scanner un code-barres"
          className="px-4 py-3 bg-gray-900 text-white rounded-lg flex items-center gap-2 active:scale-95 transition-all hover:bg-gray-800 shrink-0"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14M21 5v2M21 17v2M1 5v2M1 17v2"/>
          </svg>
        </button>
      </div>

      {scanFeedback && (
        <div className={`px-4 py-3 rounded-xl font-medium text-sm flex items-center gap-2 ${scanFeedback.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <span>{scanFeedback.msg}</span>
        </div>
      )}

      {LowStockAlerts}

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
                    type="number" inputMode="numeric" pattern="[0-9]*"
                    min="1" max={item.medication.quantity} value={item.quantity}
                    onChange={(e) => updateQuantity(item.medication.id, parseInt(e.target.value))}
                    className="w-16 px-2 py-2 border-2 border-gray-300 rounded-lg text-center text-base font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button onClick={() => removeFromCart(item.medication.id)} className="p-3 text-red-600 hover:bg-red-50 rounded-lg active:scale-95 transition-all">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2 pt-3 border-t border-gray-200">
            <div className="flex justify-between text-sm"><span className="text-gray-600">Sous-total:</span><span className="font-medium text-gray-900">{subtotal.toFixed(0)} FCFA</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">TVA ({(taxRate * 100).toFixed(1).replace('.0', '')} %):</span><span className="font-medium text-gray-900">{tax.toFixed(0)} FCFA</span></div>
            <div className="flex justify-between text-lg font-bold"><span className="text-gray-900">Total:</span><span className="text-green-600">{total.toFixed(0)} FCFA</span></div>
          </div>
        </div>
      )}

      {cart.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-4">
          <label className="block text-sm font-medium text-gray-700">Mode de paiement</label>
          <div className={`grid grid-cols-2 gap-3 ${(paymentMode === 'credit' || paymentMode === 'insurance') ? 'opacity-40 pointer-events-none' : ''}`}>
            {[
              { value: 'Espèces', icon: <Banknote className="w-7 h-7" />, label: 'Espèces' },
              { value: 'Carte Bancaire', icon: <CreditCard className="w-7 h-7" />, label: 'Carte' },
              { value: 'MTN Mobile Money', icon: <Smartphone className="w-7 h-7" />, label: 'MTN MM' },
              { value: 'Airtel Money', icon: <Smartphone className="w-7 h-7" />, label: 'Airtel' },
            ].map(({ value, icon, label }) => (
              <button key={value} onClick={() => { setPaymentMethod(value as any); setPaymentMode('direct'); }}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 active:scale-95 transition-all ${paymentMode === 'direct' && paymentMethod === value ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-300 hover:border-gray-400'}`}>
                {icon}<span className="text-xs font-semibold">{label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 my-3"><div className="flex-1 h-px bg-gray-200" /><span className="text-xs text-gray-400 font-medium">ou</span><div className="flex-1 h-px bg-gray-200" /></div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => { setMixedMode(m => !m); if (paymentMode === 'credit' || paymentMode === 'insurance') setPaymentMode('direct'); }}
              className={`flex items-center justify-center gap-1.5 p-3 rounded-xl border-2 active:scale-95 transition-all ${mixedMode ? 'border-blue-500 bg-blue-50 shadow-md text-blue-800' : 'border-blue-200 hover:border-blue-300 text-blue-600 bg-blue-50/30'}`}>
              <CreditCard className="w-3.5 h-3.5" /><span className="text-xs font-semibold">Mixte</span>
            </button>
            <button onClick={() => { setPaymentMode(paymentMode === 'insurance' ? 'direct' : 'insurance'); setMixedMode(false); }}
              className={`flex items-center justify-center gap-1.5 p-3 rounded-xl border-2 active:scale-95 transition-all ${paymentMode === 'insurance' ? 'border-indigo-500 bg-indigo-50 shadow-md text-indigo-800' : 'border-indigo-200 hover:border-indigo-300 text-indigo-600 bg-indigo-50/30'}`}>
              <Shield className="w-3.5 h-3.5" /><span className="text-xs font-semibold">Assurance</span>
            </button>
            <button onClick={() => { setPaymentMode(paymentMode === 'credit' ? 'direct' : 'credit'); setMixedMode(false); }}
              className={`flex items-center justify-center gap-1.5 p-3 rounded-xl border-2 active:scale-95 transition-all ${paymentMode === 'credit' ? 'border-amber-500 bg-amber-50 shadow-md text-amber-800' : 'border-amber-300 hover:border-amber-400 text-amber-700 bg-amber-50/40'}`}>
              <BookOpen className="w-3.5 h-3.5" /><span className="text-xs font-semibold">Crédit</span>
            </button>
          </div>

          {mixedMode && paymentMode !== 'credit' && (() => {
            const isBalanced = Math.abs(mixedDiff) <= 1;
            return (
              <div className="space-y-3 p-3 rounded-xl bg-blue-50 border border-blue-200">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Paiement partagé</p>
                  {isBalanced ? <span className="text-xs font-bold text-green-600">✓ Équilibré</span> : <span className="text-xs font-medium text-red-500">Reste : {Math.abs(mixedDiff).toFixed(0)} FCFA</span>}
                </div>
                {[
                  { method: mixedMethod1, setMethod: setMixedMethod1, amount: mixedAmount1, setAmount: setMixedAmount1, label: 'Mode 1' },
                  { method: mixedMethod2, setMethod: setMixedMethod2, amount: mixedAmount2, setAmount: setMixedAmount2, label: 'Mode 2' },
                ].map(({ method, setMethod, amount, setAmount, label }) => (
                  <div key={label} className="flex gap-2 items-center">
                    <select value={method} onChange={e => setMethod(e.target.value)} className="flex-1 px-2 py-2 border border-blue-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                      {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <div className="relative">
                      <input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="w-28 px-2 py-2 pr-10 border border-blue-300 rounded-lg text-sm font-semibold text-right bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">F</span>
                    </div>
                  </div>
                ))}
                {a1 > 0 && a2 === 0 && (
                  <button onClick={() => setMixedAmount2(Math.max(0, total - a1).toFixed(0))} className="text-xs text-blue-600 font-medium hover:underline">
                    Compléter automatiquement : {Math.max(0, total - a1).toFixed(0)} FCFA
                  </button>
                )}
              </div>
            );
          })()}

          {paymentMode === 'credit' && (
            <div className="space-y-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Informations client</p>
              <input type="text" value={creditClientName} onChange={e => setCreditClientName(e.target.value)} placeholder="Nom complet *" className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <input type="tel" inputMode="tel" value={creditClientPhone} onChange={e => setCreditClientPhone(e.target.value)} placeholder="+242 06 …" className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-sm" />
                <input type="date" value={creditDueDate} onChange={e => setCreditDueDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-sm" />
              </div>
            </div>
          )}

          {/* Formulaire assurance mobile */}
          {paymentMode === 'insurance' && (
            <div className="space-y-3 p-3 rounded-xl bg-indigo-50 border border-indigo-200">
              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Organisme assureur</p>
              {/* Chips organismes */}
              <div className="flex flex-wrap gap-2">
                {insuranceOrgs.map(org => {
                  const active = insuranceOrg === org.name;
                  return (
                    <button
                      key={org.id}
                      onClick={() => { setInsuranceOrg(org.name); setInsuranceRate(org.default_rate); }}
                      className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border-2 transition-all active:scale-95 ${active ? 'border-indigo-500 bg-indigo-100 text-indigo-800' : 'border-indigo-200 bg-white text-indigo-600'}`}
                    >
                      {org.name}
                      {org.custom && (
                        <span
                          className="text-gray-400 hover:text-red-500 ml-0.5"
                          onClick={e => { e.stopPropagation(); removeInsuranceOrg(org.id); if (insuranceOrg === org.name) setInsuranceOrg(''); }}
                        >×</span>
                      )}
                    </button>
                  );
                })}
                <button
                  onClick={() => setShowAddOrgForm(s => !s)}
                  className="px-3 py-1 rounded-full text-xs font-semibold border-2 border-dashed border-indigo-300 text-indigo-500 bg-transparent active:scale-95"
                >+ Ajouter</button>
              </div>
              {/* Formulaire ajout organisme */}
              {showAddOrgForm && (
                <div className="flex gap-2">
                  <input
                    value={newOrgName} onChange={e => setNewOrgName(e.target.value)}
                    placeholder="Nom organisme"
                    className="flex-1 px-3 py-2 border border-indigo-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                  />
                  <div className="relative w-20">
                    <input
                      type="number" min={0} max={100} value={newOrgRate} onChange={e => setNewOrgRate(e.target.value)}
                      className="w-full px-2 py-2 pr-6 border border-indigo-300 rounded-lg text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
                  </div>
                  <button
                    onClick={() => {
                      const name = newOrgName.trim();
                      const rate = Math.min(100, Math.max(0, parseFloat(newOrgRate) || 80));
                      if (!name) return;
                      const org = addInsuranceOrg(name, rate);
                      setInsuranceOrg(org.name);
                      setInsuranceRate(org.default_rate);
                      setShowAddOrgForm(false);
                      setNewOrgName('');
                      setNewOrgRate('80');
                    }}
                    disabled={!newOrgName.trim()}
                    className={`px-3 py-2 rounded-lg text-sm font-bold ${newOrgName.trim() ? 'bg-indigo-600 text-white active:scale-95' : 'bg-gray-200 text-gray-400'}`}
                  >OK</button>
                </div>
              )}
              {/* N° carte + taux */}
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={insuranceCard} onChange={e => setInsuranceCard(e.target.value)}
                  placeholder="N° carte (optionnel)"
                  className="px-3 py-2 border border-indigo-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                />
                <div className="relative">
                  <input
                    type="number" min={0} max={100} value={insuranceRate}
                    onChange={e => setInsuranceRate(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                    className="w-full px-3 py-2 pr-8 border border-indigo-200 rounded-lg text-sm font-bold text-right focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white text-indigo-800"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
                </div>
              </div>
              {/* Répartition */}
              {total > 0 && (
                <div className="bg-white rounded-lg p-2.5 border border-indigo-100 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-indigo-600 font-semibold">Part assurance ({insuranceRate}%)</span>
                    <span className="font-bold text-indigo-800">{insuranceAmount.toLocaleString('fr-FR')} F</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600 font-semibold">Part patient</span>
                    <span className={`font-bold ${patientAmount > 0 ? 'text-amber-700' : 'text-green-700'}`}>{patientAmount.toLocaleString('fr-FR')} F</span>
                  </div>
                </div>
              )}
              {/* Méthode règlement patient */}
              {patientAmount > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">Règlement part patient :</p>
                  <div className="flex flex-wrap gap-1.5">
                    {METHODS.map(m => (
                      <button
                        key={m}
                        onClick={() => setInsuranceResidualMethod(m)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border-2 transition-all active:scale-95 ${insuranceResidualMethod === m ? 'border-gray-800 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-500'}`}
                      >{m}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Patient CRM mobile */}
          <div className="relative" ref={patRef}>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Patient CRM <span className="font-normal text-gray-300">(optionnel)</span></div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={selectedPatientId ? selectedPatientName : patSearch}
                onChange={e => { setPatSearch(e.target.value); if (selectedPatientId) { setSelectedPatientId(null); setSelectedPatientName(e.target.value); } setShowPatDrop(true); }}
                onFocus={() => setShowPatDrop(true)}
                placeholder="Rechercher un patient…"
                className="w-full pl-8 pr-8 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                style={{ borderColor: selectedPatientId ? 'rgba(16,120,90,0.4)' : '#d1d5db', background: selectedPatientId ? 'rgba(16,120,90,0.04)' : '#fff', fontWeight: selectedPatientId ? 600 : 400 }}
              />
              {selectedPatientId && (
                <button onClick={() => { setSelectedPatientId(null); setSelectedPatientName(''); setPatSearch(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 flex">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {showPatDrop && patSuggestions.length > 0 && !selectedPatientId && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                {patSuggestions.map(p => (
                  <button key={p.id} onClick={() => { setSelectedPatientId(p.id); setSelectedPatientName(p.name); setPatSearch(''); setShowPatDrop(false); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left border-b border-gray-100 last:border-b-0 hover:bg-gray-50 active:bg-gray-100">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg,#10785a,#149a73)' }}>
                      <User className="w-3 h-3 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900">{p.name}</div>
                      <div className="text-xs text-gray-400">{p.phone || '—'}</div>
                    </div>
                    {p.allergies.length > 0 && <span className="text-xs font-semibold text-red-600 bg-red-50 rounded px-1.5 py-0.5 flex-shrink-0">⚠</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {paymentMode === 'direct' && (
            <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nom du client (optionnel)" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          )}

          <button
            onClick={processSale}
            disabled={submitDisabled}
            className={`w-full py-5 rounded-xl font-bold text-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg text-white ${
              paymentMode === 'credit'
                ? 'bg-amber-500 hover:bg-amber-600'
                : paymentMode === 'insurance'
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : mixedMode
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {paymentMode === 'credit'
              ? <BookOpen className="w-6 h-6" />
              : paymentMode === 'insurance'
                ? <Shield className="w-6 h-6" />
                : <CreditCard className="w-6 h-6" />
            }
            {isProcessing
              ? 'Traitement...'
              : paymentMode === 'credit'
                ? `Enregistrer crédit — ${total.toFixed(0)} FCFA`
                : paymentMode === 'insurance'
                  ? `Assurance ${insuranceOrg || '…'} — ${total.toFixed(0)} FCFA`
                  : mixedMode
                    ? `Paiement mixte — ${total.toFixed(0)} FCFA`
                    : `Vendre — ${total.toFixed(0)} FCFA`
            }
          </button>
        </div>
      )}
    </div>
  );
}
