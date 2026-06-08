import { useState, useEffect, useCallback } from 'react';
import { offlineStorage } from './offlineStorage';

export interface AppNotification {
  id: string;
  type: 'rupture' | 'expiry' | 'credit_overdue';
  title: string;
  detail: string;
  severity: 'high' | 'medium';
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const load = useCallback(() => {
    const items: AppNotification[] = [];
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // ── Medications: ruptures + péremptions ──────────────────────────
    const meds = offlineStorage.getCachedMedications();
    for (const med of meds) {
      if (med.quantity === 0) {
        items.push({
          id: `rupt-${med.id}`,
          type: 'rupture',
          title: `Rupture : ${med.name} ${med.dosage}`,
          detail: 'Stock épuisé — à commander',
          severity: 'high',
        });
      } else if (med.minimum_stock && med.quantity < med.minimum_stock) {
        items.push({
          id: `low-${med.id}`,
          type: 'rupture',
          title: `Stock critique : ${med.name} ${med.dosage}`,
          detail: `${med.quantity} unité(s) · seuil ${med.minimum_stock}`,
          severity: 'medium',
        });
      }

      if (med.expiry_date && med.quantity > 0) {
        const daysLeft = Math.floor(
          (new Date(med.expiry_date).getTime() - today.getTime()) / 86_400_000
        );
        if (daysLeft < 0) {
          items.push({
            id: `exp-${med.id}`,
            type: 'expiry',
            title: `Périmé : ${med.name} ${med.dosage}`,
            detail: 'À retirer immédiatement du stock',
            severity: 'high',
          });
        } else if (daysLeft <= 30) {
          items.push({
            id: `exp-${med.id}`,
            type: 'expiry',
            title: `Expire bientôt : ${med.name} ${med.dosage}`,
            detail: daysLeft === 0 ? "Expire aujourd'hui" : `Dans ${daysLeft} jour(s)`,
            severity: daysLeft <= 7 ? 'high' : 'medium',
          });
        }
      }
    }

    // ── Credits en retard ────────────────────────────────────────────
    const credits = offlineStorage.getCachedCredits();
    for (const c of credits) {
      if (c.status === 'unpaid' && c.due_date && c.due_date < todayStr) {
        const remaining = c.total_amount - (c.amount_paid || 0);
        if (remaining > 0) {
          items.push({
            id: `cred-${c.id}`,
            type: 'credit_overdue',
            title: `Crédit en retard : ${c.client_name}`,
            detail: `${Math.round(remaining).toLocaleString()} FCFA dû`,
            severity: 'high',
          });
        }
      }
    }

    // High severity first
    items.sort((a, b) => (a.severity === 'high' ? -1 : 1) - (b.severity === 'high' ? -1 : 1));
    setNotifications(items);
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [load]);

  return { notifications, count: notifications.length, reload: load };
}
