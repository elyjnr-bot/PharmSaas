import { useState, useEffect, useRef } from 'react';
import Navigation from './components/Navigation';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import DesktopTopbar from './components/DesktopTopbar';
import Gestion from './components/Gestion';
import Activite from './components/Activite';
import Settings from './components/Settings';
import ScanPage from './components/ScanPage';
import Equipe from './components/Equipe';
import Panier from './components/Panier';
import Carnet from './components/Carnet';
import ManagerLock from './components/ManagerLock';
import Login from './components/Login';
import OfflineIndicator from './components/OfflineIndicator';
import Dashboard from './components/Dashboard';
import Stock from './components/Stock';
import Sales from './components/Sales';
import { initOfflineMode } from './lib/offlineStorage';
import { AuthProvider, useAuth } from './lib/auth';
import { SellerProvider, useSeller } from './lib/sellerContext';
import { CartProvider } from './lib/cartContext';
import { WorkflowProvider } from './lib/workflowContext';
import { useResponsive } from './lib/useResponsive';
import { X, Lock } from 'lucide-react';

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
  const { isDesktop } = useResponsive();
  const [activeTab, setActiveTab] = useState('gestion');
  const [activiteUnlocked, setActiviteUnlocked] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hideNavigation, setHideNavigation] = useState(false);
  const initialTabSet = useRef(false);

  useEffect(() => {
    initOfflineMode();
  }, []);

  useEffect(() => {
    if (!user) {
      setActiveSeller(null);
      initialTabSet.current = false;
      setShowSettings(false);
      setShowScanner(false);
      return;
    }

    if (!isManager && profile) {
      const displayName = profile.full_name || profile.email.split('@')[0];
      setActiveSeller({ id: profile.id, name: displayName });
    }
  }, [isManager, profile, user, setActiveSeller]);

  useEffect(() => {
    setActiviteUnlocked(false);
  }, [activeSeller, activeTab]);

  useEffect(() => {
    if (!loading && !initialTabSet.current && user && profile) {
      initialTabSet.current = true;
      setShowSettings(false);
      setShowScanner(false);
      setActiveTab('gestion');
    }
  }, [isManager, loading, user, profile]);

  const handleTabChange = (tab: string) => {
    if (!isManager && (tab === 'dashboard' || tab === 'activite')) return;
    if (tab !== activeTab) setActiviteUnlocked(false);
    setActiveTab(tab);
  };

  const renderContent = () => {
    switch (activeTab) {
      // Aperçu = tableau de bord + activité fusionnés (un seul onglet).
      // Gating identique à l'ancien onglet Activité (contient les financiers + opérations).
      case 'dashboard':
      case 'activite':
        if (!isManager) return <StaffActiviteBlocked />;
        if (activeSeller && !activiteUnlocked) {
          return <ManagerLock onUnlock={() => setActiviteUnlocked(true)} />;
        }
        return (
          <div className="flex flex-col gap-6">
            <Dashboard />
            <Activite embedded onHideNavigationChange={setHideNavigation} />
          </div>
        );
      case 'stock':
        return <Stock />;
      case 'sales':
        return <Sales />;
      case 'gestion':
        return <Gestion onHideNavigationChange={setHideNavigation} />;
      case 'panier':
        return <Panier />;
      case 'carnet':
        return <Carnet />;
      case 'equipe':
        return <Equipe />;
      default:
        return <Gestion onHideNavigationChange={setHideNavigation} />;
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
          <OfflineIndicator />
          <div
            style={{
              marginLeft: 244,
              height: '100vh',
              display: 'flex',
              flexDirection: 'column',
              background: [
                'radial-gradient(ellipse 65% 55% at 12% 8%, rgba(120,200,160,0.55), transparent 60%)',
                'radial-gradient(ellipse 50% 45% at 88% 15%, rgba(100,180,220,0.40), transparent 55%)',
                'radial-gradient(ellipse 45% 60% at 75% 85%, rgba(140,100,220,0.28), transparent 55%)',
                'radial-gradient(ellipse 55% 50% at 20% 90%, rgba(60,160,130,0.30), transparent 55%)',
                '#eef2ed',
              ].join(', '),
            }}
          >
            <DesktopTopbar activeTab={activeTab} onNewSale={() => handleTabChange('sales')} />
            <div style={{ flex: 1, overflowY: 'auto' }} className="smooth-scroll scrollbar-thin">
              <div style={{ padding: '24px 28px', maxWidth: 1600, margin: '0 auto' }}>
                {renderContent()}
              </div>
            </div>
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
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <SellerProvider>
        <CartProvider>
          <WorkflowProvider>
            <AppContent />
          </WorkflowProvider>
        </CartProvider>
      </SellerProvider>
    </AuthProvider>
  );
}

export default App;
