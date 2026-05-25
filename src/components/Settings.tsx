import { useState, useEffect } from 'react';
import { User, Building2, LogOut, Upload, Percent, ChevronRight, Check, AlertCircle, Truck, Phone, Plus, X, Trash2, Layers, ScanLine, AlertTriangle, RotateCcw, Key } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useWorkflow } from '../lib/workflowContext';
import { clearAllLocalData } from '../lib/db';
import { supabase } from '../lib/supabase';
import { useUserSettings } from '../lib/userSettings';
import CSVImport from './CSVImport';
import ApiKeysManager from './ApiKeysManager';

const AVAILABLE_SITES = [
  'Pharmacie Brazzaville',
  'Pharmacie Pointe-Noire',
  'Pharmacie Dolisie',
  'Pharmacie Ouesso',
];

const TAX_OPTIONS = [
  { value: 0, label: '0% - Pas de TVA' },
  { value: 0.10, label: '10% - Taux reduit' },
  { value: 0.189, label: '18.9% - Taux normal' },
  { value: 0.20, label: '20% - Taux majore' },
];

interface Wholesaler {
  name: string;
  phone: string;
}

const DEFAULT_WHOLESALERS: Wholesaler[] = [
  { name: 'Laborex Congo', phone: '+242 06 XXX XXXX' },
  { name: 'Cophadom', phone: '+242 05 XXX XXXX' },
];

