import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, MoreHorizontal } from 'lucide-react';
import {
  SquaresFour, ShoppingCartSimple, Package, User, Sparkle, Wallet,
  Users, GearSix, Pill, CalendarCheck, Truck, ChartBar, ArrowsDownUp,
  Buildings, Wrench,
} from '@phosphor-icons/react';
import { LogoIcon } from './LogoIcon';
import { useAuth } from '../lib/auth';
import { useSeller } from '../lib/sellerContext';
import AlertsBell from './AlertsBell';
import SyncIndicator from './SyncIndicator';
import { loadSettings } from '../lib/settings';
import { getCachedSettings } from '../lib/userSettings';

// ── Phosphor Icons Bold/Fill — icon set premium ───────────────────
type IconName = 'home' | 'cart' | 'box' | 'person' | 'sparkles' | 'mone' | 'users' | 'settings' | 'rx' | 'calendar' | 'truck' | 'chart' | 'arrows' | 'building';

const PHOSPHOR_MAP: Record<IconName, React.ElementType> = {
  home:     SquaresFour,
  cart:     ShoppingCartSimple,
  box:      Package,
  person:   User,
  sparkles: Sparkle,
  mone:     Wallet,
  users:    Users,
  settings: GearSix,
  rx:       Pill,
  calendar: CalendarCheck,
  truck:    Truck,
  chart:    ChartBar,
  arrows:   ArrowsDownUp,
  building: Buildings,
};

function NavIcon({ name, size = 15, color = 'currentColor', active = false }: { name: IconName; size?: number; color?: string; active?: boolean }) {
  const Icon = PHOSPHOR_MAP[name];
  return <Icon size={size} color={color} weight={active ? 'fill' : 'bold'} />;
}

// ── Chalk Premium design tokens ──────────────────────────────────
const C = {
  panel:    'rgba(255,255,255,0.62)',
  panel2:   'rgba(255,255,255,0.40)',
  hairline: 'rgba(255,255,255,0.55)',
  border:   'rgba(15,15,20,0.06)',
  brand:    '#537d14',
  brandHi:  '#6a9e28',
  brandLt:  'rgba(83,125,20,0.08)',
  ink:      '#0a0e14',
  inkSoft:  '#2c3138',
  inkMute:  '#6b7280',
  inkFaint: '#9aa0a8',
  red:      '#c81e1e',
  amber:    '#b75f06',
};

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
  isManager?: boolean;
}

// 'Aperçu' (dashboard) fusionne désormais l'ancien onglet 'Activité'
// (financiers + opérations) → réservé au manager.
const NAV_ITEMS: { id: string; icon: IconName; label: string; kbd: string; managerOnly?: boolean }[] = [
  { id: 'dashboard',   icon: 'home',     label: 'Aperçu',       kbd: 'D', managerOnly: true },
  { id: 'sales',       icon: 'cart',     label: 'Caisse',       kbd: 'P' },
  { id: 'stock',       icon: 'box',      label: 'Inventaire',   kbd: 'I' },
  { id: 'patients',    icon: 'person',   label: 'Patients',     kbd: 'A' },
  { id: 'ordonnances', icon: 'rx',       label: 'Ordonnances',  kbd: 'R' },
  { id: 'carnet',      icon: 'mone',     label: 'Crédits',      kbd: 'C' },
  { id: 'equipe',      icon: 'users',    label: 'Équipe',       kbd: 'E' },
  { id: 'rapports',    icon: 'chart',    label: 'Rapports',     kbd: 'G', managerOnly: true },
];

// Onglets regroupés sous "Gestion" (rarement utilisés, max 1-2x/semaine)
const GESTION_ITEMS: { id: string; icon: IconName; label: string; kbd: string; managerOnly?: boolean }[] = [
  { id: 'expirations',  icon: 'calendar', label: 'Péremptions',  kbd: 'X' },
  { id: 'mouvements',   icon: 'arrows',   label: 'Mouvements',   kbd: 'M' },
  { id: 'commandes',    icon: 'truck',    label: 'Commandes',    kbd: 'O' },
  { id: 'fournisseurs', icon: 'building', label: 'Fournisseurs', kbd: 'F', managerOnly: true },
];

// ── Catalog complet des raccourcis disponibles ────────────────────────────────
interface ShortcutDef {
  id: string;
  label: string;
  color: string;
  route: string;   // vue à activer via onNavigate
  hint: string;
  managerOnly?: boolean;
}

