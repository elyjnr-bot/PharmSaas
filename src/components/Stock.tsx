import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Plus, SlidersHorizontal, X, CheckCircle, PackageOpen, Package, ChevronRight, ShoppingCart, Printer } from 'lucide-react';
import { Medication, supabase } from '../lib/supabase';
import { useMedications } from '../lib/useMedications';
import { useAuth } from '../lib/auth';
import { useCart, InventoryUnit } from '../lib/cartContext';
import AddMedicationModal, { AddMedicationResult } from './AddMedicationModal';
import PrintUnitsModal from './PrintUnitsModal';
import InlineScanLink from './InlineScanLink';
import PharmacyIndicator from './PharmacyIndicator';
import { isExpired, expiresInThreeMonths } from '../lib/dateUtils';
import { parseGS1Code } from '../lib/dataMatrixParser';
import { barcodeCache } from '../lib/barcodeCache';

const PAGE_SIZE = 50;

type StockStatus = 'out' | 'low' | 'expiring' | 'expired' | 'ok';


function getMedStatus(med: Medication): StockStatus {
  if (isExpired(med.expiry_date)) return 'expired';
  if (med.quantity === 0) return 'out';
  if (med.quantity < (med.minimum_stock ?? 0)) return 'low';
  if (expiresInThreeMonths(med.expiry_date)) return 'expiring';
  return 'ok';
}

const STATUS_LABELS: Record<StockStatus, string> = {
  ok: 'Normal',
  low: 'Stock faible',
  out: 'Rupture',
  expiring: 'Perime bientot',
  expired: 'Perime',
};

const STATUS_COLORS: Record<StockStatus, string> = {
  ok: 'bg-green-100 text-green-700',
  low: 'bg-amber-100 text-amber-700',
  out: 'bg-red-100 text-red-700',
  expiring: 'bg-orange-100 text-orange-700',
  expired: 'bg-red-200 text-red-800',
};

interface Filters {
  forme: string;
  rayon: string;
  fournisseur: string;
  statuts: StockStatus[];
}

const EMPTY_FILTERS: Filters = { forme: '', rayon: '', fournisseur: '', statuts: [] };

const ALL_STATUTS: StockStatus[] = ['ok', 'low', 'out', 'expiring', 'expired'];

function isUnitModeEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem('workflow_mode') === 'unit';
}

