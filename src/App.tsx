import React, { useState, useEffect, useRef } from 'react';
import Navigation from './components/Navigation';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import DesktopTopbar from './components/DesktopTopbar';
import Patients from './components/Patients';
import Ordonnances from './components/Ordonnances';
import Activite from './components/Activite';
import Settings from './components/Settings';
import ScanPage from './components/ScanPage';
import Equipe from './components/Equipe';
import Panier from './components/Panier';
import Carnet from './components/Carnet';
import ManagerLock from './components/ManagerLock';
import Login from './components/Login';
import SessionLockScreen from './components/SessionLockScreen';
import OfflineIndicator from './components/OfflineIndicator';
import Dashboard from './components/Dashboard';
import Stock from './components/Stock';
import Sales from './components/Sales';
import Expirations from './components/Expirations';
import Commandes from './components/Commandes';
import Fournisseurs from './components/Fournisseurs';
import Rapports from './components/Rapports';
import Mouvements from './components/Mouvements';
import TopVentes from './components/TopVentes';
import OnboardingWizard from './components/OnboardingWizard';
import TourHost from './components/TourHost';
import { initOfflineMode } from './lib/offlineStorage';
import { useGlobalBarcodeScanner } from './lib/useGlobalBarcodeScanner';
import { AuthProvider, useAuth } from './lib/auth';
import { SellerProvider, useSeller, setManagerPin, hasManagerPin } from './lib/sellerContext';

// PIN gérant scopé par compte (cf. sellerContext) : un nouveau compte n'hérite
// jamais du PIN d'un compte précédent sur le même appareil.
function hasPinConfigured(): boolean { return hasManagerPin(); }
import { CartProvider } from './lib/cartContext';
import { WorkflowProvider } from './lib/workflowContext';
import { ThemeProvider, useTheme } from './lib/themeContext';
import { useResponsive } from './lib/useResponsive';
import { X, Lock, KeyRound, ShieldCheck } from 'lucide-react';
import CommandPalette from './components/CommandPalette';