const SHORTCUT_CATALOG: ShortcutDef[] = [
  { id: 'ruptures',   label: 'Ruptures critiques', color: C.red,     route: 'ruptures',    hint: 'Produits en rupture de stock' },
  { id: 'peremption', label: 'Lots péremption',    color: C.amber,   route: 'expirations', hint: 'Lots bientôt expirés' },
  { id: 'topventes',  label: 'Top ventes',         color: C.brand,   route: 'topventes',   hint: 'Classement des produits' },
  { id: 'dashboard',  label: 'Aperçu',             color: C.brand,   route: 'dashboard',   hint: 'Tableau de bord', managerOnly: true },
  { id: 'sales',      label: 'Caisse',             color: '#0651bc', route: 'sales',       hint: 'Point de vente' },
  { id: 'patients',   label: 'Patients CRM',       color: '#6e44b0', route: 'patients',    hint: 'Gestion patients' },
  { id: 'ordonnances',label: 'Ordonnances',        color: '#b75f06', route: 'ordonnances', hint: 'Prescriptions en cours' },
  { id: 'commandes',  label: 'Commandes',          color: '#0f7e5e', route: 'commandes',   hint: 'Fournisseurs' },
  { id: 'mouvements', label: 'Mouvements',         color: '#9aa0a8', route: 'mouvements',  hint: 'Historique des entrées/sorties' },
  { id: 'rapports',   label: 'Rapports',           color: '#0651bc', route: 'rapports',    hint: 'Rapports & exports', managerOnly: true },
  { id: 'carnet',      label: 'Crédits clients',   color: '#c81e1e', route: 'carnet',       hint: 'Comptes clients' },
  { id: 'fournisseurs',label: 'Fournisseurs',      color: '#537d14', route: 'fournisseurs', hint: 'Gestion des fournisseurs', managerOnly: true },
];

const FAV_STORAGE_KEY = 'jp_sidebar_favs_v1';
const DEFAULT_FAV_IDS = ['ruptures', 'peremption', 'topventes'];