export default function Stock() {
  const { medications, isLoading, reload: loadMedications } = useMedications();
  const { user } = useAuth();
  const { addUnitToCart, cart } = useCart();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [quickScanFallback, setQuickScanFallback] = useState<{ code: string; gtin?: string; lot?: string } | null>(null);
  const [quickScanPrefill, setQuickScanPrefill] = useState<{ gtin?: string; batch_number?: string } | undefined>();
  const [quickNotification, setQuickNotification] = useState<{ type: 'ok' | 'error'; message: string } | null>(null);
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null);
  const [medicationUnits, setMedicationUnits] = useState<InventoryUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [pendingPrint, setPendingPrint] = useState<{
    medicationName: string;
    price: number;
    units: Array<{
      id: string;
      unit_code: string;
      medication_name: string;
      batch_number: string;
      expiry_date: string | null;
      entry_date: string;
      price: number;
      supplier: string;
    }>;
  } | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const currentScanIdRef = useRef<number>(0);
  const isHandlingScanRef = useRef(false);

  const unitMode = isUnitModeEnabled();

  const cartUnitIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of cart) {
      for (const unit of item.units || []) {
        ids.add(unit.id);
      }
    }
    return ids;
  }, [cart]);

  const handleAddUnitToCart = useCallback((unit: InventoryUnit) => {
    if (selectedMedication) {
      addUnitToCart(selectedMedication, unit);
      setQuickNotification({ type: 'ok', message: `Unite ${unit.unit_code} ajoutee au panier` });
      setTimeout(() => setQuickNotification(null), 3500);
    }
  }, [selectedMedication, addUnitToCart]);

  const showQuickNotification = (type: 'ok' | 'error', message: string) => {
    setQuickNotification({ type, message });
    setTimeout(() => setQuickNotification(null), 3500);
  };

  const handleQuickScan = async (code: string) => {
    if (isHandlingScanRef.current) return;
    isHandlingScanRef.current = true;
    setQuickScanFallback(null);
    const scanId = ++currentScanIdRef.current;

    const gs1 = parseGS1Code(code);

    const cachedId = barcodeCache.get(code) ?? (gs1?.gtin ? barcodeCache.get(gs1.gtin) : null);
    if (cachedId) {
      const found = medications.find(m => m.id === cachedId);
      if (found) {
        showQuickNotification('ok', `Produit trouve : ${found.name} ${found.dosage} - Stock : ${found.quantity}`);
        setSearchQuery(found.name);
        return;
      }
    }

    const { data: barcodeRow } = await supabase
      .from('barcodes')
      .select('medication_id')
      .eq('barcode', code.trim())
      .maybeSingle();

    if (scanId !== currentScanIdRef.current) return;

    if (barcodeRow?.medication_id) {
      const found = medications.find(m => m.id === barcodeRow.medication_id);
      if (found) {
        barcodeCache.set(code, barcodeRow.medication_id);
        showQuickNotification('ok', `Produit trouve : ${found.name} ${found.dosage} - Stock : ${found.quantity}`);
        setSearchQuery(found.name);
        return;
      }
    }
    if (gs1?.gtin) {
      const { data: byGtin } = await supabase
        .from('medications')
        .select('*')
        .eq('gtin', gs1.gtin)
        .maybeSingle();

      if (scanId !== currentScanIdRef.current) return;

      if (byGtin) {
        barcodeCache.set(code, byGtin.id);
        if (gs1.gtin) barcodeCache.set(gs1.gtin, byGtin.id);
        showQuickNotification('ok', `Produit trouve : ${byGtin.name} ${byGtin.dosage} - Stock : ${byGtin.quantity}`);
        setSearchQuery(byGtin.name);
        return;
      }
    }

    if (scanId !== currentScanIdRef.current) return;

    setQuickScanFallback({ code, gtin: gs1?.gtin, lot: gs1?.lot });
    setQuickScanPrefill({ gtin: gs1?.gtin, batch_number: gs1?.lot });
  };

  const loadUnitsForMedication = useCallback(async (medicationId: string) => {
    setLoadingUnits(true);
    try {
      const { data, error } = await supabase
        .from('inventory_units')
        .select('*')
        .eq('user_id', user?.id)
        .eq('medication_id', medicationId)
        .eq('status', 'available')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading units:', error);
        setMedicationUnits([]);
      } else {
        setMedicationUnits(data || []);
      }
    } catch (err) {
      console.error('Error loading units:', err);
      setMedicationUnits([]);
    } finally {
      setLoadingUnits(false);
    }
  }, [user?.id]);

  const handleMedicationClick = useCallback((medication: Medication) => {
    if (unitMode) {
      setSelectedMedication(medication);
      loadUnitsForMedication(medication.id);
    }
  }, [unitMode, loadUnitsForMedication]);

  const formeOptions = useMemo(() =>
    [...new Set(medications.map(m => m.forme_produit).filter((v): v is string => !!v))].sort(),
    [medications]);

  const rayonOptions = useMemo(() =>
    [...new Set(medications.map(m => m.name_rayon).filter((v): v is string => !!v))].sort(),
    [medications]);

  const fournisseurOptions = useMemo(() =>
    [...new Set(medications.map(m => m.supplier).filter((v): v is string => !!v))].sort(),
    [medications]);

  const filteredMedications = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return medications.filter(med => {
      if (q && !med.name.toLowerCase().includes(q) && !(med.code_produit || '').toLowerCase().includes(q)) return false;
      if (filters.forme && med.forme_produit !== filters.forme) return false;
      if (filters.rayon && med.name_rayon !== filters.rayon) return false;
      if (filters.fournisseur && med.supplier !== filters.fournisseur) return false;
      if (filters.statuts.length > 0 && !filters.statuts.includes(getMedStatus(med))) return false;
      return true;
    });
  }, [searchQuery, filters, medications]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchQuery, filters]);

  const loadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filteredMedications.length));
  }, [filteredMedications.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '300px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setShowFilters(false);
      }
    };
    if (showFilters) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilters]);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters(prev => ({ ...prev, [key]: value }));

  const toggleStatut = (s: StockStatus) =>
    setFilters(prev => ({
      ...prev,
      statuts: prev.statuts.includes(s) ? prev.statuts.filter(x => x !== s) : [...prev.statuts, s],
    }));

  const removeChip = (key: keyof Filters, value?: StockStatus) => {
    if (key === 'statuts' && value) {
      setFilters(prev => ({ ...prev, statuts: prev.statuts.filter(s => s !== value) }));
    } else {
      setFilters(prev => ({ ...prev, [key]: '' }));
    }
  };

  const activeFilterCount =
    (filters.forme ? 1 : 0) +
    (filters.rayon ? 1 : 0) +
    (filters.fournisseur ? 1 : 0) +
    filters.statuts.length;

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('fr-FR', { month: '2-digit', year: 'numeric' });

  const visibleMedications = filteredMedications.slice(0, visibleCount);
  const hasMore = visibleCount < filteredMedications.length;

  return (
    <>
    <div className="pb-20 bg-gray-50 min-h-screen">
      <PharmacyIndicator pharmacyName="Brazzaville" />

      <div className="px-1 pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inventaire</h1>
            <p className="text-sm text-gray-600 mt-1">
              {isLoading
                ? 'Chargement...'
                : `${filteredMedications.length} produit(s)${hasMore ? ` - affichage ${visibleCount}` : ''}`}
              {unitMode && <span className="ml-2 text-blue-600 font-medium">(Mode Unitaire)</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Ajouter</span>
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher par nom ou code produit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="relative" ref={filterPanelRef}>
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`relative flex items-center gap-2 px-4 py-3 rounded-lg border font-medium transition-colors ${
                activeFilterCount > 0
                  ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Filtres</span>
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {showFilters && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Filtres</h3>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => setFilters(EMPTY_FILTERS)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Tout effacer
                    </button>
                  )}
                </div>

                <FilterSelect
                  label="Forme produit"
                  value={filters.forme}
                  onChange={(v) => setFilter('forme', v)}
                  options={formeOptions}
                  placeholder="Toutes les formes"
                />

                <FilterSelect
                  label="Rayon"
                  value={filters.rayon}
                  onChange={(v) => setFilter('rayon', v)}
                  options={rayonOptions}
                  placeholder="Tous les rayons"
                />

                <FilterSelect
                  label="Fournisseur"
                  value={filters.fournisseur}
                  onChange={(v) => setFilter('fournisseur', v)}
                  options={fournisseurOptions}
                  placeholder="Tous les fournisseurs"
                />

                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block">
                    Statut du stock
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_STATUTS.map(s => (
                      <button
                        key={s}
                        onClick={() => toggleStatut(s)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors text-left ${
                          filters.statuts.includes(s)
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          s === 'ok' ? 'bg-green-500' :
                          s === 'low' ? 'bg-amber-500' :
                          s === 'out' ? 'bg-red-500' :
                          s === 'expiring' ? 'bg-orange-500' :
                          'bg-red-800'
                        }`} />
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-2">
            {filters.forme && (
              <FilterChip label={filters.forme} onRemove={() => removeChip('forme')} />
            )}
            {filters.rayon && (
              <FilterChip label={filters.rayon} onRemove={() => removeChip('rayon')} />
            )}
            {filters.fournisseur && (
              <FilterChip label={filters.fournisseur} onRemove={() => removeChip('fournisseur')} />
            )}
            {filters.statuts.map(s => (
              <FilterChip key={s} label={STATUS_LABELS[s]} onRemove={() => removeChip('statuts', s)} />
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
            <p className="text-gray-600 mt-3">Chargement de l'inventaire...</p>
          </div>
        ) : filteredMedications.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            {medications.length === 0 && !searchQuery && activeFilterCount === 0 ? (
              <div className="flex flex-col items-center gap-4 px-6">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
                  <PackageOpen className="w-10 h-10 text-gray-400" />
                </div>
                <div>
                  <p className="text-gray-800 font-semibold text-lg">Inventaire vide</p>
                  <p className="text-gray-500 text-sm mt-1">
                    Veuillez importer votre fichier Excel pour commencer.
                  </p>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Utilisez Parametres &rsaquo; Import Excel pour charger votre stock.
                </p>
              </div>
            ) : (
              <>
                <p className="text-gray-600">
                  Aucun medicament ne correspond aux filtres
                </p>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className="mt-3 text-sm text-blue-600 hover:underline"
                  >
                    Effacer les filtres
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Nom</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden lg:table-cell">Dosage</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">Forme</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">Rayon</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden xl:table-cell">Fournisseur</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        {unitMode ? 'Unites' : 'Quantite'}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">N Lot</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Peremption</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Statut</th>
                      {unitMode && <th className="px-4 py-3 w-10"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibleMedications.map((medication) => {
                      const status = getMedStatus(medication);
                      const expired = status === 'expired';
                      const expiringSoon = status === 'expiring';

                      let rowBg = unitMode ? 'hover:bg-blue-50 cursor-pointer' : 'hover:bg-gray-50';
                      if (expired) rowBg = `bg-red-50 ${unitMode ? 'hover:bg-red-100 cursor-pointer' : 'hover:bg-red-100'}`;
                      else if (expiringSoon) rowBg = `bg-orange-50 ${unitMode ? 'hover:bg-orange-100 cursor-pointer' : 'hover:bg-orange-100'}`;

                      return (
                        <tr
                          key={medication.code_produit || medication.id}
                          className={`${rowBg} transition-colors`}
                          onClick={() => handleMedicationClick(medication)}
                        >
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{medication.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 hidden lg:table-cell">{medication.dosage}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                            {medication.forme_produit || <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-sm hidden md:table-cell">
                            {medication.name_rayon
                              ? <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">{medication.name_rayon}</span>
                              : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 hidden xl:table-cell">
                            {medication.supplier || <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            <span className={`inline-flex items-center gap-1.5 font-bold ${unitMode ? 'text-blue-600' : ''}`}>
                              {unitMode && <Package className="w-3.5 h-3.5" />}
                              {medication.quantity}
                            </span>
                            <span className="text-gray-400 text-xs ml-1">/ {medication.minimum_stock}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 font-mono hidden sm:table-cell">{medication.batch_number}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={expired ? 'text-red-700 font-bold' : expiringSoon ? 'text-orange-700 font-semibold' : 'text-gray-600'}>
                              {formatDate(medication.expiry_date)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
                              {STATUS_LABELS[status]}
                            </span>
                          </td>
                          {unitMode && (
                            <td className="px-4 py-3 text-center">
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div ref={sentinelRef} className="py-4 text-center">
              {hasMore && (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                  <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full" />
                  Chargement de la suite...
                </div>
              )}
            </div>
          </>
        )}

        <AddMedicationModal
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setQuickScanPrefill(undefined); }}
          onSuccess={(result?: AddMedicationResult) => {
            loadMedications();
            setQuickScanFallback(null);
            if (result?.isUnitMode && result.newUnits && result.newUnits.length > 0) {
              const today = new Date().toISOString().split('T')[0];
              setPendingPrint({
                medicationName: result.medication.name,
                price: result.medication.price,
                units: result.newUnits.map(u => ({
                  id: u.id,
                  unit_code: u.unit_code,
                  medication_name: result.medication.name,
                  batch_number: u.batch_number,
                  expiry_date: u.expiry_date,
                  entry_date: today,
                  price: result.medication.price,
                  supplier: '',
                })),
              });
            }
          }}
          prefillData={quickScanPrefill}
        />

      </div>
    </div>

    {quickScanFallback && (
      <InlineScanLink
        code={quickScanFallback.code}
        gtin={quickScanFallback.gtin}
        lot={quickScanFallback.lot}
        onLink={(med) => {
          currentScanIdRef.current++;
          isHandlingScanRef.current = false;
          setQuickScanFallback(null);
          showQuickNotification('ok', `Lie a : ${med.name} ${med.dosage}`);
          setSearchQuery(med.name);
        }}
        onDismiss={() => { currentScanIdRef.current++; isHandlingScanRef.current = false; setQuickScanFallback(null); }}
        onCreateNew={() => { setIsModalOpen(true); }}
      />
    )}

    {quickNotification && (
      <div className="fixed top-4 left-4 right-4 z-50">
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-white ${quickNotification.type === 'ok' ? 'bg-green-600' : 'bg-red-600'}`}>
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-semibold">{quickNotification.message}</p>
        </div>
      </div>
    )}

    {selectedMedication && (
      <UnitDetailsModal
        medication={selectedMedication}
        units={medicationUnits}
        loading={loadingUnits}
        onClose={() => setSelectedMedication(null)}
        onAddUnit={handleAddUnitToCart}
        cartUnitIds={cartUnitIds}
      />
    )}

    {pendingPrint && !showPrintModal && (
      <div className="fixed bottom-24 left-4 right-4 z-50 sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-sm">
        <div className="bg-green-700 text-white rounded-2xl shadow-2xl px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{pendingPrint.medicationName}</p>
            <p className="text-xs text-green-200 mt-0.5">
              {pendingPrint.units.length} unite(s) creee(s) avec succes
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => setShowPrintModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white text-green-700 rounded-lg text-xs font-bold hover:bg-green-50 transition-colors whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimer {pendingPrint.units.length}
            </button>
            <button
              onClick={() => setPendingPrint(null)}
              className="text-xs text-green-200 hover:text-white text-center"
            >
              Ignorer
            </button>
          </div>
        </div>
      </div>
    )}

    {pendingPrint && showPrintModal && (
      <PrintUnitsModal
        units={pendingPrint.units}
        medicationName={pendingPrint.medicationName}
        price={pendingPrint.price}
        onClose={() => { setShowPrintModal(false); setPendingPrint(null); }}
        onUnitsUpdated={() => loadMedications()}
      />
    )}
    </>
  );
}

function FilterSelect({ label, value, onChange, options, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">{placeholder}</option>
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 text-sm font-medium rounded-full border border-blue-200">
      {label}
      <button onClick={onRemove} className="hover:text-blue-900">
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

interface UnitDetailsModalProps {
  medication: Medication;
  units: InventoryUnit[];
  loading: boolean;
  onClose: () => void;
  onAddUnit: (unit: InventoryUnit) => void;
  cartUnitIds: Set<string>;
}

function UnitDetailsModal({ medication, units, loading, onClose, onAddUnit, cartUnitIds }: UnitDetailsModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">{medication.name}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {medication.dosage && `${medication.dosage} - `}
              Stock : <span className="font-semibold text-blue-600">{medication.quantity} unite(s)</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Package className="w-4 h-4" />
            Unites en stock ({units.length})
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : units.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="text-sm">Aucune unite disponible</p>
            </div>
          ) : (
            <div className="space-y-2">
              {units.map((unit) => {
                const isInCart = cartUnitIds.has(unit.id);
                return (
                  <div
                    key={unit.id}
                    className={`border rounded-lg p-3 flex items-center justify-between transition-colors ${
                      isInCart ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div>
                      <p className="font-mono font-bold text-blue-700 text-sm">{unit.unit_code}</p>
                      {unit.imported_code && unit.imported_code !== unit.unit_code && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Code import : {unit.imported_code}
                        </p>
                      )}
                    </div>
                    {isInCart ? (
                      <span className="px-3 py-1.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                        <ShoppingCart className="w-3 h-3" />
                        Dans le panier
                      </span>
                    ) : (
                      <button
                        onClick={() => onAddUnit(unit)}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-full flex items-center gap-1 transition-colors"
                      >
                        <ShoppingCart className="w-3 h-3" />
                        Ajouter
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
