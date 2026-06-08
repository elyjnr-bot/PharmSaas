import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { runStartupMigrations } from './lib/migrations';

// ── Auto-réparation transparente des états corrompus ───────────────────────
// S'exécute une seule fois par version d'app, avant le rendu React.
// Le client n'a rien à faire — tout est invisible.
runStartupMigrations();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
