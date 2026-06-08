// ════════════════════════════════════════════════════════════════════════════
//  useInventoryAlerts — Alertes intelligentes basées sur les colonnes taguées
//
//  Les seuils de péremption et de stock critique sont configurables.
//  Le hook ne cherche pas une "colonne X" hardcodée : il utilise le champ
//  expiry_date de la DB, qui est le champ tagué lors du mapping import.
//
//  Exports :
//   - useInventoryAlerts()  → hook complet
//   - getExpiryConfig()     → seuils courants (lecture)
//   - setExpiryConfig()     → mise à jour des seuils
//   - hasExpiryData()       → la pharmacie a-t-elle des données de péremption ?
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react';
import { offlineStorage } from './offlineStorage';
import { fetchAllMedications } from './supabase';
import { scheduleStockAlerts } from './pushNotifications';
import type { StockMedication } from './useInventoryColumns';

// ── Config péremption (seuils configurables) ──────────────────────────────────
export interface ExpiryConfig {
  /** Avertissement critique (rouge) — jours avant expiration */
  criticalDays: number;
  /** Avertissement précoce (orange) */
  warningDays: number;
  /** Avertissement de veille (jaune) */
  watchDays: number;
}

const EXPIRY_CONFIG_KEY = 'jp_expiry_config_v1';
const DEFAULT_EXPIRY_CONFIG: ExpiryConfig = { criticalDays: 30, warningDays: 60, watchDays: 90 };

export function getExpiryConfig(): ExpiryConfig {
  try {
    const raw = localStorage.getItem(EXPIRY_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_EXPIRY_CONFIG };
    return { ...DEFAULT_EXPIRY_CONFIG, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_EXPIRY_CONFIG }; }
}

export function setExpiryConfig(cfg: Partial<ExpiryConfig>): void {
  try { localStorage.setItem(EXPIRY_CONFIG_KEY, JSON.stringify({ ...getExpiryConfig(), ...cfg })); }
  catch { /* ignore */ }
}

/** Retourne true si la pharmacie a des données de péremption (champ tagué). */
export function hasExpiryData(meds: StockMedication[]): boolean {
  return meds.some(m => !!m.expiry_date);
}

// ── Types d'alertes ──────────────────────────────────────────────────────────
export type AlertSeverity = 'expired' | 'critical' | 'warning' | 'watch' | 'low_stock' | 'out_of_stock';

export interface InventoryAlert {
  id: string;
  severity: AlertSeverity;
  medicationId: string;
  medicationName: string;
  detail: string;
  /** Onglet cible dans l'app */
  tab: 'stock' | 'expirations';
  /** Jours restants (négatif = expiré), null pour alertes stock */
  daysRemaining: number | null;
}

export interface ExpiryBucket {
  label: string;
  maxDays: number;
  count: number;
  color: string;
}

export interface InventoryAlertsSummary {
  alerts: InventoryAlert[];
  /** Alertes groupées par seuil de péremption */
  expiryBuckets: ExpiryBucket[];
  /** Nombre de produits en rupture */
  outOfStock: number;
  /** Nombre de produits sous seuil critique */
  lowStock: number;
  /** Nombre de produits expirés */
  expired: number;
  /** Nombre de produits expirant bientôt (total tous seuils) */
  expiringSoon: number;
  /** La pharmacie a des données de péremption */
  hasExpiryData: boolean;
  loading: boolean;
  refresh: () => void;
}

// ── Calcul des jours restants ──────────────────────────────────────────────────
function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp   = new Date(dateStr); exp.setHours(0, 0, 0, 0);
  if (isNaN(exp.getTime())) return null;
  return Math.ceil((exp.getTime() - today.getTime()) / 86_400_000);
}

