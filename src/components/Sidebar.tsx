import { useState } from 'react';
import {
  Home, Package, TrendingUp, DollarSign, Users, Settings,
  BarChart3, BookOpen, Search, ChevronDown, MoreHorizontal,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useSeller } from '../lib/sellerContext';

// ── Chalk Premium design tokens ──────────────────────────────────
const C = {
  panel:    'rgba(255,255,255,0.62)',
  panel2:   'rgba(255,255,255,0.40)',
  hairline: 'rgba(255,255,255,0.55)',
  border:   'rgba(15,15,20,0.06)',
  brand:    '#10785a',
  brandHi:  '#149a73',
  brandLt:  'rgba(16,120,90,0.08)',
  ink:      '#0a0e14',
  inkSoft:  '#2c3138',
  inkMute:  '#6b7280',
  inkFaint: '#9aa0a8',
  red:      '#c81e1e',
  amber:    '#b75f06',
};

// Leaf SVG icon (brand)
function LeafIcon({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 4 13c0-1 0-9 9-9 .5 5 0 9-3 11M11 20s.5-7 9-8"/>
    </svg>
  );
}

// Keyboard shortcut badge
function Kbd({ children }: { children: string }) {
  return (
    <kbd style={{
      fontFamily: '"SF Mono", "Geist Mono", ui-monospace, Menlo, monospace',
      fontSize: 10.5,
      color: C.inkMute,
      background: C.panel,
      padding: '1px 5px',
      borderRadius: 4,
      border: `1px solid ${C.border}`,
      boxShadow: `0 1px 0 ${C.border}`,
      lineHeight: 1.6,
      fontWeight: 500,
      flexShrink: 0,
    }}>{children}</kbd>
  );
}

interface SidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
  onSettingsClick: () => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', Icon: Home,       label: 'Accueil',    kbd: 'D' },
  { id: 'stock',     Icon: Package,    label: 'Stock',      kbd: 'S' },
  { id: 'sales',     Icon: DollarSign, label: 'Ventes',     kbd: 'V' },
  { id: 'gestion',   Icon: BarChart3,  label: 'Gestion',    kbd: 'G' },
  { id: 'activite',  Icon: TrendingUp, label: 'Activité',   kbd: 'A' },
  { id: 'carnet',    Icon: BookOpen,   label: 'Carnet',     kbd: 'C' },
  { id: 'equipe',    Icon: Users,      label: 'Équipe',     kbd: 'E' },
];

const FAVORITES = [
  { label: 'Ruptures critiques', color: C.red },
  { label: 'Lots péremption',    color: C.amber },
  { label: 'Top ventes',         color: C.brand },
];

