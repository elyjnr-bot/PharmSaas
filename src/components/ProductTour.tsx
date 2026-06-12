/**
 * ProductTour.tsx — Tour guidé contextuel
 * ─────────────────────────────────────────────────────────────────────────────
 * Affiche une série de bulles d'aide pointant les fonctionnalités clés
 * de l'inventaire après le premier import du catalogue.
 *
 * Architecture :
 *  - Bulles HTML positionnées via getBoundingClientRect() sur des éléments cibles
 *  - Overlay semi-transparent avec "spotlight" autour de la zone active
 *  - Navigation via Précédent / Suivant / Passer
 *  - État persisté dans localStorage (`jp_tour_done_<userId>`)
 *
 * Déclenchement :
 *   <ProductTour
 *     tourId="inventory_first_import"
 *     steps={[...]}
 *     onFinish={() => ...}
 *   />
 */

import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { X, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';

const TOUR_STORAGE_PREFIX = 'jp_tour_done_';

export interface TourStep {
  /** Sélecteur CSS de la cible (sera highlight) — facultatif si bulle libre */
  selector?: string;
  /** Position de la bulle par rapport à la cible */
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** Emoji ou icône en en-tête de la bulle */
  emoji?: string;
  /** Titre court (max 40 chars) */
  title: string;
  /** Corps explicatif */
  body: string;
  /** CTA secondaire (ex: "Essayer maintenant" qui ferme le tour et navigue) */
  cta?: { label: string; onClick: () => void };
}

interface Props {
  tourId: string;
  userId: string | null;
  steps: TourStep[];
  /** Forcer le déclenchement même si déjà vu (debug) */
  forceShow?: boolean;
  onFinish?: () => void;
  /** Notifié à chaque changement d'étape (et au démarrage / à la fin avec null) */
  onStepChange?: (step: TourStep | null, index: number) => void;
}

const STORAGE_KEY = (tourId: string, userId: string | null) =>
  userId ? `${TOUR_STORAGE_PREFIX}${tourId}_${userId}` : `${TOUR_STORAGE_PREFIX}${tourId}`;

export function hasTourBeenSeen(tourId: string, userId: string | null): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY(tourId, userId)) === 'true';
  } catch { return false; }
}

export function markTourSeen(tourId: string, userId: string | null): void {
  try {
    localStorage.setItem(STORAGE_KEY(tourId, userId), 'true');
  } catch {}
}

export function resetTour(tourId: string, userId: string | null): void {
  try {
    localStorage.removeItem(STORAGE_KEY(tourId, userId));
  } catch {}
}

const BUBBLE_W = 340;
const MARGIN = 16;
const GAP = 14;

