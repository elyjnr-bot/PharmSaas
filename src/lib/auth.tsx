import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface UserProfile {
  id: string;
  email: string;
  role: 'staff' | 'manager';
  full_name?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string, role?: 'manager' | 'staff', pharmacyName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  isManager: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ════════════════════════════════════════════════════════════════════════════
//  ISOLATION DES DONNÉES PAR UTILISATEUR (version SIMPLIFIÉE et FIABLE)
// ════════════════════════════════════════════════════════════════════════════
// La logique :
//  - On track l'ID de l'utilisateur actuellement actif dans localStorage
//  - SEULEMENT si un user DIFFÉRENT se connecte → on purge les caches de données
//  - JAMAIS au rechargement de page d'un même user, JAMAIS sans certitude
//
// Stratégie de sécurité :
//  - La RLS Supabase est l'ultime gardien (déjà active sur 24 tables)
//  - Le filtrage côté client (.eq('user_id', user.id)) est la 2e couche
//  - Cette purge est juste pour le confort UX (pas voir des données fantômes)
//
// Clés JAMAIS purgées (liées à l'appareil, pas au compte) :
//   - pharma_manager_pin     (PIN gérant)
//   - jp_theme_v1            (thème visuel)
//   - jp_active_user_id      (tracker — réécrit après)
//   - jp_sidebar_favs_v1     (favoris UI)

const ACTIVE_USER_KEY = 'jp_active_user_id';

// Clés DATA à purger lors d'un changement de user (préfixes ou clés exactes)
const DATA_PREFIXES_TO_PURGE = [
  'pharma_offline_',
  'pharma_sales_journal',
  'pharma_fond_caisse',
  'pharma_stupefiant',
  'pharma_active_seller',
  'pharma_sellers_cache',
  'pharma_user_settings_',
  'pharma_pharmacy_name',
  'jp_patients_cache',
  'jp_patients_migrated',
  'jp_dci_learning_v1',
  'jp_min_stock_',
  // ⚠️ NE PAS purger 'jp_onboarding_done*' : ce flag est scopé par user_id
  //   (jp_onboarding_done_<userId>) donc aucune fuite entre comptes. Le purger
  //   à la déconnexion faisait réapparaître l'onboarding à chaque reconnexion.
  'jungle_pharm_settings',
  'workflow_mode',
  'tax_rate',
  'ticket_width',
  'wholesalers',
  'pharma_seller_permissions',
];

function isDataKey(key: string): boolean {
  return DATA_PREFIXES_TO_PURGE.some(p => key === p || key.startsWith(p));
}

async function purgeUserDataCaches() {
  // localStorage : uniquement les clés de DONNÉES (pas le PIN, pas le thème)
  try {
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (isDataKey(k)) localStorage.removeItem(k);
    }
  } catch (e) { console.error('[auth] localStorage purge:', e); }

  // sessionStorage : session lock + manager unlock
  try {
    sessionStorage.removeItem('jp_session_ok');
    sessionStorage.removeItem('jp_manager_unlocked_until');
    sessionStorage.removeItem('fond_caisse_prompted');
  } catch {}

  // IndexedDB : produits + barcodes
  try {
    const { db } = await import('./db');
    await db.products.clear();
    if ((db as any).barcodeLinks) await (db as any).barcodeLinks.clear();
  } catch (e) { console.error('[auth] IndexedDB purge:', e); }
}

