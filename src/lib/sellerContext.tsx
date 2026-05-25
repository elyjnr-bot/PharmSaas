import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { getSellerPermissions } from './permissions';

const MANAGER_PIN_KEY = 'pharma_manager_pin';
const DEFAULT_MANAGER_PIN = '0000';

export function getManagerPin(): string {
  return localStorage.getItem(MANAGER_PIN_KEY) || DEFAULT_MANAGER_PIN;
}

export function setManagerPin(pin: string): void {
  localStorage.setItem(MANAGER_PIN_KEY, pin);
}

export interface ActiveSeller {
  id: string;
  name: string;
}

interface SellerContextValue {
  activeSeller: ActiveSeller | null;
  setActiveSeller: (seller: ActiveSeller | null) => void;
}

const SELLER_STORAGE_KEY = 'pharma_active_seller';

const SellerContext = createContext<SellerContextValue>({
  activeSeller: null,
  setActiveSeller: () => {},
});

export function SellerProvider({ children }: { children: ReactNode }) {
  const [activeSeller, setActiveSellerState] = useState<ActiveSeller | null>(() => {
    const stored = localStorage.getItem(SELLER_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  });

  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setActiveSeller = (seller: ActiveSeller | null) => {
    setActiveSellerState(seller);
    if (seller) {
      localStorage.setItem(SELLER_STORAGE_KEY, JSON.stringify(seller));
    } else {
      localStorage.removeItem(SELLER_STORAGE_KEY);
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem(SELLER_STORAGE_KEY);
    if (stored) {
      setActiveSellerState(JSON.parse(stored));
    }
  }, []);

  useEffect(() => {
    if (!activeSeller) {
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
      }
      return;
    }

    const perms = getSellerPermissions();
    const minutes = perms.autoLogoutMinutes;
    if (!minutes || minutes <= 0) return;

    const delay = minutes * 60 * 1000;

    const resetTimer = () => {
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = setTimeout(() => {
        setActiveSeller(null);
      }, delay);
    };

    const EVENTS = ['click', 'keydown', 'touchstart', 'mousemove', 'scroll'] as const;
    EVENTS.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      EVENTS.forEach(e => window.removeEventListener(e, resetTimer));
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, [activeSeller]);

  return (
    <SellerContext.Provider value={{ activeSeller, setActiveSeller }}>
      {children}
    </SellerContext.Provider>
  );
}

export function useSeller() {
  return useContext(SellerContext);
}
