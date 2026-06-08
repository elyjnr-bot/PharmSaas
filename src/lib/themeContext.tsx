import { createContext, useContext, useState, ReactNode } from 'react';

// ── Theme types & data (Chalk Premium — source exacte) ─────────────────────
export type ThemeId = 'aurora' | 'sky' | 'sunset' | 'mint' | 'lavender' | 'cream' | 'neutral' | 'charcoal' | 'dark';

export interface Theme {
  id: ThemeId;
  label: string;
  bg: string;
  dark: boolean;
  preview: string;
}

export const THEMES: Theme[] = [
  {
    id: 'aurora', label: 'Aurora', dark: false, preview: '#d4eade',
    bg: [
      'radial-gradient(ellipse 65% 55% at 12% 8%, rgba(120,200,160,0.55), transparent 60%)',
      'radial-gradient(ellipse 60% 50% at 95% 85%, rgba(255,180,140,0.45), transparent 60%)',
      'radial-gradient(ellipse 55% 45% at 75% 25%, rgba(180,200,255,0.40), transparent 60%)',
      'radial-gradient(ellipse 50% 40% at 35% 75%, rgba(220,180,255,0.35), transparent 60%)',
      '#eef2ed',
    ].join(', '),
  },
  {
    id: 'sky', label: 'Ciel', dark: false, preview: '#c4d9f5',
    bg: [
      'radial-gradient(ellipse 60% 50% at 15% 10%, rgba(180,210,255,0.55), transparent 60%)',
      'radial-gradient(ellipse 55% 45% at 90% 80%, rgba(220,200,255,0.45), transparent 60%)',
      'radial-gradient(ellipse 50% 40% at 75% 20%, rgba(200,240,250,0.50), transparent 60%)',
      'radial-gradient(ellipse 45% 35% at 30% 80%, rgba(255,220,240,0.30), transparent 60%)',
      '#eaf0f6',
    ].join(', '),
  },
  {
    id: 'sunset', label: 'Coucher', dark: false, preview: '#f9d4c0',
    bg: [
      'radial-gradient(ellipse 65% 55% at 12% 8%, rgba(255,170,140,0.55), transparent 60%)',
      'radial-gradient(ellipse 60% 50% at 95% 85%, rgba(255,200,160,0.50), transparent 60%)',
      'radial-gradient(ellipse 55% 45% at 75% 30%, rgba(255,150,180,0.40), transparent 60%)',
      'radial-gradient(ellipse 50% 40% at 30% 75%, rgba(255,220,200,0.45), transparent 60%)',
      '#fff0e8',
    ].join(', '),
  },
  {
    id: 'mint', label: 'Menthe', dark: false, preview: '#b8e8d4',
    bg: [
      'radial-gradient(ellipse 65% 55% at 10% 12%, rgba(140,220,200,0.55), transparent 60%)',
      'radial-gradient(ellipse 60% 50% at 92% 85%, rgba(160,230,240,0.50), transparent 60%)',
      'radial-gradient(ellipse 55% 45% at 75% 25%, rgba(180,240,210,0.45), transparent 60%)',
      'radial-gradient(ellipse 50% 40% at 35% 70%, rgba(200,250,230,0.40), transparent 60%)',
      '#eaf6f0',
    ].join(', '),
  },
  {
    id: 'lavender', label: 'Lavande', dark: false, preview: '#d4c8f0',
    bg: [
      'radial-gradient(ellipse 65% 55% at 12% 10%, rgba(200,180,255,0.50), transparent 60%)',
      'radial-gradient(ellipse 60% 50% at 92% 82%, rgba(255,200,230,0.45), transparent 60%)',
      'radial-gradient(ellipse 55% 45% at 75% 30%, rgba(220,200,250,0.50), transparent 60%)',
      'radial-gradient(ellipse 50% 40% at 35% 75%, rgba(240,210,250,0.40), transparent 60%)',
      '#f1ecf7',
    ].join(', '),
  },
  {
    id: 'cream', label: 'Crème', dark: false, preview: '#f0e2c0',
    bg: [
      'radial-gradient(ellipse 60% 50% at 15% 12%, rgba(240,220,180,0.50), transparent 60%)',
      'radial-gradient(ellipse 55% 45% at 90% 80%, rgba(245,225,195,0.50), transparent 60%)',
      'radial-gradient(ellipse 50% 40% at 75% 30%, rgba(235,210,170,0.40), transparent 60%)',
      'radial-gradient(ellipse 45% 35% at 30% 70%, rgba(250,235,210,0.45), transparent 60%)',
      '#faf3e6',
    ].join(', '),
  },
  {
    id: 'neutral', label: 'Neutre', dark: false, preview: '#d8dce0',
    bg: [
      'radial-gradient(ellipse 65% 55% at 15% 12%, rgba(210,215,220,0.55), transparent 60%)',
      'radial-gradient(ellipse 60% 50% at 92% 82%, rgba(220,225,230,0.50), transparent 60%)',
      'radial-gradient(ellipse 55% 45% at 78% 28%, rgba(200,210,215,0.40), transparent 60%)',
      '#f3f4f6',
    ].join(', '),
  },
  {
    id: 'charcoal', label: 'Charbon', dark: true, preview: '#2a3040',
    bg: [
      'radial-gradient(ellipse 65% 55% at 12% 8%, rgba(80,140,200,0.40), transparent 55%)',
      'radial-gradient(ellipse 60% 50% at 92% 85%, rgba(180,100,200,0.30), transparent 55%)',
      'radial-gradient(ellipse 55% 45% at 75% 30%, rgba(100,180,140,0.25), transparent 55%)',
      '#14181f',
    ].join(', '),
  },
  {
    id: 'dark', label: 'Nuit', dark: true, preview: '#0c1015',
    bg: [
      'radial-gradient(ellipse 60% 50% at 12% 8%, rgba(80,140,200,0.22), transparent 60%)',
      'radial-gradient(ellipse 55% 45% at 92% 85%, rgba(180,100,200,0.18), transparent 60%)',
      'radial-gradient(ellipse 50% 40% at 75% 30%, rgba(100,180,140,0.15), transparent 60%)',
      '#0c1015',
    ].join(', '),
  },
];

// ── Context ─────────────────────────────────────────────────────────────────
interface ThemeContextValue {
  theme: Theme;
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_STORAGE_KEY = 'jp_theme_v1';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
    // Défaut : 'neutral' (plus sobre, mieux adapté usage pro intensif)
    return (saved && THEMES.find(t => t.id === saved)) ? saved : 'neutral';
  });

  const setThemeId = (id: ThemeId) => {
    setThemeIdState(id);
    localStorage.setItem(THEME_STORAGE_KEY, id);
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
