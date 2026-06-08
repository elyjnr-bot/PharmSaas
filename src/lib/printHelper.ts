/**
 * printHelper.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Impression via un <iframe> caché injecté dans le DOM courant.
 *
 * ✅ Avantages vs window.open :
 *   - Aucune nouvelle fenêtre / onglet ne s'ouvre
 *   - L'utilisateur reste dans l'app, sans interruption
 *   - Compatible avec les bloqueurs de popups
 *   - L'iframe est supprimé automatiquement après impression
 *
 * Usage :
 *   import { printHtml } from '../lib/printHelper';
 *   printHtml(htmlString);
 */

export function printHtml(html: string): void {
  // Crée un iframe caché et l'ajoute au DOM
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;opacity:0;pointer-events:none;';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    // Fallback : window.open si l'iframe n'est pas dispo (rare)
    const w = window.open('', '_blank', 'width=900,height=700');
    if (w) { w.document.write(html); w.document.close(); }
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Attend que les ressources soient chargées avant d'imprimer
  const doprint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.warn('[printHtml] print error:', e);
    }
    // Supprime l'iframe après un délai (laisse le temps au dialogue d'impression)
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 2000);
  };

  // Si l'iframe a déjà chargé (contenu synchrone), on lance directement
  if (iframe.contentDocument?.readyState === 'complete') {
    doprint();
  } else {
    iframe.onload = doprint;
  }
}
