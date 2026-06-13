/**
 * Settings.tsx — Réglages · Chalk Premium (redesign flat)
 */

import { useState, useEffect } from 'react';
import {
  User, Building2, LogOut, Upload, Percent,
  Check, AlertCircle, Truck, Phone, Plus, Trash2,
  Layers, ScanLine, AlertTriangle, RotateCcw, Key, Bell, ShieldAlert, Clock, HelpCircle, Sparkles,
  Smartphone, Download, MapPin, CreditCard, Globe,
} from 'lucide-react';
import { usePWAInstall } from '../lib/usePWAInstall';
import { getManagerPin } from '../lib/sellerContext';
import { useTheme, THEMES } from '../lib/themeContext';
import { useAuth } from '../lib/auth';
import { useWorkflow } from '../lib/workflowContext';
import { clearAllLocalData } from '../lib/db';
import { clearAllStock } from '../lib/ImportService';
import { useUserSettings } from '../lib/userSettings';
import { saveSettings, getMarginMethod, setMarginMethod, type MarginMethod } from '../lib/settings';
import DataImporter from './DataImporter';
import ApiKeysManager from './ApiKeysManager';
import { resetTour } from './ProductTour';
import { TAB_TOURS } from '../lib/tourRegistry';

// ── Chalk Premium tokens ──────────────────────────────────────────
const C = {
  brand:    '#537d14',
  brandHi:  '#6a9e28',
  brandLt:  'rgba(83,125,20,0.08)',
  brandBd:  'rgba(83,125,20,0.20)',
  ink:      '#0a0e14',
  inkSoft:  '#2c3138',
  inkMute:  '#6b7280',
  inkFaint: '#9aa0a8',
  bg:       '#f8fafc',
  surface:  '#ffffff',
  panel:    'rgba(255,255,255,0.72)',
  hairline: 'rgba(15,15,20,0.07)',
  red:      '#c81e1e',
  redBg:    'rgba(200,30,30,0.06)',
  redBd:    'rgba(200,30,30,0.18)',
  amber:    '#b75f06',
  amberBg:  'rgba(183,95,6,0.08)',
  amberBd:  'rgba(183,95,6,0.20)',
  blue:     '#0651bc',
  blueBg:   'rgba(6,81,188,0.07)',
  violet:   '#6e44b0',
  violetBg: 'rgba(110,68,176,0.07)',
};

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, sans-serif';

const TAX_OPTIONS = [
  { value: 0,     label: '0 %',    sub: 'Pas de TVA' },
  { value: 0.10,  label: '10 %',   sub: 'Taux réduit' },
  { value: 0.189, label: '18,9 %', sub: 'Taux normal Congo' },
  { value: 0.20,  label: '20 %',   sub: 'Taux majoré' },
];

interface Wholesaler { name: string; phone: string; }

const DEFAULT_WHOLESALERS: Wholesaler[] = [
  { name: 'Laborex Congo', phone: '+242 06 XXX XXXX' },
  { name: 'Cophadom',      phone: '+242 05 XXX XXXX' },
];

const CURRENCIES = [
  { value: 'CDF', label: 'CDF — Franc congolais' },
  { value: 'XAF', label: 'XAF — Franc CFA' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'USD', label: 'USD — Dollar américain' },
];

