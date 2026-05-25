import { Bell, Filter, Download, Plus, ChevronRight } from 'lucide-react';

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
  dashboard: { section: 'Accueil',    label: "Tableau de bord"   },
  stock:     { section: 'Stock',      label: 'Inventaire'        },
  sales:     { section: 'Ventes',     label: 'Point de vente'    },
  gestion:   { section: 'Gestion',    label: 'Stock & produits'  },
  activite:  { section: 'Activité',   label: 'Journal du jour'   },
  carnet:    { section: 'Carnet',     label: 'Crédits clients'   },
  equipe:    { section: 'Équipe',     label: 'Gestion équipe'    },
};

interface DesktopTopbarProps {
  activeTab: string;
  onNewSale?: () => void;
}

export default function DesktopTopbar({ activeTab, onNewSale }: DesktopTopbarProps) {
  const crumb = TAB_LABELS[activeTab] ?? { section: 'Aperçu', label: activeTab };

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
        {/* Filter */}
        <button style={{
          background: 'transparent',
          border: `1px solid ${C.hairline}`,
          borderRadius: 7,
          padding: '6px 10px',
          fontSize: 12.5,
          color: C.inkSoft,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          fontWeight: 500,
          transition: 'background 0.12s',
        }}>
          <Filter size={13} color={C.inkMute} strokeWidth={1.5} />
          Filtres
        </button>

        {/* Export */}
        <button style={{
          background: 'transparent',
          border: `1px solid ${C.hairline}`,
          borderRadius: 7,
          padding: '6px 10px',
          fontSize: 12.5,
          color: C.inkSoft,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          fontWeight: 500,
        }}>
          <Download size={13} color={C.inkMute} strokeWidth={1.5} />
          Exporter
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 22, background: C.hairline, margin: '0 4px' }} />

        {/* Bell */}
        <button style={{
          background: 'transparent',
          border: 'none',
          position: 'relative',
          cursor: 'pointer',
          padding: 8,
          display: 'flex',
          color: C.inkSoft,
          borderRadius: 7,
        }}>
          <Bell size={16} strokeWidth={1.5} />
          <span style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 7,
            height: 7,
            borderRadius: 99,
            background: C.red,
            boxShadow: `0 0 0 2px ${C.panel}`,
          }} />
        </button>

        {/* CTA */}
        <button
          onClick={onNewSale}
          style={{
            background: C.ink,
            color: '#fff',
            border: 'none',
            borderRadius: 7,
            padding: '7px 14px',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 1px 2px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.1)',
            transition: 'opacity 0.12s',
          }}
        >
          <Plus size={14} strokeWidth={2.5} />
          Nouvelle vente
        </button>
      </div>
    </header>
  );
}
