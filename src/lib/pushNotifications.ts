/**
 * pushNotifications.ts
 * ────────────────────────────────────────────────────────────────
 * Utilitaires pour les notifications push navigateur (PWA).
 *
 *  - requestNotificationPermission() : demande la permission
 *  - showNotification()              : affiche une notif native
 *  - scheduleStockAlerts()           : vérifie le stock et notifie si critique
 *  - scheduleDailySummary()          : résumé journalier (CA + ventes)
 */

/** Clé localStorage pour throttling des alertes de stock */
const STOCK_ALERT_NOTIF_KEY   = 'jp_alerts_last_notif';
const STOCK_ALERT_THROTTLE_MS = 60 * 60 * 1000; // 1h entre deux alertes stock

/** Clé localStorage pour le résumé journalier */
const DAILY_SUMMARY_KEY = 'jp_daily_summary_last_date';

/** Clé localStorage pour tracking des alertes déjà notifiées */
const NOTIFIED_ALERTS_KEY = 'jp_notified_alerts';

// ── Permission ───────────────────────────────────────────────────

/**
 * Demande la permission de notification au navigateur.
 * Retourne true si la permission est accordée.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * Retourne l'état actuel de la permission :
 *   'default' | 'granted' | 'denied' | 'unsupported'
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

// ── Affichage ────────────────────────────────────────────────────

/**
 * Affiche une notification native si la permission est accordée.
 */
export function showNotification(
  title: string,
  body: string,
  icon: string = '/icon.svg',
  tag?: string,
): void {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  new Notification(title, {
    body,
    icon,
    tag,
    requireInteraction: false,
  });
}

// ── Alertes de stock ─────────────────────────────────────────────

/**
 * Vérifie la liste des médicaments et envoie une notification
 * pour les ruptures / stocks critiques qui n'ont pas encore été
 * notifiés (tracking dans localStorage jp_notified_alerts).
 *
 * Un throttle global d'1 heure évite le spam si la liste est
 * rafraîchie souvent.
 */
export function scheduleStockAlerts(medications: any[]): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  // Throttle global
  const lastTs = parseInt(localStorage.getItem(STOCK_ALERT_NOTIF_KEY) || '0', 10);
  if (Date.now() - lastTs < STOCK_ALERT_THROTTLE_MS) return;

  // Récupérer les IDs déjà notifiés
  let notified: string[] = [];
  try {
    notified = JSON.parse(localStorage.getItem(NOTIFIED_ALERTS_KEY) || '[]');
  } catch {
    notified = [];
  }

  const newAlerts: { id: string; name: string; type: 'rupture' | 'critique' }[] = [];

  for (const m of medications) {
    const qty: number = m.quantity ?? 0;
    // Seuil : localStorage > minimum_stock > 5 (défaut)
    const localKey = `jp_min_stock_${m.id}`;
    const localMin = parseInt(localStorage.getItem(localKey) || '0', 10);
    const minStock: number = localMin > 0 ? localMin : (m.minimum_stock ?? 5);

    if (qty === 0 && !notified.includes(`rupture-${m.id}`)) {
      newAlerts.push({ id: `rupture-${m.id}`, name: m.name, type: 'rupture' });
    } else if (qty > 0 && qty <= minStock && !notified.includes(`critique-${m.id}`)) {
      newAlerts.push({ id: `critique-${m.id}`, name: m.name, type: 'critique' });
    }
  }

  if (newAlerts.length === 0) return;

  // Construire le corps du message
  const ruptures  = newAlerts.filter(a => a.type === 'rupture');
  const critiques = newAlerts.filter(a => a.type === 'critique');
  const parts: string[] = [];
  if (ruptures.length)  parts.push(`${ruptures.length} rupture(s)`);
  if (critiques.length) parts.push(`${critiques.length} stock(s) critique(s)`);

  const firstName = newAlerts[0].name;
  const body = newAlerts.length === 1
    ? `${firstName} — ${newAlerts[0].type === 'rupture' ? 'stock épuisé' : 'stock critique'}`
    : `${parts.join(' · ')}`;

  showNotification('⚠️ JunglePharm — Alertes stock', body, '/icon.svg', 'jp-stock-alert');

  // Mettre à jour le tracking
  const updatedNotified = [...new Set([...notified, ...newAlerts.map(a => a.id)])];
  // Garder au maximum 500 entrées pour ne pas saturer le localStorage
  const trimmed = updatedNotified.slice(-500);
  localStorage.setItem(NOTIFIED_ALERTS_KEY, JSON.stringify(trimmed));
  localStorage.setItem(STOCK_ALERT_NOTIF_KEY, Date.now().toString());
}

/**
 * Efface le tracking des alertes notifiées (utile quand le stock
 * est réapprovisionné et qu'on veut pouvoir re-notifier).
 */
export function clearNotifiedAlerts(): void {
  localStorage.removeItem(NOTIFIED_ALERTS_KEY);
}

// ── Résumé journalier ────────────────────────────────────────────

/**
 * Affiche un résumé de fin de journée si :
 *   - il est entre 18h et 23h59
 *   - ça n'a pas encore été envoyé aujourd'hui
 *
 * Appeler cette fonction après le chargement des ventes du jour.
 */
export function scheduleDailySummary(totalCA: number, salesCount: number): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now    = new Date();
  const hour   = now.getHours();
  // Envoi uniquement entre 18h et 23h
  if (hour < 18) return;

  const today  = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const lastSent = localStorage.getItem(DAILY_SUMMARY_KEY);
  if (lastSent === today) return; // déjà envoyé aujourd'hui

  const caFormatted = totalCA.toLocaleString('fr-FR');
  showNotification(
    'JunglePharm — Résumé du jour',
    `CA : ${caFormatted} FCFA · ${salesCount} vente${salesCount !== 1 ? 's' : ''}`,
    '/icon.svg',
    'jp-daily-summary',
  );

  localStorage.setItem(DAILY_SUMMARY_KEY, today);
}
