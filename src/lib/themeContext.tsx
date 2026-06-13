import { createContext, useContext, useState, ReactNode } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────
export type ThemeId = 'neutral' | 'soft' | 'dark';

export interface Theme {
  id: ThemeId;
  label: string;
  bg: string;      // gradient CSS appliqué en inline sur le shell App.tsx
  dark: boolean;   // pilote isDark dans les composants qui en ont besoin
  preview: string; // couleur de la pastille de prévisualisation
}

// ── 3 piliers thématiques ────────────────────────────────────────────────────
export const THEMES: Theme[] = [
  {
    id: 'neutral', label: 'Neutre', dark: false, preview: '#d2d8df',
    bg: [
      'radial-gradient(ellipse 65% 55% at 15% 12%, rgba(210,215,220,0.55), transparent 60%)',
      'radial-gradient(ellipse 60% 50% at 92% 82%, rgba(220,225,230,0.50), transparent 60%)',
      'radial-gradient(ellipse 55% 45% at 78% 28%, rgba(200,210,215,0.40), transparent 60%)',
      '#f3f4f6',
    ].join(', '),
  },
  {
    id: 'soft', label: 'Doux', dark: false, preview: '#b4d0f0',
    bg: [
      'radial-gradient(ellipse 70% 55% at 10% 10%, rgba(170,210,255,0.55), transparent 60%)',
      'radial-gradient(ellipse 60% 50% at 90% 80%, rgba(200,185,255,0.38), transparent 60%)',
      'radial-gradient(ellipse 55% 45% at 60% 30%, rgba(185,230,255,0.45), transparent 60%)',
      '#eef3fb',
    ].join(', '),
  },
  {
    id: 'dark', label: 'Sombre', dark: true, preview: '#000000',
    bg: [
      'radial-gradient(ellipse 65% 45% at 15% 10%, rgba(10,132,255,0.10), transparent 55%)',
      'radial-gradient(ellipse 55% 40% at 85% 80%, rgba(94,92,230,0.08), transparent 55%)',
      '#000000',
    ].join(', '),
  },
];

// ── Migration : anciens IDs → neutre par défaut ──────────────────────────────
function resolveThemeId(saved: string | null): ThemeId {
  if (saved === 'neutral' || saved === 'soft' || saved === 'dark') return saved;
  return 'neutral';
}

// ── Context ──────────────────────────────────────────────────────────────────
interface ThemeContextValue {
  theme: Theme;
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_STORAGE_KEY = 'jp_theme_v1';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    const id = resolveThemeId(saved);
    // Applique data-theme immédiatement pour éviter le flash au premier rendu
    document.documentElement.setAttribute('data-theme', id);
    return id;
  });

  const setThemeId = (id: ThemeId) => {
    setThemeIdState(id);
    localStorage.setItem(THEME_STORAGE_KEY, id);
    document.documentElement.setAttribute('data-theme', id);
  };

  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0];

  return (
    <ThemeContext.Provider value={{ theme, themeId, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
