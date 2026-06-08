/**
 * AlertsBell.tsx
 * ────────────────────────────────────────────────────────────────
 * Cloche d'alertes : badge rouge + panneau contextuel.
 * Affiche les ruptures, stocks critiques, et péremptions imminentes.
 * Chalk Premium design.
 */

import { useState, useRef, useEffect } from 'react';
import { AlertTriangle, Package, Calendar, RefreshCw, ChevronRight, Bell } from 'lucide-react';
import { useAlerts, PharmAlert, AlertSeverity } from '../lib/useAlerts';
import {
  getNotificationPermission,
  requestNotificationPermission,
  showNotification,
  scheduleDailySummary,
} from '../lib/pushNotifications';

// ── Design tokens (Chalk Premium) ────────────────────────────────
const C = {
  brand:    '#10785a',
  ink:      '#0a0e14',
  inkSoft:  '#2c3138',
  inkMute:  '#6b7280',
  inkFaint: '#9aa0a8',
  bg:       '#f8fafc',
  surface:  '#ffffff',
  hairline: 'rgba(15,15,20,0.07)',
  red:      '#c81e1e',
  redBg:    'rgba(200,30,30,0.07)',
  redBd:    'rgba(200,30,30,0.20)',
  amber:    '#b75f06',
  amberBg:  'rgba(183,95,6,0.08)',
  amberBd:  'rgba(183,95,6,0.20)',
  green:    '#059669',
};

// ── Config par sévérité ──────────────────────────────────────────
const SEVERITY_META: Record<AlertSeverity, { label: string; color: string; bg: string; bd: string; icon: React.ReactNode }> = {
  rupture:    { label: 'Rupture',        color: C.red,   bg: C.redBg,   bd: C.redBd,   icon: <Package  size={12} strokeWidth={2} /> },
  perime:     { label: 'Expiré',         color: C.red,   bg: C.redBg,   bd: C.redBd,   icon: <Calendar size={12} strokeWidth={2} /> },
  critique:   { label: 'Stock critique', color: C.amber, bg: C.amberBg, bd: C.amberBd, icon: <AlertTriangle size={12} strokeWidth={2} /> },
  peremption: { label: 'Péremption J-90',color: C.amber, bg: C.amberBg, bd: C.amberBd, icon: <Calendar size={12} strokeWidth={2} /> },
};

function navigate(tab: string) {
  window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab } }));
}

// ── Composant principal ──────────────────────────────────────────
interface AlertsBellProps {
  size?: number;
  /** Couleur de l'icône au repos */
  iconColor?: string;
}

