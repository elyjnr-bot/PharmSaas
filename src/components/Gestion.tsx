import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Plus, Package, Check, Filter, ArrowUpDown, RotateCcw, X, FileSpreadsheet, ChevronRight, ShoppingCart, Printer } from 'lucide-react';
import { fetchAllMedications, Medication, supabase } from '../lib/supabase';
import { useCart, InventoryUnit } from '../lib/cartContext';
import { offlineStorage } from '../lib/offlineStorage';
import { useAuth } from '../lib/auth';
import { getSellerPermissions } from '../lib/permissions';
import { useResponsive } from '../lib/useResponsive';
import AddMedicationModal from './AddMedicationModal';
import DataTable from './DataTable';
import ImportInventoryModal from './ImportInventoryModal';
import QuickEditModal from './QuickEditModal';
import PrintUnitsModal from './PrintUnitsModal';

function isUnitModeEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem('workflow_mode') === 'unit';
}

interface EditingProduct {
  medication: Medication;
  newQuantity: number;
  newPrice: number;
}

const CATEGORIES = [
  'Antibiotique',
  'Antalgique',
  'Anti-inflammatoire',
  'Antipaludeen',
  'Antidiabetique',
  'Cardiovasculaire',
  'Dermatologie',
  'Gastro-enterologie',
  'Respiratoire',
  'Vitamines',
  'Usage externe',
  'Autre',
];

const SUPPLIERS = [
  'Laborex Congo',
  'Cophadom',
  'SEP',
  'COPHARCO',
  'Ubipharm',
  'Autre',
];

type SortOption = 'name' | 'stock' | 'expiry';

interface GestionProps {
  onHideNavigationChange?: (hidden: boolean) => void;
}

