import { useState, useEffect, useRef, useCallback } from 'react';
import { offlineStorage } from '../lib/offlineStorage';
import { printMonthlyReport } from '../lib/printMonthlyReport';

// ── Types ─────────────────────────────────────────────────────────────────────
interface CommandItem {
  id: string;
  group: 'navigation' | 'produit' | 'action';
  label: string;
  sublabel?: string;
  kbd?: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

interface CommandPaletteProps {
  onClose: () => void;
  onNavigate: (tab: string) => void;
  isManager: boolean;
}

// ── Icônes inline ─────────────────────────────────────────────────────────────
const Icon = ({ d, size = 15 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ICONS = {
  home:     'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z',
  cart:     'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  box:      'M3.5 8.5 12 4l8.5 4.5M3.5 8.5v7L12 20m-8.5-11.5L12 13m0 7 8.5-4.5v-7M12 13v7m0-7 8.5-4.5',
  chart:    'M3 3v18h18M7 14l3-3 4 4 6-7',
  money:    'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 5v14M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2.5-3 2.5-3 1.1-3 2.5 1.3 2.5 3 2.5 3-1.1 3-2.5',
  users:    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 0v6M12 3v6M4.22 10.22l4.24 4.24M15.54 8.46l4.24 4.24M2 12h6M16 12h6M4.22 13.78l4.24-4.24M15.54 15.54l4.24-4.24',
  receipt:  'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1zm3 5h10M7 10h10M7 14h6',
  scan:     'M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14M21 5v2M21 17v2M1 5v2M1 17v2',
  shield:   'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  file:     'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  pill:     'M10.5 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6.5M8 12h8M16.5 22a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zm2.5-5.5h-5',
  search:   'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
};

// ── Composant principal ───────────────────────────────────────────────────────
export default function CommandPalette({ onClose, onNavigate, isManager }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus auto à l'ouverture
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  // Fermer avec Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Items navigation (statiques)
  const navItems: CommandItem[] = [
    isManager && {
      id: 'nav-dashboard', group: 'navigation' as const,
      label: 'Aperçu', sublabel: 'Dashboard & activité',
      kbd: 'D', icon: <Icon d={ICONS.home} />,
      onSelect: () => { onNavigate('dashboard'); onClose(); },
    },
    {
      id: 'nav-sales', group: 'navigation' as const,
      label: 'Caisse', sublabel: 'Point de vente',
      kbd: 'P', icon: <Icon d={ICONS.cart} />,
      onSelect: () => { onNavigate('sales'); onClose(); },
    },
    {
      id: 'nav-stock', group: 'navigation' as const,
      label: 'Inventaire', sublabel: 'Gestion du stock',
      kbd: 'I', icon: <Icon d={ICONS.box} />,
      onSelect: () => { onNavigate('stock'); onClose(); },
    },
    {
      id: 'nav-patients', group: 'navigation' as const,
      label: 'Patients', sublabel: 'CRM & fiches patients',
      kbd: 'A', icon: <Icon d={ICONS.users} />,
      onSelect: () => { onNavigate('patients'); onClose(); },
    },
    {
      id: 'nav-ordonnances', group: 'navigation' as const,
      label: 'Ordonnances', sublabel: 'Prescriptions Rx',
      kbd: 'R', icon: <Icon d={ICONS.file} />,
      onSelect: () => { onNavigate('ordonnances'); onClose(); },
    },
    {
      id: 'nav-carnet', group: 'navigation' as const,
      label: 'Crédits', sublabel: 'Comptes clients',
      kbd: 'C', icon: <Icon d={ICONS.money} />,
      onSelect: () => { onNavigate('carnet'); onClose(); },
    },
    isManager && {
      id: 'nav-equipe', group: 'navigation' as const,
      label: 'Équipe', sublabel: 'Gestion vendeurs',
      kbd: 'E', icon: <Icon d={ICONS.users} />,
      onSelect: () => { onNavigate('equipe'); onClose(); },
    },
  ].filter(Boolean) as CommandItem[];

  // Items actions rapides (statiques)
  const actionItems: CommandItem[] = [
    {
      id: 'action-sale', group: 'action',
      label: 'Nouvelle vente', sublabel: 'Ouvrir la caisse',
      icon: <Icon d={ICONS.receipt} />,
      onSelect: () => { onNavigate('sales'); onClose(); },
    },
    {
      id: 'action-rapport', group: 'action',
      label: 'Rapport mensuel PDF', sublabel: `${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`,
      icon: <Icon d={ICONS.file} />,
      onSelect: () => {
        const now = new Date();
        printMonthlyReport(now.getFullYear(), now.getMonth());
        onClose();
      },
    },
    {
      id: 'action-ruptures', group: 'action',
      label: 'Ruptures critiques', sublabel: 'Produits en rupture de stock',
      icon: <Icon d={ICONS.box} />,
      onSelect: () => { onNavigate('stock'); onClose(); },
    },
    {
      id: 'action-patients', group: 'action',
      label: 'Nouveau patient', sublabel: 'Ajouter une fiche patient',
      icon: <Icon d={ICONS.users} />,
      onSelect: () => { onNavigate('patients'); onClose(); },
    },
    {
      id: 'action-ordonnance', group: 'action',
      label: 'Nouvelle ordonnance', sublabel: 'Créer une prescription Rx',
      icon: <Icon d={ICONS.file} />,
      onSelect: () => { onNavigate('ordonnances'); onClose(); },
    },
  ];

  // Recherche produits dans le cache
  const q = query.trim().toLowerCase();
  const produitItems: CommandItem[] = q.length >= 2
    ? offlineStorage.getCachedMedications()
        .filter(m =>
          m.name.toLowerCase().includes(q) ||
          (m.dosage || '').toLowerCase().includes(q) ||
          (m.code_produit || '').toLowerCase().includes(q)
        )
        .slice(0, 6)
        .map(m => ({
          id: `prod-${m.id}`,
          group: 'produit' as const,
          label: m.name,
          sublabel: `${m.dosage || '—'} · ${m.quantity} en stock · ${(m.price || 0).toLocaleString('fr-FR')} F`,
          icon: <Icon d={ICONS.pill} />,
          onSelect: () => { onNavigate('sales'); onClose(); },
        }))
    : [];

  // Filtrage selon la query
  const filteredNav = q
    ? navItems.filter(i => i.label.toLowerCase().includes(q) || (i.sublabel || '').toLowerCase().includes(q))
    : navItems;

  const filteredActions = q
    ? actionItems.filter(i => i.label.toLowerCase().includes(q) || (i.sublabel || '').toLowerCase().includes(q))
    : actionItems;

  // Liste finale groupée
  type GroupedSection = { title: string; items: CommandItem[] };
  const sections: GroupedSection[] = [];
  if (produitItems.length > 0) sections.push({ title: 'Produits', items: produitItems });
  if (filteredNav.length > 0) sections.push({ title: 'Navigation', items: filteredNav });
  if (filteredActions.length > 0) sections.push({ title: 'Actions', items: filteredActions });

  const allItems = sections.flatMap(s => s.items);

  // Reset active index quand la query change
  useEffect(() => { setActiveIndex(0); }, [query]);

  // Scroll vers l'item actif
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      allItems[activeIndex]?.onSelect();
    }
  }, [allItems, activeIndex]);

