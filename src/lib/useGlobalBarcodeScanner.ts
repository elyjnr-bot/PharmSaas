/**
 * useGlobalBarcodeScanner
 * ─────────────────────────────────────────────────────────────────────────────
 * Detects USB / Bluetooth HID barcode scanners (keyboard-emulation mode).
 *
 * How it works
 * ────────────
 * Scanners type characters extremely fast (<100 ms total) then send Enter.
 * Humans type ≥ 150 ms between keystrokes on average.
 * We buffer keystrokes and only fire when:
 *   • ≥ MIN_LENGTH chars arrived
 *   • each char arrived within INTER_CHAR_MS of the previous one
 *   • a final Enter key was received
 *
 * When a scan is detected the hook dispatches:
 *   window.dispatchEvent(new CustomEvent('barcode-scanned', { detail: { barcode } }))
 *
 * Individual components (Sales, Stock, Commandes…) listen to that event and
 * react in their own context.  The topbar shows a "Scanner actif" indicator.
 *
 * Safety rules
 * ─────────────
 * • If focus is inside an INPUT / TEXTAREA / SELECT the buffer is ignored so we
 *   don't interfere with normal typing.
 * • Keys longer than 1 char (arrows, F-keys…) break the scan sequence.
 */

import { useEffect } from 'react';

/** Max ms between consecutive scanner keystrokes */
const INTER_CHAR_MS = 120;

/** Minimum barcode length (chars before Enter) */
const MIN_LENGTH = 4;

/**
 * Résout un keystroke en caractère de code-barres.
 *
 * Problème classique : le scanner envoie des scan-codes physiques (QWERTY)
 * mais l'OS les traduit avec le layout courant (AZERTY, etc.).
 * Ex. touche physique "1" → e.code="Digit1", e.key="&" sur AZERTY.
 *
 * Solution : pour les touches Digit0-9 et Numpad0-9, on lit e.code
 * (position physique) et on retourne le chiffre directement.
 * Pour les lettres, on prend e.key en majuscule (Code 128 / QR).
 * Les caractères GS1 parasites (], ^, ~, NUL…) sont ignorés.
 */
function resolveChar(e: KeyboardEvent): string | null {
  const code = e.code ?? '';

  // Chiffres (rangée du haut ET pavé numérique) — indépendant du layout clavier
  if (code.startsWith('Digit')) return code.slice(5); // "Digit3" → "3"
  if (code.startsWith('Numpad') && code.length === 7) {
    const d = code.slice(6);
    if (d >= '0' && d <= '9') return d;             // "Numpad7" → "7"
  }

  // Lettres (Code 128, QR, DataMatrix…) — utilise e.key pour respecter la casse
  if (e.key.length === 1) {
    const k = e.key;
    // Filtrer les caractères parasites GS1 (], [, ^, ~, NUL, SOH…)
    const code_point = k.charCodeAt(0);
    if (code_point < 32 || code_point === 127) return null; // caractères de contrôle
    if (k === ']' || k === '[' || k === '~') return null;   // préfixes GS1
    return k.toUpperCase();
  }

  return null;
}

export function useGlobalBarcodeScanner(): void {
  useEffect(() => {
    let buffer: string[] = [];
    let lastKeyTime       = 0;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;

    function reset() {
      buffer      = [];
      lastKeyTime = 0;
      if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
    }

    function onKeyDown(e: KeyboardEvent) {
      // ── Ignore if user is typing in a form field ─────────────────────────
      const tag = (e.target as HTMLElement | null)?.tagName?.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        reset();
        return;
      }

      const now = Date.now();

      // ── Enter → evaluate buffer ──────────────────────────────────────────
      if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        const timeSinceLast = buffer.length > 0 ? now - lastKeyTime : Infinity;

        if (buffer.length >= MIN_LENGTH && timeSinceLast <= INTER_CHAR_MS * 2) {
          const barcode = buffer.join('');
          window.dispatchEvent(
            new CustomEvent<{ barcode: string }>('barcode-scanned', {
              detail: { barcode },
            })
          );
          e.preventDefault();
        }

        reset();
        return;
      }

      // ── Tab (certains scanners envoient Tab au lieu de Enter) ────────────
      if (e.key === 'Tab' || e.code === 'Tab') {
        const timeSinceLast = buffer.length > 0 ? now - lastKeyTime : Infinity;
        if (buffer.length >= MIN_LENGTH && timeSinceLast <= INTER_CHAR_MS * 2) {
          const barcode = buffer.join('');
          window.dispatchEvent(
            new CustomEvent<{ barcode: string }>('barcode-scanned', {
              detail: { barcode },
            })
          );
          e.preventDefault();
        }
        reset();
        return;
      }

      // ── Ignore multi-char keys (arrows, F1…, Escape…) ───────────────────
      if (e.key.length > 1) {
        reset();
        return;
      }

      // ── Résoudre le caractère (layout-agnostic pour les chiffres) ────────
      const char = resolveChar(e);
      if (!char) {
        // Caractère parasite → on ignore sans casser le buffer
        return;
      }

      // ── Timing check ────────────────────────────────────────────────────
      const timeSinceLast = buffer.length > 0 ? now - lastKeyTime : 0;
      if (buffer.length > 0 && timeSinceLast > INTER_CHAR_MS) {
        reset();
      }

      buffer.push(char);
      lastKeyTime = now;

      // Auto-reset après 600 ms d'inactivité
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(reset, 600);
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, []);
}
