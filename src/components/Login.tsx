import { useState } from 'react';
import { useAuth } from '../lib/auth';

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  brand:    '#10785a',
  brandHi:  '#149a73',
  brandDk:  '#0a5240',
  brandLt:  'rgba(16,120,90,0.08)',
  ink:      '#0a0e14',
  inkSoft:  '#2c3138',
  inkMute:  '#6b7280',
  inkFaint: '#9aa0a8',
  red:      '#c81e1e',
  redLt:    'rgba(200,30,30,0.07)',
  bg:       '#f4f6f3',
  panel:    '#ffffff',
  border:   'rgba(15,15,20,0.09)',
  fm:       '"SF Mono","Geist Mono",ui-monospace,Menlo,monospace',
};

// ── SVG icons ─────────────────────────────────────────────────────────────────
function LeafLogo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none">
      <rect width="44" height="44" rx="13" fill={C.brand} />
      <path
        d="M22 10c0 0-7 9-7 15 0 3.87 3.13 7 7 7s7-3.13 7-7c0-6-7-15-7-15z"
        fill="white" stroke="white" strokeWidth="0.5" strokeLinejoin="round"
      />
      <line x1="22" y1="32" x2="22" y2="36" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.inkFaint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 6L2 7" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.inkFaint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.inkFaint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}
function IconEye({ show }: { show: boolean }) {
  return show ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.inkFaint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.inkFaint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
function IconBuilding() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.inkFaint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M4 21V7l8-4 8 4v14" />
      <path d="M9 21V12h6v9" />
      <path d="M9 7h.01M15 7h.01M9 10.5h.01M15 10.5h.01" strokeWidth="2" />
    </svg>
  );
}

// ── Shared field ──────────────────────────────────────────────────────────────
function Field({
  icon, type, value, onChange, placeholder, autoComplete, suffix,
}: {
  icon: React.ReactNode;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  suffix?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: focused ? '#fff' : 'rgba(15,15,20,0.03)',
      border: `1.5px solid ${focused ? C.brand : C.border}`,
      borderRadius: 11, padding: '0 14px', height: 48,
      transition: 'all 0.15s',
    }}>
      <span style={{ flexShrink: 0, display: 'flex', opacity: focused ? 0.7 : 1 }}>{icon}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1, border: 'none', background: 'transparent', outline: 'none',
          fontSize: 14, color: C.ink, fontFamily: 'inherit',
        }}
      />
      {suffix && <span style={{ flexShrink: 0 }}>{suffix}</span>}
    </div>
  );
}

// ── Password strength ─────────────────────────────────────────────────────────
function PasswordStrength({ pwd }: { pwd: string }) {
  if (!pwd) return null;
  const checks = [
    { label: '8 caractères', ok: pwd.length >= 8 },
    { label: 'Majuscule', ok: /[A-Z]/.test(pwd) },
    { label: 'Chiffre', ok: /[0-9]/.test(pwd) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ['#c81e1e', '#b75f06', '#10785a'];
  const labels = ['Faible', 'Moyen', 'Fort'];
  return (
    <div style={{ marginTop: -4 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 99,
            background: i < score ? colors[score - 1] : C.border,
            transition: 'background 0.2s',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {checks.map(c => (
          <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 14, height: 14, borderRadius: 99,
              background: c.ok ? C.brand : C.border,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s', flexShrink: 0,
            }}>
              {c.ok && <IconCheck />}
            </div>
            <span style={{ fontSize: 11, color: c.ok ? C.inkMute : C.inkFaint }}>{c.label}</span>
          </div>
        ))}
        <span style={{
          marginLeft: 'auto', fontSize: 11, fontWeight: 600,
          color: score > 0 ? colors[score - 1] : C.inkFaint,
        }}>
          {score > 0 ? labels[score - 1] : ''}
        </span>
      </div>
    </div>
  );
}

// ── Error banner ──────────────────────────────────────────────────────────────
function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      background: C.redLt, border: `1px solid rgba(200,30,30,0.18)`,
      borderRadius: 10, padding: '11px 14px', fontSize: 13, color: C.red,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      {msg}
    </div>
  );
}