export default function Sidebar({ activeView, onNavigate, onSettingsClick }: SidebarProps) {
  const { profile } = useAuth();
  const { activeSeller } = useSeller();
  const [hovered, setHovered] = useState<string | null>(null);

  const initials = (name?: string) => {
    if (!name) return 'MG';
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  };

  const displayName = activeSeller?.name ?? profile?.full_name ?? profile?.email?.split('@')[0] ?? 'Manager';
  const role = profile?.role === 'manager' ? 'Pharmacien gérant' : 'Vendeur';

  return (
    <aside
      style={{
        width: 244,
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        background: C.panel2,
        backdropFilter: 'saturate(180%) blur(28px)',
        WebkitBackdropFilter: 'saturate(180%) blur(28px)',
        borderRight: `1px solid ${C.hairline}`,
        zIndex: 20,
        flexShrink: 0,
      }}
    >
      {/* ── Workspace header ── */}
      <div style={{ padding: '14px 14px', borderBottom: `1px solid ${C.hairline}` }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '4px 6px', borderRadius: 8, cursor: 'pointer',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: `linear-gradient(135deg, ${C.brand}, ${C.brandHi})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 2px rgba(16,120,90,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
            flexShrink: 0,
          }}>
            <LeafIcon size={14} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: '-0.015em', lineHeight: 1.2 }}>
              Jungle<span style={{ color: C.brand }}>Pharm</span>
            </div>
            <div style={{ fontSize: 11, color: C.inkMute, lineHeight: 1.4 }}>Pharma. Centrale</div>
          </div>
          <ChevronDown size={14} color={C.inkFaint} strokeWidth={1.5} />
        </div>
      </div>

      {/* ── Search ── */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: C.panel, border: `1px solid ${C.hairline}`,
          borderRadius: 7, padding: '6px 10px', cursor: 'pointer',
        }}>
          <Search size={14} color={C.inkFaint} strokeWidth={1.5} />
          <span style={{ fontSize: 12.5, color: C.inkMute, flex: 1 }}>Rechercher…</span>
          <Kbd>⌘K</Kbd>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav style={{ flex: 1, padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
        {NAV_ITEMS.map(({ id, Icon, label, kbd }) => {
          const isActive = activeView === id;
          const isHov = hovered === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              onMouseEnter={() => setHovered(id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 7,
                background: isActive ? C.panel : isHov ? 'rgba(255,255,255,0.3)' : 'transparent',
                boxShadow: isActive ? `0 1px 0 ${C.hairline}, 0 0 0 1px ${C.hairline}` : 'none',
                cursor: 'pointer', transition: 'all 0.12s',
                border: 'none', width: '100%', textAlign: 'left',
              }}
            >
              <Icon
                size={15}
                strokeWidth={isActive ? 1.8 : 1.5}
                color={isActive ? C.brand : C.inkMute}
                style={{ flexShrink: 0, transition: 'color 0.12s' }}
              />
              <span style={{
                fontSize: 13,
                fontWeight: isActive ? 600 : 450,
                color: isActive ? C.ink : C.inkSoft,
                letterSpacing: '-0.01em',
                flex: 1,
                transition: 'color 0.12s',
              }}>
                {label}
              </span>
              <Kbd>{kbd}</Kbd>
            </button>
          );
        })}

        {/* ── Favoris ── */}
        <div style={{
          padding: '14px 10px 6px',
          fontSize: 10.5, color: C.inkFaint, fontWeight: 500,
          letterSpacing: '0.05em', textTransform: 'uppercase',
        }}>
          Favoris
        </div>
        {FAVORITES.map((f, i) => (
          <button
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 10px', borderRadius: 7, cursor: 'pointer',
              background: 'transparent', border: 'none', width: '100%', textAlign: 'left',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 2, background: f.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 450, letterSpacing: '-0.005em' }}>{f.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Settings ── */}
      <div style={{ padding: '8px 8px 0', borderTop: `1px solid ${C.hairline}` }}>
        <button
          onClick={onSettingsClick}
          onMouseEnter={() => setHovered('settings')}
          onMouseLeave={() => setHovered(null)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 10px', borderRadius: 7, width: '100%',
            background: hovered === 'settings' ? 'rgba(255,255,255,0.3)' : 'transparent',
            border: 'none', cursor: 'pointer', textAlign: 'left',
            transition: 'background 0.12s',
          }}
        >
          <Settings size={15} strokeWidth={1.5} color={C.inkMute} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 450, color: C.inkSoft, letterSpacing: '-0.01em', flex: 1 }}>Réglages</span>
          <Kbd>,</Kbd>
        </button>
      </div>

      {/* ── User card ── */}
      <div style={{ padding: 12 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '6px 8px', borderRadius: 8,
          background: C.panel, border: `1px solid ${C.hairline}`,
        }}>
          {/* Avatar */}
          <div style={{
            width: 26, height: 26, borderRadius: 99, flexShrink: 0,
            background: `linear-gradient(135deg, ${C.brand}, ${C.brandHi})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 9.5, fontWeight: 700, letterSpacing: '-0.01em',
          }}>
            {initials(displayName)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, letterSpacing: '-0.01em', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayName}
            </div>
            <div style={{ fontSize: 10.5, color: C.inkMute, display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: C.brand }} />
              {role}
            </div>
          </div>
          <MoreHorizontal size={14} color={C.inkFaint} strokeWidth={1.5} style={{ flexShrink: 0 }} />
        </div>
      </div>
    </aside>
  );
}