// ── Écran création PIN obligatoire (première connexion) ───────────────────────
function FirstTimePinSetup({ onDone }: { onDone: () => void }) {
  const [step,  setStep]  = React.useState<'create' | 'confirm'>('create');
  const [pin1,  setPin1]  = React.useState('');
  const [pin2,  setPin2]  = React.useState('');
  const [error, setError] = React.useState('');
  const [shake, setShake] = React.useState(false);
  const [done,  setDone]  = React.useState(false);

  const current = step === 'create' ? pin1 : pin2;
  const setter  = step === 'create' ? setPin1 : setPin2;
  const KEYS    = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  // ── Garde-fou : si l'écran "Code créé !" reste affiché > 3s sans transition,
  //    on force le déblocage pour éviter tout risque de blocage utilisateur.
  React.useEffect(() => {
    if (!done) return;
    const failsafe = setTimeout(() => {
      onDone();
    }, 3000);
    return () => clearTimeout(failsafe);
  }, [done, onDone]);

  const handleDigit = (d: string) => {
    if (d === '⌫') { setter(p => p.slice(0,-1)); setError(''); return; }
    if (current.length >= 4) return;
    const next = current + d;
    setter(next); setError('');
    if (next.length === 4) {
      setTimeout(() => {
        if (step === 'create') {
          setStep('confirm');
        } else {
          if (next === pin1) {
            setManagerPin(pin1);
            setDone(true);
            setTimeout(() => onDone(), 1200);
          } else {
            setShake(true);
            setError('Les codes ne correspondent pas');
            setPin2('');
            setTimeout(() => setShake(false), 500);
          }
        }
      }, 120);
    }
  };

  if (done) {
    return (
      <div style={{ minHeight: '100svh', background: 'linear-gradient(150deg,#0a5240 0%,#064e3b 45%,#065f46 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', color: '#fff', animation: 'fadeUp 0.4s ease' }}>
          <div style={{ width: 80, height: 80, borderRadius: 99, background: 'rgba(52,211,153,0.2)', border: '2px solid rgba(52,211,153,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <ShieldCheck style={{ width: 36, height: 36, color: '#34d399' }} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.03em' }}>Code créé !</h2>
          <p style={{ fontSize: 14, color: 'rgba(167,243,208,0.7)', margin: 0 }}>Accès à JunglePharm en cours…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100svh', background: 'linear-gradient(150deg,#0a5240 0%,#064e3b 45%,#065f46 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }
      `}</style>

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 32, animation: 'fadeUp 0.4s ease' }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <KeyRound style={{ width: 28, height: 28, color: '#34d399' }} />
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
          Créer votre code Gérant
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'rgba(167,243,208,0.7)', lineHeight: 1.5, maxWidth: 280 }}>
          {step === 'create'
            ? 'Ce code protège l\'accès aux données sensibles de votre pharmacie.'
            : 'Confirmez le code pour l\'activer.'}
        </p>
      </div>

      {/* Card */}
      <div style={{ width: '100%', maxWidth: 360, background: 'rgba(255,255,255,0.97)', borderRadius: 24, padding: '28px 24px', boxShadow: '0 28px 72px rgba(0,0,0,0.3)', animation: shake ? 'shake 0.4s ease' : 'fadeUp 0.4s ease 0.1s both' }}>

        {/* Points */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 20 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width: 56, height: 56, borderRadius: 14,
              border: `2.5px solid ${error ? '#dc2626' : current.length > i ? '#10785a' : 'rgba(0,0,0,0.12)'}`,
              background: error ? 'rgba(220,38,38,0.05)' : current.length > i ? 'rgba(16,120,90,0.08)' : '#f9fafb',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, color: '#10785a', fontWeight: 800,
              transition: 'all 0.12s',
              transform: current.length > i ? 'scale(1.04)' : 'scale(1)',
            }}>
              {current.length > i ? '•' : ''}
            </div>
          ))}
        </div>

        {error && <p style={{ fontSize: 12.5, color: '#dc2626', textAlign: 'center', margin: '-4px 0 14px', fontWeight: 600 }}>{error}</p>}

        {/* Pavé numérique */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {KEYS.map((d, i) => (
            <button key={i} onClick={() => d ? handleDigit(d) : undefined} disabled={!d}
              style={{
                height: 58, borderRadius: 14, border: 'none',
                cursor: d ? 'pointer' : 'default',
                background: d === '⌫' ? 'rgba(0,0,0,0.05)' : d ? '#f3f4f6' : 'transparent',
                fontSize: d === '⌫' ? 20 : 22, fontWeight: 600, color: '#1f2937',
                visibility: d ? 'visible' : 'hidden',
                boxShadow: d && d !== '⌫' ? '0 1px 3px rgba(0,0,0,0.07)' : 'none',
                transition: 'transform 0.08s',
              }}
              onMouseDown={e => d && ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.93)')}
              onMouseUp={e => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)')}
            >{d}</button>
          ))}
        </div>

        {/* Indicateur étapes */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 18 }}>
          {(['create','confirm'] as const).map(s => (
            <div key={s} style={{ width: 28, height: 4, borderRadius: 99, background: step === s ? '#10785a' : '#e5e7eb', transition: 'background 0.2s' }} />
          ))}
        </div>

        {step === 'confirm' && (
          <button type="button" onClick={() => { setStep('create'); setPin1(''); setPin2(''); setError(''); }}
            style={{ display: 'block', margin: '12px auto 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: '#9ca3af' }}>
            ← Recommencer depuis le début
          </button>
        )}
      </div>

      <p style={{ marginTop: 20, fontSize: 12, color: 'rgba(167,243,208,0.4)', textAlign: 'center' }}>
        Ce code ne pourra pas être récupéré — notez-le en lieu sûr
      </p>
    </div>
  );
}

function StaffActiviteBlocked() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ background: 'rgba(15,23,42,0.06)' }}
      >
        <Lock className="w-7 h-7 text-ios-secondary" strokeWidth={1.5} />
      </div>
      <h2 className="text-[16px] font-bold text-ios-text mb-1">Acces reserve</h2>
      <p className="text-[13px] text-ios-secondary max-w-[240px] leading-relaxed">
        L'onglet Activite est reserve au compte Manager.
      </p>
    </div>
  );
}

function AppContent() {
  const { user, loading, isManager, profile } = useAuth();
  const { activeSeller, setActiveSeller } = useSeller();
  const { theme } = useTheme();
  const { isDesktop } = useResponsive();

  // ── Global HID barcode scanner (USB / Bluetooth) ──────────────────────────
  // Dispatches 'barcode-scanned' CustomEvent — Sales/Stock listen and react.
  useGlobalBarcodeScanner();
  // ── Session lock screen (Option C — vendor PIN) ───────────────────────────
  // sessionStarted = true means the user has already chosen their session
  // in this browser tab (stored in sessionStorage → cleared on tab close).
  const [sessionStarted, setSessionStarted] = useState<boolean>(() => {
    if (sessionStorage.getItem('jp_session_ok') === '1') return true;
    // No session screen needed when no vendors are configured yet
    try {
      const cached = JSON.parse(localStorage.getItem('pharma_sellers_cache') || '[]');
      return cached.length === 0;
    } catch { return true; }
  });

  // Atterrissage par défaut sur Aperçu (dashboard) — c'est ce qu'un pharmacien
  // veut voir le matin (CA d'hier, ruptures, alertes), pas la liste patients.
  // ⚠️ Doit correspondre à un `case` de renderContent (sinon → default → Patients).
  const [activeTab, setActiveTab] = useState('dashboard');

  // ── PIN configuration state (force re-render après création) ────────────────
  // Sans ce state, après la création du PIN dans <FirstTimePinSetup/>, le
  // composant parent ne re-render pas → l'app reste bloquée sur "Code créé !"
  const [pinReady, setPinReady] = useState<boolean>(() => hasPinConfigured());

  // Re-synchroniser pinReady à chaque changement d'utilisateur
  // (login d'un autre compte → vérifier si le PIN existe déjà sur l'appareil)
  useEffect(() => {
    if (user) setPinReady(hasPinConfigured());
  }, [user?.id]);

  // ── PIN Manager : déverrouillage global avec durée configurable ──────────────
  const PIN_UNLOCK_DURATION_KEY = 'pin_unlock_duration'; // 0=session, sinon minutes

  const [managerUnlockedAt, setManagerUnlockedAt] = useState<number | null>(() => {
    const stored = sessionStorage.getItem('jp_manager_unlocked_at');
    return stored ? parseInt(stored) : null;
  });

  /** Vérifie si le manager est encore déverrouillé selon la durée configurée */
  const isManagerUnlocked = (): boolean => {
    if (!managerUnlockedAt) return false;
    const durationMin = parseInt(localStorage.getItem(PIN_UNLOCK_DURATION_KEY) || '0');
    if (durationMin === 0) return true; // Session complète (tant que l'onglet est ouvert)
    return Date.now() < managerUnlockedAt + durationMin * 60 * 1000;
  };

  /** Déverrouille toutes les sections protégées d'un coup */
  const unlockManager = () => {
    const now = Date.now();
    setManagerUnlockedAt(now);
    sessionStorage.setItem('jp_manager_unlocked_at', now.toString());
  };

  // Supprimé : anciens états individuels remplacés par isManagerUnlocked()
  const [pendingOrderSupplier, setPendingOrderSupplier] = useState<string | undefined>(undefined);
  const [showScanner, setShowScanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hideNavigation, setHideNavigation] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const initialTabSet = useRef(false);

  useEffect(() => {
    initOfflineMode();
  }, []);

  useEffect(() => {
    // ⚠️ Ne RIEN faire tant que l'auth n'est pas résolue. Au rechargement de la
    // page, `user` est momentanément null (le temps que getSession() réponde) :
    // si on réinitialisait ici, on effacerait `jp_session_ok` et on rebasculerait
    // sur l'écran « Qui commence la session ? » à chaque refresh (= fausse
    // déconnexion). On attend donc la fin du chargement.
    if (loading) return;

    if (!user) {
      setActiveSeller(null);
      // Reset session lock screen on full logout (vraie déconnexion, auth résolue)
      setSessionStarted(false);
      sessionStorage.removeItem('jp_session_ok');
      initialTabSet.current = false;
      setShowSettings(false);
      setShowScanner(false);
      return;
    }

    // For manager accounts: activeSeller is managed by SessionLockScreen (Option C).
    // For legacy staff Supabase accounts: auto-populate from profile.
    if (!isManager && profile) {
      const displayName = profile.full_name || profile.email.split('@')[0];
      setActiveSeller({ id: profile.id, name: displayName });
    }
  }, [isManager, profile, user, loading, setActiveSeller]);

  // Le verrouillage est maintenant basé sur le timestamp + durée configurée
  // (plus de reset automatique à chaque changement d'onglet)

  useEffect(() => {
    if (!loading && !initialTabSet.current && user && profile) {
      initialTabSet.current = true;
      setShowSettings(false);
      setShowScanner(false);
      setActiveTab('dashboard');

      // ── Onboarding : afficher le wizard à la PREMIÈRE connexion ─────────────
      // Le flag est lié à l'user_id (pas à l'appareil) pour que chaque nouveau
      // pharmacien ait son tutoriel, même s'il utilise un appareil déjà utilisé
      // par un autre compte.
      const onboardingKey = `jp_onboarding_done_${user.id}`;
      if (isManager && localStorage.getItem(onboardingKey) !== 'true') {
        setTimeout(() => setShowOnboarding(true), 800);
      }
    }
  }, [isManager, loading, user, profile]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  // Permet aux sous-composants (Ordonnances, etc.) de naviguer entre onglets
  useEffect(() => {
    const handler = (e: Event) => {
      const { tab } = (e as CustomEvent<{ tab: string }>).detail;
      handleTabChange(tab);
    };
    window.addEventListener('navigate-to-tab', handler);
    return () => window.removeEventListener('navigate-to-tab', handler);
  }, [isManager, activeTab]);

  // ── Raccourcis clavier desktop ────────────────────────────────────────────
  useEffect(() => {
    if (!isDesktop || !user) return;

    const handler = (e: KeyboardEvent) => {
      // Ignorer si focus dans un input / textarea / select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Ignorer si modificateur (sauf ⌘K)
      if (e.altKey || e.shiftKey) return;

      // ⌘K — palette de commande
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowPalette(p => !p);
        return;
      }

      if (e.metaKey || e.ctrlKey) return;

      switch (e.key.toLowerCase()) {
        case 'd': handleTabChange('dashboard'); break;
        case 'p': handleTabChange('sales'); break;
        case 'i': handleTabChange('stock'); break;
        case 'a': handleTabChange('patients'); break;
        case 'r': handleTabChange('ordonnances'); break;
        case 'c': handleTabChange('carnet'); break;
        case 'e': handleTabChange('equipe'); break;
        case 'x': handleTabChange('expirations'); break;
        case 'm': handleTabChange('mouvements'); break;
        case 'o': handleTabChange('commandes'); break;
        case 'g': handleTabChange('rapports'); break;
        case 'f': handleTabChange('fournisseurs'); break;
        case ',': setShowSettings(true); break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isDesktop, user, isManager, activeTab]);

  const renderContent = () => {
    switch (activeTab) {
      // ── Aperçu / Activité : protégé par PIN Manager ──────────────────────────
      case 'dashboard':
      case 'activite':
        if (!isManagerUnlocked()) {
          return <ManagerLock onUnlock={unlockManager} />;
        }
        return (
          <div className="flex flex-col gap-6">
            <Dashboard />
            <Activite embedded onHideNavigationChange={setHideNavigation} />
          </div>
        );
      case 'stock':
        return <Stock onNavigateToSales={() => handleTabChange('sales')} />;
      case 'sales':
        return <Sales />;
      case 'patients':
        return <Patients />;
      case 'ordonnances':
        return <Ordonnances />;
      case 'panier':
        return <Panier />;
      case 'carnet':
        return <Carnet />;
      // ── Équipe : protégé par PIN Manager ────────────────────────────────────
      case 'equipe':
        if (!isManagerUnlocked()) {
          return <ManagerLock onUnlock={unlockManager} />;
        }
        return <Equipe />;
      case 'expirations':
        return <Expirations />;
      case 'mouvements':
        return <Mouvements />;
      case 'commandes':
        return <Commandes initialSupplier={pendingOrderSupplier} key={pendingOrderSupplier || 'commandes'} />;
      case 'topventes':
        return <TopVentes />;
      case 'ruptures':
        return <Stock initialFilter="__ruptures__" />;
      // ── Rapports : protégé par PIN Manager ──────────────────────────────────
      case 'rapports':
        if (!isManagerUnlocked()) {
          return <ManagerLock onUnlock={unlockManager} />;
        }
        return <Rapports />;
      // ── Fournisseurs : protégé par PIN Manager ───────────────────────────────
      case 'fournisseurs':
        if (!isManagerUnlocked()) {
          return <ManagerLock onUnlock={unlockManager} />;
        }
        return <Fournisseurs onOrderSupplier={(name) => {
          setPendingOrderSupplier(name);
          handleTabChange('commandes');
          // Reset après navigation pour éviter de ré-ouvrir le modal au retour
          setTimeout(() => setPendingOrderSupplier(undefined), 500);
        }} />;
      default:
        return <Patients />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-ios-bg flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-5 animate-pulse">
            <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
              <path d="M16 1L29.856 8.5V23.5L16 31L2.144 23.5V8.5L16 1Z" fill="#059669" />
              <path d="M16 8C16 8 12 14 12 18C12 20.2 13.8 22 16 22C18.2 22 20 20.2 20 18C20 14 16 8 16 8Z" fill="white" stroke="white" strokeWidth="0.5" strokeLinejoin="round" />
              <line x1="16" y1="22" x2="16" y2="25" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
          <h2 style={{ fontSize: '17px', letterSpacing: '-0.03em' }}>
            <span className="font-extrabold text-ios-text">Jungle</span>
            <span className="font-extrabold text-emerald-600">Pharm</span>
          </h2>
          <p className="text-[13px] text-ios-secondary mt-1.5 font-medium">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // ── Première connexion : création obligatoire du PIN Manager ─────────────
  // Si aucun PIN n'a encore été configuré, on force sa création avant tout accès.
  if (!pinReady) {
    return <FirstTimePinSetup onDone={() => setPinReady(true)} />;
  }

  // ── Session lock screen: shown once per tab after login ───────────────────
  if (!sessionStarted) {
    return (
      <SessionLockScreen
        onManagerAccess={() => {
          setActiveSeller(null);
          sessionStorage.setItem('jp_session_ok', '1');
          setSessionStarted(true);
        }}
        onVendorAccess={(seller) => {
          setActiveSeller(seller);
          sessionStorage.setItem('jp_session_ok', '1');
          setSessionStarted(true);
        }}
      />
    );
  }

  return (
    <div className="app-shell bg-ios-bg flex flex-col">
      {isDesktop ? (
        <>
          <Sidebar
            activeView={activeTab}
            onNavigate={handleTabChange}
            onSettingsClick={() => setShowSettings(true)}
            isManager={isManager}
          />
          {showPalette && (
            <CommandPalette
              onClose={() => setShowPalette(false)}
              onNavigate={handleTabChange}
              isManager={isManager}
            />
          )}

          <div
            style={{
              marginLeft: 244,
              height: '100vh',
              display: 'flex',
              flexDirection: 'column',
              background: theme.bg,
              transition: 'background 0.4s ease',
            }}
          >
            <DesktopTopbar
              activeTab={activeTab}
              onNewSale={() => handleTabChange('sales')}
            />
            {/* Vues plein-écran (deux panneaux, pas de scroll externe) */}
            {['ordonnances', 'patients', 'carnet'].includes(activeTab) ? (
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {renderContent()}
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto' }} className="smooth-scroll scrollbar-thin">
                <div style={{ padding: '16px 16px', maxWidth: 1600, margin: '0 auto' }}>
                  {renderContent()}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <Header onSettingsClick={() => setShowSettings(true)} />
          {activeTab === 'panier' ? (
            <div className="flex-1 flex flex-col overflow-hidden" style={{ paddingTop: '64px', paddingBottom: '72px' }}>
              {renderContent()}
            </div>
          ) : (
            <div
              id="main-scroll-container"
              className="flex-1 overflow-y-auto smooth-scroll"
              style={{
                paddingTop: '64px',
                paddingBottom: '96px',
                WebkitOverflowScrolling: 'touch',
                overscrollBehaviorY: 'contain',
                willChange: 'scroll-position'
              }}
            >
              <div key={activeTab} className="animate-tab-enter">
                {renderContent()}
              </div>
            </div>
          )}
          <Navigation
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onScanClick={() => setShowScanner(true)}
            isManager={isManager}
            hidden={hideNavigation}
          />
        </>
      )}

      {showScanner && (
        <div className="fixed inset-0 z-[100] bg-ios-bg">
          <div
            className="px-4 safe-area-top flex items-center justify-between bg-white"
            style={{ borderBottom: '1px solid #e2e8f0', height: '56px' }}
          >
            <h1 className="text-[16px] font-bold text-ios-text" style={{ letterSpacing: '-0.02em' }}>Scanner</h1>
            <button
              onClick={() => setShowScanner(false)}
              className="w-8 h-8 bg-ios-bg rounded-full flex items-center justify-center active:scale-[0.96] transition-all duration-150 border border-ios-border"
            >
              <X className="w-4 h-4 text-ios-secondary" strokeWidth={2} />
            </button>
          </div>
          <div className="h-full overflow-y-auto pb-safe">
            <ScanPage />
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-ios-bg">
          <div
            className="px-4 safe-area-top flex items-center justify-between bg-white"
            style={{ borderBottom: '1px solid #e2e8f0', height: '56px' }}
          >
            <h1 className="text-[16px] font-bold text-ios-text" style={{ letterSpacing: '-0.02em' }}>Reglages</h1>
            <button
              onClick={() => setShowSettings(false)}
              className="w-8 h-8 bg-ios-bg rounded-full flex items-center justify-center active:scale-[0.96] transition-all duration-150 border border-ios-border"
            >
              <X className="w-4 h-4 text-ios-secondary" strokeWidth={2} />
            </button>
          </div>
          <div className="h-full overflow-y-auto pb-safe">
            <Settings />
          </div>
        </div>
      )}

      {/* Onboarding wizard — premier démarrage / stock vide */}
      {showOnboarding && (
        <OnboardingWizard
          onDismiss={() => setShowOnboarding(false)}
          onNavigate={(tab) => { setShowOnboarding(false); handleTabChange(tab); }}
        />
      )}

      {/* Guides interactifs par onglet (un seul actif à la fois) — désactivés
          tant qu'une surcouche est ouverte pour ne pas se superposer. */}
      <TourHost
        activeTab={activeTab}
        userId={user?.id ?? null}
        enabled={!showOnboarding && !showSettings && !showScanner && !!user && pinReady}
      />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SellerProvider>
          <CartProvider>
            <WorkflowProvider>
              <AppContent />
            </WorkflowProvider>
          </CartProvider>
        </SellerProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