// ── Success banner ────────────────────────────────────────────────────────────
function SuccessBanner({ msg }: { msg: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      background: C.brandLt, border: `1px solid rgba(16,120,90,0.2)`,
      borderRadius: 10, padding: '11px 14px', fontSize: 13, color: C.brand,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.brand} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
        <circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" />
      </svg>
      {msg}
    </div>
  );
}

// ── Submit button ─────────────────────────────────────────────────────────────
function SubmitBtn({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        width: '100%', height: 50, border: 'none', borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer',
        background: loading ? 'rgba(16,120,90,0.5)' : `linear-gradient(135deg, ${C.brand}, ${C.brandHi})`,
        color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: loading ? 'none' : '0 2px 12px rgba(16,120,90,0.35)',
        transition: 'all 0.15s', fontFamily: 'inherit',
      }}
      onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
    >
      {loading ? (
        <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin 0.7s linear infinite' }} />
      ) : (
        <>{label} <IconArrow /></>
      )}
    </button>
  );
}

// ── LOGIN FORM ────────────────────────────────────────────────────────────────
function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const { signIn } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Veuillez remplir tous les champs.'); return; }
    setError(''); setLoading(true);
    try {
      await signIn(email, password);
      onSuccess?.();
    } catch {
      setError('Email ou mot de passe incorrect. Vérifiez vos identifiants.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && <ErrorBanner msg={error} />}

      <Field
        icon={<IconMail />} type="email" value={email}
        onChange={setEmail} placeholder="Adresse email"
        autoComplete="email"
      />
      <Field
        icon={<IconLock />} type={showPwd ? 'text' : 'password'} value={password}
        onChange={setPassword} placeholder="Mot de passe"
        autoComplete="current-password"
        suffix={
          <button type="button" onClick={() => setShowPwd(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            <IconEye show={showPwd} />
          </button>
        }
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4 }}>
        <button
          type="button"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: C.brand, fontFamily: 'inherit', padding: 0 }}
          onClick={() => {/* TODO: forgot password */}}
        >
          Mot de passe oublié ?
        </button>
      </div>

      <SubmitBtn loading={loading} label="Se connecter" />

      {/* Demo accounts — hidden behind subtle link */}
      <DemoSection onFill={(em, pw) => { setEmail(em); setPassword(pw); }} />
    </form>
  );
}