  // Calcul de l'index absolu dans allItems pour chaque item de section
  let runningIdx = 0;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 560,
          background: 'rgba(255,255,255,0.92)',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.8)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.04)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Barre de recherche */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
          <Icon d={ICONS.search} size={16} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher une page, un produit, une action…"
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: 15, color: '#0a0e14', background: 'transparent',
              fontWeight: 450,
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ background: 'rgba(0,0,0,0.07)', border: 'none', borderRadius: 6, width: 22, height: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
          <kbd style={{ fontSize: 11, color: '#9ca3af', background: 'rgba(0,0,0,0.06)', padding: '2px 7px', borderRadius: 5, border: '1px solid rgba(0,0,0,0.08)', flexShrink: 0 }}>Esc</kbd>
        </div>

        {/* Liste résultats */}
        <div ref={listRef} style={{ maxHeight: 380, overflowY: 'auto', padding: '6px 0 8px' }}>
          {sections.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 20px', color: '#9ca3af' }}>
              <Icon d={ICONS.search} size={28} />
              <p style={{ fontSize: 13, marginTop: 10, fontWeight: 500 }}>Aucun résultat pour « {query} »</p>
            </div>
          ) : (
            sections.map(section => {
              const sectionStart = runningIdx;
              runningIdx += section.items.length;
              return (
                <div key={section.title}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 16px 4px' }}>
                    {section.title}
                  </div>
                  {section.items.map((item, localIdx) => {
                    const absIdx = sectionStart + localIdx;
                    const isActive = absIdx === activeIndex;
                    return (
                      <button
                        key={item.id}
                        data-idx={absIdx}
                        onClick={item.onSelect}
                        onMouseEnter={() => setActiveIndex(absIdx)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                          padding: '8px 16px', border: 'none', textAlign: 'left', cursor: 'pointer',
                          background: isActive ? 'rgba(16,120,90,0.08)' : 'transparent',
                          transition: 'background 0.08s',
                        }}
                      >
                        {/* Icône */}
                        <div style={{
                          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                          background: isActive ? 'rgba(16,120,90,0.12)' : 'rgba(0,0,0,0.05)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: isActive ? '#10785a' : '#6b7280',
                          transition: 'all 0.08s',
                        }}>
                          {item.icon}
                        </div>

                        {/* Texte */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0a0e14', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.label}
                          </div>
                          {item.sublabel && (
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.sublabel}
                            </div>
                          )}
                        </div>

                        {/* Raccourci clavier */}
                        {item.kbd && (
                          <kbd style={{ fontSize: 11, color: '#9ca3af', background: 'rgba(0,0,0,0.06)', padding: '2px 7px', borderRadius: 5, border: '1px solid rgba(0,0,0,0.08)', flexShrink: 0 }}>
                            {item.kbd}
                          </kbd>
                        )}

                        {/* Flèche entrée si item actif */}
                        {isActive && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10785a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                            <polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 16 }}>
          {[
            { keys: ['↑', '↓'], label: 'naviguer' },
            { keys: ['↵'], label: 'sélectionner' },
            { keys: ['Esc'], label: 'fermer' },
          ].map(({ keys, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9ca3af' }}>
              {keys.map(k => (
                <kbd key={k} style={{ background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 4, padding: '1px 5px', fontFamily: 'inherit', fontSize: 10.5 }}>{k}</kbd>
              ))}
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