export default function Gestion({ onHideNavigationChange }: GestionProps = {}) {
  const { addToCart: addToCartContext, addUnitToCart, cart } = useCart();
  const { isManager } = useAuth();
  const { isDesktop } = useResponsive();
  const canAddProduct = isManager || getSellerPermissions().allowManualProductAdd;
  const [medications, setMedications] = useState<Medication[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<EditingProduct | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showQuickEditModal, setShowQuickEditModal] = useState(false);
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [showFilters, setShowFilters] = useState(false);
  const [showUnitSelector, setShowUnitSelector] = useState(false);
  const [unitSelectorMedication, setUnitSelectorMedication] = useState<Medication | null>(null);
  const [availableUnits, setAvailableUnits] = useState<InventoryUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [addedUnitNotif, setAddedUnitNotif] = useState<string | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);
  const addThrottleLock = useRef(false);
  const searchBarRef = useRef<HTMLDivElement>(null);
  const [contentOffset, setContentOffset] = useState(160);

  const unitMode = isUnitModeEnabled();
  const hasActiveFilters = categoryFilter || supplierFilter || sortBy !== 'name';

  const cartUnitIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of cart) {
      for (const unit of item.units || []) {
        ids.add(unit.id);
      }
    }
    return ids;
  }, [cart]);

  const openUnitSelector = async (med: Medication) => {
    setUnitSelectorMedication(med);
    setShowUnitSelector(true);
    setLoadingUnits(true);

    try {
      const { data, error } = await supabase
        .from('inventory_units')
        .select('id, unit_code, medication_id, batch_number, expiry_date, entry_date, supplier, status, imported_code, linked_barcode, reception_batch')
        .eq('medication_id', med.id)
        .eq('status', 'available')
        .order('unit_code', { ascending: true });

      if (error) throw error;
      setAvailableUnits(data || []);
    } catch (err) {
      console.error('Error loading units:', err);
      setAvailableUnits([]);
    } finally {
      setLoadingUnits(false);
    }
  };

  const handleAddUnitToCart = (unit: InventoryUnit) => {
    if (unitSelectorMedication) {
      addUnitToCart(unitSelectorMedication, unit);
      setAddedUnitNotif(unit.unit_code);
      setTimeout(() => setAddedUnitNotif(null), 2000);
    }
  };

  const resetFilters = () => {
    setCategoryFilter('');
    setSupplierFilter('');
    setSortBy('name');
  };

  useEffect(() => {
    const el = searchBarRef.current;
    if (!el) return;

    const updateOffset = () => {
      const height = el.offsetHeight;
      setContentOffset(height);
    };

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(updateOffset);
    });

    observer.observe(el);
    updateOffset();

    return () => observer.disconnect();
  }, [showFilters]);

  useEffect(() => {
    loadMedications();
  }, []);

  useEffect(() => {
    if (onHideNavigationChange) {
      onHideNavigationChange(editingProduct !== null || showAddModal || showImportModal || showQuickEditModal);
    }
  }, [editingProduct, showAddModal, showImportModal, showQuickEditModal, onHideNavigationChange]);

  const loadMedications = async () => {
    setIsLoading(true);
    try {
      const cached = offlineStorage.getCachedMedications();
      if (cached.length > 0) {
        setMedications(cached);
        setIsLoading(false);
      }

      if (offlineStorage.isOnline()) {
        const data = await fetchAllMedications();
        setMedications(data);
        offlineStorage.cacheMedications(data);
      }
    } catch (error) {
      console.error('Error loading medications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMedications = useMemo(() => {
    let result = [...medications];

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(med =>
        med.name.toLowerCase().includes(q) ||
        (med.code_produit || '').toLowerCase().includes(q) ||
        (med.code_interne || '').toLowerCase().includes(q) ||
        (med.dosage || '').toLowerCase().includes(q)
      );
    }

    if (categoryFilter) {
      result = result.filter(med =>
        (med.name_rayon || '').toLowerCase().includes(categoryFilter.toLowerCase()) ||
        (med.category || '').toLowerCase().includes(categoryFilter.toLowerCase()) ||
        med.name.toLowerCase().includes(categoryFilter.toLowerCase())
      );
    }

    if (supplierFilter) {
      result = result.filter(med =>
        (med.supplier || '').toLowerCase() === supplierFilter.toLowerCase()
      );
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'stock':
          return a.quantity - b.quantity;
        case 'expiry':
          const dateA = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
          const dateB = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
          return dateA - dateB;
        case 'name':
        default:
          return a.name.localeCompare(b.name, 'fr');
      }
    });

    return result;
  }, [searchQuery, medications, categoryFilter, supplierFilter, sortBy]);

  const handleTouchStart = (e: React.TouchEvent, med: Medication) => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      openEditModal(med);
    }, 500);
  };

  const handleTouchEnd = (e: React.TouchEvent, med: Medication) => {
    e.preventDefault();
    e.stopPropagation();
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
    if (!isLongPress.current) {
      if (unitMode) {
        openUnitSelector(med);
      } else {
        addToCart(med);
      }
    }
  };

  const handleMouseDown = (med: Medication) => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      openEditModal(med);
    }, 500);
  };

  const handleMouseUp = (e: React.MouseEvent, med: Medication) => {
    e.stopPropagation();
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
    if (!isLongPress.current) {
      if (unitMode) {
        openUnitSelector(med);
      } else {
        addToCart(med);
      }
    }
  };

  const handleMouseLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const openEditModal = (med: Medication) => {
    setSelectedMedication(med);
    setShowQuickEditModal(true);
  };

  const addToCart = (med: Medication) => {
    if (med.quantity <= 0) return;
    if (addThrottleLock.current) return;
    addThrottleLock.current = true;
    addToCartContext(med);
    setTimeout(() => { addThrottleLock.current = false; }, 800);
  };

  const saveProductEdit = async () => {
    if (!editingProduct) return;

    try {
      const { error } = await supabase
        .from('medications')
        .update({
          quantity: editingProduct.newQuantity,
          price: editingProduct.newPrice,
        })
        .eq('id', editingProduct.medication.id);

      if (error) throw error;

      setMedications(prev => prev.map(med =>
        med.id === editingProduct.medication.id
          ? { ...med, quantity: editingProduct.newQuantity, price: editingProduct.newPrice }
          : med
      ));

      setEditingProduct(null);
    } catch (error) {
      console.error('Error saving product:', error);
      alert('Erreur lors de la sauvegarde');
    }
  };

  const [tappedCardId, setTappedCardId] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const triggerSpring = useCallback((id: string) => {
    setTappedCardId(id);
    setTimeout(() => setTappedCardId(null), 350);
  }, []);

  return (
    <div className="pb-24 bg-slate-100 min-h-screen">
      <div ref={searchBarRef} className={`${isDesktop ? 'sticky top-0' : 'fixed top-[64px] left-0 right-0'} px-3 pt-3 pb-2.5 transition-all duration-200`} style={{
        zIndex: 100,
        background: isDesktop ? 'rgba(248,250,252,0.98)' : 'rgba(242, 242, 247, 0.98)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        willChange: 'height',
      }}>
        <div className="flex items-center gap-2.5 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-slate-500" strokeWidth={1.5} />
            <input
              type="text"
              placeholder="Rechercher un produit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ios-input-pill pl-10 text-[15px]"
            />
          </div>
          {canAddProduct && (
            <>
              <button
                onClick={() => setShowImportModal(true)}
                className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full active:scale-[0.96] transition-all duration-200"
                style={{
                  background: '#059669',
                  boxShadow: '0 2px 8px rgba(22, 163, 74, 0.25)',
                }}
                title="Importer inventaire"
              >
                <FileSpreadsheet className="w-5 h-5 text-white" strokeWidth={2} />
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full active:scale-[0.96] transition-all duration-200"
                style={{
                  background: '#059669',
                  boxShadow: '0 2px 8px rgba(22, 163, 74, 0.25)',
                }}
              >
                <Plus className="w-5 h-5 text-white" strokeWidth={2} />
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 mb-2 overflow-x-auto scrollbar-hide pb-0.5">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[13px] font-medium transition-all duration-200 active:scale-95 whitespace-nowrap ${
              showFilters || hasActiveFilters
                ? 'bg-emerald-50 text-emerald-600 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]'
                : 'bg-white text-slate-900 shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
            }`}
          >
            <Filter className="w-3.5 h-3.5" strokeWidth={1.5} />
            Filtres
            {hasActiveFilters && (
              <span className="bg-emerald-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {(categoryFilter ? 1 : 0) + (supplierFilter ? 1 : 0) + (sortBy !== 'name' ? 1 : 0)}
              </span>
            )}
          </button>

          <button
            onClick={() => setSortBy('name')}
            className={`flex items-center gap-1 px-3.5 py-[7px] rounded-full text-[13px] font-medium whitespace-nowrap transition-all duration-200 active:scale-95 ${
              sortBy === 'name'
                ? 'bg-emerald-50 text-emerald-600 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]'
                : 'bg-white text-slate-500 shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
            }`}
          >
            <ArrowUpDown className="w-3 h-3" strokeWidth={1.5} />
            A-Z
          </button>
          <button
            onClick={() => setSortBy('stock')}
            className={`flex items-center gap-1 px-3.5 py-[7px] rounded-full text-[13px] font-medium whitespace-nowrap transition-all duration-200 active:scale-95 ${
              sortBy === 'stock'
                ? 'bg-amber-50 text-amber-600 shadow-[0_0_0_1px_rgba(245,158,11,0.2)]'
                : 'bg-white text-slate-500 shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
            }`}
          >
            <ArrowUpDown className="w-3 h-3" strokeWidth={1.5} />
            Stock
          </button>
          <button
            onClick={() => setSortBy('expiry')}
            className={`flex items-center gap-1 px-3.5 py-[7px] rounded-full text-[13px] font-medium whitespace-nowrap transition-all duration-200 active:scale-95 ${
              sortBy === 'expiry'
                ? 'bg-rose-50 text-rose-500 shadow-[0_0_0_1px_rgba(244,63,94,0.15)]'
                : 'bg-white text-slate-500 shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
            }`}
          >
            <ArrowUpDown className="w-3 h-3" strokeWidth={1.5} />
            Peremption
          </button>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center p-1.5 rounded-full text-slate-500 active:scale-[0.96] transition-all duration-200"
            >
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          )}
        </div>

        {showFilters && (
          <div className="bg-white rounded-[16px] p-3.5 mb-2 animate-scale-in" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)', willChange: 'transform, opacity' }}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Categorie
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-full text-[13px] focus:outline-none focus:ring-2 focus:ring-green-500/20 bg-gray-100/70 text-slate-900"
                >
                  <option value="">Toutes</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Fournisseur
                </label>
                <select
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-full text-[13px] focus:outline-none focus:ring-2 focus:ring-green-500/20 bg-gray-100/70 text-slate-900"
                >
                  <option value="">Tous</option>
                  {SUPPLIERS.map((sup) => (
                    <option key={sup} value={sup}>{sup}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-0.5">
          <p className="text-[12px] text-slate-500 font-medium">
            {filteredMedications.length} produit{filteredMedications.length > 1 ? 's' : ''}
            {hasActiveFilters && ' (filtres actifs)'}
          </p>
          <p className="text-[10px] text-slate-400">
            {unitMode ? 'Clic = choisir unite' : 'Appui long = modifier'}
          </p>
        </div>
      </div>

      <div className="px-2 transition-all duration-200" style={{ paddingTop: `${contentOffset}px` }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-7 h-7 border-2 border-green-500 border-t-transparent rounded-full" />
          </div>
        ) : filteredMedications.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-12 h-12 text-slate-400 mx-auto mb-3" strokeWidth={1} />
            <p className="text-slate-500 text-[15px]">Aucun produit trouve</p>
          </div>
        ) : isDesktop ? (
          <div className="pb-6">
            <DataTable
              medications={filteredMedications.slice(0, 100).map(med => ({
                id: med.id,
                name: med.name || 'Produit sans nom',
                code_produit: med.code_produit,
                price: med.price,
                quantity: med.quantity,
                peremption: med.expiry_date,
                supplier: med.supplier,
                forme_produit: med.dosage || med.forme_produit,
                name_rayon: med.name_rayon,
                minimum_stock: med.minimum_stock,
              }))}
              onRowClick={(med) => {
                const medication = filteredMedications.find(m => m.id === med.id);
                if (medication) openEditModal(medication);
              }}
            />
          </div>
        ) : (
          <div className="space-y-2 pb-28" style={{ position: 'relative', zIndex: 1 }}>
            {filteredMedications.map((med) => {
              const inCart = cart.find(item => item.medication.id === med.id);
              const isOutOfStock = med.quantity <= 0;
              const isLowStock = med.quantity > 0 && med.quantity < (med.minimum_stock || 5);
              const isTapped = tappedCardId === med.id;

              return (
                <div
                  key={med.id}
                  onTouchStart={(e) => handleTouchStart(e, med)}
                  onTouchEnd={(e) => { handleTouchEnd(e, med); if (!isLongPress.current) triggerSpring(med.id); }}
                  onMouseDown={() => handleMouseDown(med)}
                  onMouseUp={(e) => { handleMouseUp(e, med); if (!isLongPress.current) triggerSpring(med.id); }}
                  onMouseLeave={handleMouseLeave}
                  className={`bg-white rounded-[20px] p-4 select-none cursor-pointer transition-shadow duration-200 ${
                    isTapped ? 'animate-spring-tap' : ''
                  } ${
                    inCart
                      ? 'ring-[1.5px] ring-green-400/60'
                      : ''
                  } ${isOutOfStock ? 'opacity-45' : ''}`}
                  style={{
                    boxShadow: inCart
                      ? '0 4px 12px -2px rgba(22,163,74,0.12), 0 2px 4px -1px rgba(0,0,0,0.04)'
                      : '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-[15px] font-bold text-slate-900 truncate leading-tight">{med.name || 'Produit sans nom'}</h3>
                        {inCart && (
                          <span className="bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
                            x{inCart.quantity}
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] text-slate-500 truncate leading-snug">{med.dosage || 'N/A'}</p>
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-[3px] rounded-full ${
                          isOutOfStock
                            ? 'bg-[#FFF0F0] text-[#E8484A]'
                            : isLowStock
                            ? 'bg-[#FFF8ED] text-[#D4850D]'
                            : 'bg-[#F0FAF0] text-[#34A853]'
                        }`}>
                          <span className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${
                            isOutOfStock
                              ? 'bg-[#E8484A]'
                              : isLowStock
                              ? 'bg-[#E8A317]'
                              : 'bg-[#34A853]'
                          }`} />
                          {isOutOfStock ? 'Rupture' : isLowStock ? `Faible: ${med.quantity}` : `${med.quantity} en stock`}
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right pt-0.5 flex items-center gap-2">
                      <div>
                        <div className="flex items-baseline gap-1 justify-end">
                          <span className="text-[18px] font-bold text-slate-900 tracking-tight leading-none">
                            {(med.price || 0).toLocaleString()}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">FCFA</span>
                        </div>
                        {med.batch_number && !unitMode && (
                          <p className="text-[10px] text-slate-400 mt-1">Lot {med.batch_number}</p>
                        )}
                      </div>
                      {unitMode && !isOutOfStock && (
                        <ChevronRight className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editingProduct && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-end justify-center sm:items-center sm:p-4 animate-fade-in">
          <div className="bg-slate-100 w-full rounded-t-[20px] sm:rounded-2xl sm:max-w-[560px] max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="pt-2 pb-1 flex justify-center">
              <div className="w-9 h-[5px] rounded-full bg-[#D1D1D6]" />
            </div>
            <div className="px-5 pt-1 pb-3 flex items-center justify-between">
              <div className="min-w-0 flex-1 mr-3">
                <h2 className="text-[18px] font-bold text-slate-900 tracking-tight">Modifier</h2>
                <p className="text-[13px] text-slate-500 truncate mt-0.5">{editingProduct.medication.name}</p>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="w-[30px] h-[30px] bg-slate-200 rounded-full flex items-center justify-center active:scale-[0.96] transition-all duration-200"
              >
                <X className="w-3.5 h-3.5 text-slate-500" strokeWidth={2.5} />
              </button>
            </div>

            <div className="px-4 space-y-3" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
              <div className="bg-white rounded-[16px] p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Quantite en stock
                </label>
                <input
                  type="number"
                  value={editingProduct.newQuantity}
                  onChange={(e) => setEditingProduct({
                    ...editingProduct,
                    newQuantity: Math.max(0, parseInt(e.target.value) || 0)
                  })}
                  className="w-full py-3 bg-slate-100 rounded-[12px] text-[22px] font-bold text-center text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:bg-white transition-all duration-200"
                />
              </div>

              <div className="bg-white rounded-[16px] p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Prix de vente (FCFA)
                </label>
                <input
                  type="number"
                  value={editingProduct.newPrice}
                  onChange={(e) => setEditingProduct({
                    ...editingProduct,
                    newPrice: Math.max(0, parseFloat(e.target.value) || 0)
                  })}
                  className="w-full py-3 bg-slate-100 rounded-[12px] text-[22px] font-bold text-center text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:bg-white transition-all duration-200"
                />
              </div>

              <button
                onClick={saveProductEdit}
                className="w-full text-white py-[15px] rounded-[20px] font-bold text-[16px] flex items-center justify-center gap-2 active:scale-[0.97] active:brightness-95 transition-all duration-200"
                style={{
                  background: '#059669',
                  boxShadow: '0 6px 20px -4px rgba(22, 163, 74, 0.35)',
                }}
              >
                <Check className="w-5 h-5" strokeWidth={2} />
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="fixed top-20 left-4 right-4" style={{ zIndex: 10001 }}>
          <div className="px-4 py-3.5 rounded-[16px] flex items-center gap-3 animate-slide-down" style={{
            background: 'rgba(22, 163, 74, 0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 8px 24px -4px rgba(22, 163, 74, 0.3)',
          }}>
            <div className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center">
              <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[15px] font-semibold text-white">Vente enregistree</span>
          </div>
        </div>
      )}

      {showImportModal && (
        <ImportInventoryModal
          onClose={() => {
            setShowImportModal(false);
            loadMedications();
          }}
          onImportComplete={() => {
            loadMedications();
          }}
        />
      )}

      {showQuickEditModal && selectedMedication && (
        <QuickEditModal
          medication={selectedMedication}
          onClose={() => {
            setShowQuickEditModal(false);
            setSelectedMedication(null);
          }}
          onSave={() => {
            loadMedications();
            setShowQuickEditModal(false);
            setSelectedMedication(null);
          }}
        />
      )}

      <AddMedicationModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => loadMedications()}
        onAddToCart={(medication) => {
          addToCartContext(medication);
        }}
      />

      {showUnitSelector && unitSelectorMedication && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">{unitSelectorMedication.name}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {unitSelectorMedication.dosage && `${unitSelectorMedication.dosage} - `}
                  <span className="font-semibold text-blue-600">{unitSelectorMedication.quantity} unite(s)</span>
                  {unitSelectorMedication.price && (
                    <span className="ml-2 text-green-600">{unitSelectorMedication.price.toLocaleString()} FCFA</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {availableUnits.length > 0 && (
                  <button
                    onClick={() => setShowPrintModal(true)}
                    className="p-2 hover:bg-blue-100 text-blue-600 rounded-full transition-colors"
                    title="Imprimer les etiquettes"
                  >
                    <Printer className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowUnitSelector(false);
                    setUnitSelectorMedication(null);
                    setAvailableUnits([]);
                  }}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Selectionnez une unite a vendre
                </h3>
                {availableUnits.length > 0 && (
                  <button
                    onClick={() => setShowPrintModal(true)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Tout imprimer
                  </button>
                )}
              </div>

              {loadingUnits ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full" />
                </div>
              ) : availableUnits.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                  <p className="text-sm">Aucune unite disponible</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableUnits.map((unit) => {
                    const isInCart = cartUnitIds.has(unit.id);
                    return (
                      <div
                        key={unit.id}
                        className={`border rounded-xl p-3 flex items-center justify-between transition-colors ${
                          isInCart ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div>
                          <p className="font-mono font-bold text-blue-700 text-base">{unit.unit_code}</p>
                          {unit.imported_code && unit.imported_code !== unit.unit_code && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              Code import : {unit.imported_code}
                            </p>
                          )}
                        </div>
                        {isInCart ? (
                          <span className="px-3 py-2 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1.5">
                            <ShoppingCart className="w-3.5 h-3.5" />
                            Dans le panier
                          </span>
                        ) : (
                          <button
                            onClick={() => handleAddUnitToCart(unit)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-full flex items-center gap-1.5 transition-colors active:scale-95"
                          >
                            <ShoppingCart className="w-4 h-4" />
                            Vendre
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
                onClick={() => {
                  setShowUnitSelector(false);
                  setUnitSelectorMedication(null);
                  setAvailableUnits([]);
                }}
                className="w-full py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {addedUnitNotif && (
        <div className="fixed top-20 left-4 right-4" style={{ zIndex: 10001 }}>
          <div className="px-4 py-3.5 rounded-[16px] flex items-center gap-3 animate-slide-down" style={{
            background: 'rgba(22, 163, 74, 0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 8px 24px -4px rgba(22, 163, 74, 0.3)',
          }}>
            <div className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center">
              <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[15px] font-semibold text-white">Unite {addedUnitNotif} ajoutee au panier</span>
          </div>
        </div>
      )}

      {showPrintModal && unitSelectorMedication && availableUnits.length > 0 && (
        <PrintUnitsModal
          units={availableUnits.map(u => ({
            id: u.id,
            unit_code: u.unit_code,
            medication_name: `${unitSelectorMedication.name} ${unitSelectorMedication.dosage || ''}`.trim(),
            batch_number: u.batch_number,
            expiry_date: u.expiry_date,
            entry_date: (u as any).entry_date || null,
            price: unitSelectorMedication.price,
            supplier: (u as any).supplier || unitSelectorMedication.supplier || '',
            linked_barcode: (u as any).linked_barcode,
          }))}
          medicationName={unitSelectorMedication.name}
          price={unitSelectorMedication.price}
          supplier={unitSelectorMedication.supplier}
          onClose={() => setShowPrintModal(false)}
          onUnitsUpdated={() => openUnitSelector(unitSelectorMedication)}
        />
      )}
    </div>
  );
}