export default function Settings() {
  const { profile, signOut } = useAuth();
  const { workflowMode, setWorkflowMode } = useWorkflow();
  const { settings: userSettings, update: updateUserSettings } = useUserSettings();
  const [activeSection, setActiveSection] = useState<'main' | 'import' | 'pharmacy' | 'tax' | 'wholesalers' | 'api'>('main');
  const [customPharmacyName, setCustomPharmacyName] = useState('');
  const [defaultSupplier, setDefaultSupplier] = useState('');
  const [selectedSite, setSelectedSite] = useState(() =>
    localStorage.getItem('pharmacy_site') || 'Pharmacie Brazzaville'
  );
  const [taxRate, setTaxRate] = useState(() =>
    parseFloat(localStorage.getItem('tax_rate') || '0.189')
  );
  const [wholesalers, setWholesalers] = useState<Wholesaler[]>(() => {
    const saved = localStorage.getItem('wholesalers');
    return saved ? JSON.parse(saved) : DEFAULT_WHOLESALERS;
  });
  const [newWholesaler, setNewWholesaler] = useState({ name: '', phone: '' });
  const [showAddWholesaler, setShowAddWholesaler] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    setCustomPharmacyName(userSettings.pharmacy_name);
    setDefaultSupplier(userSettings.default_supplier);
  }, [userSettings.pharmacy_name, userSettings.default_supplier]);

  const handleSignOut = async () => {
    if (confirm('Voulez-vous vraiment vous deconnecter ?')) {
      try {
        await signOut();
      } catch (error) {
        console.error('Error signing out:', error);
        alert('Erreur lors de la deconnexion');
      }
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await supabase.from('medications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await clearAllLocalData();
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) keysToRemove.push(key);
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      localStorage.setItem('pharma_data_reset', '1');
      window.location.reload();
    } catch (error) {
      console.error('Reset error:', error);
      setIsResetting(false);
      setShowResetConfirm(false);
    }
  };

  const saveSettings = () => {
    localStorage.setItem('pharmacy_site', selectedSite);
    localStorage.setItem('tax_rate', taxRate.toString());
    localStorage.setItem('wholesalers', JSON.stringify(wholesalers));
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 2000);
  };

  const addWholesaler = () => {
    if (newWholesaler.name && newWholesaler.phone) {
      const updated = [...wholesalers, newWholesaler];
      setWholesalers(updated);
      localStorage.setItem('wholesalers', JSON.stringify(updated));
      setNewWholesaler({ name: '', phone: '' });
      setShowAddWholesaler(false);
    }
  };

  const removeWholesaler = (index: number) => {
    const updated = wholesalers.filter((_, i) => i !== index);
    setWholesalers(updated);
    localStorage.setItem('wholesalers', JSON.stringify(updated));
  };

  if (activeSection === 'import') {
    return (
      <div className="pb-24 bg-gray-50 min-h-screen">
        <div className="sticky top-16 z-30 bg-white border-b border-gray-200 px-2 py-3">
          <button
            onClick={() => setActiveSection('main')}
            className="flex items-center gap-2 text-green-600 font-medium"
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
            Retour
          </button>
        </div>
        <div className="p-2">
          <CSVImport />
        </div>
      </div>
    );
  }

  if (activeSection === 'pharmacy') {
    const handleSavePharmacy = async () => {
      localStorage.setItem('pharmacy_site', selectedSite);
      await updateUserSettings({
        pharmacy_name: customPharmacyName,
        default_supplier: defaultSupplier,
      });
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 2000);
    };

    return (
      <div className="pb-24 bg-gray-50 min-h-screen">
        <div className="sticky top-16 z-30 bg-white border-b border-gray-200 px-2 py-3">
          <button
            onClick={() => setActiveSection('main')}
            className="flex items-center gap-2 text-green-600 font-medium"
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
            Retour
          </button>
        </div>
        <div className="p-2 flex flex-col gap-3">

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2.5 rounded-xl">
                  <Building2 className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Identite de la Pharmacie</h2>
                  <p className="text-sm text-gray-500">Nom affiché sur les etiquettes</p>
                </div>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nom de la pharmacie
                </label>
                <input
                  type="text"
                  value={customPharmacyName}
                  onChange={(e) => setCustomPharmacyName(e.target.value)}
                  placeholder="Ex: Pharmacie du Centre"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Fournisseur par defaut
                </label>
                <input
                  type="text"
                  value={defaultSupplier}
                  onChange={(e) => setDefaultSupplier(e.target.value)}
                  placeholder="Ex: Laborex Congo"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2.5 rounded-xl">
                  <Building2 className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Site</h2>
                  <p className="text-sm text-gray-500">Selectionner votre site</p>
                </div>
              </div>
            </div>

            <div className="p-2">
              {AVAILABLE_SITES.map((site) => (
                <button
                  key={site}
                  onClick={() => setSelectedSite(site)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                    selectedSite === site
                      ? 'bg-green-50 text-green-700'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="font-medium">{site}</span>
                  {selectedSite === site && (
                    <Check className="w-5 h-5 text-green-600" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSavePharmacy}
            className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {showSaveSuccess ? (
              <>
                <Check className="w-5 h-5" />
                Enregistre !
              </>
            ) : 'Enregistrer les parametres'}
          </button>
        </div>
      </div>
    );
  }

  if (activeSection === 'tax') {
    return (
      <div className="pb-24 bg-gray-50 min-h-screen">
        <div className="sticky top-16 z-30 bg-white border-b border-gray-200 px-2 py-3">
          <button
            onClick={() => setActiveSection('main')}
            className="flex items-center gap-2 text-green-600 font-medium"
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
            Retour
          </button>
        </div>
        <div className="p-2">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-2.5 rounded-xl">
                  <Percent className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Taux de TVA</h2>
                  <p className="text-sm text-gray-500">Configurer la taxe applicable</p>
                </div>
              </div>
            </div>

            <div className="p-2">
              {TAX_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTaxRate(option.value)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                    taxRate === option.value
                      ? 'bg-amber-50 text-amber-700'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="font-medium">{option.label}</span>
                  {taxRate === option.value && (
                    <Check className="w-5 h-5 text-amber-600" />
                  )}
                </button>
              ))}
            </div>

            <div className="p-4 border-t border-gray-100">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    Le taux de TVA sera applique automatiquement sur toutes les ventes.
                  </p>
                </div>
              </div>
              <button
                onClick={saveSettings}
                className="w-full bg-amber-600 text-white py-3 rounded-xl font-semibold hover:bg-amber-700 active:scale-[0.98] transition-all"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeSection === 'api') {
    return (
      <div className="pb-24 bg-gray-50 min-h-screen">
        <div className="sticky top-16 z-30 bg-white border-b border-gray-200 px-2 py-3">
          <button
            onClick={() => setActiveSection('main')}
            className="flex items-center gap-2 text-green-600 font-medium"
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
            Retour
          </button>
        </div>
        <div className="p-2 flex flex-col gap-3">
          <ApiKeysManager />
        </div>
      </div>
    );
  }

  if (activeSection === 'wholesalers') {
    return (
      <div className="pb-24 bg-gray-50 min-h-screen">
        <div className="sticky top-16 z-30 bg-white border-b border-gray-200 px-2 py-3">
          <button
            onClick={() => setActiveSection('main')}
            className="flex items-center gap-2 text-green-600 font-medium"
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
            Retour
          </button>
        </div>
        <div className="p-2">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2.5 rounded-xl">
                  <Truck className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Fournisseurs</h2>
                  <p className="text-sm text-gray-500">Mes grossistes</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddWholesaler(true)}
                className="bg-blue-600 text-white p-2 rounded-xl hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="divide-y divide-gray-100">
              {wholesalers.map((wholesaler, index) => (
                <div key={index} className="flex items-center gap-4 p-4">
                  <div className="bg-blue-50 p-2.5 rounded-xl">
                    <Truck className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{wholesaler.name}</p>
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" />
                      {wholesaler.phone}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${wholesaler.phone}`}
                      className="bg-green-50 text-green-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-green-100 transition-colors"
                    >
                      Appeler
                    </a>
                    <button
                      onClick={() => removeWholesaler(index)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {wholesalers.length === 0 && (
              <div className="p-8 text-center">
                <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Aucun fournisseur enregistre</p>
              </div>
            )}
          </div>
        </div>

        {showAddWholesaler && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center sm:justify-center sm:p-4">
            <div className="bg-white w-full rounded-t-3xl sm:rounded-2xl sm:max-w-[520px] max-h-[90vh] overflow-y-auto animate-slide-up">
              <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Ajouter un fournisseur</h2>
                <button
                  onClick={() => setShowAddWholesaler(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                  <input
                    type="text"
                    value={newWholesaler.name}
                    onChange={(e) => setNewWholesaler({ ...newWholesaler, name: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: Laborex Congo"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telephone</label>
                  <input
                    type="tel"
                    value={newWholesaler.phone}
                    onChange={(e) => setNewWholesaler({ ...newWholesaler, phone: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="+242 06 XXX XXXX"
                  />
                </div>

                <button
                  onClick={addWholesaler}
                  disabled={!newWholesaler.name || !newWholesaler.phone}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg"
                >
                  Ajouter
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pb-24 bg-gray-50 min-h-screen">
      <div className="px-2 pt-4">
        {profile && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-green-600 rounded-2xl flex items-center justify-center">
                <User className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900">{profile.full_name || profile.email}</h3>
                <p className="text-sm text-gray-500">
                  {profile.role === 'manager' ? 'Gerant' : 'Vendeur'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mb-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2.5 rounded-xl">
                  <Layers className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Mode de Gestion</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Methode de tracabilite du stock</p>
                </div>
              </div>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setWorkflowMode('global')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  workflowMode === 'global'
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  workflowMode === 'global' ? 'bg-green-100' : 'bg-gray-200'
                }`}>
                  <Layers className={`w-5 h-5 ${workflowMode === 'global' ? 'text-green-600' : 'text-gray-500'}`} />
                </div>
                <span className={`text-sm font-bold ${workflowMode === 'global' ? 'text-green-700' : 'text-gray-600'}`}>
                  Global
                </span>
                <span className="text-xs text-center text-gray-500 leading-tight">
                  Stock global, vente par code EAN ou nom
                </span>
                {workflowMode === 'global' && (
                  <div className="flex items-center gap-1 text-xs font-semibold text-green-600">
                    <Check className="w-3.5 h-3.5" />
                    Actif
                  </div>
                )}
              </button>

              <button
                onClick={() => setWorkflowMode('unit')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  workflowMode === 'unit'
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  workflowMode === 'unit' ? 'bg-green-100' : 'bg-gray-200'
                }`}>
                  <ScanLine className={`w-5 h-5 ${workflowMode === 'unit' ? 'text-green-600' : 'text-gray-500'}`} />
                </div>
                <span className={`text-sm font-bold ${workflowMode === 'unit' ? 'text-green-700' : 'text-gray-600'}`}>
                  Unitaire
                </span>
                <span className="text-xs text-center text-gray-500 leading-tight">
                  Code unique par boite, tracabilite complete
                </span>
                {workflowMode === 'unit' && (
                  <div className="flex items-center gap-1 text-xs font-semibold text-green-600">
                    <Check className="w-3.5 h-3.5" />
                    Actif
                  </div>
                )}
              </button>
            </div>
            {workflowMode === 'unit' && (
              <div className="px-4 pb-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs text-amber-800 leading-relaxed">
                    <strong>Mode Unitaire actif :</strong> Chaque reception genere des codes uniques (JP-...) a imprimer sur chaque boite. Le scanner exige ces codes lors des ventes.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => setActiveSection('pharmacy')}
            className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors active:scale-[0.99]"
          >
            <div className="bg-green-100 p-2.5 rounded-xl">
              <Building2 className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-semibold text-gray-900">Pharmacie</p>
              <p className="text-sm text-gray-500">{selectedSite}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          <button
            onClick={() => setActiveSection('tax')}
            className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors active:scale-[0.99]"
          >
            <div className="bg-amber-100 p-2.5 rounded-xl">
              <Percent className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-semibold text-gray-900">Taux de TVA</p>
              <p className="text-sm text-gray-500">{(taxRate * 100).toFixed(1)}%</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          <button
            onClick={() => setActiveSection('wholesalers')}
            className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors active:scale-[0.99]"
          >
            <div className="bg-blue-100 p-2.5 rounded-xl">
              <Truck className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-semibold text-gray-900">Fournisseurs</p>
              <p className="text-sm text-gray-500">{wholesalers.length} grossiste(s)</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          <button
            onClick={() => setActiveSection('import')}
            className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors active:scale-[0.99]"
          >
            <div className="bg-green-100 p-2.5 rounded-xl">
              <Upload className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-semibold text-gray-900">Import Excel</p>
              <p className="text-sm text-gray-500">Importer stock et codes-barres</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          <button
            onClick={() => setActiveSection('api')}
            className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors active:scale-[0.99]"
          >
            <div className="bg-purple-100 p-2.5 rounded-xl">
              <Key className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-semibold text-gray-900">Clés API</p>
              <p className="text-sm text-gray-500">Chatbot WhatsApp & intégrations</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <button
            onClick={handleSignOut}
            className="w-full bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-center gap-3 text-red-600 font-semibold hover:bg-red-100 transition-colors active:scale-[0.99]"
          >
            <LogOut className="w-5 h-5" />
            Se deconnecter
          </button>

          <button
            onClick={() => setShowResetConfirm(true)}
            className="w-full bg-white border-2 border-red-300 rounded-2xl p-4 flex items-center justify-center gap-3 text-red-600 font-semibold hover:bg-red-50 transition-colors active:scale-[0.99]"
          >
            <RotateCcw className="w-5 h-5" />
            Reinitialiser toutes les donnees
          </button>
        </div>

        <div className="text-center text-xs text-gray-400 mt-8">
          Version 2.0.0 - JunglePharm
        </div>
      </div>

      {showSaveSuccess && (
        <div className="fixed top-20 left-4 right-4 z-50">
          <div className="bg-green-600 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3">
            <Check className="w-5 h-5" />
            <span className="font-semibold">Parametres enregistres</span>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div
          className="fixed inset-0 bg-black/60 z-[999] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isResetting) {
              setShowResetConfirm(false);
            }
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
                Reinitialiser les donnees ?
              </h2>
              <p className="text-sm text-gray-500 text-center leading-relaxed mb-1">
                Cette action supprime definitivement tout l'inventaire.
              </p>
              <p className="text-sm font-semibold text-red-600 text-center mb-6">
                Cette action est irreversible.
              </p>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-6">
                <ul className="text-xs text-red-800 space-y-1">
                  <li className="flex items-start gap-1.5">
                    <span className="mt-0.5">•</span>
                    Tous les medicaments dans la base de donnees cloud
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="mt-0.5">•</span>
                    Cache local, ventes en attente et panier
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="mt-0.5">•</span>
                    Preferences et donnees de l'appareil
                  </li>
                </ul>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  disabled={isResetting}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleReset}
                  disabled={isResetting}
                  className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isResetting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Nettoyage...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Reinitialiser
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