export default function AlertsBell({ size = 16, iconColor = '#6b7280' }: AlertsBellProps) {
  const { total, urgent, alerts, loading, refresh } = useAlerts();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<AlertSeverity | 'all'>('all');
  const [notifPerm, setNotifPerm] = useState<ReturnType<typeof getNotificationPermission>>(getNotificationPermission());
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);

  // Fermer le panneau si clic dehors
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Notif pour les nouvelles alertes critiques (rupture/périmé)
  // On notifie si la permission est granted et qu'il y a des alertes urgentes
  const prevUrgentRef = useRef<number>(0);
  useEffect(() => {
    if (notifPerm !== 'granted') return;
    if (urgent > 0 && urgent > prevUrgentRef.current) {
      const newUrgentAlerts = alerts
        .filter(a => a.severity === 'rupture' || a.severity === 'perime')
        .slice(0, 3);
      if (newUrgentAlerts.length > 0) {
        const names = newUrgentAlerts.map(a => a.medicationName).join(', ');
        const more  = urgent > 3 ? ` (+${urgent - 3} autres)` : '';
        showNotification(
          '⚠️ JunglePharm — Alerte urgente',
          `${names}${more}`,
          '/icon.svg',
          'jp-urgent-alert',
        );
      }
    }
    prevUrgentRef.current = urgent;
  }, [urgent, alerts, notifPerm]);

  // Résumé journalier : vérifier toutes les 10 min si l'heure est propice
  useEffect(() => {
    function checkDailySummary() {
      // Récupérer le CA + nb ventes du jour depuis le localStorage (posé par Sales/Gestion)
      const ca    = parseInt(localStorage.getItem('jp_today_ca') || '0', 10);
      const count = parseInt(localStorage.getItem('jp_today_sales_count') || '0', 10);
      if (ca > 0 || count > 0) {
        scheduleDailySummary(ca, count);
      }
    }
    checkDailySummary();
    const timer = setInterval(checkDailySummary, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [notifPerm]);

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.severity === filter);

  const badgeColor = urgent > 0 ? C.red : C.amber;
  const hasBadge   = total > 0;

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      {/* ── Bouton cloche ── */}
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        title={total > 0 ? `${total} alerte(s)` : 'Aucune alerte'}
        style={{
          position: 'relative',
          width: 30, height: 30,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8,
          background: open ? 'rgba(255,255,255,0.5)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          transition: 'background 0.12s',
          flexShrink: 0,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.5)'; }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {/* Bell SVG */}
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={hasBadge ? badgeColor : iconColor} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>

        {/* Badge */}
        {hasBadge && (
          <span style={{
            position: 'absolute',
            top: 3, right: 3,
            width: urgent > 0 ? 8 : 6,
            height: urgent > 0 ? 8 : 6,
            borderRadius: 99,
            background: badgeColor,
            border: '1.5px solid white',
            fontSize: 7, fontWeight: 800, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
            transition: 'all 0.2s',
          }}>
            {urgent > 0 && total > 9 ? '' : ''}
          </span>
        )}
      </button>

      {/* ── Panneau flottant ── */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 320,
            maxHeight: 480,
            background: C.surface,
            border: `1px solid ${C.hairline}`,
            borderRadius: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.06)',
            zIndex: 300,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* En-tête panneau */}
          <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
                Alertes
              </span>
              {total > 0 && (
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: urgent > 0 ? C.redBg : C.amberBg, color: urgent > 0 ? C.red : C.amber, border: `1px solid ${urgent > 0 ? C.redBd : C.amberBd}` }}>
                  {total}
                </span>
              )}
            </div>
            <button
              onClick={() => { refresh(); }}
              disabled={loading}
              title="Rafraîchir"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: C.inkMute, display: 'flex', alignItems: 'center', opacity: loading ? 0.5 : 1 }}
            >
              <RefreshCw size={13} strokeWidth={2} style={{ animation: loading ? 'spin 0.7s linear infinite' : 'none' }} />
            </button>
          </div>

          {/* Filtres */}
          {total > 0 && (
            <div style={{ padding: '8px 12px', display: 'flex', gap: 5, flexWrap: 'wrap', borderBottom: `1px solid ${C.hairline}`, flexShrink: 0 }}>
              {(['all', 'rupture', 'critique', 'perime', 'peremption'] as const).map(f => {
                const count = f === 'all' ? total : alerts.filter(a => a.severity === f).length;
                if (f !== 'all' && count === 0) return null;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      padding: '3px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 600,
                      border: `1px solid ${filter === f ? C.ink : C.hairline}`,
                      background: filter === f ? C.ink : 'transparent',
                      color: filter === f ? '#fff' : C.inkMute,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    {f === 'all' ? `Tout (${count})` : `${SEVERITY_META[f].label} (${count})`}
                  </button>
                );
              })}
            </div>
          )}

          {/* Liste des alertes */}
          <div style={{ flex: 1, overflowY: 'auto', padding: total === 0 ? '24px 16px' : '6px 0' }}>
            {total === 0 && !loading && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, margin: 0 }}>Tout est en ordre</p>
                <p style={{ fontSize: 12, color: C.inkMute, margin: '4px 0 0' }}>Aucune alerte de stock ou de péremption.</p>
              </div>
            )}
            {total === 0 && loading && (
              <div style={{ textAlign: 'center', padding: '20px', color: C.inkMute, fontSize: 13 }}>Chargement…</div>
            )}

            {filtered.map((alert, i) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                last={i === filtered.length - 1}
                onNavigate={(tab) => { setOpen(false); navigate(tab); }}
              />
            ))}
          </div>

          {/* Bouton "Activer les notifications" si permission non accordée */}
          {notifPerm === 'default' && (
            <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.hairline}`, flexShrink: 0 }}>
              <button
                onClick={async () => {
                  const granted = await requestNotificationPermission();
                  setNotifPerm(getNotificationPermission());
                  if (granted) {
                    showNotification(
                      'JunglePharm — Notifications activées',
                      'Vous recevrez des alertes pour les ruptures de stock.',
                      '/icon.svg',
                    );
                  }
                }}
                style={{
                  width: '100%', padding: '8px', borderRadius: 8,
                  fontSize: 12, fontWeight: 600,
                  border: `1px solid rgba(16,120,90,0.25)`,
                  background: 'rgba(16,120,90,0.06)',
                  color: C.brand,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <Bell size={12} strokeWidth={2} />
                Activer les notifications
              </button>
            </div>
          )}

          {/* Footer actions */}
          {total > 0 && (
            <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.hairline}`, display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => { setOpen(false); navigate('stock'); }}
                style={{ flex: 1, padding: '7px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1px solid ${C.hairline}`, background: C.bg, color: C.inkSoft, cursor: 'pointer' }}
              >
                Voir le stock
              </button>
              <button
                onClick={() => { setOpen(false); navigate('expirations'); }}
                style={{ flex: 1, padding: '7px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1px solid ${C.hairline}`, background: C.bg, color: C.inkSoft, cursor: 'pointer' }}
              >
                Voir les péremptions
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Ligne d'alerte ───────────────────────────────────────────────
function AlertRow({ alert, last, onNavigate }: { alert: PharmAlert; last: boolean; onNavigate: (tab: string) => void }) {
  const meta = SEVERITY_META[alert.severity];
  const [hov, setHov] = useState(false);

  return (
    <button
      onClick={() => onNavigate(alert.tab)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '9px 16px',
        borderBottom: last ? 'none' : `1px solid ${C.hairline}`,
        background: hov ? C.bg : 'transparent',
        border: 'none', width: '100%', textAlign: 'left',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
    >
      {/* Icon */}
      <div style={{ width: 28, height: 28, borderRadius: 8, background: meta.bg, border: `1px solid ${meta.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: meta.color }}>
        {meta.icon}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {alert.medicationName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: meta.bg, color: meta.color, border: `1px solid ${meta.bd}` }}>
            {meta.label}
          </span>
          <span style={{ fontSize: 11, color: C.inkMute }}>{alert.detail}</span>
        </div>
      </div>

      <ChevronRight size={12} color={C.inkFaint} style={{ flexShrink: 0, opacity: hov ? 1 : 0, transition: 'opacity 0.1s' }} />
    </button>
  );
}