// ── Flat card shell ───────────────────────────────────────────────
function FlatCard({
  title, subtitle, icon, iconBg, children, headerAction, noPad = false,
}: {
  title: string; subtitle?: string;
  icon?: React.ReactNode; iconBg?: string;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
  noPad?: boolean;
}) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.hairline}`,
      borderRadius: 16,
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '16px 18px',
        display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: `1px solid ${C.hairline}`,
      }}>
        {icon && (
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: iconBg ?? C.brandLt,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {icon}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink, letterSpacing: '-0.015em' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: C.inkMute, marginTop: 2 }}>{subtitle}</div>}
        </div>
        {headerAction}
      </div>
      <div style={{ padding: noPad ? 0 : '16px 18px' }}>
        {children}
      </div>
    </div>
  );
}

// ── Input Chalk ───────────────────────────────────────────────────
function ChalkInput({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: '100%', padding: '10px 12px', fontSize: 14, color: C.ink,
          background: C.bg,
          border: `1.5px solid ${focus ? C.brand : C.hairline}`,
          borderRadius: 9, outline: 'none', boxSizing: 'border-box',
          transition: 'border-color 0.15s',
          fontFamily: FONT,
        }}
      />
    </div>
  );
}

// ── Bouton Chalk ──────────────────────────────────────────────────
function ChalkButton({ label, onClick, color = C.brand, disabled = false, icon }: {
  label: string; onClick: () => void;
  color?: string; disabled?: boolean; icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        padding: '10px 18px', borderRadius: 9, border: 'none',
        background: disabled ? C.hairline : color,
        color: disabled ? C.inkFaint : '#fff',
        fontSize: 13.5, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
        letterSpacing: '-0.01em', transition: 'opacity 0.15s',
        fontFamily: FONT,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}{label}
    </button>
  );
}

// ── Statistiques rapides pour la carte profil ─────────────────────
function useTodayStats() {
  const [stats, setStats] = useState({ sales: 0, revenue: 0 });
  useEffect(() => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const raw = localStorage.getItem('offline_journal');
      if (!raw) return;
      const journal = JSON.parse(raw) as Array<{ date: string; total_price: number }>;
      const todayEntries = journal.filter(e => e.date?.startsWith(today));
      setStats({ sales: todayEntries.length, revenue: todayEntries.reduce((s, e) => s + (e.total_price || 0), 0) });
    } catch {}
  }, []);
  return stats;
}

// ═══════════════════════════════════════════════════════════════════
export default function Settings() {
  const { profile, signOut, user } = useAuth();
  const { workflowMode, setWorkflowMode } = useWorkflow();
  const { settings: userSettings, update: updateUserSettings } = useUserSettings();
  const { theme, themeId, setThemeId } = useTheme();
  const todayStats = useTodayStats();

  // Responsive
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // Données locales
  const [pharmacyName,    setPharmacyName]    = useState('');
  const [defSupplier,     setDefSupplier]     = useState('');
  const [licenseNumber,   setLicenseNumber]   = useState(() => localStorage.getItem('license_number') || '');
  const [currency,        setCurrency]        = useState(() => localStorage.getItem('currency') || 'CDF');
  const [pharmacyAddress, setPharmacyAddress] = useState(() => localStorage.getItem('pharmacy_address') || '');
  const [editingAddress,  setEditingAddress]  = useState(false);
  const [taxRate,         setTaxRate]         = useState(() => parseFloat(localStorage.getItem('tax_rate') || '0'));
  const [marginMethodState, setMarginMethodState] = useState<MarginMethod>(getMarginMethod());

  const PIN_DURATION_KEY = 'pin_unlock_duration';
  const PIN_DURATION_OPTIONS = [
    { value: 0,   label: 'Cette session',  sub: "Jusqu'à la fermeture de l'onglet" },
    { value: 15,  label: '15 minutes',     sub: 'Reverrouillage automatique' },
    { value: 30,  label: '30 minutes',     sub: 'Recommandé pour usage partagé' },
    { value: 60,  label: '1 heure',        sub: 'Usage exclusif du manager' },
    { value: 240, label: '4 heures',       sub: 'Journée de travail' },
  ];
  const [pinDuration, setPinDuration] = useState(() => parseInt(localStorage.getItem(PIN_DURATION_KEY) || '0'));
  const [ticketWidth,  setTicketWidth]  = useState(() => localStorage.getItem('ticket_width') || '58mm');

  const [wholesalers,      setWholesalers]      = useState<Wholesaler[]>(() => {
    const s = localStorage.getItem('wholesalers');
    return s ? JSON.parse(s) : DEFAULT_WHOLESALERS;
  });
  const [newWholesaler,    setNewWholesaler]    = useState({ name: '', phone: '' });
  const [showAddWholesaler, setShowAddWholesaler] = useState(false);

  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>(() =>
    ('Notification' in window) ? Notification.permission : 'unsupported'
  );

  const { state: pwaState, install: installPWA } = usePWAInstall();
  const [savedSection, setSavedSection] = useState<string | null>(null);

  // Danger — reset
  const [showResetPinGate, setShowResetPinGate] = useState(false);
  const [resetPinInput,    setResetPinInput]    = useState('');
  const [resetPinError,    setResetPinError]    = useState('');
  const [showReset,        setShowReset]        = useState(false);
  const [resetText,        setResetText]        = useState('');
  const [isResetting,      setIsResetting]      = useState(false);

  useEffect(() => {
    setPharmacyName(userSettings.pharmacy_name);
    setDefSupplier(userSettings.default_supplier);
  }, [userSettings.pharmacy_name, userSettings.default_supplier]);

  const flashSaved = (section: string) => {
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 2200);
  };

  const savePharmacy = async () => {
    await updateUserSettings({ pharmacy_name: pharmacyName, default_supplier: defSupplier });
    saveSettings({ pharmacy_name: pharmacyName });
    localStorage.setItem('license_number', licenseNumber);
    localStorage.setItem('currency', currency);
    localStorage.setItem('pharmacy_address', pharmacyAddress);
    window.dispatchEvent(new Event('junglepharm:settings_updated'));
    flashSaved('pharmacie');
  };

  const saveAll = async () => {
    await savePharmacy();
    flashSaved('__all__');
  };

  const saveTax = () => {
    localStorage.setItem('tax_rate', taxRate.toString());
    window.dispatchEvent(new Event('junglepharm:tax_updated'));
    flashSaved('tva');
  };

  const savePinDuration = (value: number) => {
    setPinDuration(value);
    localStorage.setItem(PIN_DURATION_KEY, value.toString());
    flashSaved('pin_duration');
  };

  const addWholesaler = () => {
    if (!newWholesaler.name || !newWholesaler.phone) return;
    const updated = [...wholesalers, newWholesaler];
    setWholesalers(updated);
    localStorage.setItem('wholesalers', JSON.stringify(updated));
    setNewWholesaler({ name: '', phone: '' });
    setShowAddWholesaler(false);
  };

  const removeWholesaler = (i: number) => {
    const updated = wholesalers.filter((_, idx) => idx !== i);
    setWholesalers(updated);
    localStorage.setItem('wholesalers', JSON.stringify(updated));
  };

  const handleSignOut = async () => {
    if (confirm('Se déconnecter ?')) await signOut().catch(console.error);
  };

  const handleReset = async () => {
    if (resetText !== 'SUPPRIMER') return;
    setIsResetting(true);
    try {
      const result = await clearAllStock();
      await clearAllLocalData();
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) keys.push(k); }
      keys.forEach(k => localStorage.removeItem(k));
      localStorage.setItem('pharma_data_reset', '1');
      if (result.ok) {
        alert(`✓ Stock actuel effacé.\n${result.deleted} entrée(s) supprimée(s).`);
      } else {
        alert(`⚠️ Suppression partielle : ${result.deleted} supprimée(s), ${result.remaining} restante(s).\nRéessayez si nécessaire.`);
      }
      window.location.reload();
    } catch (e) {
      alert(`Erreur lors de la suppression : ${String(e)}`);
      setIsResetting(false);
      setShowReset(false);
    }
  };

  const taxLabel = TAX_OPTIONS.find(t => t.value === taxRate)?.label ?? `${(taxRate * 100).toFixed(1)} %`;

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FONT, minHeight: '100vh', background: C.bg }}>
      {/* ── Header sticky ─────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(248,250,252,0.90)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${C.hairline}`,
        padding: '12px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.inkMute }}>
          <span>Compte</span>
          <span style={{ fontSize: 11 }}>›</span>
          <span style={{ color: C.ink, fontWeight: 600 }}>Paramètres</span>
        </div>
        <button
          onClick={saveAll}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 9,
            background: savedSection === '__all__' || savedSection === 'pharmacie' ? C.brand : C.ink,
            color: '#fff', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, fontFamily: FONT,
            transition: 'background 0.25s',
          }}
        >
          <Check size={13} strokeWidth={2.8} />
          {savedSection === '__all__' || savedSection === 'pharmacie' ? 'Enregistré !' : 'Enregistrer'}
        </button>
      </div>

      <div style={{ padding: '24px 20px 100px', maxWidth: 740, margin: '0 auto' }}>

        {/* ── Page title ────────────────────────────────────────── */}
        <h1 style={{ margin: '0 0 4px', fontSize: 28, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          Paramètres
        </h1>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: C.inkMute, lineHeight: 1.5 }}>
          Configure ton officine, ton apparence et ta synchronisation.
        </p>

        {/* ── Profil utilisateur ────────────────────────────────── */}
        {profile && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 18px', marginBottom: 14,
            background: C.surface, border: `1px solid ${C.hairline}`,
            borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 13, flexShrink: 0,
              background: `linear-gradient(135deg, ${C.brand}, ${C.brandHi})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 12px ${C.brand}44`,
            }}>
              <User size={20} color="#fff" strokeWidth={1.8} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                {profile.full_name || profile.email}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: C.brand, display: 'inline-block' }} />
                <span style={{ fontSize: 12, color: C.inkMute, fontWeight: 500 }}>
                  {profile.role === 'manager' ? 'Pharmacien gérant' : 'Vendeur'}
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 10.5, color: C.inkFaint, marginBottom: 2 }}>Aujourd'hui</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.brand }}>
                {todayStats.sales} vente{todayStats.sales !== 1 ? 's' : ''}
              </div>
              {todayStats.revenue > 0 && (
                <div style={{ fontSize: 11, color: C.inkMute, marginTop: 1 }}>
                  {Math.round(todayStats.revenue).toLocaleString('fr-FR')} F
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Banner pharmacie non configurée ───────────────────── */}
        {!pharmacyName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 14, background: C.amberBg, border: `1px solid ${C.amberBd}`, borderRadius: 12 }}>
            <AlertCircle size={16} color={C.amber} strokeWidth={2} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 13, color: C.amber, fontWeight: 600 }}>
              Le nom de votre pharmacie n'est pas configuré — il apparaîtra sur les tickets et rapports.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ═══ APPARENCE — full width ═══════════════════════════ */}
          <FlatCard
            title="Apparence"
            subtitle={`${theme.label} · ${theme.dark ? 'Sombre' : 'Clair'}`}
            icon={
              <div style={{ width: 17, height: 17, borderRadius: 5, background: theme.preview ?? theme.bg, border: '2px solid rgba(255,255,255,0.7)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            }
            iconBg="rgba(0,0,0,0.04)"
          >
            <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: C.inkFaint, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              THÈME D'ARRIÈRE-PLAN
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 3 : 4}, 1fr)`, gap: 10 }}>
              {THEMES.map(t => {
                const active = t.id === themeId;
                return (
                  <button
                    key={t.id}
                    onClick={() => setThemeId(t.id)}
                    title={t.label}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                      background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT,
                    }}
                  >
                    <div style={{
                      width: '100%', aspectRatio: '4/3',
                      borderRadius: 12,
                      background: t.bg,
                      border: active ? `2.5px solid ${C.brand}` : `2px solid ${C.hairline}`,
                      boxShadow: active
                        ? `0 0 0 3px ${C.brandLt}, 0 6px 16px rgba(0,0,0,0.14)`
                        : '0 2px 6px rgba(0,0,0,0.08)',
                      transition: 'all 0.2s',
                      position: 'relative', overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {active && (
                        <div style={{
                          width: 22, height: 22, borderRadius: 99,
                          background: 'rgba(255,255,255,0.95)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                        }}>
                          <Check size={12} color={C.brand} strokeWidth={3} />
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontSize: 11.5, fontWeight: active ? 700 : 500,
                      color: active ? C.brand : C.inkMute,
                      letterSpacing: '-0.005em', lineHeight: 1,
                    }}>
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </FlatCard>

          {/* ═══ 2-column: Mode de gestion + Profil pharmacie ════ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 12,
          }}>

            {/* ── Mode de gestion ─────────────────────────────── */}
            <FlatCard
              title="Mode de gestion"
              subtitle={workflowMode === 'global' ? 'Global — stock par produit' : 'Unitaire — JP-XXXXX par boîte'}
              icon={<Layers size={17} color={C.violet} strokeWidth={1.8} />}
              iconBg={C.violetBg}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {([
                  { mode: 'global' as const, icon: <Layers size={16} strokeWidth={1.5} />, label: 'Mode global', desc: 'Stock agrégé par produit' },
                  { mode: 'unit'   as const, icon: <ScanLine size={16} strokeWidth={1.5} />, label: 'Mode unitaire', desc: 'Code JP-XXXXX par boîte' },
                ]).map(({ mode, icon, label, desc }) => {
                  const active = workflowMode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => setWorkflowMode(mode)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 14px', borderRadius: 11,
                        background: active ? C.brandLt : C.bg,
                        border: `2px solid ${active ? C.brand : C.hairline}`,
                        cursor: 'pointer', transition: 'all 0.15s',
                        fontFamily: FONT, textAlign: 'left',
                      }}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                        background: active ? C.brand : C.hairline,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: active ? '#fff' : C.inkMute, transition: 'all 0.15s',
                      }}>
                        {icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: active ? C.brand : C.ink }}>{label}</div>
                        <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>{desc}</div>
                      </div>
                      {active && (
                        <div style={{ width: 18, height: 18, borderRadius: 99, background: C.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Check size={10} color="#fff" strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}
                {workflowMode === 'unit' && (
                  <div style={{ marginTop: 2, padding: '10px 12px', background: C.amberBg, border: `1px solid ${C.amberBd}`, borderRadius: 9, fontSize: 12, color: C.amber, lineHeight: 1.5 }}>
                    <strong>Mode unitaire actif —</strong> chaque réception génère des codes JP-XXXXX à scanner lors des ventes.
                  </div>
                )}
              </div>
            </FlatCard>

            {/* ── Profil de la pharmacie ──────────────────────── */}
            <FlatCard
              title="Profil de la pharmacie"
              icon={<Building2 size={17} color={!pharmacyName ? C.amber : C.brand} strokeWidth={1.8} />}
              iconBg={!pharmacyName ? C.amberBg : C.brandLt}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ChalkInput
                  label="Nom de l'officine"
                  value={pharmacyName}
                  onChange={setPharmacyName}
                  placeholder="Ex : Pharmacie du Centre"
                />
                <ChalkInput
                  label="Numéro de licence"
                  value={licenseNumber}
                  onChange={setLicenseNumber}
                  placeholder="Ex : PH-2024-00123"
                />

                {/* Adresse avec bouton Modifier */}
                <div>
                  <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 700, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    ADRESSE
                  </p>
                  {editingAddress ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        value={pharmacyAddress}
                        onChange={e => setPharmacyAddress(e.target.value)}
                        placeholder="Ex : 12 Avenue de l'Indépendance, Brazzaville"
                        rows={2}
                        style={{
                          width: '100%', padding: '10px 12px', fontSize: 13, color: C.ink,
                          background: C.bg, border: `1.5px solid ${C.brand}`,
                          borderRadius: 9, outline: 'none', resize: 'none',
                          boxSizing: 'border-box', fontFamily: FONT, lineHeight: 1.5,
                        }}
                      />
                      <button
                        onClick={() => setEditingAddress(false)}
                        style={{ alignSelf: 'flex-end', fontSize: 12, fontWeight: 700, color: C.brand, background: C.brandLt, border: `1px solid ${C.brandBd}`, borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontFamily: FONT }}
                      >
                        Valider
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: C.bg, borderRadius: 9, border: `1.5px solid ${C.hairline}` }}>
                      <MapPin size={14} color={C.inkFaint} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, color: pharmacyAddress ? C.inkSoft : C.inkFaint, lineHeight: 1.4 }}>
                        {pharmacyAddress || 'Non renseignée'}
                      </span>
                      <button
                        onClick={() => setEditingAddress(true)}
                        style={{ fontSize: 12, fontWeight: 700, color: C.brand, background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0, fontFamily: FONT }}
                      >
                        Modifier
                      </button>
                    </div>
                  )}
                </div>

                {/* Devise par défaut */}
                <div>
                  <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 700, color: C.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    DEVISE PAR DÉFAUT
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {CURRENCIES.map(c => {
                      const active = currency === c.value;
                      return (
                        <button
                          key={c.value}
                          onClick={() => setCurrency(c.value)}
                          style={{
                            padding: '9px 12px', borderRadius: 9, textAlign: 'left',
                            background: active ? C.brandLt : C.bg,
                            border: `1.5px solid ${active ? C.brand : C.hairline}`,
                            cursor: 'pointer', fontFamily: FONT, transition: 'all 0.12s',
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: active ? C.brand : C.ink }}>{c.value}</div>
                          <div style={{ fontSize: 10.5, color: C.inkFaint, marginTop: 1 }}>{c.label.split(' — ')[1]}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                  {savedSection === 'pharmacie' && (
                    <span style={{ fontSize: 12.5, color: C.brand, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={13} /> Enregistré
                    </span>
                  )}
                  <ChalkButton label="Enregistrer" onClick={savePharmacy} />
                </div>
              </div>
            </FlatCard>
          </div>

          {/* ═══ 2-column: TVA + Marge ════════════════════════════ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 12,
          }}>

            {/* ── Taux de TVA ─────────────────────────────────── */}
            <FlatCard
              title="Taux de TVA"
              subtitle={taxLabel}
              icon={<Percent size={17} color={C.amber} strokeWidth={2} />}
              iconBg={C.amberBg}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {TAX_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTaxRate(opt.value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', borderRadius: 9, width: '100%', textAlign: 'left',
                      background: taxRate === opt.value ? C.amberBg : C.bg,
                      border: `1.5px solid ${taxRate === opt.value ? C.amberBd : 'transparent'}`,
                      cursor: 'pointer', transition: 'all 0.12s', fontFamily: FONT,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: taxRate === opt.value ? C.amber : C.ink }}>{opt.label}</div>
                      <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>{opt.sub}</div>
                    </div>
                    {taxRate === opt.value && <Check size={14} color={C.amber} strokeWidth={2.5} />}
                  </button>
                ))}
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                  {savedSection === 'tva' && (
                    <span style={{ fontSize: 12, color: C.brand, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={12} /> Appliqué
                    </span>
                  )}
                  <ChalkButton label="Appliquer" onClick={saveTax} color={C.amber} />
                </div>
              </div>
            </FlatCard>

            {/* ── Calcul de la marge ──────────────────────────── */}
            <FlatCard
              title="Calcul de la marge"
              subtitle={marginMethodState === 'on_sale' ? 'Sur prix de vente' : "Sur prix d'achat"}
              icon={<Percent size={17} color={C.brand} strokeWidth={2} />}
              iconBg={C.brandLt}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, margin: '0 0 6px' }}>
                  Formule appliquée dans l'inventaire et les rapports.
                </p>
                {([
                  {
                    value: 'on_cost' as MarginMethod,
                    label: "Sur prix d'achat",
                    sub: '(Vente − Achat) / Achat × 100',
                    exemple: 'Achat 700 F → marge 43 %',
                  },
                  {
                    value: 'on_sale' as MarginMethod,
                    label: 'Sur prix de vente',
                    sub: '(Vente − Achat) / Vente × 100',
                    exemple: 'Achat 700 F → marge 30 %',
                  },
                ]).map(opt => {
                  const active = marginMethodState === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setMarginMethodState(opt.value);
                        setMarginMethod(opt.value);
                        flashSaved('margin');
                      }}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '11px 12px', borderRadius: 9, width: '100%', textAlign: 'left',
                        background: active ? C.brandLt : C.bg,
                        border: `1.5px solid ${active ? C.brandBd : 'transparent'}`,
                        cursor: 'pointer', transition: 'all 0.12s', fontFamily: FONT,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: active ? C.brand : C.ink }}>{opt.label}</div>
                        <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>{opt.sub}</div>
                        <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 3, fontStyle: 'italic' }}>{opt.exemple}</div>
                      </div>
                      {active && <Check size={14} color={C.brand} strokeWidth={2.5} style={{ marginTop: 2, flexShrink: 0 }} />}
                    </button>
                  );
                })}
                {savedSection === 'margin' && (
                  <span style={{ fontSize: 12, color: C.brand, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 4 }}>
                    <Check size={12} /> Enregistré
                  </span>
                )}
              </div>
            </FlatCard>
          </div>

          {/* ═══ PIN + Format ticket ══════════════════════════════ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 12,
          }}>

            {/* ── Durée PIN ───────────────────────────────────── */}
            <FlatCard
              title="Déverrouillage PIN"
              subtitle={PIN_DURATION_OPTIONS.find(o => o.value === pinDuration)?.label ?? 'Cette session'}
              icon={<Clock size={17} color={C.brand} strokeWidth={1.8} />}
              iconBg={C.brandLt}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <p style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, margin: '0 0 6px' }}>
                  Durée avant redemande du code Manager.
                </p>
                {PIN_DURATION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => savePinDuration(opt.value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 9, width: '100%', textAlign: 'left',
                      background: pinDuration === opt.value ? C.brandLt : C.bg,
                      border: `1.5px solid ${pinDuration === opt.value ? C.brandBd : 'transparent'}`,
                      cursor: 'pointer', transition: 'all 0.12s', fontFamily: FONT,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: pinDuration === opt.value ? C.brand : C.ink }}>{opt.label}</div>
                      <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>{opt.sub}</div>
                    </div>
                    {pinDuration === opt.value && <Check size={14} color={C.brand} strokeWidth={2.5} />}
                  </button>
                ))}
                {savedSection === 'pin_duration' && (
                  <span style={{ fontSize: 12, color: C.brand, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 2 }}>
                    <Check size={12} /> Enregistré
                  </span>
                )}
              </div>
            </FlatCard>

            {/* ── Format ticket ───────────────────────────────── */}
            <FlatCard
              title="Format ticket"
              subtitle={ticketWidth === '80mm' ? '80 mm (large)' : '58 mm (standard)'}
              icon={<ScanLine size={17} color={C.brand} strokeWidth={1.8} />}
              iconBg={C.brandLt}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, margin: '0 0 6px' }}>
                  Largeur du papier de votre imprimante thermique.
                </p>
                {[
                  { value: '58mm', label: '58 mm — Standard', sub: 'Bluetooth portables (POS-58, Star mPOP…)' },
                  { value: '80mm', label: '80 mm — Large', sub: 'Comptoir (Epson TM-T20, Star TSP143…)' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setTicketWidth(opt.value); localStorage.setItem('ticket_width', opt.value); flashSaved('ticket'); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 9, width: '100%', textAlign: 'left',
                      background: ticketWidth === opt.value ? C.brandLt : C.bg,
                      border: `1.5px solid ${ticketWidth === opt.value ? C.brandBd : 'transparent'}`,
                      cursor: 'pointer', transition: 'all 0.12s', fontFamily: FONT,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: ticketWidth === opt.value ? C.brand : C.ink }}>{opt.label}</div>
                      <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>{opt.sub}</div>
                    </div>
                    {ticketWidth === opt.value && <Check size={14} color={C.brand} strokeWidth={2.5} />}
                  </button>
                ))}
                {savedSection === 'ticket' && (
                  <span style={{ fontSize: 12, color: C.brand, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 2 }}>
                    <Check size={12} /> Enregistré
                  </span>
                )}
              </div>
            </FlatCard>
          </div>

          {/* ═══ Fournisseurs ═════════════════════════════════════ */}
          <FlatCard
            title="Fournisseurs grossistes"
            subtitle={wholesalers.length > 0 ? wholesalers.map(w => w.name).join(', ') : 'Aucun fournisseur'}
            icon={<Truck size={17} color={C.blue} strokeWidth={1.8} />}
            iconBg={C.blueBg}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {wholesalers.map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: C.bg, border: `1px solid ${C.hairline}` }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: C.blueBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Truck size={14} color={C.blue} strokeWidth={1.8} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{w.name}</div>
                    <div style={{ fontSize: 12, color: C.inkMute, display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                      <Phone size={11} strokeWidth={1.8} />{w.phone}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <a href={`tel:${w.phone}`} title="Appeler" style={{ fontSize: 12, fontWeight: 600, color: C.brand, background: C.brandLt, border: `1px solid ${C.brandBd}`, borderRadius: 7, padding: '4px 10px', textDecoration: 'none' }}>
                      📞
                    </a>
                    <a
                      href={`https://wa.me/${w.phone.replace(/[\s\-().]/g,'').replace(/^00/,'+')}?text=${encodeURIComponent(`Bonjour, je suis de ${pharmacyName || 'JunglePharm'}. Je souhaite passer une commande.`)}`}
                      target="_blank" rel="noopener noreferrer"
                      title="Commander via WhatsApp"
                      style={{ fontSize: 12, fontWeight: 600, color: '#25D366', background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.25)', borderRadius: 7, padding: '4px 10px', textDecoration: 'none' }}
                    >
                      WhatsApp
                    </a>
                    <button onClick={() => removeWholesaler(i)} style={{ width: 28, height: 28, borderRadius: 7, background: 'transparent', border: `1px solid ${C.hairline}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.inkMute }}>
                      <Trash2 size={13} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
              ))}

              {wholesalers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: C.inkFaint, fontSize: 13 }}>
                  Aucun fournisseur enregistré
                </div>
              )}

              {showAddWholesaler ? (
                <div style={{ padding: '14px', background: C.bg, border: `1px solid ${C.hairline}`, borderRadius: 11, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <ChalkInput label="Nom" value={newWholesaler.name} onChange={v => setNewWholesaler(p => ({ ...p, name: v }))} placeholder="Ex: Laborex Congo" />
                  <ChalkInput label="Téléphone" value={newWholesaler.phone} onChange={v => setNewWholesaler(p => ({ ...p, phone: v }))} placeholder="+242 06 XXX XXXX" type="tel" />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setShowAddWholesaler(false); setNewWholesaler({ name: '', phone: '' }); }} style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${C.hairline}`, background: 'transparent', color: C.inkMute, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>Annuler</button>
                    <button onClick={addWholesaler} disabled={!newWholesaler.name || !newWholesaler.phone} style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none', background: !newWholesaler.name || !newWholesaler.phone ? C.hairline : C.blue, color: !newWholesaler.name || !newWholesaler.phone ? C.inkFaint : '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>Ajouter</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddWholesaler(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, width: '100%', border: `1.5px dashed ${C.hairline}`, background: 'transparent', cursor: 'pointer', color: C.inkMute, fontSize: 13, fontWeight: 600, fontFamily: FONT, transition: 'all 0.12s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.brand; (e.currentTarget as HTMLElement).style.color = C.brand; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.hairline; (e.currentTarget as HTMLElement).style.color = C.inkMute; }}
                >
                  <Plus size={15} strokeWidth={2} /> Ajouter un fournisseur
                </button>
              )}
            </div>
          </FlatCard>

          {/* ═══ Notifications + PWA ══════════════════════════════ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 12,
          }}>

            {/* ── Notifications ───────────────────────────────── */}
            <FlatCard
              title="Notifications"
              subtitle={notifPerm === 'granted' ? 'Activées' : notifPerm === 'denied' ? 'Bloquées' : notifPerm === 'unsupported' ? 'Non supportées' : 'Non configurées'}
              icon={<Bell size={17} color={C.amber} strokeWidth={1.8} />}
              iconBg={C.amberBg}
            >
              {notifPerm === 'unsupported' && (
                <p style={{ fontSize: 13, color: C.inkMute, margin: 0 }}>Les notifications ne sont pas supportées par ce navigateur.</p>
              )}
              {notifPerm === 'granted' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: C.brandLt, borderRadius: 9 }}>
                    <Check size={16} color={C.brand} strokeWidth={2.5} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Notifications activées</div>
                      <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>Alertes automatiques en temps réel.</div>
                    </div>
                    <button
                      onClick={() => new Notification('Test JunglePharm', { body: 'Les notifications fonctionnent correctement.', icon: '/icon-192.png' })}
                      style={{ fontSize: 12, fontWeight: 600, color: C.amber, background: C.amberBg, border: `1px solid ${C.amberBd}`, borderRadius: 7, padding: '5px 10px', cursor: 'pointer', fontFamily: FONT, flexShrink: 0 }}
                    >
                      Tester
                    </button>
                  </div>
                  {[
                    { emoji: '⚠️', title: 'Rupture de stock', desc: 'Produit sous le seuil minimum' },
                    { emoji: '📅', title: 'Péremption proche', desc: 'Expire dans les 30 prochains jours' },
                    { emoji: '🧾', title: 'Rapport Z', desc: 'Rappel de clôture de caisse' },
                  ].map(a => (
                    <div key={a.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', background: C.bg, borderRadius: 8, border: `1px solid ${C.hairline}` }}>
                      <span style={{ fontSize: 15 }}>{a.emoji}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{a.title}</div>
                        <div style={{ fontSize: 11, color: C.inkMute, marginTop: 1 }}>{a.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {notifPerm === 'denied' && (
                <div style={{ padding: '12px 14px', background: C.redBg, border: `1px solid ${C.redBd}`, borderRadius: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>Notifications bloquées</div>
                  <div style={{ fontSize: 12, color: '#7f2424', marginTop: 4, lineHeight: 1.5 }}>
                    Autorisez-les dans les paramètres du navigateur — cliquez sur le cadenas dans la barre d'adresse.
                  </div>
                </div>
              )}
              {notifPerm === 'default' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, margin: 0 }}>
                    Recevez une alerte dès qu'un produit est en rupture ou proche de la péremption.
                  </p>
                  <ChalkButton
                    label="Activer les notifications"
                    onClick={async () => { const p = await Notification.requestPermission(); setNotifPerm(p); }}
                    color={C.amber}
                  />
                </div>
              )}
            </FlatCard>

            {/* ── Installer l'application ─────────────────────── */}
            <FlatCard
              title="Installer l'application"
              subtitle={pwaState === 'installed' ? 'Déjà installée' : pwaState === 'installable' ? 'Disponible' : pwaState === 'ios' ? 'iOS — manuel' : 'Non disponible'}
              icon={<Smartphone size={17} color={C.brand} strokeWidth={1.8} />}
              iconBg={C.brandLt}
            >
              {pwaState === 'installed' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px', background: C.brandLt, borderRadius: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Check size={18} color={C.brand} strokeWidth={2.5} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>JunglePharm est installée</div>
                    <div style={{ fontSize: 12, color: C.inkMute, marginTop: 2 }}>Accessible depuis l'écran d'accueil, fonctionne hors connexion.</div>
                  </div>
                </div>
              )}
              {pwaState === 'installable' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, margin: 0 }}>
                    Installez JunglePharm comme application native — accès direct depuis l'écran d'accueil ou le bureau, fonctionne sans connexion.
                  </p>
                  <ChalkButton label="Installer JunglePharm" icon={<Download size={15} />} onClick={installPWA} color={C.brand} />
                </div>
              )}
              {pwaState === 'ios' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, margin: '0 0 12px' }}>
                    Sur Safari iOS, installez l'app en 3 étapes :
                  </p>
                  {[
                    { icon: '⬆️', text: "Appuyez sur le bouton Partager en bas de l'écran Safari" },
                    { icon: '➕', text: 'Sélectionnez "Sur l\'écran d\'accueil"' },
                    { icon: '✅', text: 'Appuyez sur "Ajouter" pour confirmer' },
                  ].map((step, i, arr) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.hairline}` : 'none' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: C.brandLt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{step.icon}</div>
                      <span style={{ fontSize: 13, color: C.ink, lineHeight: 1.4, paddingTop: 6 }}>{step.text}</span>
                    </div>
                  ))}
                </div>
              )}
              {pwaState === 'unsupported' && (
                <div style={{ padding: '12px 14px', background: 'rgba(0,0,0,0.03)', border: `1px solid ${C.hairline}`, borderRadius: 10 }}>
                  <p style={{ fontSize: 13, color: C.inkMute, margin: 0, lineHeight: 1.55 }}>
                    Votre navigateur actuel ne supporte pas l'installation PWA.<br />
                    Ouvrez JunglePharm dans <strong style={{ color: C.ink }}>Chrome</strong> ou <strong style={{ color: C.ink }}>Edge</strong> pour pouvoir l'installer.
                  </p>
                </div>
              )}
            </FlatCard>
          </div>

          {/* ═══ Fournisseur par défaut (section dédiée) ══════════ */}
          <FlatCard
            title="Fournisseur par défaut"
            subtitle={defSupplier || 'Non configuré'}
            icon={<Globe size={17} color={C.blue} strokeWidth={1.8} />}
            iconBg={C.blueBg}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ChalkInput
                label="Fournisseur par défaut"
                value={defSupplier}
                onChange={setDefSupplier}
                placeholder="Ex : Laborex Congo"
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                {savedSection === 'pharmacie' && (
                  <span style={{ fontSize: 12, color: C.brand, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Check size={12} /> Enregistré
                  </span>
                )}
                <ChalkButton label="Enregistrer" onClick={savePharmacy} color={C.blue} />
              </div>
            </div>
          </FlatCard>

          {/* ═══ Import CSV ═══════════════════════════════════════ */}
          <FlatCard
            title="Import CSV / Excel"
            subtitle="Importer ou mettre à jour le stock depuis un fichier"
            icon={<Upload size={17} color={C.brand} strokeWidth={1.8} />}
            iconBg={C.brandLt}
          >
            <DataImporter />
          </FlatCard>

          {/* ═══ Clés API ═════════════════════════════════════════ */}
          <FlatCard
            title="Clés API"
            subtitle="Chatbot WhatsApp & intégrations externes"
            icon={<Key size={17} color={C.violet} strokeWidth={1.8} />}
            iconBg={C.violetBg}
          >
            <ApiKeysManager />
          </FlatCard>

          {/* ═══ Aide & guides ════════════════════════════════════ */}
          <FlatCard
            title="Aide & guides interactifs"
            subtitle="Rejouer le guide de chaque onglet"
            icon={<HelpCircle size={17} color={C.brand} strokeWidth={1.8} />}
            iconBg={C.brandLt}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: C.inkMute, lineHeight: 1.55 }}>
                Chaque onglet possède un guide. Cliquez sur « Rejouer » : le guide s'affichera à votre prochaine ouverture de l'onglet concerné.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {TAB_TOURS.map(tour => (
                  <div key={tour.tourId} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 10,
                    background: C.bg, border: `1px solid ${C.hairline}`,
                  }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{tour.icon}</span>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: C.ink }}>
                      {tour.label}
                    </div>
                    <button
                      onClick={() => {
                        resetTour(tour.tourId, user?.id ?? null);
                        window.dispatchEvent(new Event('junglepharm:tour-recheck'));
                        flashSaved(`aide_${tour.tourId}`);
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '7px 12px', borderRadius: 8, flexShrink: 0,
                        border: `1px solid ${C.brandBd}`, background: C.brandLt,
                        color: C.brand, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                        fontFamily: FONT,
                      }}
                    >
                      {savedSection === `aide_${tour.tourId}`
                        ? <><Check size={13} strokeWidth={2.6} /> Réactivé</>
                        : <><RotateCcw size={13} strokeWidth={2} /> Rejouer</>}
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  TAB_TOURS.forEach(t => resetTour(t.tourId, user?.id ?? null));
                  window.dispatchEvent(new Event('junglepharm:tour-recheck'));
                  flashSaved('aide_all');
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '11px 16px', borderRadius: 10, alignSelf: 'flex-start',
                  border: `1px solid ${C.brandBd}`,
                  background: savedSection === 'aide_all' ? C.brandLt : 'transparent',
                  color: C.brand, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                  fontFamily: FONT,
                }}
              >
                <Sparkles size={15} strokeWidth={2} />
                {savedSection === 'aide_all' ? 'Tous les guides réactivés' : 'Rejouer tous les guides'}
              </button>
            </div>
          </FlatCard>

          {/* ═══ Zone Danger ══════════════════════════════════════ */}
          <div style={{
            marginTop: 8,
            padding: '16px',
            background: C.redBg,
            border: `1.5px solid ${C.redBd}`,
            borderRadius: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <AlertTriangle size={15} color={C.red} strokeWidth={2} />
              <span style={{ fontSize: 12, fontWeight: 700, color: C.red, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Zone critique
              </span>
            </div>

            <button
              onClick={handleSignOut}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', borderRadius: 10, marginBottom: 8, background: 'rgba(255,255,255,0.6)', border: `1px solid ${C.hairline}`, cursor: 'pointer', fontFamily: FONT, transition: 'background 0.12s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.9)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.6)'; }}
            >
              <LogOut size={15} color={C.red} strokeWidth={2} />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Se déconnecter</div>
                <div style={{ fontSize: 12, color: C.inkMute, marginTop: 1 }}>Ferme la session sur cet appareil</div>
              </div>
            </button>

            {!showResetPinGate && !showReset ? (
              <button
                onClick={() => { setShowResetPinGate(true); setResetPinInput(''); setResetPinError(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', borderRadius: 10, background: 'transparent', border: `1.5px dashed ${C.redBd}`, cursor: 'pointer', fontFamily: FONT }}
              >
                <RotateCcw size={15} color={C.red} strokeWidth={2} />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: C.red }}>Réinitialiser toutes les données</div>
                  <div style={{ fontSize: 12, color: '#9a4040', marginTop: 1 }}>Supprime définitivement tout l'inventaire et les ventes</div>
                </div>
              </button>
            ) : showResetPinGate ? (
              <div style={{ padding: '14px', background: 'rgba(255,255,255,0.7)', borderRadius: 12, border: `1.5px solid ${C.redBd}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldAlert size={14} /> Code Manager requis
                </div>
                <p style={{ fontSize: 12, color: C.inkSoft, marginBottom: 10 }}>
                  Entrez votre code Manager pour débloquer la réinitialisation.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 10 }}>
                  {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
                    <button key={i} onClick={() => {
                      if (!d) return;
                      if (d === '⌫') { setResetPinInput(p => p.slice(0,-1)); setResetPinError(''); return; }
                      if (resetPinInput.length >= 4) return;
                      const next = resetPinInput + d;
                      setResetPinInput(next);
                      setResetPinError('');
                      if (next.length === 4) {
                        setTimeout(() => {
                          if (next === getManagerPin()) {
                            setShowResetPinGate(false); setResetPinInput('');
                            setShowReset(true); setResetText('');
                          } else {
                            setResetPinError('Code incorrect'); setResetPinInput('');
                          }
                        }, 120);
                      }
                    }}
                    disabled={!d}
                    style={{ height: 44, borderRadius: 9, border: 'none', cursor: d ? 'pointer' : 'default',
                      background: d === '⌫' ? 'rgba(0,0,0,0.06)' : d ? '#f3f4f6' : 'transparent',
                      fontSize: 18, fontWeight: 600, color: '#1f2937', visibility: d ? 'visible' : 'hidden' }}>
                      {d}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[0,1,2,3].map(i => (
                      <div key={i} style={{ width: 10, height: 10, borderRadius: 99,
                        background: resetPinInput.length > i ? C.red : C.hairline, transition: 'all 0.12s' }} />
                    ))}
                  </div>
                  {resetPinError && <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>{resetPinError}</span>}
                  <button onClick={() => { setShowResetPinGate(false); setResetPinInput(''); setResetPinError(''); }}
                    style={{ fontSize: 12, color: C.inkMute, background: 'none', border: 'none', cursor: 'pointer' }}>Annuler</button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '14px', background: 'rgba(255,255,255,0.7)', borderRadius: 12, border: `1.5px solid ${C.redBd}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 4 }}>⚠ Confirmation requise</div>
                <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 12, lineHeight: 1.5 }}>
                  Cette action est <strong>irréversible</strong>. Elle supprimera tous les médicaments, ventes, unités de stock et données locales.<br />
                  Tapez <strong style={{ color: C.red, fontFamily: 'monospace' }}>SUPPRIMER</strong> pour confirmer.
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <input
                      value={resetText}
                      onChange={e => setResetText(e.target.value)}
                      placeholder="Tapez SUPPRIMER"
                      style={{
                        width: '100%', padding: '9px 12px', fontSize: 14, fontWeight: 700,
                        fontFamily: 'monospace', letterSpacing: '0.04em',
                        border: `2px solid ${resetText === 'SUPPRIMER' ? C.red : C.redBd}`,
                        borderRadius: 8, outline: 'none', color: C.red,
                        background: '#fff', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <button
                    onClick={() => { setShowReset(false); setResetText(''); }}
                    style={{ padding: '9px 14px', borderRadius: 8, border: `1px solid ${C.hairline}`, background: 'transparent', color: C.inkMute, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, flexShrink: 0 }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={resetText !== 'SUPPRIMER' || isResetting}
                    style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: resetText === 'SUPPRIMER' && !isResetting ? C.red : C.hairline, color: resetText === 'SUPPRIMER' && !isResetting ? '#fff' : C.inkFaint, fontSize: 13, fontWeight: 700, cursor: resetText === 'SUPPRIMER' ? 'pointer' : 'not-allowed', fontFamily: FONT, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {isResetting ? (
                      <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin 0.7s linear infinite' }} />
                    ) : (
                      <Trash2 size={13} />
                    )}
                    Supprimer
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Pied de page ──────────────────────────────────────── */}
          <div style={{ textAlign: 'center', padding: '16px 0 8px', fontSize: 11.5, color: C.inkFaint, letterSpacing: '-0.005em' }}>
            JunglePharm · v2.0.0 · Chalk Premium
          </div>

        </div>
      </div>
    </div>
  );
}