// ── Construction des alertes ───────────────────────────────────────────────────
function buildAlerts(meds: StockMedication[], cfg: ExpiryConfig): InventoryAlert[] {
  const out: InventoryAlert[] = [];

  for (const m of meds) {
    const qty = m.quantity ?? 0;
    const name = `${m.name}${m.dosage ? ` ${m.dosage}` : ''}`;
    const threshold = m.minimum_stock ?? 0;

    // ── Stock ──────────────────────────────────────────────────────────────
    if (qty <= 0) {
      out.push({ id: `out-${m.id}`, severity: 'out_of_stock', medicationId: m.id, medicationName: name, detail: 'Stock épuisé', tab: 'stock', daysRemaining: null });
    } else if (threshold > 0 && qty <= threshold) {
      out.push({ id: `low-${m.id}`, severity: 'low_stock', medicationId: m.id, medicationName: name, detail: `Qté ${qty} ≤ seuil ${threshold}`, tab: 'stock', daysRemaining: null });
    }

    // ── Péremption (colonne taguée expiry_date) ────────────────────────────
    const days = daysUntil(m.expiry_date);
    if (days === null) continue;

    if (days < 0) {
      out.push({ id: `exp-${m.id}`, severity: 'expired', medicationId: m.id, medicationName: name, detail: `Expiré il y a ${Math.abs(days)} j`, tab: 'expirations', daysRemaining: days });
    } else if (days <= cfg.criticalDays) {
      out.push({ id: `crit-${m.id}`, severity: 'critical', medicationId: m.id, medicationName: name, detail: `Expire dans ${days} j`, tab: 'expirations', daysRemaining: days });
    } else if (days <= cfg.warningDays) {
      out.push({ id: `warn-${m.id}`, severity: 'warning', medicationId: m.id, medicationName: name, detail: `Expire dans ${days} j`, tab: 'expirations', daysRemaining: days });
    } else if (days <= cfg.watchDays) {
      out.push({ id: `watch-${m.id}`, severity: 'watch', medicationId: m.id, medicationName: name, detail: `Expire dans ${days} j`, tab: 'expirations', daysRemaining: days });
    }
  }

  const ORDER: Record<AlertSeverity, number> = { expired: 0, out_of_stock: 1, critical: 2, low_stock: 3, warning: 4, watch: 5 };
  return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

function buildExpiryBuckets(alerts: InventoryAlert[], cfg: ExpiryConfig): ExpiryBucket[] {
  return [
    { label: `< ${cfg.criticalDays} j`,  maxDays: cfg.criticalDays, count: alerts.filter(a => a.severity === 'critical').length, color: '#dc2626' },
    { label: `< ${cfg.warningDays} j`,   maxDays: cfg.warningDays,  count: alerts.filter(a => a.severity === 'warning').length,  color: '#d97706' },
    { label: `< ${cfg.watchDays} j`,     maxDays: cfg.watchDays,    count: alerts.filter(a => a.severity === 'watch').length,    color: '#2563eb' },
  ];
}

// ── Notification native (throttle 1h) ─────────────────────────────────────────
const NOTIF_KEY = 'jp_alerts_last_notif';
async function maybeNotify(urgent: InventoryAlert[]) {
  if (!urgent.length || !('Notification' in window)) return;
  const last = parseInt(localStorage.getItem(NOTIF_KEY) || '0', 10);
  if (Date.now() - last < 3_600_000) return;
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') return;
  const ruptureCount = urgent.filter(a => a.severity === 'out_of_stock').length;
  const expiredCount = urgent.filter(a => a.severity === 'expired').length;
  const parts = [];
  if (ruptureCount) parts.push(`${ruptureCount} rupture(s)`);
  if (expiredCount) parts.push(`${expiredCount} produit(s) expiré(s)`);
  new Notification('⚠️ JunglePharm', { body: parts.join(' · '), tag: 'jp-alert', icon: '/favicon.ico' });
  localStorage.setItem(NOTIF_KEY, Date.now().toString());
}

// ════════════════════════════════════════════════════════════════════════════
//  HOOK PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
export function useInventoryAlerts(): InventoryAlertsSummary {
  const [alerts,  setAlerts]  = useState<InventoryAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [expiryDataAvail, setExpiryDataAvail] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const cfg = getExpiryConfig();
    try {
      const cached = offlineStorage.getCachedMedications?.() ?? [];
      if (cached.length) {
        setAlerts(buildAlerts(cached, cfg));
        setExpiryDataAvail(hasExpiryData(cached));
      }
      if (navigator.onLine) {
        const fresh = await fetchAllMedications();
        if (fresh.length) {
          offlineStorage.cacheMedications(fresh);
          const computed = buildAlerts(fresh, cfg);
          setAlerts(computed);
          setExpiryDataAvail(hasExpiryData(fresh));
          const urgent = computed.filter(a => a.severity === 'expired' || a.severity === 'out_of_stock');
          maybeNotify(urgent);
          scheduleStockAlerts(fresh);
        }
      }
    } catch (e) { console.error('[useInventoryAlerts]', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { const t = setInterval(refresh, 5 * 60_000); return () => clearInterval(t); }, [refresh]);
  useEffect(() => {
    const h = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [refresh]);

  // Écouter les ventes terminées pour rafraîchir immédiatement
  useEffect(() => {
    const h = () => refresh();
    window.addEventListener('sale-completed', h);
    return () => window.removeEventListener('sale-completed', h);
  }, [refresh]);

  const cfg = getExpiryConfig();
  const buckets = buildExpiryBuckets(alerts, cfg);

  return {
    alerts,
    expiryBuckets: buckets,
    outOfStock:  alerts.filter(a => a.severity === 'out_of_stock').length,
    lowStock:    alerts.filter(a => a.severity === 'low_stock').length,
    expired:     alerts.filter(a => a.severity === 'expired').length,
    expiringSoon: buckets.reduce((s, b) => s + b.count, 0),
    hasExpiryData: expiryDataAvail,
    loading,
    refresh,
  };
}
