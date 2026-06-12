/**
 * CategoryPicker — Sélecteur de catégorie thérapeutique cliquable
 * ─────────────────────────────────────────────────────────────────────────────
 * Affiche un badge cliquable qui ouvre un popover de sélection de catégorie.
 *
 * Workflow :
 *  1. L'utilisateur clique sur la catégorie (ou "Catégoriser" si vide)
 *  2. Un popover s'ouvre avec recherche + liste filtrée des 30 catégories
 *  3. Au choix d'une catégorie :
 *     - Sauvegarde dans Supabase (name_rayon)
 *     - Sauvegarde dans le cache d'apprentissage localStorage (offline)
 *     - Patch local optimiste (mise à jour immédiate de l'UI)
 */

import { useState, useRef, useEffect } from 'react';
import { Check, X, Sparkles } from 'lucide-react';
import { supabase, type Medication } from '../lib/supabase';
import {
  ALL_CATEGORIES, learnCategory, forgetCategory, detectCategory,
  type TherapeuticCategory,
} from '../lib/dciCategories';

// Couleur par catégorie (déterministe, basée sur hash du nom)
const CATEGORY_PALETTE = [
  '#0651bc', '#537d14', '#6e44b0', '#b75f06', '#0891b2',
  '#dc2626', '#9333ea', '#0f766e', '#d97706', '#7c3aed',
  '#b91c1c', '#0369a1', '#16a34a', '#a16207', '#7e22ce',
];

function categoryColor(cat: string): string {
  let h = 0;
  for (const ch of cat) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return CATEGORY_PALETTE[Math.abs(h) % CATEGORY_PALETTE.length];
}

interface Props {
  med: Medication;
  onUpdated: (med: Medication) => void;
}