export default function ProductTour({ tourId, userId, steps, forceShow, onFinish, onStepChange }: Props) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  /** Hauteur réelle de la bulle (mesurée), pour un placement précis. */
  const [bubbleH, setBubbleH] = useState(190);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  /** Garde-fou anti-boucle : on ne scrolle qu'une fois par étape. */
  const scrolledForIndex = useRef<number>(-1);

  // Déclencher après mount si pas encore vu
  useEffect(() => {
    if (forceShow || !hasTourBeenSeen(tourId, userId)) {
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
  }, [forceShow, tourId, userId]);

  // Notifier le parent à chaque étape active (pour forcer l'affichage de cibles
  // normalement masquées, ex : actions de ligne visibles seulement au survol).
  useEffect(() => {
    if (visible) onStepChange?.(steps[index] ?? null, index);
    else onStepChange?.(null, -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, index]);

  // Calculer rect au changement d'étape + au resize/scroll.
  useLayoutEffect(() => {
    if (!visible) return;
    const step = steps[index];

    // Cherche la cible. Si absente, on retente quelques fois (le DOM de l'onglet
    // peut encore être en train de se monter), puis on bascule en bulle centrée.
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const locate = (): HTMLElement | null =>
      step?.selector ? (document.querySelector(step.selector) as HTMLElement | null) : null;

    const update = () => {
      if (!step?.selector) { setRect(null); return; }
      const el = locate();
      if (!el) {
        // Cible pas encore là → retente jusqu'à ~1,5 s puis abandonne (centrée)
        if (attempts++ < 10) { retryTimer = setTimeout(update, 150); }
        else setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const offscreen = r.top < 0 || r.bottom > window.innerHeight;
      if (offscreen && scrolledForIndex.current !== index) {
        scrolledForIndex.current = index;           // une seule fois → pas de boucle
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        retryTimer = setTimeout(update, 380);
        return;
      }
      setRect(el.getBoundingClientRect());
    };

    scrolledForIndex.current = -1; // réautorise un scroll pour cette nouvelle étape
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [visible, index, steps]);

  // Mesure la hauteur réelle de la bulle après rendu (placement précis).
  useLayoutEffect(() => {
    if (visible && bubbleRef.current) {
      const h = bubbleRef.current.offsetHeight;
      if (h && Math.abs(h - bubbleH) > 4) setBubbleH(h);
    }
  }, [visible, index, rect, bubbleH]);

  if (!visible) return null;
  const step = steps[index];
  if (!step) return null;

  const isLast = index === steps.length - 1;
  const finish = () => {
    markTourSeen(tourId, userId);
    setVisible(false);
    onFinish?.();
  };

  const clampLeft = (x: number) => Math.max(MARGIN, Math.min(window.innerWidth - BUBBLE_W - MARGIN, x));
  const clampTop  = (y: number) => Math.max(MARGIN, Math.min(window.innerHeight - bubbleH - MARGIN, y));

  // Position de la bulle — toujours intégralement dans le viewport.
  let bubbleStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 10001,
    width: BUBBLE_W,
    maxWidth: 'calc(100vw - 32px)',
    background: '#fff',
    borderRadius: 14,
    padding: '18px 18px 14px',
    boxShadow: '0 24px 60px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.10)',
    border: '1px solid rgba(0,0,0,0.06)',
    animation: 'jp-tour-pop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
  };

  if (rect && step.placement && step.placement !== 'center') {
    // Choix du côté : on part de la préférence, mais on bascule automatiquement
    // s'il n'y a pas la place (évite toute bulle hors-écran → bouton inatteignable).
    let placement = step.placement;
    const spaceTop = rect.top;
    const spaceBottom = window.innerHeight - rect.bottom;
    const spaceLeft = rect.left;
    const spaceRight = window.innerWidth - rect.right;
    if (placement === 'top' && spaceTop < bubbleH + GAP && spaceBottom > spaceTop) placement = 'bottom';
    if (placement === 'bottom' && spaceBottom < bubbleH + GAP && spaceTop > spaceBottom) placement = 'top';
    if (placement === 'left' && spaceLeft < BUBBLE_W + GAP && spaceRight > spaceLeft) placement = 'right';
    if (placement === 'right' && spaceRight < BUBBLE_W + GAP && spaceLeft > spaceRight) placement = 'left';

    switch (placement) {
      case 'top':
        bubbleStyle.top  = clampTop(rect.top - bubbleH - GAP);
        bubbleStyle.left = clampLeft(rect.left + rect.width / 2 - BUBBLE_W / 2);
        break;
      case 'bottom':
        bubbleStyle.top  = clampTop(rect.bottom + GAP);
        bubbleStyle.left = clampLeft(rect.left + rect.width / 2 - BUBBLE_W / 2);
        break;
      case 'left':
        bubbleStyle.top  = clampTop(rect.top + rect.height / 2 - bubbleH / 2);
        bubbleStyle.left = clampLeft(rect.left - BUBBLE_W - GAP);
        break;
      case 'right':
        bubbleStyle.top  = clampTop(rect.top + rect.height / 2 - bubbleH / 2);
        bubbleStyle.left = clampLeft(rect.right + GAP);
        break;
    }
  } else {
    // Centré dans le viewport
    bubbleStyle.top = '50%';
    bubbleStyle.left = '50%';
    bubbleStyle.transform = 'translate(-50%, -50%)';
  }

  // Spotlight autour de la cible
  const spotlightPad = 8;
  const spotlight = rect ? {
    top: rect.top - spotlightPad,
    left: rect.left - spotlightPad,
    width: rect.width + spotlightPad * 2,
    height: rect.height + spotlightPad * 2,
  } : null;

  return (
    <>
      <style>{`
        @keyframes jp-tour-pop {
          from { opacity: 0; transform: ${rect ? 'translateY(8px)' : 'translate(-50%, -45%)'}; }
          to   { opacity: 1; transform: ${rect ? 'translateY(0)'  : 'translate(-50%, -50%)'}; }
        }
        @keyframes jp-tour-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(83,125,20,0.5), 0 0 0 9999px rgba(10,14,20,0.55); }
          50%      { box-shadow: 0 0 0 8px rgba(83,125,20,0.15), 0 0 0 9999px rgba(10,14,20,0.55); }
        }
      `}</style>

      {/* Overlay + spotlight */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        pointerEvents: 'auto',
      }} onClick={finish}>
        {spotlight ? (
          <div style={{
            position: 'fixed',
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            borderRadius: 10,
            pointerEvents: 'none',
            animation: 'jp-tour-pulse 1.8s ease-in-out infinite',
          }} />
        ) : (
          <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(10,14,20,0.55)',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      {/* Bulle */}
      <div ref={bubbleRef} style={bubbleStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            color: '#537d14', textTransform: 'uppercase',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            <Sparkles size={11} /> Étape {index + 1} sur {steps.length}
          </span>
          <button
            onClick={finish}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 2, color: '#9ca3af',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="Passer le tour"
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          {step.emoji && <span style={{ fontSize: 22 }}>{step.emoji}</span>}
          <h3 style={{
            margin: 0, fontSize: 16, fontWeight: 800, color: '#0a0e14',
            letterSpacing: '-0.01em', flex: 1,
          }}>
            {step.title}
          </h3>
        </div>

        <p style={{
          margin: '0 0 14px', fontSize: 13.5, color: '#374151',
          lineHeight: 1.55,
        }}>
          {step.body}
        </p>

        {step.cta && (
          <button
            onClick={() => { markTourSeen(tourId, userId); setVisible(false); step.cta!.onClick(); }}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8,
              background: 'rgba(83,125,20,0.08)', border: '1px solid rgba(83,125,20,0.2)',
              color: '#537d14', fontWeight: 600, fontSize: 13, cursor: 'pointer',
              marginBottom: 10,
            }}
          >
            {step.cta.label} →
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
          <button
            onClick={finish}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, color: '#9ca3af', fontWeight: 500,
              padding: '4px 0',
            }}
          >
            Passer le tour
          </button>

          <div style={{ display: 'flex', gap: 6 }}>
            {index > 0 && (
              <button
                onClick={() => setIndex(index - 1)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '7px 12px', borderRadius: 8,
                  background: '#f3f4f6', border: 'none',
                  color: '#374151', fontSize: 12.5, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <ArrowLeft size={12} /> Précédent
              </button>
            )}
            <button
              onClick={isLast ? finish : () => setIndex(index + 1)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '7px 14px', borderRadius: 8,
                background: 'linear-gradient(135deg, #537d14, #6a9e28)',
                border: 'none', color: '#fff',
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(83,125,20,0.25)',
              }}
            >
              {isLast ? 'Terminer' : 'Suivant'}
              {!isLast && <ArrowRight size={12} />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
