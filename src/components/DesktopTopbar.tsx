import { useRef, useState, useEffect } from 'react';
import { Bell, Filter, Download, Plus, ChevronRight, AlertTriangle, Package, Clock, BookOpen, X, FileText, Upload, ScanLine } from 'lucide-react';
import { useNotifications, AppNotification } from '../lib/useNotifications';
import { printMonthlyReport } from '../lib/printMonthlyReport';
import { exportSalesJournalCsv } from '../lib/exporters';
import { useAuth } from '../lib/auth';
import { getSellerPermissions } from '../lib/permissions';

// Design tokens — Chalk Premium
const C = {
  panel:    'rgba(255,255,255,0.62)',
  hairline: 'rgba(255,255,255,0.55)',
  border:   'rgba(15,15,20,0.06)',
  brand:    '#10785a',
  ink:      '#0a0e14',
  inkSoft:  '#2c3138',
  inkMute:  '#6b7280',
  inkFaint: '#9aa0a8',
  red:      '#c81e1e',
};

const TAB_LABELS: Record<string, { section: string; label: string }> = {
  dashboard:   { section: 'Aperçu',      label: "Aujourd'hui"        },
  sales:       { section: 'Caisse',      label: 'Point de vente'     },
  stock:       { section: 'Inventaire',  label: 'Stock & lots'       },
  patients:    { section: 'Patients',    label: 'CRM patients'       },
  ordonnances: { section: 'Ordonnances', label: 'Prescriptions Rx'   },
  activite:    { section: 'Activité',    label: 'Journal du jour'    },
  carnet:      { section: 'Crédits',     label: 'Comptes clients'    },
  equipe:      { section: 'Équipe',      label: 'Gestion équipe'     },
  expirations: { section: 'Stock',       label: 'Péremptions'        },
  mouvements:  { section: 'Stock',       label: 'Mouvements'         },
  commandes:   { section: 'Achats',      label: 'Commandes fournisseurs' },
  rapports:    { section: 'Gestion',     label: 'Exports & Rapports' },
};

function notifIcon(type: AppNotification['type']) {
  switch (type) {
    case 'rupture':       return <Package size={13} />;
    case 'expiry':        return <Clock size={13} />;
    case 'credit_overdue':return <BookOpen size={13} />;
  }
}

function notifColor(severity: AppNotification['severity'], type: AppNotification['type']) {
  if (severity === 'high') return { dot: '#c81e1e', bg: 'rgba(200,30,30,0.07)', text: '#991b1b' };
  return { dot: '#b75f06', bg: 'rgba(183,95,6,0.07)', text: '#92400e' };
}

// ── Contextual actions per tab ────────────────────────────────────────────────
function dispatch(action: string) {
  window.dispatchEvent(new CustomEvent('topbar-action', { detail: { action } }));
}

interface TabAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'default';
}

function getTabActions(activeTab: string, isManager: boolean, onNewSale?: () => void): TabAction[] {
  const now = new Date();
  switch (activeTab) {
    case 'dashboard':
    case 'activite':
      return [
        {
          label: 'Export CSV',
          icon: <Download size={13} color={C.inkMute} strokeWidth={1.5} />,
          onClick: exportSalesJournalCsv,
        },
        {
          label: 'Rapport PDF',
          icon: <FileText size={13} strokeWidth={1.5} />,
          onClick: () => printMonthlyReport(now.getFullYear(), now.getMonth() + 1),
          variant: 'primary',
        },
      ];
    case 'patients':
      return [
        {
          label: 'Nouveau patient',
          icon: <Plus size={13} strokeWidth={2.5} />,
          onClick: () => dispatch('add-patient'),
          variant: 'primary',
        },
      ];
    case 'ordonnances':
      return [
        {
          label: 'Nouvelle ordonnance',
          icon: <Plus size={13} strokeWidth={2.5} />,
          onClick: () => dispatch('add-ordonnance'),
          variant: 'primary',
        },
      ];
    case 'stock': {
      // Permission "allowManualProductAdd" : si désactivée et utilisateur non-manager → pas de bouton
      const canAdd = isManager || getSellerPermissions().allowManualProductAdd;
      if (!canAdd) return [];
      return [
        {
          label: 'Nouveau lot',
          icon: <Plus size={13} strokeWidth={2.5} />,
          onClick: () => dispatch('add-lot'),
          variant: 'primary',
        },
      ];
    }
    case 'carnet':
      return [
        {
          label: 'Nouveau crédit',
          icon: <Plus size={13} strokeWidth={2.5} />,
          onClick: () => dispatch('add-credit'),
          variant: 'primary',
        },
      ];
    case 'equipe':
      return [
        {
          label: 'Nouveau vendeur',
          icon: <Plus size={13} strokeWidth={2.5} />,
          onClick: () => dispatch('add-seller'),
          variant: 'primary',
        },
      ];
    case 'mouvements':
      return [
        {
          label: 'Réception BL',
          icon: <Upload size={13} strokeWidth={2} />,
          onClick: () => dispatch('mouvements-reception'),
          variant: 'primary',
        },
      ];
    default:
      return [];
  }
}

