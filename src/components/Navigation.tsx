import { useState, useEffect, useRef } from 'react';
import { HeartPulse } from 'lucide-react';
import { useCart } from '../lib/cartContext';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onScanClick: () => void;
  isManager: boolean;
  hidden?: boolean;
}

function PulseIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 12 7 12 9 6 12 18 15 9 17 12 21 12" />
    </svg>
  );
}

function PatientIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7.5" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function BagIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 7V6a2 2 0 012-2h8a2 2 0 012 2v1" />
      <rect x="4" y="7" width="16" height="13" rx="2.5" />
      <path d="M9 7V5" />
      <path d="M15 7V5" />
      <line x1="14" y1="15" x2="17" y2="15" />
      <line x1="15.5" y1="13.5" x2="15.5" y2="16.5" />
    </svg>
  );
}

function LedgerIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20V4H6.5A2.5 2.5 0 004 6.5v13z" />
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <circle cx="14" cy="10" r="2" />
    </svg>
  );
}

function TeamIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="8" r="3" />
      <path d="M4 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2" />
      <path d="M20 19c0-2.2-1.3-4-3-4.5" />
    </svg>
  );
}

function RxIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h8a4 4 0 0 1 0 8H3M3 11l8 10M14 11l6 10M17 11l6-8" />
    </svg>
  );
}

function BuildingIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 21V9h6v12M3 9h18M9 6h.01M15 6h.01" />
    </svg>
  );
}

function LockIcon({ color }: { color: string }) {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function ScannerIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 012-2h2" />
      <path d="M17 3h2a2 2 0 012 2v2" />
      <path d="M21 17v2a2 2 0 01-2 2h-2" />
      <path d="M7 21H5a2 2 0 01-2-2v-2" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  );
}

export default function Navigation({ activeTab, onTabChange, onScanClick, isManager, hidden = false }: NavigationProps) {
  const { cartItemCount } = useCart();
  const [isNavVisible, setIsNavVisible] = useState(true);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const SCROLL_THRESHOLD = 10;
    const tabsWithHideBehavior = ['dashboard', 'patients', 'ordonnances', 'equipe', 'carnet'];
    const shouldHide = tabsWithHideBehavior.includes(activeTab);

    if (!shouldHide) {
      setIsNavVisible(true);
      return;
    }

    const scrollContainer = document.getElementById('main-scroll-container');
    if (!scrollContainer) {
      setIsNavVisible(true);
      return;
    }

    const handleScroll = () => {
      if (!ticking.current) {
        window.requestAnimationFrame(() => {
          const currentScrollY = scrollContainer.scrollTop;
          const scrollDiff = currentScrollY - lastScrollY.current;

          if (Math.abs(scrollDiff) > SCROLL_THRESHOLD) {
            if (scrollDiff > 0 && currentScrollY > 20) {
              setIsNavVisible(false);
            } else if (scrollDiff < 0) {
              setIsNavVisible(true);
            }
          }

          lastScrollY.current = currentScrollY;
          ticking.current = false;
        });
        ticking.current = true;
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
  }, [activeTab]);

  const iconMap: Record<string, (color: string) => JSX.Element> = {
    dashboard:    (c) => <HeartPulse color={c} strokeWidth={1.5} size={22} />,
    patients:     (c) => <PatientIcon color={c} />,
    ordonnances:  (c) => <RxIcon color={c} />,
    panier:       (c) => <BagIcon color={c} />,
    carnet:       (c) => <LedgerIcon color={c} />,
    equipe:       (c) => <TeamIcon color={c} />,
    fournisseurs: (c) => <BuildingIcon color={c} />,
  };

  const tabs = [
    { id: 'dashboard',    label: 'APERÇU',        managerOnly: true  },
    { id: 'patients',     label: 'PATIENTS',      managerOnly: false },
    { id: 'ordonnances',  label: 'ORDONNANCES',   managerOnly: false },
    { id: 'panier',       label: 'PANIER',        managerOnly: false, badge: cartItemCount },
    { id: 'carnet',       label: 'CRÉDITS',       managerOnly: false },
    { id: 'fournisseurs', label: 'FOURNISSEURS',  managerOnly: true  },
  ];

  if (hidden) return null;

  return (
    <>
      <button
        onClick={onScanClick}
        className="fixed flex items-center justify-center active:scale-[0.93] transition-all hover:shadow-lg"
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          bottom: '80px',
          right: '16px',
          background: '#059669',
          boxShadow: '0 4px 20px rgba(5, 150, 105, 0.35), 0 2px 8px rgba(0,0,0,0.1)',
          transform: isNavVisible ? 'translateY(0)' : 'translateY(160px)',
          transition: 'transform 0.28s cubic-bezier(0.25, 0.1, 0.25, 1), box-shadow 0.2s ease',
          zIndex: 60,
        }}
        aria-label="Scanner un produit"
      >
        <ScannerIcon />
      </button>

      <nav
        className="fixed bottom-0 left-0 right-0 bg-white"
        style={{
          borderTop: '1px solid #e2e8f0',
          transform: isNavVisible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.28s cubic-bezier(0.25, 0.1, 0.25, 1)',
          zIndex: 50,
        }}
      >
        <div className="flex items-stretch safe-area-bottom" style={{ height: '64px' }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const isLocked = tab.managerOnly && !isManager;
            const color = isLocked ? '#cbd5e1' : isActive ? '#059669' : '#94a3b8';

            return (
              <button
                key={tab.id}
                onClick={isLocked ? undefined : () => onTabChange(tab.id)}
                disabled={isLocked}
                className="flex-1 flex flex-col items-center justify-center pt-2 pb-1 relative"
                style={{ gap: '3px' }}
              >
                <div className="relative">
                  {iconMap[tab.id](color)}
                  {isLocked && (
                    <div className="absolute -top-1 -right-1.5 w-3 h-3 rounded-full bg-white flex items-center justify-center">
                      <LockIcon color="#cbd5e1" />
                    </div>
                  )}
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <div
                      className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-orange-500 rounded-full flex items-center justify-center px-1"
                      style={{ boxShadow: '0 0 0 2px #ffffff' }}
                    >
                      <span className="text-[9px] font-bold text-white leading-none">{tab.badge > 99 ? '99+' : tab.badge}</span>
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: isActive ? 600 : 500,
                    letterSpacing: '0.04em',
                    color,
                  }}
                >
                  {tab.label}
                </span>
                {isActive && !isLocked && (
                  <div
                    className="absolute top-0 left-1/2"
                    style={{
                      width: '24px',
                      height: '3px',
                      borderRadius: '0 0 4px 4px',
                      background: '#059669',
                      transform: 'translateX(-50%)',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
