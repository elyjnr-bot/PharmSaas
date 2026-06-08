/**
 * TourHost.tsx — Orchestrateur global des guides interactifs
 * ─────────────────────────────────────────────────────────────────────────────
 * Monté une seule fois dans App. Rôles :
 *
 *  1. Déclenche automatiquement le guide d'un onglet à sa PREMIÈRE visite
 *     (flag scopé par utilisateur, non encore vu).
 *  2. Affiche un bouton flottant « ? » sur chaque onglet possédant un guide,
 *     pour le relancer manuellement à tout moment (même déjà vu).
 *  3. Diffuse « junglepharm:tour-step » pour que des composants (ex : Stock)
 *     révèlent des cibles normalement masquées pendant l'étape concernée.
 *
 * Rejouable aussi via « junglepharm:tour-recheck » (Réglages › Aide).
 */

import { useEffect, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import ProductTour, { hasTourBeenSeen } from './ProductTour';
import { getTourForTab, type TabTour } from '../lib/tourRegistry';

interface Props {
  activeTab: string;
  userId: string | null;
  /** Désactivé pendant onboarding / settings / scanner / lock. */
  enabled: boolean;
}

export default function TourHost({ activeTab, userId, enabled }: Props) {
  const [activeTour, setActiveTour] = useState<TabTour | null>(null);
  /** true = lancé manuellement (bouton « ? ») → on ignore le flag « déjà vu ». */
  const [forced, setForced] = useState(false);

  // ── Déclenchement automatique à la première visite ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    const evaluate = () => {
      setActiveTour(null);
      setForced(false);
      if (!enabled) return;
      const tour = getTourForTab(activeTab);
      if (!tour || hasTourBeenSeen(tour.tourId, userId)) return;

      // Sans ancre requise → on déclenche directement.
      if (!tour.requireSelector) { setActiveTour(tour); return; }

      // Avec ancre requise → on attend qu'elle soit montée (max ~2,5 s).
      // Cela évite d'afficher le guide au-dessus d'un écran de verrouillage
      // (Aperçu protégé par PIN) ou d'un inventaire encore vide.
      let attempts = 0;
      const poll = () => {
        if (cancelled) return;
        if (document.querySelector(tour.requireSelector!)) {
          setActiveTour(tour);
        } else if (attempts++ < 16) {
          pollTimer = setTimeout(poll, 150);
        }
        // sinon : ancre absente → on abandonne (réévalué au prochain onglet)
      };
      poll();
    };

    evaluate();
    // « Rejouer » depuis Réglages : on réévalue (le flag vient d'être effacé).
    window.addEventListener('junglepharm:tour-recheck', evaluate);
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      window.removeEventListener('junglepharm:tour-recheck', evaluate);
    };
  }, [activeTab, userId, enabled]);

  // ── Lancement manuel (bouton « ? ») ─────────────────────────────────────────
  const launchCurrentTab = () => {
    const tour = getTourForTab(activeTab);
    if (tour) { setForced(true); setActiveTour(tour); }
  };
  useEffect(() => {
    const onLaunch = () => launchCurrentTab();
    window.addEventListener('junglepharm:tour-launch', onLaunch);
    return () => window.removeEventListener('junglepharm:tour-launch', onLaunch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const tourForThisTab = getTourForTab(activeTab);
  const showHelpButton = enabled && !!tourForThisTab && !activeTour;

  return (
    <>
      {/* Bouton flottant d'aide — relance le guide de l'onglet courant */}
      {showHelpButton && (
        <>
          <style>{`
            @keyframes jp-help-in { from { opacity: 0; transform: translateY(8px) scale(0.9); } to { opacity: 1; transform: none; } }
            .jp-help-fab {
              position: fixed;
              right: max(20px, env(safe-area-inset-right));
              bottom: calc(20px + env(safe-area-inset-bottom));
              z-index: 9000;
              width: 48px; height: 48px; border-radius: 999px;
              border: none; cursor: pointer; color: #fff;
              display: flex; align-items: center; justify-content: center;
              background: linear-gradient(135deg, #10785a, #149a73);
              box-shadow: 0 6px 20px rgba(16,120,90,0.38), 0 2px 6px rgba(0,0,0,0.12);
              animation: jp-help-in 0.25s cubic-bezier(0.34,1.56,0.64,1);
              transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
            }
            .jp-help-fab:hover { transform: translateY(-2px) scale(1.05); box-shadow: 0 10px 28px rgba(16,120,90,0.45); }
            .jp-help-fab:active { transform: scale(0.96); }
            /* Sur mobile, remonter au-dessus de la barre de navigation (~72px). */
            @media (max-width: 900px) {
              .jp-help-fab { bottom: calc(84px + env(safe-area-inset-bottom)); width: 44px; height: 44px; }
            }
          `}</style>
          <button
            className="jp-help-fab"
            onClick={launchCurrentTab}
            title={`Revoir le guide : ${tourForThisTab!.label}`}
            aria-label="Revoir le guide de cet onglet"
          >
            <HelpCircle size={24} strokeWidth={2} />
          </button>
        </>
      )}

      {/* Le guide lui-même */}
      {activeTour && (
        <ProductTour
          key={activeTour.tourId + (forced ? '-forced' : '')}
          tourId={activeTour.tourId}
          userId={userId}
          forceShow={forced}
          steps={activeTour.steps}
          onStepChange={(step) => {
            window.dispatchEvent(new CustomEvent('junglepharm:tour-step', {
              detail: { tourId: activeTour.tourId, selector: step?.selector ?? null },
            }));
          }}
          onFinish={() => {
            window.dispatchEvent(new CustomEvent('junglepharm:tour-step', {
              detail: { tourId: activeTour.tourId, selector: null },
            }));
            setActiveTour(null);
            setForced(false);
          }}
        />
      )}
    </>
  );
}