interface DesktopTopbarProps {
  activeTab: string;
  onNewSale?: () => void;
  onFilter?: () => void;
  onExport?: () => void;
}

export default function DesktopTopbar({ activeTab, onNewSale, onFilter, onExport }: DesktopTopbarProps) {
  const crumb = TAB_LABELS[activeTab] ?? { section: 'Aperçu', label: activeTab };
  const { notifications, count, reload } = useNotifications();
  const [showPanel, setShowPanel] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const { isManager } = useAuth();
  const tabActions = getTabActions(activeTab, isManager, onNewSale);

  // ── Scanner activity badge ──────────────────────────────────────────────────
  const [scannerFlash, setScannerFlash] = useState(false);
  const [scannerBarcode, setScannerBarcode] = useState('');
  const scannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const { barcode } = (e as CustomEvent<{ barcode: string }>).detail;
      setScannerBarcode(barcode);
      setScannerFlash(true);
      if (scannerTimerRef.current) clearTimeout(scannerTimerRef.current);
      scannerTimerRef.current = setTimeout(() => {
        setScannerFlash(false);
        setScannerBarcode('');
      }, 3000);
    };
    window.addEventListener('barcode-scanned', handler);
    return () => {
      window.removeEventListener('barcode-scanned', handler);
      if (scannerTimerRef.current) clearTimeout(scannerTimerRef.current);
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!showPanel) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bellRef.current && !bellRef.current.contains(e.target as Node)
      ) {
        setShowPanel(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPanel]);

  const grouped = {
    rupture: notifications.filter(n => n.type === 'rupture'),
    expiry:  notifications.filter(n => n.type === 'expiry'),
    credit_overdue: notifications.filter(n => n.type === 'credit_overdue'),
  };

  return (
    <header
      style={{
        height: 56,
        background: C.panel,
        backdropFilter: 'saturate(180%) blur(28px)',
        WebkitBackdropFilter: 'saturate(180%) blur(28px)',
        borderBottom: `1px solid ${C.hairline}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      {/* Breadcrumb */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <span style={{ color: C.inkMute }}>{crumb.section}</span>
        <ChevronRight size={12} color={C.inkFaint} strokeWidth={1.5} />
        <span style={{ color: C.ink, fontWeight: 600, letterSpacing: '-0.01em' }}>{crumb.label}</span>
      </nav>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Contextual tab actions */}
        {tabActions.map((action, i) =>
          action.variant === 'primary' ? (
            <button
              key={i}
              onClick={action.onClick}
              style={{
                background: C.ink, color: '#fff', border: 'none', borderRadius: 7,
                padding: '7px 14px', fontSize: 13, fontWeight: 600,
                letterSpacing: '-0.01em', cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: 6,
                boxShadow: '0 1px 2px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.1)',
                transition: 'opacity 0.12s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              {action.icon}
              {action.label}
            </button>
          ) : (
            <button
              key={i}
              onClick={action.onClick}
              style={{
                background: 'transparent', border: `1px solid ${C.hairline}`, borderRadius: 7,
                padding: '6px 10px', fontSize: 12.5, color: C.inkSoft, display: 'flex',
                alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 500,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.5)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {action.icon}
              {action.label}
            </button>
          )
        )}

        {/* "Nouvelle vente" — toujours visible sauf sur la caisse elle-même */}
        {activeTab !== 'sales' && tabActions.every(a => a.variant !== 'primary') && (
          <>
            {tabActions.length > 0 && <div style={{ width: 1, height: 22, background: C.hairline, margin: '0 4px' }} />}
            <button
              onClick={onNewSale}
              style={{
                background: C.ink, color: '#fff', border: 'none', borderRadius: 7,
                padding: '7px 14px', fontSize: 13, fontWeight: 600,
                letterSpacing: '-0.01em', cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: 6,
                boxShadow: '0 1px 2px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.1)',
                transition: 'opacity 0.12s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              <Plus size={14} strokeWidth={2.5} />
              Nouvelle vente
            </button>
          </>
        )}

        {/* ── Scanner actif badge ── */}
        {scannerFlash && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(16, 120, 90, 0.10)',
              border: '1px solid rgba(16, 120, 90, 0.22)',
              borderRadius: 99, padding: '4px 10px',
              fontSize: 12, fontWeight: 600, color: C.brand,
              animation: 'scanner-flash-in 0.2s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <ScanLine size={12} strokeWidth={2} color={C.brand} />
            {scannerBarcode.length > 16
              ? scannerBarcode.slice(0, 16) + '…'
              : scannerBarcode}
          </div>
        )}

        <div style={{ width: 1, height: 22, background: C.hairline, margin: '0 4px' }} />

        {/* Bell + notifications panel */}
        <div style={{ position: 'relative' }}>
          <button
            ref={bellRef}
            onClick={() => { setShowPanel(v => !v); if (!showPanel) reload(); }}
            style={{
              background: showPanel ? 'rgba(255,255,255,0.4)' : 'transparent',
              border: 'none', position: 'relative', cursor: 'pointer',
              padding: 8, display: 'flex', color: C.inkSoft, borderRadius: 7,
              transition: 'background 0.12s',
            }}
          >
            <Bell size={16} strokeWidth={1.5} />
            {count > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 4,
                minWidth: 16, height: 16, borderRadius: 99,
                background: C.red, color: '#fff',
                fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px',
                boxShadow: `0 0 0 2px ${C.panel}`,
              }}>
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>

          {/* Notification panel */}
          {showPanel && (
            <div
              ref={panelRef}
              style={{
                position: 'absolute', top: 44, right: 0,
                width: 340, maxHeight: 480, overflowY: 'auto',
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'saturate(180%) blur(24px)',
                WebkitBackdropFilter: 'saturate(180%) blur(24px)',
                border: `1px solid ${C.hairline}`,
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                zIndex: 100,
              }}
            >
              {/* Header */}
              <div style={{ padding: '12px 14px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.hairline}` }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                  Alertes
                  {count > 0 && <span style={{ marginLeft: 6, background: C.red, color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 99, padding: '1px 6px' }}>{count}</span>}
                </span>
                <button onClick={() => setShowPanel(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, color: C.inkMute, display: 'flex' }}>
                  <X size={13} />
                </button>
              </div>

              {count === 0 ? (
                <div style={{ padding: '32px 14px', textAlign: 'center', color: C.inkMute, fontSize: 13 }}>
                  ✅ Aucune alerte en cours
                </div>
              ) : (
                <div>
                  {/* Ruptures */}
                  {grouped.rupture.length > 0 && (
                    <NotifGroup label="Ruptures de stock" items={grouped.rupture} />
                  )}
                  {/* Péremptions */}
                  {grouped.expiry.length > 0 && (
                    <NotifGroup label="Péremptions proches" items={grouped.expiry} />
                  )}
                  {/* Crédits */}
                  {grouped.credit_overdue.length > 0 && (
                    <NotifGroup label="Crédits en retard" items={grouped.credit_overdue} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </header>
  );
}

function NotifGroup({ label, items }: { label: string; items: AppNotification[] }) {
  return (
    <div>
      <div style={{ padding: '8px 14px 4px', fontSize: 10.5, fontWeight: 600, color: C.inkMute, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </div>
      {items.map(n => {
        const col = notifColor(n.severity, n.type);
        return (
          <div key={n.id} style={{ padding: '8px 14px', display: 'flex', alignItems: 'flex-start', gap: 10, borderBottom: `1px solid ${C.hairline}` }}>
            <div style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, background: col.bg, color: col.text, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              {notifIcon(n.type)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: C.ink, lineHeight: 1.3 }}>{n.title}</div>
              <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>{n.detail}</div>
            </div>
            <div style={{ flexShrink: 0, width: 6, height: 6, borderRadius: 99, background: col.dot, marginTop: 6 }} />
          </div>
        );
      })}
    </div>
  );
}
