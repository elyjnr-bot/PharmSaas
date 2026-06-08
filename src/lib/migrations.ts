/**
 * migrations.ts — Auto-migrations silencieuses au démarrage de l'app
 * ─────────────────────────────────────────────────────────────────────────────
 * Exécutées une seule fois par version, avant le rendu de React.
 * Objectif : réparer automatiquement les états corrompus de localStorage
 * provoqués par d'anciennes versions buguées de l'app.
 *
 * Le client n'a rien à faire — tout est transparent.
 */

const MIGRATION_VERSION_KEY = 'jp_migrations_done';
const CURRENT_VERSION = '2026-06-08-v1';

interface MigrationsState {
  version: string;
  ranAt: string;
}

function getMigrationState(): MigrationsState | null {
  try {
    const raw = localStorage.getItem(MIGRATION_VERSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setMigrationState(state: MigrationsState) {
  try { localStorage.setItem(MIGRATION_VERSION_KEY, JSON.stringify(state)); } catch {}
}

/**
 * Détecte et nettoie les états corrompus.
 * Returns true si une migration a été appliquée.
 */
function detectAndFixCorruption(): { fixed: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // ── Corruption #1 : flag onboarding global obsolète ─────────────────────
  // Les anciennes versions stockaient `jp_onboarding_done` globalement, ce qui
  // empêchait les nouveaux comptes de voir l'onboarding. On le retire pour
  // forcer la nouvelle logique par user_id.
  if (localStorage.getItem('jp_onboarding_done') === 'true') {
    localStorage.removeItem('jp_onboarding_done');
    reasons.push('flag onboarding global retiré (nouvelle logique par user)');
  }

  // ── Corruption #2 : ACTIVE_USER_KEY orpheline ───────────────────────────
  // Si l'app a fait un signOut récent, le tracker user_id peut rester
  // alors qu'aucune session n'est active. Pas critique, on laisse tel quel
  // (sera réécrit au prochain login).

  // ── Corruption #3 : sessionStorage avec session_ok pour ancien utilisateur ──
  // Si le user a fermé l'app sans déconnexion propre, la session lock peut
  // rester active. On la nettoie au démarrage pour forcer une re-vérification.
  // (Note : sessionStorage est en principe effacé à la fermeture d'onglet,
  // mais certains navigateurs le restaurent)
  try {
    sessionStorage.removeItem('fond_caisse_prompted');
  } catch {}

  // ── Corruption #5 : PIN gérant « device-wide » (legacy) ─────────────────
  // Le PIN était stocké au niveau de l'appareil (`pharma_manager_pin`), si bien
  // qu'un NOUVEAU compte héritait du PIN d'un compte précédent (et n'avait pas
  // l'écran de création). Le PIN est désormais scopé par compte
  // (`pharma_manager_pin_<userId>`). On supprime l'ancienne clé partagée pour
  // qu'aucun compte n'en hérite — chaque compte (re)crée son PIN une fois.
  if (localStorage.getItem('pharma_manager_pin') !== null) {
    localStorage.removeItem('pharma_manager_pin');
    reasons.push('PIN gérant device-wide retiré (désormais scopé par compte)');
  }

  // ── Corruption #4 : préférences mal sérialisées (JSON invalide) ─────────
  const jsonKeys = [
    'pharma_sellers_cache',
    'pharma_seller_permissions',
    'pharma_user_settings',
    'jp_dci_learning_v1',
  ];
  for (const key of jsonKeys) {
    const v = localStorage.getItem(key);
    if (v !== null && v !== '' && v !== 'null') {
      try { JSON.parse(v); }
      catch {
        localStorage.removeItem(key);
        reasons.push(`clé corrompue retirée : ${key}`);
      }
    }
  }

  return { fixed: reasons.length > 0, reasons };
}

/**
 * Point d'entrée — à appeler depuis main.tsx AVANT le rendu React.
 */
export function runStartupMigrations(): void {
  const state = getMigrationState();

  // Déjà à jour ? Rien à faire (mode normal).
  if (state?.version === CURRENT_VERSION) return;

  try {
    const result = detectAndFixCorruption();
    setMigrationState({ version: CURRENT_VERSION, ranAt: new Date().toISOString() });

    if (result.fixed && import.meta.env.DEV) {
      console.info('[jp-migrations] Auto-réparation effectuée :', result.reasons);
    }
  } catch (e) {
    console.error('[jp-migrations] Erreur:', e);
  }
}
