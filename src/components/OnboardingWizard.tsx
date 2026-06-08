/**
 * OnboardingWizard.tsx — Setup guidé en 6 étapes
 * ─────────────────────────────────────────────────
 * Affiché automatiquement à la première connexion manager.
 *
 * Étape 1 : Nom de la pharmacie
 * Étape 2 : Mode de gestion (Global vs Unitaire)
 * Étape 3 : Taux de TVA
 * Étape 4 : Thème de l'application
 * Étape 5 : Import catalogue médicaments (CSV/Excel)
 * Étape 6 : Récapitulatif + lancement
 *
 * Toutes les options peuvent être modifiées plus tard via Réglages.
 */

import { useState, useEffect } from 'react';
import {
  Building2, Percent, FileSpreadsheet, CheckCircle2,
  ChevronRight, X, Check, Boxes, ScanLine, Palette, Sparkles,
} from 'lucide-react';
import DataImporter from './DataImporter';
import { supabase } from '../lib/supabase';
import { useWorkflow, type WorkflowMode } from '../lib/workflowContext';
import { useTheme, THEMES } from '../lib/themeContext';

// ── Couleurs ────────────────────────────────────────────────────────────────
const C = {
  brand:    '#10785a',
  brandBg:  'rgba(16,120,90,0.08)',
  brandBd:  'rgba(16,120,90,0.22)',
  ink:      '#0a0e14',
  inkSoft:  '#2c3138',
  inkMute:  '#6b7280',
  inkFaint: '#9aa0a8',
  bg:       '#f8fafc',
  surface:  '#ffffff',
  hairline: 'rgba(15,15,20,0.07)',
};

const TVA_OPTIONS = [
  { value: 0,     label: '0 %',    sub: 'Pas de TVA (exonéré)' },
  { value: 0.10,  label: '10 %',   sub: 'Taux réduit' },
  { value: 0.189, label: '18,9 %', sub: 'Taux normal Congo' },
  { value: 0.20,  label: '20 %',   sub: 'Taux majoré' },
];

type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface Props {
  onDismiss: () => void;
  onNavigate: (tab: string) => void;
}

// ── Persistance de l'état de l'onboarding (resume après fermeture d'onglet)
// ────────────────────────────────────────────────────────────────────────────
// On stocke localement le step et les valeurs saisies pour que l'utilisateur
// puisse reprendre exactement où il en était s'il quitte la page.
interface OnboardingState {
  step: Step;
  pharmName: string;
  taxRate: number;
  customTax: string;
  showCustomTax: boolean;
  catalogDone: boolean;
}
const ONBOARDING_STATE_KEY_PREFIX = 'jp_onboarding_state_';

function loadOnboardingState(userId: string): Partial<OnboardingState> | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_STATE_KEY_PREFIX + userId);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveOnboardingState(userId: string, state: OnboardingState): void {
  try {
    localStorage.setItem(ONBOARDING_STATE_KEY_PREFIX + userId, JSON.stringify(state));
  } catch {}
}

function clearOnboardingState(userId: string): void {
  try { localStorage.removeItem(ONBOARDING_STATE_KEY_PREFIX + userId); } catch {}
}