async function trackUserAndPurgeIfChanged(newUserId: string | null) {
  if (!newUserId) {
    // Pas d'user (déconnexion par exemple) → on garde l'ID en mémoire pour
    // détecter un changement au prochain login
    return;
  }
  const prevUserId = localStorage.getItem(ACTIVE_USER_KEY);

  // SEULE condition pour purger : un user DIFFÉRENT se connecte
  // (même user qui recharge la page → AUCUNE purge)
  if (prevUserId && prevUserId !== newUserId) {
    await purgeUserDataCaches();
  }

  // Toujours mettre à jour le tracker
  localStorage.setItem(ACTIVE_USER_KEY, newUserId);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const newUser = session?.user ?? null;
      // ⚠ IMPORTANT : await la purge AVANT de setUser pour éviter
      //   que des composants chargent des données du compte précédent.
      await trackUserAndPurgeIfChanged(newUser?.id ?? null);
      setUser(newUser);
      if (newUser) {
        loadProfile(newUser.id);
      } else {
        setLoading(false);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        const newUser = session?.user ?? null;
        await trackUserAndPurgeIfChanged(newUser?.id ?? null);
        setUser(newUser);
        if (newUser) {
          // ── Remet loading=true pendant le chargement du profil ──────────────
          // Sans ça, l'app reste bloquée sur l'écran de Login après signIn()
          // car user!=null mais profile==null → App.tsx attend les deux.
          setLoading(true);
          await loadProfile(newUser.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Auto-correction : si le profil dit 'staff' mais les metadata disent 'manager',
        // on met à jour silencieusement (anciens comptes créés avant la migration du trigger).
        const metaRole = (await supabase.auth.getUser()).data.user?.user_metadata?.role;
        const emailIsDemo = (await supabase.auth.getUser()).data.user?.email === 'manager@pharmacy.cg';
        if (data.role !== 'manager' && (metaRole === 'manager' || emailIsDemo)) {
          await supabase.from('user_profiles').update({ role: 'manager' }).eq('id', userId);
          setProfile({ ...data, role: 'manager' });
        } else {
          setProfile(data);
        }
      } else {
        // Profil absent (trigger pas encore exécuté) — on le crée à la volée
        // en lisant le rôle depuis les user_metadata de l'auth Supabase.
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const metaRole = authUser?.user_metadata?.role;
        const role = metaRole === 'manager' ? 'manager'
                   : authUser?.email === 'manager@pharmacy.cg' ? 'manager'
                   : 'staff';
        const { data: created } = await supabase
          .from('user_profiles')
          .upsert({
            id:        userId,
            email:     authUser?.email ?? '',
            full_name: authUser?.user_metadata?.full_name ?? authUser?.email ?? '',
            role,
          })
          .select()
          .maybeSingle();
        setProfile(created ?? null);
      }
    } catch (err) {
      console.error('Error loading profile:', err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (
    email: string,
    password: string,
    fullName?: string,
    role: 'manager' | 'staff' = 'manager',
    pharmacyName?: string,
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name:     fullName,
          role,
          pharmacy_name: pharmacyName || null,
        },
      },
    });
    if (error) throw error;

    // ── Si Supabase renvoie directement une session (confirmation email désactivée),
    //    on crée le profil immédiatement sans attendre l'email.
    if (data.session && data.user) {
      setLoading(true);
      await trackUserAndPurgeIfChanged(data.user.id);
      setUser(data.user);
      await loadProfile(data.user.id);

      // Sauvegarde le nom de la pharmacie si fourni
      if (pharmacyName?.trim()) {
        try {
          const { saveSettings } = await import('./settings');
          saveSettings({ pharmacy_name: pharmacyName.trim() });
          await supabase.from('user_settings').upsert(
            { user_id: data.user.id, pharmacy_name: pharmacyName.trim() },
            { onConflict: 'user_id' }
          );
        } catch { /* non critique */ }
      }
    }
    // Si data.session est null → confirmation email requise → Login.tsx affichera le message
  };

  const signOut = async () => {
    setUser(null);
    setProfile(null);
    // Purge UNIQUEMENT les caches de données (pas le PIN, pas le thème)
    // Le tracker user_id reste pour détecter un changement au prochain login.
    await purgeUserDataCaches();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  // Résolution du rôle : user_profiles > user_metadata > email heuristique
  // On consulte les 3 sources car l'ancien trigger mettait 'staff' par défaut
  // même pour les comptes manager (avant la migration du trigger).
  const isManager =
    profile?.role === 'manager' ||
    user?.user_metadata?.role === 'manager' ||
    user?.email === 'manager@pharmacy.cg';     // compte démo

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, isManager }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