function loadFavIds(): string[] {
  try {
    const raw = localStorage.getItem(FAV_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return DEFAULT_FAV_IDS;
}
function saveFavIds(ids: string[]) {
  try { localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(ids)); } catch { /* quota */ }
}

export default function Sidebar({ activeView, onNavigate, onSettingsClick, isManager = true }: SidebarProps) {
  const { profile, user } = useAuth();
  const navItems = NAV_ITEMS.filter(item => isManager || !item.managerOnly);
  const { activeSeller } = useSeller();
  const [hovered, setHovered]           = useState<string | null>(null);
  const [pressed, setPressed]           = useState<string | null>(null);
  const [favIds, setFavIds]             = useState<string[]>(() => loadFavIds());
  const [editingFavs, setEditingFavs]   = useState(false);
  const gestionIds = GESTION_ITEMS.map(i => i.id);
  const [gestionOpen, setGestionOpen]   = useState(() => gestionIds.includes(activeView));

  // ── Nom de la pharmacie — lit les deux sources et prend la première valide ──
  const getPharmName = () => {
    // Source 1 : cache Supabase user_settings (plus fiable, mis à jour par Settings)
    if (user?.id) {
      const cached = getCachedSettings(user.id);
      if (cached.pharmacy_name && cached.pharmacy_name.trim()) return cached.pharmacy_name;
    }
    // Source 2 : localStorage jungle_pharm_settings (legacy + onboarding)
    const legacy = loadSettings().pharmacy_name;
    if (legacy && legacy !== 'JUNGLE PHARM') return legacy;
    return '';
  };
  const [pharmacyName, setPharmacyName] = useState(() => getPharmName());
  // Re-lit quand user change ou quand Settings déclenche un event
  useEffect(() => {
    setPharmacyName(getPharmName());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  useEffect(() => {
    const refresh = () => setPharmacyName(getPharmName());
    window.addEventListener('junglepharm:settings_updated', refresh);
    window.addEventListener('junglepharm:tax_updated', refresh); // settings saved
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('junglepharm:settings_updated', refresh);
      window.removeEventListener('junglepharm:tax_updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  const [favDropOpen, setFavDropOpen]   = useState(false);
  const favDropRef                       = useRef<HTMLDivElement>(null);

  // Ferme le dropdown si on clique ailleurs
  useEffect(() => {
    if (!favDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (favDropRef.current && !favDropRef.current.contains(e.target as Node)) {
        setFavDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [favDropOpen]);

  // Auto-expand groupe Gestion si l'onglet actif en fait partie
  useEffect(() => {
    if (gestionIds.includes(activeView)) setGestionOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  const catalog = SHORTCUT_CATALOG.filter(s => isManager || !s.managerOnly);
  const activeFavs = favIds
    .map(id => catalog.find(s => s.id === id))
    .filter(Boolean) as ShortcutDef[];

  const toggleFav = (id: string) => {
    setFavIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      saveFavIds(next);
      return next;
    });
  };

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
          <div style={{ flexShrink: 0 }}>
            <LogoIcon size={28} radius={8} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Mode white-label léger : nom pharmacie en avant, JunglePharm en attribution */}
            {pharmacyName ? (
              <>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: C.ink,
                  letterSpacing: '-0.015em', lineHeight: 1.2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {pharmacyName}
                </div>
                <div style={{ fontSize: 10, color: C.inkFaint, lineHeight: 1.4, marginTop: 1 }}>
                  Powered by <span style={{ color: C.brand, fontWeight: 600 }}>JunglePharm</span>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: '-0.015em', lineHeight: 1.2 }}>
                  Jungle<span style={{ color: C.brand }}>Pharm</span>
                </div>
                <div style={{ fontSize: 11, color: C.inkMute, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Configurer le nom →
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <ChevronDown size={14} color={C.inkFaint} strokeWidth={1.5} />
          </div>
        </div>
      </div>

      {/* ── Search ── */}
      <div style={{ padding: '10px 12px' }}>
        <button
          onClick={() => {
            // Déclenche ⌘K via un événement clavier synthétique
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            background: C.panel, border: `1px solid ${C.hairline}`,
            borderRadius: 7, padding: '6px 10px', cursor: 'pointer',
            transition: 'background 0.12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.5)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = C.panel; }}
        >
          <Search size={14} color={C.inkFaint} strokeWidth={1.5} />
          <span style={{ fontSize: 12.5, color: C.inkMute, flex: 1, textAlign: 'left' }}>Rechercher…</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>

      {/* ── Navigation ── */}
      <nav style={{ flex: 1, padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
        {navItems.map(({ id, icon, label, kbd }) => {
          const isActive = activeView === id;
          const isHov = hovered === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              onMouseEnter={() => setHovered(id)}
              onMouseLeave={() => { setHovered(null); setPressed(null); }}
              onMouseDown={() => setPressed(id)}
              onMouseUp={() => setPressed(null)}
              onTouchStart={() => setPressed(id)}
              onTouchEnd={() => setPressed(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 7,
                background: isActive ? C.panel : isHov ? 'rgba(255,255,255,0.12)' : 'transparent',
                boxShadow: isActive ? `0 1px 0 ${C.hairline}, 0 0 0 1px ${C.hairline}` : 'none',
                cursor: 'pointer',
                transition: pressed === id ? 'transform 0.07s ease' : 'transform 0.15s ease, background 0.12s',
                transform: pressed === id ? 'scale(0.96)' : 'scale(1)',
                border: 'none', width: '100%', textAlign: 'left',
              }}
            >
              <span style={{ flexShrink: 0, display: 'flex', transition: 'color 0.12s' }}>
                <NavIcon name={icon} size={15} active={isActive} color={isActive ? C.brand : C.inkMute} />
              </span>
              <span style={{
                fontSize: 13,
                fontWeight: isActive ? 600 : 450,
                color: isActive ? C.brand : C.inkSoft,
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

        {/* ── Groupe Gestion (collapsible) ── */}
        <div style={{ marginTop: 2 }}>
          {/* En-tête du groupe */}
          <button
            onClick={() => setGestionOpen(v => !v)}
            onMouseEnter={() => setHovered('__gestion')}
            onMouseLeave={() => { setHovered(null); setPressed(null); }}
            onMouseDown={() => setPressed('__gestion')}
            onMouseUp={() => setPressed(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '6px 10px', borderRadius: 7,
              background: hovered === '__gestion' ? 'rgba(255,255,255,0.12)' : 'transparent',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              transition: pressed === '__gestion' ? 'transform 0.07s ease' : 'transform 0.15s ease, background 0.12s',
              transform: pressed === '__gestion' ? 'scale(0.97)' : 'scale(1)',
            }}
          >
            {/* Icône outils Phosphor */}
            <span style={{ flexShrink: 0, display: 'flex' }}>
              <Wrench
                size={15}
                color={gestionIds.includes(activeView) ? C.brand : C.inkMute}
                weight={gestionIds.includes(activeView) ? 'fill' : 'bold'}
              />
            </span>
            <span style={{
              fontSize: 13, flex: 1,
              fontWeight: gestionIds.includes(activeView) ? 600 : 450,
              color: gestionIds.includes(activeView) ? C.brand : C.inkSoft,
              letterSpacing: '-0.01em',
            }}>
              Gestion
            </span>
            {/* Point indicateur si un onglet Gestion est actif mais groupe fermé */}
            {!gestionOpen && gestionIds.includes(activeView) && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.brand, flexShrink: 0, marginRight: 4 }} />
            )}
            <ChevronDown
              size={13} color={C.inkFaint} strokeWidth={2}
              style={{ transition: 'transform 0.2s', transform: gestionOpen ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
            />
          </button>

          {/* Items du groupe — animés */}
          <div style={{
            overflow: 'hidden',
            maxHeight: gestionOpen ? '300px' : '0px',
            transition: 'max-height 0.22s cubic-bezier(0.4,0,0.2,1)',
          }}>
            <div style={{ paddingLeft: 6, paddingTop: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {GESTION_ITEMS.filter(item => isManager || !item.managerOnly).map(({ id, icon, label, kbd }) => {
                const isActive = activeView === id;
                const isHov = hovered === id;
                return (
                  <button
                    key={id}
                    onClick={() => onNavigate(id)}
                    onMouseEnter={() => setHovered(id)}
                    onMouseLeave={() => { setHovered(null); setPressed(null); }}
                    onMouseDown={() => setPressed(id)}
                    onMouseUp={() => setPressed(null)}
                    onTouchStart={() => setPressed(id)}
                    onTouchEnd={() => setPressed(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '6px 10px', borderRadius: 7,
                      background: isActive ? C.panel : isHov ? 'rgba(255,255,255,0.12)' : 'transparent',
                      boxShadow: isActive ? `0 1px 0 ${C.hairline}, 0 0 0 1px ${C.hairline}` : 'none',
                      cursor: 'pointer',
                      transition: pressed === id ? 'transform 0.07s ease' : 'transform 0.15s ease, background 0.12s',
                      transform: pressed === id ? 'scale(0.96)' : 'scale(1)',
                      border: 'none', width: '100%', textAlign: 'left',
                    }}
                  >
                    {/* Trait de connexion vertical */}
                    <span style={{ width: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <span style={{ width: 1, height: 14, background: isActive ? C.brand : 'rgba(15,15,20,0.12)', borderRadius: 1 }} />
                    </span>
                    <span style={{ flexShrink: 0, display: 'flex' }}>
                      <NavIcon name={icon} size={14} active={isActive} color={isActive ? C.brand : C.inkMute} />
                    </span>
                    <span style={{
                      fontSize: 12.5, fontWeight: isActive ? 600 : 450,
                      color: isActive ? C.brand : C.inkSoft,
                      letterSpacing: '-0.01em', flex: 1,
                    }}>
                      {label}
                    </span>
                    <Kbd>{kbd}</Kbd>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Favoris ── */}
        <div style={{ padding: '14px 10px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10.5, color: C.inkFaint, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Favoris
          </span>
          <button
            onClick={() => setEditingFavs(v => !v)}
            title={editingFavs ? 'Terminer' : 'Personnaliser les favoris'}
            style={{
              border: 'none', background: editingFavs ? C.brandLt : 'transparent',
              borderRadius: 5, padding: '2px 6px', cursor: 'pointer',
              fontSize: 10.5, color: editingFavs ? C.brand : C.inkFaint,
              fontWeight: editingFavs ? 600 : 400, transition: 'all 0.12s',
            }}
          >
            {editingFavs ? 'Terminer' : '+ Modifier'}
          </button>
        </div>

        {/* Picker — visible quand editingFavs */}
        {editingFavs && (
          <div style={{
            margin: '2px 8px 6px', borderRadius: 9,
            background: 'rgba(255,255,255,0.45)',
            border: `1px solid ${C.border}`,
            maxHeight: 260,
            overflowY: 'auto',
          }}>
            {catalog.map(s => {
              const active = favIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleFav(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    width: '100%', border: 'none', borderBottom: `1px solid ${C.border}`,
                    background: 'transparent', cursor: 'pointer',
                    padding: '7px 10px', textAlign: 'left', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(83,125,20,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{
                    width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                    border: active ? 'none' : `1.5px solid ${C.inkFaint}`,
                    background: active ? s.color : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.12s',
                  }}>
                    {active && (
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span style={{ width: 6, height: 6, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: C.inkSoft, flex: 1 }}>{s.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Dropdown favoris actifs ── */}
        {!editingFavs && (
          <div ref={favDropRef} style={{ position: 'relative', margin: '2px 8px 2px' }}>
            {/* Bouton déclencheur */}
            <button
              onClick={() => setFavDropOpen(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '7px 10px', borderRadius: 7,
                background: favDropOpen ? C.panel : 'transparent',
                border: favDropOpen ? `1px solid ${C.hairline}` : '1px solid transparent',
                cursor: 'pointer', transition: 'all 0.12s',
                boxShadow: favDropOpen ? `0 1px 0 ${C.hairline}` : 'none',
              }}
              onMouseEnter={e => { if (!favDropOpen) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.3)'; }}
              onMouseLeave={e => { if (!favDropOpen) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.brand} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>
              </svg>
              <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 500, flex: 1, textAlign: 'left' }}>
                {activeFavs.length === 0
                  ? 'Aucun favori'
                  : activeFavs.length === 1
                    ? activeFavs[0].label
                    : `${activeFavs.length} favoris`}
              </span>
              {activeFavs.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: '#fff',
                  background: C.brand, borderRadius: 99, padding: '1px 6px', marginRight: 2,
                }}>
                  {activeFavs.length}
                </span>
              )}
              <ChevronDown
                size={13}
                color={C.inkFaint}
                strokeWidth={2}
                style={{ transition: 'transform 0.2s', transform: favDropOpen ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
              />
            </button>

            {/* Liste déroulante */}
            {favDropOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: '#fff',
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)',
                zIndex: 100,
                overflow: 'hidden',
                maxHeight: 320,
                overflowY: 'auto',
              }}>
                {activeFavs.length === 0 ? (
                  <div style={{ padding: '12px 14px', fontSize: 12, color: C.inkFaint, fontStyle: 'italic' }}>
                    Aucun favori — cliquez "+ Modifier"
                  </div>
                ) : (
                  activeFavs.map((f, i) => (
                    <button
                      key={f.id}
                      onClick={() => { onNavigate(f.route); setFavDropOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', padding: '9px 14px',
                        borderBottom: i < activeFavs.length - 1 ? `1px solid ${C.border}` : 'none',
                        background: activeView === f.route ? 'rgba(83,125,20,0.07)' : 'transparent',
                        border: 'none',
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'background 0.1s, transform 0.07s ease',
                      }}
                      onMouseEnter={e => { if (activeView !== f.route) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(83,125,20,0.04)'; }}
                      onMouseLeave={e => { if (activeView !== f.route) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                      onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.96)'; }}
                      onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: 2, background: f.color, flexShrink: 0 }} />
                      <span style={{
                        fontSize: 12.5, flex: 1,
                        color: activeView === f.route ? C.brand : C.inkSoft,
                        fontWeight: activeView === f.route ? 600 : 450,
                        letterSpacing: '-0.005em',
                      }}>
                        {f.label}
                      </span>
                      {activeView === f.route && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.brand} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

      </nav>

      {/* ── Sync indicator ── */}
      <div style={{ padding: '6px 12px 0' }}>
        <SyncIndicator />
      </div>

      {/* ── Settings ── */}
      <div style={{ padding: '8px 8px 0', borderTop: `1px solid ${C.hairline}` }}>
        {(() => {
          const isActive = activeView === 'settings';
          return (
            <button
              onClick={onSettingsClick}
              onMouseEnter={() => setHovered('settings')}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 7, width: '100%',
                background: isActive ? C.panel : hovered === 'settings' ? 'rgba(255,255,255,0.12)' : 'transparent',
                boxShadow: isActive ? `0 1px 0 ${C.hairline}, 0 0 0 1px ${C.hairline}` : 'none',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.12s',
              }}
            >
              <span style={{ flexShrink: 0, display: 'flex' }}>
                <NavIcon name="settings" size={15} active={isActive} color={isActive ? C.brand : C.inkMute} />
              </span>
              <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 450, color: isActive ? C.brand : C.inkSoft, letterSpacing: '-0.01em', flex: 1 }}>Réglages</span>
              <Kbd>,</Kbd>
            </button>
          );
        })()}
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
