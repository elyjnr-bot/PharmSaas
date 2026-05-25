import { useState, useEffect, useMemo } from 'react';
import { Users, Plus, X, Check, Trash2, RefreshCw, Eye, EyeOff, UserCheck, TrendingUp, ShoppingBag, Lock, ChevronRight, KeyRound, Shield, Timer, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSeller, ActiveSeller, getManagerPin, setManagerPin } from '../lib/sellerContext';
import { useAuth } from '../lib/auth';
import { offlineStorage, SalesJournalEntry } from '../lib/offlineStorage';
import { getSellerPermissions, setSellerPermissions, SellerPermissions } from '../lib/permissions';

interface Seller {
  id: string;
  name: string;
  pin_code: string;
  created_at: string;
}

type View = 'list' | 'add' | 'switch' | 'manager-pin';

function Toggle({ enabled, onChange, label, description }: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className="w-full flex items-center justify-between gap-3 py-3 group"
    >
      <div className="flex-1 text-left">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <div className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${enabled ? '' : 'bg-gray-200'}`} style={enabled ? { background: '#059669' } : {}}>
        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
    </button>
  );
}

function SellerDashboard({ sellerName, permissions }: { sellerName: string; permissions: SellerPermissions }) {
  const todayEntries = useMemo(() => {
    const all = offlineStorage.getTodaySalesJournal();
    return all.filter(e => e.seller_name === sellerName);
  }, [sellerName]);

  const totalToday = useMemo(
    () => todayEntries.reduce((s, e) => s + e.total_price, 0),
    [todayEntries]
  );

  const last5: SalesJournalEntry[] = useMemo(() => {
    return [...todayEntries]
      .sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime())
      .slice(0, 5);
  }, [todayEntries]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  if (!permissions.showDailyTotal && !permissions.showTransactionHistory) return null;

  return (
    <div className="mx-2 mt-4 space-y-3">
      {permissions.showDailyTotal && (
        <div className="rounded-2xl p-5 shadow-md" style={{ background: 'linear-gradient(135deg, #065f46 0%, #059669 100%)' }}>
          <p className="text-green-100 text-sm font-medium mb-1">Mes ventes aujourd'hui</p>
          <p className="text-white text-3xl font-bold">{totalToday.toLocaleString()} FCFA</p>
          <div className="flex items-center gap-1.5 mt-2">
            <ShoppingBag className="w-4 h-4 text-green-200" />
            <span className="text-green-100 text-sm">{todayEntries.length} transaction{todayEntries.length > 1 ? 's' : ''}</span>
          </div>
        </div>
      )}

      {permissions.showTransactionHistory && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">5 dernieres transactions</h3>
          </div>
          {last5.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-gray-400">Aucune vente pour l'instant</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {last5.map(entry => (
                <div key={entry.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{entry.medication_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatTime(entry.sale_date)} · x{entry.quantity_sold}</p>
                  </div>
                  <span className="text-sm font-bold text-green-700 flex-shrink-0">
                    {entry.total_price.toLocaleString()} F
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const AUTO_LOGOUT_OPTIONS = [
  { label: 'Desactive', value: 0 },
  { label: '5 minutes', value: 5 },
  { label: '10 minutes', value: 10 },
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
];

export default function Equipe() {
  const { isManager } = useAuth();
  const { activeSeller, setActiveSeller } = useSeller();
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [view, setView] = useState<View>('list');
  const [isLoading, setIsLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [switchPin, setSwitchPin] = useState('');
  const [switchError, setSwitchError] = useState('');
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [managerPin, setManagerPinState] = useState(() => getManagerPin());
  const [newManagerPin, setNewManagerPin] = useState('');
  const [confirmManagerPin, setConfirmManagerPin] = useState('');
  const [managerPinStep, setManagerPinStep] = useState<'new' | 'confirm'>('new');
  const [managerPinError, setManagerPinError] = useState('');

  const [permissions, setPermissionsState] = useState<SellerPermissions>(() => getSellerPermissions());
  const [showAutoLogoutPicker, setShowAutoLogoutPicker] = useState(false);

  useEffect(() => { loadSellers(); }, []);

  const loadSellers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('sellers')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setSellers(data || []);
    } catch {
      setSellers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const updatePermission = (patch: Partial<SellerPermissions>) => {
    const next = { ...permissions, ...patch };
    setPermissionsState(next);
    setSellerPermissions(next);
  };

  const handleAddSeller = async () => {
    if (!newName.trim() || newPin.length !== 4) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('sellers')
        .insert([{ name: newName.trim(), pin_code: newPin, user_id: user.id }])
        .select()
        .single();
      if (error) throw error;
      setSellers(prev => [...prev, data]);
      setNewName('');
      setNewPin('');
      setView('list');
    } catch {
      alert('Erreur lors de la creation du profil');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSeller = async (id: string) => {
    try {
      const { error } = await supabase.from('sellers').delete().eq('id', id);
      if (error) throw error;
      setSellers(prev => prev.filter(s => s.id !== id));
      if (activeSeller?.id === id) setActiveSeller(null);
      setDeleteConfirmId(null);
    } catch {
      alert('Erreur lors de la suppression');
    }
  };

  const handleSwitchInit = (seller: Seller) => {
    setSelectedSeller(seller);
    setSwitchPin('');
    setSwitchError('');
    setView('switch');
  };

  const handleSwitchConfirm = () => {
    if (!selectedSeller) return;
    if (switchPin === selectedSeller.pin_code) {
      const next: ActiveSeller = { id: selectedSeller.id, name: selectedSeller.name };
      setActiveSeller(next);
      setSwitchPin('');
      setSwitchError('');
      setSelectedSeller(null);
      setView('list');
    } else {
      setSwitchError('Code PIN incorrect');
      setSwitchPin('');
    }
  };

  const handlePinDigit = (digit: string, forField: 'new' | 'switch' | 'mgr-new' | 'mgr-confirm') => {
    if (forField === 'new') {
      if (newPin.length < 4) setNewPin(prev => prev + digit);
    } else if (forField === 'switch') {
      if (switchPin.length < 4) {
        const next = switchPin + digit;
        setSwitchPin(next);
        setSwitchError('');
        if (next.length === 4 && selectedSeller) {
          setTimeout(() => {
            if (next === selectedSeller.pin_code) {
              setActiveSeller({ id: selectedSeller.id, name: selectedSeller.name });
              setSwitchPin('');
              setSwitchError('');
              setSelectedSeller(null);
              setView('list');
            } else {
              setSwitchError('Code PIN incorrect');
              setSwitchPin('');
            }
          }, 150);
        }
      }
    } else if (forField === 'mgr-new') {
      if (newManagerPin.length < 4) {
        const next = newManagerPin + digit;
        setNewManagerPin(next);
        setManagerPinError('');
        if (next.length === 4) setManagerPinStep('confirm');
      }
    } else if (forField === 'mgr-confirm') {
      if (confirmManagerPin.length < 4) {
        const next = confirmManagerPin + digit;
        setConfirmManagerPin(next);
        setManagerPinError('');
        if (next.length === 4) {
          setTimeout(() => {
            if (next === newManagerPin) {
              setManagerPin(next);
              setManagerPinState(next);
              setNewManagerPin('');
              setConfirmManagerPin('');
              setManagerPinStep('new');
              setManagerPinError('');
              setView('list');
            } else {
              setManagerPinError('Les codes ne correspondent pas');
              setConfirmManagerPin('');
            }
          }, 150);
        }
      }
    }
  };

  const handlePinDelete = (forField: 'new' | 'switch' | 'mgr-new' | 'mgr-confirm') => {
    if (forField === 'new') setNewPin(prev => prev.slice(0, -1));
    else if (forField === 'switch') { setSwitchPin(prev => prev.slice(0, -1)); setSwitchError(''); }
    else if (forField === 'mgr-new') { setNewManagerPin(prev => prev.slice(0, -1)); setManagerPinError(''); }
    else if (forField === 'mgr-confirm') { setConfirmManagerPin(prev => prev.slice(0, -1)); setManagerPinError(''); }
  };

  const PIN_DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  if (view === 'add') {
    return (
      <div className="bg-gray-50">
        <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
          <button onClick={() => { setView('list'); setNewName(''); setNewPin(''); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
          <h2 className="text-lg font-bold text-gray-900">Nouveau vendeur</h2>
        </div>
        <div className="p-2 space-y-6">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Nom du vendeur</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Marc, Julie..."
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Code PIN (4 chiffres)</label>
              <div className="flex gap-3 justify-center mb-4">
                {[0,1,2,3].map(i => (
                  <div key={i} className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-all ${newPin.length > i ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-transparent'}`}>
                    {showPin ? (newPin[i] || '') : (newPin.length > i ? '•' : '')}
                  </div>
                ))}
              </div>
              <div className="flex justify-end mb-3">
                <button onClick={() => setShowPin(!showPin)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
                  {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showPin ? 'Masquer' : 'Afficher'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PIN_DIGITS.map((digit, i) => (
                  <button key={i} onClick={() => digit === '⌫' ? handlePinDelete('new') : digit ? handlePinDigit(digit, 'new') : undefined} disabled={!digit && digit !== '⌫'}
                    className={`h-12 rounded-xl font-semibold text-lg transition-all active:scale-95 ${digit === '⌫' ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : digit ? 'bg-gray-100 text-gray-900 hover:bg-gray-200' : 'invisible'}`}>
                    {digit}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={handleAddSeller} disabled={!newName.trim() || newPin.length !== 4 || isSaving}
            className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold text-base hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-40 shadow-md">
            {isSaving ? 'Enregistrement...' : 'Creer le profil'}
          </button>
        </div>
      </div>
    );
  }

  if (view === 'switch') {
    return (
      <div className="bg-gray-50">
        <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
          <button onClick={() => { setView('list'); setSwitchPin(''); setSwitchError(''); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
          <h2 className="text-lg font-bold text-gray-900">Changer de vendeur</h2>
        </div>
        <div className="p-2">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center space-y-5">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <UserCheck className="w-8 h-8 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">{selectedSeller?.name}</h3>
              <p className="text-sm text-gray-500 mt-1">Entrez votre code PIN</p>
            </div>
            <div className="flex gap-3 justify-center">
              {[0,1,2,3].map(i => (
                <div key={i} className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-all ${switchError ? 'border-red-400 bg-red-50' : switchPin.length > i ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50'}`}>
                  {switchPin.length > i ? '•' : ''}
                </div>
              ))}
            </div>
            {switchError && <p className="text-sm text-red-600 font-medium">{switchError}</p>}
            <div className="grid grid-cols-3 gap-2">
              {PIN_DIGITS.map((digit, i) => (
                <button key={i} onClick={() => digit === '⌫' ? handlePinDelete('switch') : digit ? handlePinDigit(digit, 'switch') : undefined} disabled={!digit && digit !== '⌫'}
                  className={`h-12 rounded-xl font-semibold text-lg transition-all active:scale-95 ${digit === '⌫' ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : digit ? 'bg-gray-100 text-gray-900 hover:bg-gray-200' : 'invisible'}`}>
                  {digit}
                </button>
              ))}
            </div>
            <button onClick={handleSwitchConfirm} disabled={switchPin.length !== 4}
              className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-40">
              Confirmer
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'manager-pin') {
    const currentField = managerPinStep === 'new' ? 'mgr-new' : 'mgr-confirm';
    const currentValue = managerPinStep === 'new' ? newManagerPin : confirmManagerPin;
    return (
      <div className="bg-gray-50">
        <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
          <button onClick={() => { setView('list'); setNewManagerPin(''); setConfirmManagerPin(''); setManagerPinStep('new'); setManagerPinError(''); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
          <h2 className="text-lg font-bold text-gray-900">Code Manager</h2>
        </div>
        <div className="p-2">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center space-y-5">
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7 text-slate-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                {managerPinStep === 'new' ? 'Nouveau code Manager' : 'Confirmer le code'}
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                {managerPinStep === 'new' ? 'Choisissez un code a 4 chiffres' : 'Retapez le meme code'}
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              {[0,1,2,3].map(i => (
                <div key={i} className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-all ${managerPinError ? 'border-red-400 bg-red-50' : currentValue.length > i ? 'border-slate-500 bg-slate-50' : 'border-gray-200 bg-gray-50'}`}>
                  {currentValue.length > i ? '•' : ''}
                </div>
              ))}
            </div>
            {managerPinError && <p className="text-sm text-red-600 font-medium">{managerPinError}</p>}
            <div className="grid grid-cols-3 gap-2">
              {PIN_DIGITS.map((digit, i) => (
                <button key={i} onClick={() => digit === '⌫' ? handlePinDelete(currentField) : digit ? handlePinDigit(digit, currentField) : undefined} disabled={!digit && digit !== '⌫'}
                  className={`h-12 rounded-xl font-semibold text-lg transition-all active:scale-95 ${digit === '⌫' ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : digit ? 'bg-gray-100 text-gray-900 hover:bg-gray-200' : 'invisible'}`}>
                  {digit}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isManager) {
    return (
      <div className="bg-gray-50">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-4">
          <h2 className="text-lg font-bold text-gray-900">Mon espace</h2>
          {activeSeller && (
            <p className="text-xs text-gray-400 mt-0.5">Session: {activeSeller.name}</p>
          )}
        </div>

        {activeSeller ? (
          <SellerDashboard sellerName={activeSeller.name} permissions={permissions} />
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <UserCheck className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">Chargement de votre profil...</p>
          </div>
        )}

        {permissions.autoLogoutMinutes > 0 && (
          <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
            <Timer className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              Deconnexion automatique apres {permissions.autoLogoutMinutes} min d'inactivite
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Equipe</h2>
        {!activeSeller && (
          <button onClick={() => setView('add')} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors">
            <Plus className="w-4 h-4" />
            Ajouter
          </button>
        )}
      </div>

      {activeSeller ? (
        <>
          <div className="mx-4 mt-4 bg-green-50 border border-green-200 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-base">{activeSeller.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-emerald-600 font-medium">Session active</p>
                <p className="text-base font-bold text-green-900 truncate">{activeSeller.name}</p>
              </div>
              <button onClick={() => setActiveSeller(null)} className="p-2 hover:bg-green-100 rounded-full transition-colors" title="Deconnecter">
                <X className="w-4 h-4 text-emerald-600" />
              </button>
            </div>
          </div>

          <SellerDashboard sellerName={activeSeller.name} permissions={permissions} />

          <div className="px-4 mt-5">
            <button
              onClick={() => {
                const s = sellers.find(s => s.id !== activeSeller.id) || sellers[0];
                if (s) handleSwitchInit(s);
                else setActiveSeller(null);
              }}
              className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 py-3.5 rounded-2xl font-semibold text-sm hover:bg-gray-50 transition-colors shadow-sm"
            >
              <UserCheck className="w-4 h-4 text-gray-500" />
              Changer de vendeur
            </button>
          </div>

          {sellers.length > 1 && (
            <div className="mx-4 mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Autres vendeurs</p>
              </div>
              {sellers.filter(s => s.id !== activeSeller.id).map(seller => (
                <button key={seller.id} onClick={() => handleSwitchInit(seller)} className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                  <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="font-bold text-gray-500">{seller.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <span className="flex-1 text-left font-medium text-gray-800">{seller.name}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="p-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-green-500 animate-spin" />
            </div>
          ) : sellers.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-700 mb-1">Aucun vendeur</h3>
              <p className="text-sm text-gray-400 mb-4">Ajoutez des profils vendeurs pour suivre les ventes par personne.</p>
              <button onClick={() => setView('add')} className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-3 rounded-xl font-semibold hover:bg-emerald-700 transition-colors text-sm">
                <Plus className="w-4 h-4" />
                Creer le premier profil
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {sellers.map(seller => (
                <div key={seller.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                  <div className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <span className="font-bold text-lg text-gray-500">{seller.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{seller.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">PIN: ••••</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleSwitchInit(seller)} className="flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-green-100 transition-colors">
                        <Check className="w-3.5 h-3.5" />
                        Activer
                      </button>
                      {deleteConfirmId === seller.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => setDeleteConfirmId(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                            <X className="w-4 h-4 text-gray-400" />
                          </button>
                          <button onClick={() => handleDeleteSeller(seller.id)} className="p-2 hover:bg-red-100 rounded-full transition-colors">
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirmId(seller.id)} className="p-2 hover:bg-red-50 rounded-full transition-colors group">
                          <Trash2 className="w-4 h-4 text-gray-300 group-hover:text-red-400 transition-colors" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2.5">
              <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                <Shield className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Permissions vendeurs</h3>
                <p className="text-xs text-gray-400">Ce que les vendeurs peuvent voir</p>
              </div>
            </div>
            <div className="px-4 divide-y divide-gray-50">
              <Toggle
                enabled={permissions.showDailyTotal}
                onChange={v => updatePermission({ showDailyTotal: v })}
                label="Afficher le total des ventes du jour"
                description="Le vendeur voit son CA journalier"
              />
              <Toggle
                enabled={permissions.showTransactionHistory}
                onChange={v => updatePermission({ showTransactionHistory: v })}
                label="Afficher l'historique des transactions"
                description="Les 5 dernieres ventes du vendeur"
              />
              <Toggle
                enabled={permissions.allowManualProductAdd}
                onChange={v => updatePermission({ allowManualProductAdd: v })}
                label="Autoriser l'ajout manuel de produits"
                description="Ajouter un nouveau medicament au stock"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2.5">
              <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                <Timer className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Deconnexion automatique</h3>
                <p className="text-xs text-gray-400">Verrouillage apres inactivite</p>
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="relative">
                <button
                  onClick={() => setShowAutoLogoutPicker(!showAutoLogoutPicker)}
                  className="w-full flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-100 transition-colors"
                >
                  <span>
                    {AUTO_LOGOUT_OPTIONS.find(o => o.value === permissions.autoLogoutMinutes)?.label ?? `${permissions.autoLogoutMinutes} minutes`}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showAutoLogoutPicker ? 'rotate-180' : ''}`} />
                </button>
                {showAutoLogoutPicker && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10">
                    {AUTO_LOGOUT_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { updatePermission({ autoLogoutMinutes: opt.value }); setShowAutoLogoutPicker(false); }}
                        className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${permissions.autoLogoutMinutes === opt.value ? 'text-green-700 font-semibold' : 'text-gray-700'}`}
                      >
                        {opt.label}
                        {permissions.autoLogoutMinutes === opt.value && <Check className="w-4 h-4 text-emerald-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {permissions.autoLogoutMinutes > 0 && (
                <p className="text-xs text-gray-400 mt-2">
                  La session vendeur se ferme apres {permissions.autoLogoutMinutes} min d'inactivite
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => { setNewManagerPin(''); setConfirmManagerPin(''); setManagerPinStep('new'); setManagerPinError(''); setView('manager-pin'); }}
              className="w-full flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:bg-gray-50 transition-colors text-left"
            >
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <KeyRound className="w-5 h-5 text-slate-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">Code Manager</p>
                <p className="text-xs text-gray-400 mt-0.5">Code actuel: {managerPin.replace(/./g, '•')}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
