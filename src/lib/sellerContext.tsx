import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { getSellerPermissions } from './permissions';

// ════════════════════════════════════════════════════════════════════════════
//  PIN GÉRANT — SCOPÉ PAR COMPTE (user_id)
// ════════════════════════════════════════════════════════════════════════════
// ⚠️ Historiquement le PIN était stocké au niveau de l'APPAREIL
// (`pharma_manager_pin`), ce qui faisait qu'un nouveau compte héritait du PIN
// d'un compte précédent (et n'avait pas l'écran de création). On scope donc le
// PIN au compte connecté : `pharma_manager_pin_<userId>`.
//
// L'user_id courant est lu depuis `jp_active_user_id`, maintenu de façon
// synchrone par auth.tsx à chaque connexion / rechargement.
const MANAGER_PIN_KEY = 'pharma_manager_pin';        // legacy device-wide (ignoré)
const ACTIVE_USER_KEY = 'jp_active_user_id';
const DEFAULT_MANAGER_PIN = '0000';

function currentUserId(): string | null {
  try { return localStorage.getItem(ACTIVE_USER_KEY); } catch { return null; }
}

/** Clé du PIN scopée au compte connecté (fallback device si aucun user). */
function pinKey(): string {
  const uid = currentUserId();
  return uid ? `${MANAGER_PIN_KEY}_${uid}` : MANAGER_PIN_KEY;
}

/** Le compte actuellement connecté a-t-il déjà configuré un PIN gérant ? */
export function hasManagerPin(): boolean {
  return !!localStorage.getItem(pinKey());
}

export function getManagerPin(): string {
  return localStorage.getItem(pinKey()) || DEFAULT_MANAGER_PIN;
}

export function setManagerPin(pin: string): void {
  localStorage.setItem(pinKey(), pin);
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