// ── SIGNUP FORM ───────────────────────────────────────────────────────────────
function SignupForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { signUp } = useAuth();
  const [fullName,  setFullName]  = useState('');
  const [pharmaName, setPharmaName] = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPwd,   setShowPwd]   = useState(false);
  const [showCfm,   setShowCfm]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fullName.trim())    { setError('Veuillez entrer votre nom complet.'); return; }
    if (!email.trim())       { setError('Veuillez entrer votre adresse email.'); return; }
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return; }
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return; }

    setLoading(true);
    try {
      await signUp(email.trim(), password, fullName.trim(), 'manager', pharmaName.trim() || undefined);
      // Si signUp a créé une session directement (confirmation email désactivée),
      // useAuth a déjà mis à jour user → App.tsx va se re-render automatiquement.
      // On affiche le message de succès seulement si on reste sur cette page.
      setSuccess(true);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('already registered') || msg.includes('already exists')) {
        setError('Un compte existe déjà avec cet email. Connectez-vous à la place.');
      } else if (msg.includes('email') && msg.includes('invalid')) {
        setError('Adresse email invalide. Vérifiez votre saisie.');
      } else if (msg.includes('password') && msg.includes('weak')) {
        setError('Mot de passe trop simple. Utilisez des chiffres et des caractères spéciaux.');
      } else {
        setError(msg || "Erreur lors de la création du compte. Réessayez.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 99, background: C.brandLt,
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.brand} strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, marginBottom: 6 }}>Compte créé !</div>
          <div style={{ fontSize: 13.5, color: C.inkMute, lineHeight: 1.6 }}>
            Un email de confirmation a été envoyé à <strong style={{ color: C.ink }}>{email}</strong>.
            Cliquez sur le lien pour activer votre compte.
          </div>
        </div>
        <button
          type="button"
          onClick={onSwitchToLogin}
          style={{
            background: C.brandLt, border: `1px solid rgba(16,120,90,0.2)`,
            borderRadius: 11, padding: '11px 20px', color: C.brand,
            fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Retour à la connexion
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && <ErrorBanner msg={error} />}

      <Field icon={<IconUser />}     type="text"  value={fullName}   onChange={setFullName}   placeholder="Nom complet du gérant" autoComplete="name" />
      <Field icon={<IconBuilding />} type="text"  value={pharmaName} onChange={setPharmaName} placeholder="Nom de la pharmacie (optionnel)" />
      <Field icon={<IconMail />}     type="email" value={email}      onChange={setEmail}      placeholder="Adresse email professionnelle" autoComplete="email" />

      <Field
        icon={<IconLock />} type={showPwd ? 'text' : 'password'} value={password}
        onChange={setPassword} placeholder="Choisir un mot de passe"
        autoComplete="new-password"
        suffix={
          <button type="button" onClick={() => setShowPwd(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            <IconEye show={showPwd} />
          </button>
        }
      />
      <PasswordStrength pwd={password} />

      <Field
        icon={<IconLock />} type={showCfm ? 'text' : 'password'} value={confirm}
        onChange={setConfirm} placeholder="Confirmer le mot de passe"
        autoComplete="new-password"
        suffix={
          <button type="button" onClick={() => setShowCfm(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            <IconEye show={showCfm} />
          </button>
        }
      />

      {/* Role badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: C.brandLt, border: `1px solid rgba(16,120,90,0.2)`,
        borderRadius: 11, padding: '10px 14px',
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6, background: C.brand,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}><IconCheck /></div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.brand }}>Compte Pharmacien Gérant</div>
          <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>Accès complet — tableau de bord, stock, rapports</div>
        </div>
      </div>

      <SubmitBtn loading={loading} label="Créer mon espace pharmacie" />

      <p style={{ fontSize: 11.5, color: C.inkFaint, textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
        En créant un compte, vous acceptez les conditions d'utilisation de JunglePharm.
      </p>
    </form>
  );
}

// ── DEMO SECTION ──────────────────────────────────────────────────────────────
function DemoSection({ onFill }: { onFill: (email: string, pwd: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ textAlign: 'center', marginTop: 4 }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, color: C.inkFaint, fontFamily: 'inherit', padding: '4px 8px',
          textDecoration: 'underline', textDecorationStyle: 'dotted',
        }}
      >
        {open ? 'Masquer le compte démo' : 'Accès démo'}
      </button>
      {open && (
        <div style={{
          marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6,
          background: 'rgba(15,15,20,0.03)', borderRadius: 12, padding: 12,
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 11, color: C.inkFaint, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
            Compte de démonstration
          </div>
          <button
            type="button"
            onClick={() => onFill('manager@pharmacy.cg', 'password123')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '9px 12px', borderRadius: 9, border: `1px solid ${C.border}`,
              background: '#fff', cursor: 'pointer', textAlign: 'left',
              transition: 'border-color 0.12s', fontFamily: 'inherit',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = C.brand)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Pharmacie Centrale</div>
              <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>manager@pharmacy.cg</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: C.brandLt, color: C.brand }}>
              DÉMO
            </span>
          </button>
          <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>
            Mot de passe : <code style={{ fontFamily: C.fm, color: C.inkSoft }}>password123</code>
          </div>
        </div>
      )}
    </div>
  );
}

// ── FEATURES LIST (left panel) ────────────────────────────────────────────────
const FEATURES = [
  { icon: '📦', label: 'Stock en temps réel', sub: 'Gestion multi-lots, alertes rupture' },
  { icon: '📊', label: 'Tableau de bord', sub: 'CA, marges, top produits' },
  { icon: '🧾', label: 'Ordonnances & CRM', sub: 'Suivi patients, prescriptions' },
  { icon: '🌐', label: 'Mode hors-ligne', sub: 'Fonctionne sans connexion' },
];

// ── VENDOR INFO TAB ───────────────────────────────────────────────────────────
function VendorInfoTab({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const sellers: { id: string; name: string }[] = (() => {
    try { return JSON.parse(localStorage.getItem('pharma_sellers_cache') || '[]'); }
    catch { return []; }
  })();

  const hasSellers = sellers.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Illustration */}
      <div style={{
        textAlign: 'center', padding: '20px 16px 16px',
        background: C.brandLt,
        borderRadius: 14, border: `1px solid rgba(16,120,90,0.15)`,
      }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>🔐</div>
        <p style={{ fontSize: 14.5, fontWeight: 700, color: C.ink, margin: '0 0 6px', letterSpacing: '-0.01em' }}>
          Connexion Vendeur
        </p>
        <p style={{ fontSize: 13, color: C.inkMute, margin: 0, lineHeight: 1.55 }}>
          {hasSellers
            ? 'Cet appareil est configuré. Sélectionnez votre profil au démarrage de l\'application.'
            : 'Les vendeurs se connectent avec leur code PIN — pas de mot de passe email.'}
        </p>
      </div>

      {hasSellers ? (
        /* Device already configured */
        <>
          <div style={{
            background: 'rgba(16,120,90,0.04)',
            borderRadius: 12, border: `1px solid rgba(16,120,90,0.12)`,
            padding: '14px 16px',
          }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
              Vendeurs configurés ({sellers.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sellers.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: C.brandLt,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10.5, fontWeight: 700, color: C.brand,
                  }}>
                    {s.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: C.inkSoft }}>{s.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            background: 'rgba(251,191,36,0.08)', borderRadius: 12,
            border: `1px solid rgba(251,191,36,0.25)`, padding: '12px 14px',
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#92400e', margin: '0 0 3px' }}>
                Session expirée
              </p>
              <p style={{ fontSize: 12, color: '#92400e', margin: 0, lineHeight: 1.5, opacity: 0.85 }}>
                La connexion de la pharmacie a expiré. Le gérant doit se reconnecter pour rétablir l'accès.
              </p>
            </div>
          </div>
        </>
      ) : (
        /* Device not configured */
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {[
            { icon: '1️⃣', text: 'Le gérant se connecte avec son email et mot de passe' },
            { icon: '2️⃣', text: 'Il crée les profils vendeurs dans l\'onglet Équipe' },
            { icon: '3️⃣', text: 'Les vendeurs se connectent avec leur PIN au démarrage' },
          ].map(step => (
            <div key={step.icon} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', background: 'rgba(0,0,0,0.03)', borderRadius: 10 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{step.icon}</span>
              <p style={{ fontSize: 13, color: C.inkMute, margin: 0, lineHeight: 1.45 }}>{step.text}</p>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onSwitchToLogin}
        style={{
          width: '100%', height: 50, border: 'none', borderRadius: 12,
          cursor: 'pointer',
          background: `linear-gradient(135deg, ${C.brand}, ${C.brandHi})`,
          color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: '0 2px 12px rgba(16,120,90,0.35)',
          fontFamily: 'inherit',
        }}
      >
        Connexion Gérant <IconArrow />
      </button>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function Login() {
  const [showSignup, setShowSignup] = useState(false);

  const cardContent = showSignup
    ? <SignupForm onSwitchToLogin={() => setShowSignup(false)} />
    : <LoginForm />;

  const cardTitle   = showSignup ? 'Créer votre espace 🏥' : 'Accès Pharmacie 🏥';
  const cardSubtitle = showSignup
    ? 'Configurez JunglePharm pour votre pharmacie'
    : 'Connectez-vous à votre espace JunglePharm';

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        * { box-sizing: border-box; }
      `}</style>

      {/* ── MOBILE ── */}
      <div style={{
        flexDirection: 'column', minHeight: '100svh',
        background: `linear-gradient(150deg, ${C.brandDk} 0%, #064e3b 45%, #065f46 100%)`,
        padding: '24px 20px 32px',
        alignItems: 'center', justifyContent: 'flex-start',
      }} className="flex lg:hidden">
        <div style={{ textAlign: 'center', marginTop: 32, marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <div style={{ width: 60, height: 60, borderRadius: 18, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LeafLogo size={42} />
            </div>
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff' }}>
            Jungle<span style={{ color: '#34d399' }}>Pharm</span>
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(167,243,208,0.65)', fontStyle: 'italic' }}>
            Votre pharmacie, partout.
          </p>
        </div>
        <div style={{ width: '100%', maxWidth: 440, background: 'rgba(255,255,255,0.97)', borderRadius: 20, padding: '28px 22px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', animation: 'fadeUp 0.4s ease' }}>
          <div style={{ marginBottom: 22 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em' }}>{cardTitle}</h2>
            <p style={{ margin: 0, fontSize: 13, color: C.inkMute }}>{cardSubtitle}</p>
          </div>
          {cardContent}
          {!showSignup && (
            <p style={{ textAlign: 'center', fontSize: 12, color: C.inkFaint, marginTop: 16 }}>
              Première utilisation ?{' '}
              <button type="button" onClick={() => setShowSignup(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.brand, fontSize: 12, fontFamily: 'inherit', fontWeight: 600, padding: 0 }}>
                Créer votre espace pharmacie
              </button>
            </p>
          )}
        </div>
      </div>

      {/* ── DESKTOP ── */}
      <div style={{ minHeight: '100vh', background: C.bg }} className="hidden lg:flex">
        {/* Left panel */}
        <div style={{ width: '42%', maxWidth: 520, flexShrink: 0, background: `linear-gradient(150deg, ${C.brandDk} 0%, #064e3b 45%, #065f46 100%)`, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px 48px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -80, left: -80, width: 300, height: 300, borderRadius: 99, background: 'radial-gradient(circle, rgba(52,211,153,0.15) 0%, transparent 70%)' }} />
          <div style={{ position: 'absolute', bottom: -100, right: -60, width: 400, height: 400, borderRadius: 99, background: 'radial-gradient(circle, rgba(16,120,90,0.2) 0%, transparent 70%)' }} />
          <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 340 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 52 }}>
              <div style={{ width: 48, height: 48, borderRadius: 15, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LeafLogo size={36} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1.1 }}>Jungle<span style={{ color: '#34d399' }}>Pharm</span></div>
                <div style={{ fontSize: 12, color: 'rgba(167,243,208,0.6)', marginTop: 2 }}>Gestion pharmacie</div>
              </div>
            </div>
            <h2 style={{ margin: '0 0 10px', fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1.2 }}>Gérez votre pharmacie avec clarté.</h2>
            <p style={{ margin: '0 0 40px', fontSize: 14, color: 'rgba(167,243,208,0.65)', lineHeight: 1.6 }}>Stock, ventes, patients et rapports — tout en un seul endroit.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {FEATURES.map(f => (
                <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{f.icon}</div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,0.9)', lineHeight: 1.2 }}>{f.label}</div>
                    <div style={{ fontSize: 12, color: 'rgba(167,243,208,0.5)', marginTop: 2 }}>{f.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' }}>
          <div style={{ width: '100%', maxWidth: 440, animation: 'fadeUp 0.35s ease' }}>
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em' }}>{cardTitle}</h2>
              <p style={{ margin: 0, fontSize: 14, color: C.inkMute }}>{cardSubtitle}</p>
            </div>
            {cardContent}
            {!showSignup && (
              <p style={{ textAlign: 'center', fontSize: 12, color: C.inkFaint, marginTop: 16 }}>
                Première utilisation ?{' '}
                <button type="button" onClick={() => setShowSignup(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.brand, fontSize: 12, fontFamily: 'inherit', fontWeight: 600, padding: 0 }}>
                  Créer votre espace pharmacie
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
