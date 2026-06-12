import { useState, useEffect } from 'react';
import { getManagerPin, setManagerPin, hasManagerPin } from '../lib/sellerContext';
import { LogoIcon } from './LogoIcon';

// PIN scopé par compte (cf. sellerContext) — plus de clé d'appareil partagée.
function hasPinConfigured(): boolean {
  return hasManagerPin();
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  brand:   '#537d14',
  brandHi: '#6a9e28',
  brandDk: '#2a4009',
  brandLt: 'rgba(83,125,20,0.08)',
  ink:     '#0a0e14',
  inkSoft: '#2c3138',
  inkMute: '#6b7280',
  inkFaint:'#9aa0a8',
  border:  'rgba(15,15,20,0.09)',
  panel:   '#ffffff',
};

interface CachedSeller {
  id: string;
  name: string;
  pin_code: string;
}

interface Props {
  onManagerAccess: () => void;
  onVendorAccess:  (seller: { id: string; name: string }) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function avatarColor(name: string): [string, string] {
  const p: [string, string][] = [
    ['#537d14', '#eef7cc'],
    ['#2563eb', '#dbeafe'],
    ['#7c3aed', '#ede9fe'],
    ['#db2777', '#fce7f3'],
    ['#d97706', '#fef3c7'],
    ['#0891b2', '#cffafe'],
  ];
  return p[name.charCodeAt(0) % p.length];
}

// ── PIN pad ────────────────────────────────────────────────────────────────────
function PinPad({
  value, onChange, error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      {/* Dots */}
      <div style={{ display: 'flex', gap: 12 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="session-pin-dot" style={{
            width: 52, height: 52, borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 800, color: C.brand,
            background: error
              ? 'rgba(220,38,38,0.07)'
              : value.length > i
                ? C.brandLt
                : 'rgba(0,0,0,0.04)',
            border: `2px solid ${error
              ? '#dc2626'
              : value.length > i
                ? C.brand
                : C.border
            }`,
            transition: 'all 0.12s',
          }}>
            {value.length > i ? '•' : ''}
          </div>
        ))}
      </div>

      {error && (
        <p style={{ fontSize: 12.5, color: '#dc2626', fontWeight: 600, margin: '-6px 0' }}>
          {error}
        </p>
      )}

      {/* Numpad */}
      <div className="session-pinpad" style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8, width: '100%', maxWidth: 260,
      }}>
        {KEYS.map((d, i) => (
          <button
            key={i}
            onClick={() => {
              if (d === '⌫') onChange(value.slice(0, -1));
              else if (d && value.length < 4) onChange(value + d);
            }}
            disabled={!d}
            className="session-pin-btn"
            style={{
              height: 56, borderRadius: 14,
              fontSize: d === '⌫' ? 20 : 22, fontWeight: 600,
              cursor: d ? 'pointer' : 'default',
              background: d === '⌫' ? 'rgba(0,0,0,0.05)' : d ? C.panel : 'transparent',
              border: d ? `1px solid ${C.border}` : 'none',
              color: d === '⌫' ? C.inkMute : C.ink,
              boxShadow: d && d !== '⌫' ? '0 1px 4px rgba(0,0,0,0.07)' : 'none',
              visibility: d === '' ? 'hidden' : 'visible',
              transition: 'transform 0.08s',
            }}
            onMouseDown={e => { if (d) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.93)'; }}
            onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function SessionLockScreen({ onManagerAccess, onVendorAccess }: Props) {
  const sellers: CachedSeller[] = (() => {
    try { return JSON.parse(localStorage.getItem('pharma_sellers_cache') || '[]'); }
    catch { return []; }
  })();

  const [selected, setSelected]         = useState<CachedSeller | null>(null);
  const [pin, setPin]                   = useState('');
  const [pinError, setPinError]         = useState('');

  // ── Accès Gérant : PIN requis ───────────────────────────────────────────────
  const [managerPinView, setManagerPinView] = useState<'hidden' | 'create' | 'confirm' | 'enter'>('hidden');
  const [mgrPin1, setMgrPin1]           = useState('');  // création étape 1
  const [mgrPin2, setMgrPin2]           = useState('');  // création étape 2
  const [mgrEnter, setMgrEnter]         = useState('');  // saisie normale
  const [mgrError, setMgrError]         = useState('');
  const [mgrShake, setMgrShake]         = useState(false);

  // Auto-validate PIN after 4 digits
  useEffect(() => {
    if (pin.length === 4 && selected) {
      const timer = setTimeout(() => {
        if (pin === selected.pin_code) {
          onVendorAccess({ id: selected.id, name: selected.name });
        } else {
          setPinError('Code PIN incorrect');
          setPin('');
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [pin, selected, onVendorAccess]);

  const handleSelect = (seller: CachedSeller) => {
    setSelected(seller);
    setPin('');
    setPinError('');
  };

  const handleBack = () => {
    setSelected(null);
    setPin('');
    setPinError('');
  };

  // ── Ouvrir le flow PIN Manager ──────────────────────────────────────────────
  const openManagerPin = () => {
    setMgrPin1(''); setMgrPin2(''); setMgrEnter(''); setMgrError('');
    setManagerPinView(hasPinConfigured() ? 'enter' : 'create');
  };

  // ── Gestion saisie PIN Manager ──────────────────────────────────────────────
  const handleMgrDigit = (digit: string) => {
    const shake = () => { setMgrShake(true); setTimeout(() => setMgrShake(false), 500); };

    if (managerPinView === 'create') {
      const next = digit === '⌫' ? mgrPin1.slice(0,-1) : mgrPin1.length < 4 ? mgrPin1 + digit : mgrPin1;
      setMgrPin1(next); setMgrError('');
      if (next.length === 4) setTimeout(() => setManagerPinView('confirm'), 120);

    } else if (managerPinView === 'confirm') {
      const next = digit === '⌫' ? mgrPin2.slice(0,-1) : mgrPin2.length < 4 ? mgrPin2 + digit : mgrPin2;
      setMgrPin2(next); setMgrError('');
      if (next.length === 4) {
        setTimeout(() => {
          if (next === mgrPin1) { setManagerPin(mgrPin1); onManagerAccess(); }
          else { shake(); setMgrError('Les codes ne correspondent pas'); setMgrPin2(''); }
        }, 120);
      }

    } else if (managerPinView === 'enter') {
      const next = digit === '⌫' ? mgrEnter.slice(0,-1) : mgrEnter.length < 4 ? mgrEnter + digit : mgrEnter;
      setMgrEnter(next); setMgrError('');
      if (next.length === 4) {
        setTimeout(() => {
          if (next === getManagerPin()) { onManagerAccess(); }
          else { shake(); setMgrError('Code incorrect'); setMgrEnter(''); }
        }, 120);
      }
    }
  };

  const now = new Date();
  const greeting = now.getHours() < 12
    ? 'Bonjour 👋'
    : now.getHours() < 18
      ? 'Bon après-midi 👋'
      : 'Bonsoir 👋';

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .session-card { animation: fadeUp 0.35s ease both; }
        .seller-card {
          transition: transform 0.12s, box-shadow 0.12s;
        }
        .seller-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.12);
        }
        .seller-card:active { transform: scale(0.97); }
      `}</style>

      {/* ── Background ── */}
      <style>{`
        .session-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .session-logo { text-align: center; margin-bottom: 28px; }

        /* ── Tablette & mobile : layout vertical (par défaut ci-dessus) ── */

        /* ── Desktop ≥ 980px : layout 2 colonnes — logo+texte à gauche, carte à droite ── */
        @media (min-width: 980px) {
          .session-wrap {
            flex-direction: row;
            align-items: center;
            justify-content: center;
            gap: 80px;
            padding: 40px 60px !important;
          }
          .session-logo {
            text-align: left !important;
            margin-bottom: 0 !important;
            flex: 0 0 360px;
            max-width: 420px;
          }
          .session-logo .session-logo-icon { justify-content: flex-start !important; }
          .session-logo h1 { font-size: 44px !important; line-height: 1 !important; margin-bottom: 16px !important; }
          .session-logo .session-greeting { font-size: 16px !important; line-height: 1.6 !important; max-width: 340px; }
          .session-logo .session-tagline {
            display: block !important;
            margin-top: 18px;
            font-size: 13px;
            color: rgba(255,255,255,0.55);
            letter-spacing: 0.02em;
            line-height: 1.5;
          }
          .session-card { max-width: 440px !important; }
          .session-hint {
            position: absolute !important;
            bottom: 24px;
            left: 0;
            right: 0;
            margin-top: 0 !important;
          }
        }

        /* ── Mobile ≤ 480px : compacter pour rentrer sans scroll ── */
        @media (max-width: 480px) {
          .session-wrap { padding: 16px 12px !important; }
          .session-card { border-radius: 18px !important; }
          .session-card-inner { padding: 18px 16px 22px !important; }
          .session-logo h1 { font-size: 24px !important; }
          .session-logo p  { font-size: 13px !important; }
          .session-pin-dot { width: 44px !important; height: 44px !important; font-size: 20px !important; }
          .session-pin-btn { height: 50px !important; font-size: 20px !important; }
          .session-pinpad  { max-width: 240px !important; }
        }
        @media (max-width: 360px) {
          .session-card-inner { padding: 14px 12px 18px !important; }
          .session-pin-dot { width: 38px !important; height: 38px !important; }
          .session-pin-btn { height: 46px !important; font-size: 18px !important; }
          .session-pinpad  { max-width: 210px !important; gap: 6px !important; }
        }
      `}</style>
      <div className="session-wrap" style={{
        minHeight: '100svh',
        background: `linear-gradient(150deg, ${C.brandDk} 0%, #1e3006 45%, #253804 100%)`,
        padding: '24px 20px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Background blobs */}
        <div style={{ position: 'absolute', top: -100, left: -100, width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, rgba(188,217,110,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -120, right: -80, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(83,125,20,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Logo + greeting — affiché en colonne gauche sur desktop ≥ 980px */}
        <div className="session-logo" style={{ position: 'relative', zIndex: 1, animation: 'fadeIn 0.5s ease' }}>
          <div className="session-logo-icon" style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <LogoIcon size={60} radius={18} />
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1.1 }}>
            Jungle<span style={{ color: '#bcd96e' }}>Pharm</span>
          </h1>
          <p className="session-greeting" style={{ margin: '6px 0 0', fontSize: 14, color: 'rgba(188,217,110,0.65)' }}>
            {greeting} — Qui commence la session ?
          </p>
          {/* Tagline desktop uniquement */}
          <span className="session-tagline" style={{ display: 'none' }}>
            🌿 Gestion intelligente de pharmacie<br />
            Conçu pour les pharmaciens d'Afrique centrale
          </span>
        </div>

        {/* ── Card ── */}
        <div className="session-card" style={{
          width: '100%', maxWidth: 460,
          background: 'rgba(255,255,255,0.97)',
          borderRadius: 22,
          boxShadow: '0 28px 72px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}>

          {/* ── Vendor selection view ── */}
          {!selected && (
            <div style={{ padding: '24px 22px 20px' }}>
              {sellers.length > 0 ? (
                <>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.inkMute, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Choisissez votre profil
                  </p>

                  {/* Seller grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: sellers.length === 1
                      ? '1fr'
                      : sellers.length === 2
                        ? 'repeat(2, 1fr)'
                        : 'repeat(auto-fill, minmax(130px, 1fr))',
                    gap: 10,
                    marginBottom: 20,
                  }}>
                    {sellers.map(seller => {
                      const [tc, bg] = avatarColor(seller.name);
                      return (
                        <button
                          key={seller.id}
                          className="seller-card"
                          onClick={() => handleSelect(seller)}
                          style={{
                            padding: '16px 12px 14px',
                            borderRadius: 16,
                            background: bg,
                            border: `2px solid transparent`,
                            cursor: 'pointer', textAlign: 'center',
                            fontFamily: 'inherit',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = tc; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; }}
                        >
                          <div style={{
                            width: 46, height: 46, borderRadius: 14,
                            background: 'rgba(255,255,255,0.65)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 16, fontWeight: 800, color: tc,
                            margin: '0 auto 10px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                          }}>
                            {initials(seller.name)}
                          </div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: tc, margin: 0, lineHeight: 1.2 }}>
                            {seller.name}
                          </p>
                          <p style={{ fontSize: 11, color: `${tc}99`, margin: '2px 0 0', fontWeight: 500 }}>
                            Entrer le PIN
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                /* No vendors configured */
                <div style={{
                  textAlign: 'center', padding: '20px 0 16px',
                  color: C.inkMute, marginBottom: 20,
                }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 16,
                    background: 'rgba(0,0,0,0.04)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px', fontSize: 22,
                  }}>
                    👥
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: C.inkSoft, margin: '0 0 4px' }}>
                    Aucun vendeur configuré
                  </p>
                  <p style={{ fontSize: 12.5, color: C.inkMute, margin: 0 }}>
                    Ajoutez des vendeurs dans l'onglet Équipe
                  </p>
                </div>
              )}

              {/* Manager access */}
              <div style={{ borderTop: `1px solid rgba(0,0,0,0.07)`, paddingTop: 16 }}>
                <p style={{ fontSize: 11.5, color: C.inkFaint, textAlign: 'center', margin: '0 0 10px', fontWeight: 500 }}>
                  ACCÈS ADMINISTRATEUR
                </p>

                {/* ── PIN Manager inline ── */}
                {managerPinView !== 'hidden' ? (
                  <div style={{ animation: mgrShake ? 'shake 0.4s ease' : undefined }}>
                    <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}`}</style>

                    {/* Titre */}
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.ink, textAlign: 'center', margin: '0 0 12px' }}>
                      {managerPinView === 'create' && '🔐 Créer votre code Gérant'}
                      {managerPinView === 'confirm' && 'Confirmer le code'}
                      {managerPinView === 'enter' && '🔐 Code Gérant'}
                    </p>
                    {managerPinView === 'create' && (
                      <p style={{ fontSize: 11.5, color: C.inkMute, textAlign: 'center', margin: '-6px 0 12px', lineHeight: 1.4 }}>
                        Ce code protège l'accès gérant sur cet appareil
                      </p>
                    )}

                    {/* Points */}
                    {(() => {
                      const val = managerPinView === 'enter' ? mgrEnter : managerPinView === 'confirm' ? mgrPin2 : mgrPin1;
                      return (
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 14 }}>
                          {[0,1,2,3].map(i => (
                            <div key={i} style={{
                              width: 46, height: 46, borderRadius: 12,
                              border: `2px solid ${mgrError ? '#dc2626' : val.length > i ? C.brand : C.border}`,
                              background: mgrError ? 'rgba(220,38,38,0.05)' : val.length > i ? C.brandLt : 'rgba(0,0,0,0.03)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 22, color: C.brand, fontWeight: 800,
                              transition: 'all 0.12s',
                            }}>
                              {val.length > i ? '•' : ''}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {mgrError && (
                      <p style={{ fontSize: 12, color: '#dc2626', textAlign: 'center', margin: '-4px 0 10px', fontWeight: 600 }}>
                        {mgrError}
                      </p>
                    )}

                    {/* Pavé numérique compact */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
                      {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
                        <button key={i} onClick={() => d ? handleMgrDigit(d) : undefined} disabled={!d}
                          style={{
                            height: 46, borderRadius: 11, border: 'none',
                            cursor: d ? 'pointer' : 'default',
                            background: d === '⌫' ? 'rgba(0,0,0,0.05)' : d ? '#f3f4f6' : 'transparent',
                            fontSize: 18, fontWeight: 600, color: C.ink,
                            visibility: d ? 'visible' : 'hidden',
                            transition: 'transform 0.08s',
                          }}
                          onMouseDown={e => d && ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.92)')}
                          onMouseUp={e => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)')}
                        >{d}</button>
                      ))}
                    </div>

                    {/* Étapes (création) */}
                    {(managerPinView === 'create' || managerPinView === 'confirm') && (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
                        {['create','confirm'].map(s => (
                          <div key={s} style={{ width: 20, height: 3, borderRadius: 99, background: managerPinView === s ? C.brand : '#e5e7eb', transition: 'background 0.2s' }} />
                        ))}
                      </div>
                    )}

                    <button type="button" onClick={() => { setManagerPinView('hidden'); setMgrPin1(''); setMgrPin2(''); setMgrEnter(''); setMgrError(''); }}
                      style={{ display: 'block', margin: '10px auto 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.inkFaint }}>
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={openManagerPin}
                    style={{
                      width: '100%', padding: '13px 0', borderRadius: 12,
                      border: `1.5px solid rgba(83,125,20,0.22)`,
                      background: C.brandLt, color: C.brand,
                      fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(83,125,20,0.14)'; (e.currentTarget as HTMLButtonElement).style.borderColor = C.brand; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = C.brandLt; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(83,125,20,0.22)'; }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.brand} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    Continuer en tant que Gérant
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── PIN entry view ── */}
          {selected && (
            <div className="session-card-inner" style={{ padding: '20px 22px 28px' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <button
                  onClick={handleBack}
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    border: `1.5px solid ${C.border}`,
                    background: 'rgba(0,0,0,0.03)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: C.inkMute, fontSize: 16, fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  ←
                </button>

                {/* Avatar */}
                <div style={{
                  width: 44, height: 44, borderRadius: 13,
                  background: avatarColor(selected.name)[1],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 800, color: avatarColor(selected.name)[0],
                  flexShrink: 0,
                }}>
                  {initials(selected.name)}
                </div>

                <div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: C.ink, margin: 0 }}>
                    {selected.name}
                  </p>
                  <p style={{ fontSize: 12.5, color: C.inkMute, margin: 0 }}>
                    Entrez votre code PIN à 4 chiffres
                  </p>
                </div>
              </div>

              {/* PIN pad */}
              <PinPad
                value={pin}
                onChange={v => { setPin(v); setPinError(''); }}
                error={pinError}
              />

              {/* Retry button on error */}
              {pinError && (
                <button
                  onClick={() => { setPin(''); setPinError(''); }}
                  style={{
                    width: '100%', marginTop: 14,
                    padding: '11px 0', borderRadius: 11,
                    fontSize: 13.5, fontWeight: 600,
                    background: 'rgba(0,0,0,0.04)',
                    border: `1px solid ${C.border}`,
                    color: C.inkMute, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Réessayer
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bottom hint — centré en bas sur desktop, sous la carte sur mobile */}
        <p className="session-hint" style={{ marginTop: 20, fontSize: 12, color: 'rgba(188,217,110,0.4)', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          Cette session ne sera demandée qu'une fois par onglet
        </p>
      </div>
    </>
  );
}
