/**
 * useAlerts.ts
 * ────────────────────────────────────────────────────────────────
 * Hook qui calcule en temps réel les alertes critiques à partir
 * du cache local des médicaments (mise à jour toutes les 5 min).
 *
 * Catégories :
 *   rupture    — qty = 0
 *   critique   — 0 < qty <= minimum_stock
 *   perime     — date expiration dépassée
 *   peremption — expiration dans les 90 prochains jours
 */

import { useState, useEffect, useCallback } from 'react';
import { offlineStorage } from './offlineStorage';
import { fetchAllMedications } from './supabase';
import { scheduleStockAlerts } from './pushNotifications';

export type AlertSeverity = 'rupture' | 'critique' | 'perime' | 'peremption';

export interface PharmAlert {
  id: string;
  severity: AlertSeverity;
  medicationName: string;
  detail: string;         // ex: "Qté : 0" ou "Exp : 12/05/2026"
  medicationId: string;
  tab: 'stock' | 'expirations';   // onglet cible pour le raccourci
}

export interface AlertsSummary {
  total: number;
  urgent: number;   // rupture + perime
  warning: number;  // critique + peremption
  alerts: PharmAlert[];
  loading: boolean;
  refresh: () => void;
}

// Retourne le nombre de jours jusqu'à l'expiration (négatif si expiré).
function daysUntilExpiry(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - today.getTime()) / 86_400_000);
}

const EXPIRY_WARN_DAYS = 90;

/** Retourne le seuil minimum pour un médicament.
 *  Priorité : localStorage (jp_min_stock_<id>) > minimum_stock DB > 0
 */
export function getMinStockForMed(med: { id: string; minimum_stock?: number }): number {
  const localKey = `jp_min_stock_${med.id}`;
  const localVal = parseInt(localStorage.getItem(localKey) || '0', 10);
  if (localVal > 0) return localVal;
  return med.minimum_stock ?? 0;
}

function buildAlerts(meds: any[]): PharmAlert[] {
  const out: PharmAlert[] = [];

  for (const m of meds) {
    const qty: number = m.quantity ?? 0;
    const minStock: number = getMinStockForMed(m);
    const name: string = `${m.name}${m.dosage ? ` ${m.dosage}` : ''}`;

    // 1 — Rupture (priorité maximale)
    if (qty <= 0) {
      out.push({
        id: `rupture-${m.id}`,
        severity: 'rupture',
        medicationName: name,
        detail: 'Stock épuisé',
        medicationId: m.id,
        tab: 'stock',
      });
    } else if (minStock > 0 && qty <= minStock) {
      // 2 — Stock critique (qty > 0 mais sous le seuil)
      out.push({
        id: `critique-${m.id}`,
        severity: 'critique',
        medicationName: name,
        detail: `Qté : ${qty} (seuil ${minStock})`,
        medicationId: m.id,
        tab: 'stock',
      });
    }

    // 3 — Péremption / expiré (indépendant du stock)
    const days = daysUntilExpiry(m.expiry_date);
    if (days !== null) {
      if (days < 0) {
        out.push({
          id: `perime-${m.id}`,
          severity: 'perime',
          medicationName: name,
          detail: `Expiré il y a ${Math.abs(days)} j`,
          medicationId: m.id,
          tab: 'expirations',
        });
      } else if (days <= EXPIRY_WARN_DAYS) {
        out.push({
          id: `peremption-${m.id}`,
          severity: 'peremption',
          medicationName: name,
          detail: `Exp. dans ${days} j`,
          medicationId: m.id,
          tab: 'expirations',
        });
      }
    }
  }

  // Trier : rupture > périmé > critique > péremption proche
  const ORDER: Record<AlertSeverity, number> = { rupture: 0, perime: 1, critique: 2, peremption: 3 };
  out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  return out;
}

// ── Notifications browser natives ───────────────────────────────
const NOTIF_THROTTLE_KEY = 'jp_alerts_last_notif';
const NOTIF_THROTTLE_MS  = 60 * 60 * 1000; // 1 heure

async function maybeSendBrowserNotification(urgentAlerts: PharmAlert[]) {
  if (!urgentAlerts.length) return;
  if (!('Notification' in window)) return;

  // Throttle : une notification max par heure
  const last = parseInt(localStorage.getItem(NOTIF_THROTTLE_KEY) || '0', 10);
  if (Date.now() - last < NOTIF_THROTTLE_MS) return;

  // Demander la permission si pas encore accordée
  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return;

  // Regrouper par type pour un message synthétique
  const ruptures   = urgentAlerts.filter(a => a.severity === 'rupture').length;
  const perimes    = urgentAlerts.filter(a => a.severity === 'perime').length;
  const parts: string[] = [];
  if (ruptures) parts.push(`${ruptures} rupture(s)`);
  if (perimes)  parts.push(`${perimes} produit(s) expiré(s)`);

  new Notification('⚠️ JunglePharm — Alertes stock', {
    body: parts.join(' · '),
    icon: '/favicon.ico',
    tag: 'jp-stock-alert',   // remplace la notif précédente
    requireInteraction: false,
  });

  localStorage.setItem(NOTIF_THROTTLE_KEY, Date.now().toString());
}

export function useAlerts(): AlertsSummary {
  const [alerts, setAlerts]   = useState<PharmAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Utiliser le cache immédiatement pour un affichage instantané
      const cached = offlineStorage.getCachedMedications?.() ?? [];
      if (cached.length) setAlerts(buildAlerts(cached));

      // 2. Rafraîchir depuis Supabase si en ligne
      if (navigator.onLine) {
        const fresh = await fetchAllMedications();
        if (fresh.length) {
          offlineStorage.cacheMedications(fresh);
          const computed = buildAlerts(fresh);
          setAlerts(computed);
          // Notifications natives : ruptures/périmés via maybeSendBrowserNotification
          // + alertes critiques via scheduleStockAlerts (tracking par alerte)
          const urgent = computed.filter(a => a.severity === 'rupture' || a.severity === 'perime');
          maybeSendBrowserNotification(urgent);
          scheduleStockAlerts(fresh);
        }
      }
    } catch (err) {
      console.error('useAlerts refresh error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Premier chargement
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refresh automatique toutes les 5 minutes
  useEffect(() => {
    const timer = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Refresh si l'onglet redevient visible
  useEffect(() => {
    const handler = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [refresh]);

  const urgent  = alerts.filter(a => a.severity === 'rupture' || a.severity === 'perime').length;
  const warning = alerts.filter(a => a.severity === 'critique' || a.severity === 'peremption').length;

  return { total: alerts.length, urgent, warning, alerts, loading, refresh };
}
