import { useState } from 'react';
import { useAuth } from '../lib/auth';

function HexagonLogo({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 1L29.856 8.5V23.5L16 31L2.144 23.5V8.5L16 1Z" fill="#059669" />
      <path d="M16 8C16 8 12 14 12 18C12 20.2 13.8 22 16 22C18.2 22 20 20.2 20 18C20 14 16 8 16 8Z" fill="white" stroke="white" strokeWidth="0.5" strokeLinejoin="round" />
      <line x1="16" y1="22" x2="16" y2="25" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/* ───── icon helpers ───── */
function EyeIcon({ dark }: { dark: boolean }) {
  const s = dark ? 'rgba(15,23,42,0.4)' : 'rgba(255,255,255,0.5)';
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
}
function EyeOffIcon({ dark }: { dark: boolean }) {
  const s = dark ? 'rgba(15,23,42,0.4)' : 'rgba(255,255,255,0.5)';
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>;
}
function MailIcon({ dark }: { dark: boolean }) {
  const s = dark ? 'rgba(15,23,42,0.35)' : 'rgba(255,255,255,0.4)';
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 6L2 7" /></svg>;
}
function LockIconSvg({ dark }: { dark: boolean }) {
  const s = dark ? 'rgba(15,23,42,0.35)' : 'rgba(255,255,255,0.4)';
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>;
}
function ArrowIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>;
}

/* ───── shared form ───── */
interface FormProps {
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  showPassword: boolean; setShowPassword: (v: boolean) => void;
  isLoading: boolean; error: string;
  onSubmit: (e: React.FormEvent) => void;
  onDemoManager: () => void; onDemoStaff: () => void;
  dark: boolean;
}

function LoginForm({ email, setEmail, password, setPassword, showPassword, setShowPassword, isLoading, error, onSubmit, onDemoManager, onDemoStaff, dark }: FormProps) {
  const inputStyle = dark
    ? { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px' }
    : { background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '12px' };
  const inputFocusBorder = '#059669';
  const inputBlurBorder = dark ? 'rgba(255,255,255,0.12)' : '#e2e8f0';
  const textClass = dark ? 'text-white' : 'text-slate-900';
  const placeholderClass = dark ? 'placeholder-white/40' : 'placeholder-slate-400';
  const dividerColor = dark ? 'rgba(255,255,255,0.12)' : '#e2e8f0';
  const dividerTextColor = dark ? 'rgba(255,255,255,0.35)' : '#94a3b8';

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium ${dark ? 'bg-red-500/20 border border-red-400/30 text-red-300' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {error}
        </div>
      )}
      <div className="space-y-2">
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2"><MailIcon dark={dark} /></div>
          <input
            type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`w-full pl-11 pr-4 py-[14px] ${textClass} ${placeholderClass} text-[15px] font-medium focus:outline-none`}
            style={inputStyle}
            placeholder="Email"
            onFocus={(e) => (e.currentTarget.style.borderColor = inputFocusBorder)}
            onBlur={(e) => (e.currentTarget.style.borderColor = inputBlurBorder)}
          />
        </div>
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2"><LockIconSvg dark={dark} /></div>
          <input
            type={showPassword ? 'text' : 'password'} required value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`w-full pl-11 pr-12 py-[14px] ${textClass} ${placeholderClass} text-[15px] font-medium focus:outline-none`}
            style={inputStyle}
            placeholder="Mot de passe"
            onFocus={(e) => (e.currentTarget.style.borderColor = inputFocusBorder)}
            onBlur={(e) => (e.currentTarget.style.borderColor = inputBlurBorder)}
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 active:scale-[0.96] transition-transform">
            {showPassword ? <EyeOffIcon dark={dark} /> : <EyeIcon dark={dark} />}
          </button>
        </div>
      </div>

      <button type="submit" disabled={isLoading}
        className="w-full text-white py-[14px] font-bold text-[15px] active:scale-[0.98] transition-all duration-150 disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: '#059669', borderRadius: '12px', boxShadow: '0 1px 3px rgba(5,150,105,0.3)' }}>
        {isLoading ? 'Connexion...' : 'Se connecter'}
        {!isLoading && <ArrowIcon />}
      </button>

      <div className="pt-2">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px" style={{ background: dividerColor }} />
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: dividerTextColor }}>Demo</p>
          <div className="flex-1 h-px" style={{ background: dividerColor }} />
        </div>
        <div className="space-y-2">
          {/* Manager */}
          <button type="button" onClick={onDemoManager}
            className="w-full rounded-xl p-4 text-left active:scale-[0.98] transition-all duration-150"
            style={dark
              ? { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }
              : { background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '12px' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = dark ? 'rgba(255,255,255,0.2)' : '#059669')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0')}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`font-semibold text-[14px] ${dark ? 'text-white' : 'text-slate-900'}`}>Manager</p>
                <p className="text-[12px] mt-0.5" style={{ color: dark ? 'rgba(255,255,255,0.45)' : '#64748b' }}>manager@pharmacy.cg</p>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={dark
                ? { background: 'rgba(22,163,74,0.2)', color: '#86efac', border: '1px solid rgba(22,163,74,0.3)' }
                : { background: 'rgba(5,150,105,0.1)', color: '#059669', border: '1px solid rgba(5,150,105,0.2)' }}>
                COMPLET
              </span>
            </div>
          </button>

          {/* Vendeur */}
          <button type="button" onClick={onDemoStaff}
            className="w-full rounded-xl p-4 text-left active:scale-[0.98] transition-all duration-150"
            style={dark
              ? { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }
              : { background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '12px' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = dark ? 'rgba(255,255,255,0.2)' : '#94a3b8')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0')}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`font-semibold text-[14px] ${dark ? 'text-white' : 'text-slate-900'}`}>Vendeur</p>
                <p className="text-[12px] mt-0.5" style={{ color: dark ? 'rgba(255,255,255,0.45)' : '#64748b' }}>staff@pharmacy.cg</p>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={dark
                ? { background: 'rgba(148,163,184,0.15)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)' }
                : { background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}>
                LIMITE
              </span>
            </div>
          </button>
        </div>
        <p className="text-[11px] text-center mt-4" style={{ color: dark ? 'rgba(255,255,255,0.3)' : '#94a3b8' }}>
          Mot de passe : <span className={`font-mono font-semibold ${dark ? 'text-white/50' : 'text-slate-600'}`}>password123</span>
        </p>
      </div>
    </form>
  );
}

/* ───── main component ───── */
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await signIn(email, password);
    } catch {
      setError('Email ou mot de passe incorrect');
    } finally {
      setIsLoading(false);
    }
  };

  const formProps: FormProps = {
    email, setEmail, password, setPassword,
    showPassword, setShowPassword,
    isLoading, error,
    onSubmit: handleSubmit,
    onDemoManager: () => { setEmail('manager@pharmacy.cg'); setPassword('password123'); },
    onDemoStaff:   () => { setEmail('staff@pharmacy.cg');   setPassword('password123'); },
    dark: false,
  };

  return (
    <>
      {/* ── Mobile: dark gradient (original) ── */}
      <div
        className="lg:hidden min-h-screen flex flex-col items-center justify-center px-5 py-12"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a2f 50%, #052e16 100%)' }}
      >
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <div className="mx-auto mb-5 flex justify-center">
              <HexagonLogo size={56} />
            </div>
            <h1 style={{ fontSize: '24px', letterSpacing: '-0.03em', lineHeight: 1 }}>
              <span className="font-extrabold text-white">Jungle</span>
              <span className="font-extrabold" style={{ color: '#059669' }}>Pharm</span>
            </h1>
            <p className="text-sm mt-2 italic" style={{ color: 'rgba(134, 239, 172, 0.7)' }}>
              Votre pharmacie, partout.
            </p>
          </div>
          <LoginForm {...formProps} dark={true} />
        </div>
      </div>

      {/* ── Desktop: split-screen ── */}
      <div className="hidden lg:flex min-h-screen">
        {/* Left panel */}
        <div
          className="lg:w-1/2 xl:w-[55%] flex flex-col items-center justify-center px-12 py-16 relative overflow-hidden"
          style={{ background: 'linear-gradient(150deg, #022c22 0%, #064e3b 40%, #065f46 100%)' }}
        >
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #10b981, transparent)' }} />
          <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #34d399, transparent)' }} />

          <div className="relative z-10 flex flex-col items-center text-center max-w-sm">
            <div className="mb-8 flex items-center justify-center w-24 h-24 rounded-[28px]"
              style={{ background: 'rgba(5,150,105,0.2)', border: '1px solid rgba(52,211,153,0.25)' }}>
              <HexagonLogo size={56} />
            </div>
            <h1 style={{ fontSize: '36px', letterSpacing: '-0.04em', lineHeight: 1.1 }} className="font-extrabold">
              <span className="text-white">Jungle</span><span style={{ color: '#34d399' }}>Pharm</span>
            </h1>
            <p className="mt-3 text-base font-medium italic" style={{ color: 'rgba(167,243,208,0.7)' }}>
              Votre pharmacie, partout.
            </p>
            <div className="mt-12 space-y-4 w-full text-left">
              {['Gestion de stock en temps réel', 'Tableau de bord analytique', 'Synchronisation hors-ligne'].map((label) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#34d399', boxShadow: '0 0 6px #34d39980' }} />
                  <p className="text-sm font-medium" style={{ color: 'rgba(209,250,229,0.75)' }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-12" style={{ background: '#f8fafc' }}>
          <div className="w-full max-w-[420px]">
            <div className="mb-8">
              <h2 className="text-slate-900 font-extrabold" style={{ fontSize: '26px', letterSpacing: '-0.03em' }}>Connexion</h2>
              <p className="text-slate-500 text-sm mt-1">Connectez-vous à votre espace pharmacie</p>
            </div>
            <LoginForm {...formProps} dark={false} />
          </div>
        </div>
      </div>
    </>
  );
}
