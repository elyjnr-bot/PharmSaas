import { useState } from 'react';
import { Home, Package, TrendingUp, DollarSign, Users, Settings, BarChart3, CircleUser as UserCircle, BookOpen } from 'lucide-react';
import { useSeller } from '../lib/sellerContext';

interface SidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
  onSettingsClick: () => void;
}

function HexLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 1L29.856 8.5V23.5L16 31L2.144 23.5V8.5L16 1Z" fill="#059669" />
      <path d="M16 8C16 8 12 14 12 18C12 20.2 13.8 22 16 22C18.2 22 20 20.2 20 18C20 14 16 8 16 8Z" fill="white" stroke="white" strokeWidth="0.5" strokeLinejoin="round" />
      <line x1="16" y1="22" x2="16" y2="25" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

const EMERALD = '#10b981';
const INACTIVE = 'rgba(255,255,255,0.42)';

export default function Sidebar({ activeView, onNavigate, onSettingsClick }: SidebarProps) {
  const { activeSeller } = useSeller();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const navItems = [
    { id: 'dashboard', icon: Home,       label: 'Accueil'  },
    { id: 'stock',     icon: Package,    label: 'Stock'    },
    { id: 'sales',     icon: DollarSign, label: 'Ventes'   },
    { id: 'gestion',   icon: BarChart3,  label: 'Gestion'  },
    { id: 'activite',  icon: TrendingUp, label: 'Activité' },
    { id: 'carnet',    icon: BookOpen,   label: 'Carnet'   },
    { id: 'equipe',    icon: Users,      label: 'Équipe'   },
  ];

  const itemColor = (id: string, isActive: boolean) => {
    if (isActive || hoveredItem === id) return EMERALD;
    return INACTIVE;
  };

  return (
    <aside
      className="fixed left-0 top-0 h-full w-64 flex flex-col"
      style={{
        background: '#030712',
        borderRight: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Brand header */}
      <div className="px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(5,150,105,0.15)', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <HexLogo />
          </div>
          <div>
            <h1 className="text-[15px] font-extrabold text-white" style={{ letterSpacing: '-0.02em' }}>
              Jungle<span style={{ color: '#10b981' }}>Pharm</span>
            </h1>
            <p className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.28)' }}>Dashboard Manager</p>
          </div>
        </div>

        {activeSeller && (
          <div
            className="mt-3 flex items-center gap-2.5 rounded-[10px] px-3 py-2.5"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <UserCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} style={{ color: 'rgba(255,255,255,0.3)' }} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>Vendeur actif</p>
              <p className="text-[13px] font-semibold text-white truncate">{activeSeller.name}</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          const color = itemColor(item.id, isActive);

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] transition-all duration-150 active:scale-[0.98] relative overflow-hidden"
              style={{
                background: isActive
                  ? 'rgba(16,185,129,0.1)'
                  : hoveredItem === item.id
                  ? 'rgba(255,255,255,0.04)'
                  : 'transparent',
                border: isActive ? '1px solid rgba(16,185,129,0.15)' : '1px solid transparent',
              }}
            >
              {isActive && (
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
                  style={{
                    width: '3px',
                    height: '20px',
                    background: EMERALD,
                    boxShadow: `0 0 10px ${EMERALD}80`,
                  }}
                />
              )}
              <Icon
                className="w-[17px] h-[17px] flex-shrink-0"
                strokeWidth={isActive ? 2.5 : 1.75}
                style={{ color, transition: 'color 0.15s ease' }}
              />
              <span
                className="text-[13px]"
                style={{ fontWeight: isActive ? 700 : 500, color, transition: 'color 0.15s ease' }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Settings footer */}
      <div className="p-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <button
          onClick={onSettingsClick}
          onMouseEnter={() => setHoveredItem('settings')}
          onMouseLeave={() => setHoveredItem(null)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] transition-all duration-150 active:scale-[0.98]"
          style={{
            background: hoveredItem === 'settings' ? 'rgba(255,255,255,0.04)' : 'transparent',
            border: hoveredItem === 'settings' ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
          }}
        >
          <Settings
            className="w-[17px] h-[17px]"
            strokeWidth={1.75}
            style={{ color: itemColor('settings', false), transition: 'color 0.15s ease' }}
          />
          <span
            className="text-[13px] font-medium"
            style={{ color: itemColor('settings', false), transition: 'color 0.15s ease' }}
          >
            Réglages
          </span>
        </button>
      </div>
    </aside>
  );
}