export default function OnboardingWizard({ onDismiss, onNavigate }: Props) {
  const { workflowMode, setWorkflowMode } = useWorkflow();
  const { themeId, setThemeId } = useTheme();

  const [userId, setUserId] = useState<string | null>(null);
  const [step,        setStep]        = useState<Step>(1);
  // Pré-remplir le nom de la pharmacie depuis Supabase user_metadata
  // (si saisi lors de l'inscription, on évite la double saisie)
  const [pharmName,   setPharmName]   = useState('');
  const [pharmNameLoaded, setPharmNameLoaded] = useState(false);
  useEffect(() => {
    if (pharmNameLoaded) return;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          // ── Reprendre l'état sauvegardé s'il existe ─────────────────────
          const saved = loadOnboardingState(user.id);
          if (saved) {
            if (saved.step)          setStep(saved.step);
            if (saved.pharmName)     setPharmName(saved.pharmName);
            if (saved.taxRate !== undefined) setTaxRate(saved.taxRate);
            if (saved.customTax)     setCustomTax(saved.customTax);
            if (saved.showCustomTax) setShowCustomTax(saved.showCustomTax);
            if (saved.catalogDone)   setCatalogDone(saved.catalogDone);
          } else {
            // Première fois : pré-remplir le nom depuis user_metadata
            const meta = (user.user_metadata?.pharmacy_name as string | undefined) || '';
            if (meta) setPharmName(meta);
          }
        }
      } catch {}
      setPharmNameLoaded(true);
    })();
  }, [pharmNameLoaded]);
  const [taxRate,     setTaxRate]     = useState(0.189);
  const [customTax,   setCustomTax]   = useState(''); // 🆕 valeur custom
  const [showCustomTax, setShowCustomTax] = useState(false);
  const [catalogDone, setCatalogDone] = useState(false);
  const [saving,      setSaving]      = useState(false);

  // ── Auto-save : à chaque changement d'état, on sauvegarde la progression ──
  useEffect(() => {
    if (!userId || !pharmNameLoaded) return;
    saveOnboardingState(userId, { step, pharmName, taxRate, customTax, showCustomTax, catalogDone });
  }, [userId, pharmNameLoaded, step, pharmName, taxRate, customTax, showCustomTax, catalogDone]);

  const STEPS = [
    { n: 1, label: 'Pharmacie',  icon: Building2 },
    { n: 2, label: 'Mode',       icon: Boxes },
    { n: 3, label: 'TVA',        icon: Percent },
    { n: 4, label: 'Thème',      icon: Palette },
    { n: 5, label: 'Catalogue',  icon: FileSpreadsheet },
    { n: 6, label: 'Lancement',  icon: CheckCircle2 },
  ];

  // ── Helper : marque l'onboarding terminé pour CE user (pas global) ────────
  // Si plusieurs comptes utilisent le même appareil, chacun a son propre flag.
  const markOnboardingDone = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      localStorage.setItem(`jp_onboarding_done_${user.id}`, 'true');
      // Nettoyer l'état de progression (plus besoin)
      clearOnboardingState(user.id);
    }
    // Legacy : on garde aussi le flag global pour compatibilité (sera lu si user_id absent)
    localStorage.setItem('jp_onboarding_done', 'true');
  };

  // ── Sauvegarder et fermer ─────────────────────────────────────────────────
  const finish = async () => {
    setSaving(true);
    try {
      // Sauvegarder nom pharmacie
      if (pharmName.trim()) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('user_settings').upsert(
            { user_id: user.id, pharmacy_name: pharmName.trim() },
            { onConflict: 'user_id' }
          );
          // Sync localStorage
          const key = `pharma_user_settings_${user.id}`;
          try {
            const cached = JSON.parse(localStorage.getItem(key) || '{}');
            cached.pharmacy_name = pharmName.trim();
            localStorage.setItem(key, JSON.stringify(cached));
          } catch {}
          localStorage.setItem('jungle_pharm_settings', JSON.stringify({ pharmacy_name: pharmName.trim() }));
        }
      }
      // Sauvegarder TVA
      localStorage.setItem('tax_rate', taxRate.toString());
      window.dispatchEvent(new Event('junglepharm:tax_updated'));
      // Marquer onboarding comme terminé pour CE user
      await markOnboardingDone();
    } finally {
      setSaving(false);
    }
    onDismiss();
  };

  const skipAll = async () => {
    await markOnboardingDone();
    onDismiss();
  };

  const goFournisseurs = async () => {
    await markOnboardingDone();
    onNavigate('fournisseurs');
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────
  // Étape Catalogue (5) = large pour accueillir le DataImporter
  // Étape Thème (4) = un peu plus large pour la grille 3 colonnes
  const isWide = step === 5;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(10,14,20,0.55)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: C.surface,
        borderRadius: 20,
        boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
        width: '100%',
        maxWidth: isWide ? 760 : 540,
        maxHeight: '92vh',
        overflowY: 'auto',
        transition: 'max-width 0.25s ease',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ padding: '24px 28px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: C.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                <path d="M16 8C16 8 12 14 12 18C12 20.2 13.8 22 16 22C18.2 22 20 20.2 20 18C20 14 16 8 16 8Z" fill="white" />
                <line x1="16" y1="22" x2="16" y2="25" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>
                {step === 6 ? '🎉 Tout est prêt !' : 'Configuration initiale'}
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.inkMute }}>
                Étape {step} sur 6
              </p>
            </div>
          </div>
          <button onClick={skipAll}
            style={{ background: C.bg, border: `1px solid ${C.hairline}`, borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: C.inkMute }}
          ><X size={14} /></button>
        </div>

        {/* ── Barre de progression ─────────────────────────────────────────── */}
        <div style={{ padding: '16px 28px 0', display: 'flex', gap: 6 }}>
          {STEPS.map(s => {
            const done    = s.n < step;
            const active  = s.n === step;
            const Icon    = s.icon;
            return (
              <div key={s.n} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: '100%', height: 3, borderRadius: 99,
                  background: done || active ? C.brand : C.hairline,
                  opacity: active ? 1 : done ? 0.6 : 1,
                  transition: 'background 0.2s',
                }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 99,
                    background: done ? C.brand : active ? C.brandBg : C.bg,
                    border: `1.5px solid ${done || active ? C.brand : C.hairline}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {done
                      ? <Check size={10} color="#fff" strokeWidth={3} />
                      : <Icon size={9} color={active ? C.brand : C.inkFaint} strokeWidth={active ? 2.5 : 1.8} />
                    }
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: active || done ? 700 : 500, color: active ? C.brand : done ? C.inkSoft : C.inkFaint }}>
                    {s.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Contenu ──────────────────────────────────────────────────────── */}
        <div style={{ padding: '20px 28px 28px', flex: 1 }}>

          {/* ── ÉTAPE 1 : Nom de la pharmacie ──────────────────────────────── */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <p style={{ margin: '0 0 6px', fontSize: 14.5, fontWeight: 700, color: C.ink }}>
                  Quel est le nom de votre pharmacie ?
                </p>
                <p style={{ margin: 0, fontSize: 13, color: C.inkMute, lineHeight: 1.5 }}>
                  Il apparaîtra sur tous vos tickets de caisse, bordereaux d'assurance et rapports imprimés.
                </p>
              </div>
              <input
                value={pharmName}
                onChange={e => setPharmName(e.target.value)}
                placeholder="Ex : Pharmacie Centrale de Brazzaville"
                autoFocus
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10,
                  border: `1.5px solid ${pharmName.trim() ? C.brand : C.hairline}`,
                  fontSize: 14, outline: 'none', color: C.ink, background: C.bg,
                  boxSizing: 'border-box', transition: 'border-color 0.15s',
                }}
              />
              {!pharmName.trim() && (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: C.inkFaint }}>
                  Vous pouvez renseigner le nom plus tard dans Réglages → Pharmacie.
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, gap: 10 }}>
                <button onClick={() => setStep(2)}
                  style={{ fontSize: 13, color: C.inkMute, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  Passer cette étape →
                </button>
                <button onClick={() => setStep(2)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 10, background: C.brand, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                  Continuer <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 2 : Mode de gestion ─────────────────────────────────── */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <p style={{ margin: '0 0 6px', fontSize: 14.5, fontWeight: 700, color: C.ink }}>
                  Comment gérez-vous votre stock ?
                </p>
                <p style={{ margin: 0, fontSize: 13, color: C.inkMute, lineHeight: 1.5 }}>
                  Le mode de gestion influence la traçabilité de vos médicaments.
                  Choisissez celui qui correspond à votre activité.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  {
                    mode: 'global' as WorkflowMode,
                    icon: <Boxes size={20} strokeWidth={1.8} />,
                    label: 'Gestion par quantité',
                    sub: 'Recommandé pour la plupart des pharmacies',
                    desc: 'Gérez votre stock par quantité totale (ex : 50 boîtes de Paracétamol). Plus rapide à saisir, idéal pour un volume de vente élevé.',
                    pros: ['✓ Import Excel rapide', '✓ Saisie en caisse simplifiée', '✓ Reporting global par produit'],
                  },
                  {
                    mode: 'unit' as WorkflowMode,
                    icon: <ScanLine size={20} strokeWidth={1.8} />,
                    label: 'Gestion par boîte (code unique)',
                    sub: 'Pour les médicaments à forte valeur ou réglementés',
                    desc: 'Chaque boîte reçoit un code unique JP-XXXXXX scannable. Traçabilité complète : qui a vendu quoi à quel client, à quelle date.',
                    pros: ['✓ Traçabilité boîte par boîte', '✓ Détection des contrefaçons', '✓ Conforme aux normes pharmaceutiques'],
                  },
                ].map(opt => {
                  const active = workflowMode === opt.mode;
                  return (
                    <button
                      key={opt.mode}
                      onClick={() => setWorkflowMode(opt.mode)}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 8,
                        padding: '14px 16px', borderRadius: 11, textAlign: 'left', cursor: 'pointer',
                        background: active ? C.brandBg : C.bg,
                        border: `1.5px solid ${active ? C.brand : C.hairline}`,
                        transition: 'all 0.12s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 9,
                          background: active ? C.brand : '#fff',
                          color: active ? '#fff' : C.inkMute,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                          border: `1px solid ${active ? C.brand : C.hairline}`,
                        }}>
                          {opt.icon}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: active ? C.brand : C.ink }}>{opt.label}</div>
                          <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>{opt.sub}</div>
                        </div>
                        {active && <Check size={16} color={C.brand} strokeWidth={2.5} />}
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: C.inkSoft, lineHeight: 1.5 }}>{opt.desc}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {opt.pros.map(p => (
                          <span key={p} style={{
                            fontSize: 11, color: active ? C.brand : C.inkMute,
                            background: active ? 'rgba(16,120,90,0.06)' : 'rgba(0,0,0,0.04)',
                            padding: '2px 7px', borderRadius: 99, fontWeight: 600,
                          }}>{p}</span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              <p style={{ margin: '14px 0 0', fontSize: 11.5, color: C.inkFaint, textAlign: 'center', fontStyle: 'italic' }}>
                💡 Vous pourrez changer ce mode à tout moment via <strong>Réglages → Mode de gestion</strong>.
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, gap: 10 }}>
                <button onClick={() => setStep(1)}
                  style={{ fontSize: 13, color: C.inkMute, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  ← Retour
                </button>
                <button onClick={() => setStep(3)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 10, background: C.brand, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                  Continuer <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 3 : TVA ─────────────────────────────────────────────── */}
          {step === 3 && (
            <div>
              <div style={{ marginBottom: 18 }}>
                <p style={{ margin: '0 0 6px', fontSize: 14.5, fontWeight: 700, color: C.ink }}>
                  Quel est votre taux de TVA ?
                </p>
                <p style={{ margin: 0, fontSize: 13, color: C.inkMute, lineHeight: 1.5 }}>
                  Utilisé pour calculer les totaux TTC à la caisse et dans les rapports assurance.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {TVA_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => { setTaxRate(opt.value); setShowCustomTax(false); setCustomTax(''); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                      background: !showCustomTax && taxRate === opt.value ? C.brandBg : C.bg,
                      border: `1.5px solid ${!showCustomTax && taxRate === opt.value ? C.brand : C.hairline}`,
                      transition: 'all 0.12s',
                    }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: !showCustomTax && taxRate === opt.value ? C.brand : C.ink }}>{opt.label}</div>
                      <div style={{ fontSize: 12, color: C.inkMute, marginTop: 1 }}>{opt.sub}</div>
                    </div>
                    {!showCustomTax && taxRate === opt.value && <Check size={16} color={C.brand} strokeWidth={2.5} />}
                  </button>
                ))}
                {/* Option : autre taux personnalisé */}
                <div
                  style={{
                    padding: '12px 16px', borderRadius: 10,
                    background: showCustomTax ? C.brandBg : C.bg,
                    border: `1.5px solid ${showCustomTax ? C.brand : C.hairline}`,
                    transition: 'all 0.12s',
                  }}
                >
                  <div
                    onClick={() => setShowCustomTax(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: showCustomTax ? C.brand : C.ink }}>Autre taux personnalisé</div>
                      <div style={{ fontSize: 12, color: C.inkMute, marginTop: 1 }}>Saisissez librement votre taux (ex : 16, 7.5)</div>
                    </div>
                    {showCustomTax && <Check size={16} color={C.brand} strokeWidth={2.5} />}
                  </div>
                  {showCustomTax && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        autoFocus
                        value={customTax}
                        onChange={e => {
                          const v = e.target.value;
                          setCustomTax(v);
                          const n = parseFloat(v);
                          if (!isNaN(n) && n >= 0 && n <= 100) setTaxRate(n / 100);
                        }}
                        placeholder="Ex: 16"
                        style={{
                          flex: 1, padding: '9px 12px', borderRadius: 8,
                          border: `1.5px solid ${C.brandBd}`,
                          fontSize: 14, color: C.ink, outline: 'none',
                          background: '#fff', fontFamily: 'inherit',
                        }}
                      />
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.brand }}>%</span>
                    </div>
                  )}
                </div>
              </div>

              <p style={{ margin: '14px 0 0', fontSize: 11.5, color: C.inkFaint, textAlign: 'center', fontStyle: 'italic' }}>
                💡 Modifiable via <strong>Réglages → TVA</strong>.
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, gap: 10 }}>
                <button onClick={() => setStep(2)}
                  style={{ fontSize: 13, color: C.inkMute, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  ← Retour
                </button>
                <button onClick={() => setStep(4)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 10, background: C.brand, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                  Continuer <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 4 : Thème ───────────────────────────────────────────── */}
          {step === 4 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <p style={{ margin: '0 0 6px', fontSize: 14.5, fontWeight: 700, color: C.ink }}>
                  Choisissez votre apparence
                </p>
                <p style={{ margin: 0, fontSize: 13, color: C.inkMute, lineHeight: 1.5 }}>
                  Personnalisez l'ambiance visuelle de votre logiciel. Le thème <strong>Neutre</strong> est recommandé pour un usage prolongé en pharmacie.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {THEMES.map(t => {
                  const active = themeId === t.id;
                  const isRecommended = t.id === 'neutral';
                  return (
                    <button
                      key={t.id}
                      onClick={() => setThemeId(t.id)}
                      style={{
                        position: 'relative',
                        padding: '10px 10px 12px', borderRadius: 11, cursor: 'pointer',
                        background: active ? C.brandBg : C.bg,
                        border: `1.5px solid ${active ? C.brand : C.hairline}`,
                        textAlign: 'left',
                        transition: 'all 0.12s',
                      }}
                    >
                      {isRecommended && !active && (
                        <span style={{
                          position: 'absolute', top: 6, right: 6,
                          fontSize: 9, fontWeight: 700,
                          background: 'rgba(16,120,90,0.1)', color: C.brand,
                          padding: '1px 5px', borderRadius: 4,
                          letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}>
                          ★
                        </span>
                      )}
                      {/* Aperçu visuel */}
                      <div style={{
                        width: '100%', height: 40, borderRadius: 8, marginBottom: 7,
                        background: t.preview ?? t.bg,
                        border: `1px solid ${C.hairline}`,
                        display: 'flex', alignItems: 'flex-end', padding: 4, gap: 3,
                      }}>
                        <div style={{ flex: 1, height: 5, background: 'rgba(0,0,0,0.12)', borderRadius: 2 }} />
                        <div style={{ width: 12, height: 5, background: 'rgba(0,0,0,0.2)', borderRadius: 2 }} />
                      </div>
                      <div style={{
                        fontSize: 12, fontWeight: 700,
                        color: active ? C.brand : C.ink,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}>
                        <span>{t.label}</span>
                        {active && <Check size={12} color={C.brand} strokeWidth={2.5} />}
                      </div>
                      <div style={{ fontSize: 10.5, color: C.inkMute, marginTop: 1 }}>
                        {t.dark ? 'Sombre' : 'Clair'}
                      </div>
                    </button>
                  );
                })}
              </div>

              <p style={{ margin: '14px 0 0', fontSize: 11.5, color: C.inkFaint, textAlign: 'center', fontStyle: 'italic' }}>
                💡 Modifiable via <strong>Réglages → Apparence</strong>.
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, gap: 10 }}>
                <button onClick={() => setStep(3)}
                  style={{ fontSize: 13, color: C.inkMute, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  ← Retour
                </button>
                <button onClick={() => setStep(5)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 10, background: C.brand, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                  Continuer <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 5 : Import catalogue ────────────────────────────────── */}
          {step === 5 && (
            <div>
              {!catalogDone ? (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ margin: '0 0 4px', fontSize: 14.5, fontWeight: 700, color: C.ink }}>
                      Importez votre catalogue médicaments
                    </p>
                    <p style={{ margin: 0, fontSize: 13, color: C.inkMute, lineHeight: 1.5 }}>
                      Glissez votre fichier Excel ou CSV avec vos produits. Le mapping se fait automatiquement.
                    </p>
                  </div>
                  <DataImporter onImportComplete={() => setCatalogDone(true)} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, gap: 10 }}>
                    <button onClick={() => setStep(4)}
                      style={{ fontSize: 13, color: C.inkMute, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      ← Retour
                    </button>
                    <button onClick={() => setStep(6)}
                      style={{ fontSize: 13, color: C.inkMute, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      Passer cette étape →
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 99, background: C.brandBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <CheckCircle2 size={28} color={C.brand} strokeWidth={1.8} />
                  </div>
                  <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: C.ink }}>Catalogue importé !</p>
                  <p style={{ margin: '0 0 20px', fontSize: 13, color: C.inkMute }}>Vos produits sont maintenant disponibles en caisse.</p>
                  <button onClick={() => setStep(6)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 10, background: C.brand, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                    Continuer <ChevronRight size={15} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── ÉTAPE 6 : Récapitulatif ───────────────────────────────────── */}
          {step === 6 && (
            <div>
              <p style={{ margin: '0 0 18px', fontSize: 13.5, color: C.inkSoft, lineHeight: 1.5 }}>
                Votre pharmacie est configurée. Voici un récap de ce qui a été fait :
              </p>

              {/* Récap */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                <SummaryRow
                  icon={<Building2 size={14} color={pharmName.trim() ? C.brand : C.inkFaint} />}
                  label="Nom de la pharmacie"
                  value={pharmName.trim() || '— non configuré'}
                  done={!!pharmName.trim()}
                />
                <SummaryRow
                  icon={<Boxes size={14} color={C.brand} />}
                  label="Mode de gestion"
                  value={workflowMode === 'unit' ? 'Par boîte (code unique)' : 'Par quantité'}
                  done
                />
                <SummaryRow
                  icon={<Percent size={14} color={C.brand} />}
                  label="Taux de TVA"
                  value={`${(taxRate * 100).toFixed(1).replace('.0', '')} %`}
                  done
                />
                <SummaryRow
                  icon={<Palette size={14} color={C.brand} />}
                  label="Thème"
                  value={THEMES.find(t => t.id === themeId)?.label ?? 'Neutre'}
                  done
                />
                <SummaryRow
                  icon={<FileSpreadsheet size={14} color={catalogDone ? C.brand : C.inkFaint} />}
                  label="Catalogue médicaments"
                  value={catalogDone ? 'Importé ✓' : 'Non importé — à faire plus tard'}
                  done={catalogDone}
                />
                <SummaryRow
                  icon={<ChevronRight size={14} color={C.inkFaint} />}
                  label="Fournisseurs WhatsApp"
                  value="À configurer dans l'onglet Fournisseurs"
                  done={false}
                />
              </div>

              {/* CTA fournisseurs */}
              <button onClick={goFournisseurs}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '13px 16px', borderRadius: 10, marginBottom: 10,
                  border: `1.5px solid ${C.hairline}`, background: C.bg, cursor: 'pointer',
                  textAlign: 'left',
                }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Ajouter des fournisseurs</div>
                  <div style={{ fontSize: 12, color: C.inkMute, marginTop: 1 }}>Numéros WhatsApp, contacts — pour commander directement depuis l'app</div>
                </div>
                <ChevronRight size={15} color={C.inkFaint} />
              </button>

              {/* Bouton principal */}
              <button onClick={finish} disabled={saving}
                style={{
                  width: '100%', padding: '12px', borderRadius: 10,
                  background: saving ? '#e5e7eb' : C.brand, color: saving ? '#9ca3af' : '#fff',
                  border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                {saving
                  ? <><div style={{ width: 14, height: 14, borderRadius: 99, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} /> Enregistrement…</>
                  : <><CheckCircle2 size={16} /> Lancer JunglePharm</>
                }
              </button>

              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ligne de récapitulatif ──────────────────────────────────────────────────
function SummaryRow({ icon, label, value, done }: { icon: React.ReactNode; label: string; value: string; done: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8,
      background: done ? 'rgba(16,120,90,0.05)' : '#f9fafb',
      border: `1px solid ${done ? 'rgba(16,120,90,0.15)' : 'rgba(0,0,0,0.06)'}`,
    }}>
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{label}</span>
        <div style={{ fontSize: 13, fontWeight: 700, color: done ? '#10785a' : '#6b7280', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      </div>
      {done && <Check size={13} color="#10785a" strokeWidth={2.5} />}
    </div>
  );
}