export default function CategoryPicker({ med, onUpdated }: Props) {
  const [open, setOpen]       = useState(false);
  const [anchor, setAnchor]   = useState<DOMRect | null>(null);
  const [search, setSearch]   = useState('');
  const [saving, setSaving]   = useState(false);

  // Catégorie courante : prend name_rayon, sinon détection auto
  const currentCat =
    med.name_rayon ||
    med.category ||
    detectCategory(med.name) ||
    null;

  const wasAutoDetected = !med.name_rayon && !med.category && currentCat !== null;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (open) { setOpen(false); setAnchor(null); return; }
    setAnchor(e.currentTarget.getBoundingClientRect());
    setOpen(true);
    setSearch('');
  };

  const handleSelect = async (cat: TherapeuticCategory) => {
    setSaving(true);
    try {
      // Sauvegarde Supabase
      await supabase
        .from('medications')
        .update({ name_rayon: cat, updated_at: new Date().toISOString() })
        .eq('id', med.id);

      // Cache local (apprentissage hors-ligne)
      learnCategory(med.name, cat);

      // Patch optimiste UI
      onUpdated({ ...med, name_rayon: cat });
      setOpen(false);
      setAnchor(null);
    } catch (err) {
      console.error('Erreur sauvegarde catégorie:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSaving(true);
    try {
      await supabase
        .from('medications')
        .update({ name_rayon: null, updated_at: new Date().toISOString() })
        .eq('id', med.id);
      forgetCategory(med.name);
      onUpdated({ ...med, name_rayon: undefined });
      setOpen(false);
      setAnchor(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {currentCat ? (
        <button
          onClick={handleClick}
          title={wasAutoDetected ? `Détectée automatiquement — cliquez pour confirmer ou changer` : 'Cliquez pour modifier'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: '#f3f4f6',
            border: wasAutoDetected ? '1px dashed #d1d5db' : '1px solid #e5e7eb',
            borderRadius: 6, padding: '3px 8px',
            fontSize: 12, fontWeight: 500, color: '#4b5563',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.1s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#e5e7eb';
            (e.currentTarget as HTMLButtonElement).style.borderStyle = 'solid';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6';
            (e.currentTarget as HTMLButtonElement).style.borderStyle = wasAutoDetected ? 'dashed' : 'solid';
          }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: 99,
            background: categoryColor(currentCat), flexShrink: 0,
          }} />
          {currentCat.length > 14 ? currentCat.slice(0, 13) + '…' : currentCat}
          {wasAutoDetected && <Sparkles size={9} color="#9ca3af" />}
        </button>
      ) : (
        <button
          onClick={handleClick}
          title="Catégoriser ce produit"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'transparent',
            border: '1px dashed #d1d5db',
            borderRadius: 6, padding: '3px 8px',
            fontSize: 11.5, fontWeight: 500, color: '#9ca3af',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.1s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb';
            (e.currentTarget as HTMLButtonElement).style.color = '#4b5563';
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#9ca3af';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af';
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#d1d5db';
          }}
        >
          + Catégoriser
        </button>
      )}

      {open && anchor && (
        <CategoryPopover
          anchor={anchor}
          search={search}
          onSearchChange={setSearch}
          currentCat={currentCat}
          wasAutoDetected={wasAutoDetected}
          saving={saving}
          onSelect={handleSelect}
          onClear={handleClear}
          onClose={() => { setOpen(false); setAnchor(null); }}
        />
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  POPOVER
// ════════════════════════════════════════════════════════════════════════════
function CategoryPopover({
  anchor, search, onSearchChange, currentCat, wasAutoDetected, saving,
  onSelect, onClear, onClose,
}: {
  anchor: DOMRect;
  search: string;
  onSearchChange: (v: string) => void;
  currentCat: string | null;
  wasAutoDetected: boolean;
  saving: boolean;
  onSelect: (cat: TherapeuticCategory) => void;
  onClear: (e: React.MouseEvent) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Position calculée
  const POPOVER_W = 240;
  const POPOVER_H = 360;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top  = anchor.bottom + 6;
  let left = anchor.left;
  if (top + POPOVER_H > vh - 10) top = anchor.top - POPOVER_H - 6;
  if (left + POPOVER_W > vw - 10) left = vw - POPOVER_W - 10;
  if (left < 8) left = 8;

  // Ferme au clic extérieur
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  // Échap pour fermer
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const q = search.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const filtered = ALL_CATEGORIES.filter(c =>
    !q || c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)
  );

  return (
    <div
      ref={ref}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', top, left,
        width: POPOVER_W,
        background: '#fff',
        border: '1px solid rgba(15,15,20,0.1)',
        borderRadius: 12,
        boxShadow: '0 10px 32px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.06)',
        zIndex: 9999,
        overflow: 'hidden',
        animation: 'jp-fade-in 0.12s ease',
      }}
    >
      <style>{`@keyframes jp-fade-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header avec recherche */}
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid #f3f4f6',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Catégorie thérapeutique
          </span>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#9ca3af' }}>
            <X size={13} />
          </button>
        </div>
        <input
          autoFocus
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Rechercher…"
          style={{
            width: '100%', height: 30, padding: '0 10px',
            border: '1px solid #e5e7eb', borderRadius: 7,
            fontSize: 12.5, color: '#0a0e14', outline: 'none',
            boxSizing: 'border-box', fontFamily: 'inherit',
            background: '#f9fafb',
          }}
        />
        {wasAutoDetected && currentCat && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            marginTop: 8, padding: '5px 8px', borderRadius: 6,
            background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)',
            fontSize: 11, color: '#4338ca',
          }}>
            <Sparkles size={10} />
            Auto : <strong>{currentCat}</strong>
          </div>
        )}
      </div>

      {/* Liste */}
      <div style={{ maxHeight: 240, overflowY: 'auto', padding: '4px 0' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>
            Aucune catégorie
          </div>
        ) : (
          filtered.map(cat => {
            const isCurrent = cat === currentCat;
            return (
              <button
                key={cat}
                onClick={() => onSelect(cat)}
                disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 12px',
                  border: 'none',
                  background: isCurrent ? 'rgba(83,125,20,0.07)' : 'transparent',
                  cursor: saving ? 'wait' : 'pointer',
                  textAlign: 'left',
                  fontSize: 12.5,
                  fontWeight: isCurrent ? 700 : 500,
                  color: isCurrent ? '#537d14' : '#374151',
                  fontFamily: 'inherit',
                  transition: 'background 0.08s',
                }}
                onMouseEnter={e => { if (!isCurrent) (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; }}
                onMouseLeave={e => { if (!isCurrent) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: 99,
                  background: categoryColor(cat), flexShrink: 0,
                }} />
                <span style={{ flex: 1 }}>{cat}</span>
                {isCurrent && <Check size={12} color="#537d14" strokeWidth={2.5} />}
              </button>
            );
          })
        )}
      </div>

      {/* Footer : retirer catégorie */}
      {currentCat && (
        <div style={{ borderTop: '1px solid #f3f4f6', padding: '6px' }}>
          <button
            onClick={onClear}
            disabled={saving}
            style={{
              width: '100%', padding: '7px 8px', borderRadius: 6,
              border: 'none', background: 'transparent',
              cursor: saving ? 'wait' : 'pointer',
              fontSize: 11.5, color: '#9ca3af',
              fontFamily: 'inherit', fontWeight: 500,
              transition: 'all 0.08s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#dc2626'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; }}
          >
            Retirer la catégorie
          </button>
        </div>
      )}
    </div>
  );
}
