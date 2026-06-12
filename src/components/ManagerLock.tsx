import { useState } from 'react';
import { Lock, ShieldAlert, KeyRound, Eye, EyeOff } from 'lucide-react';
import { getManagerPin, setManagerPin, hasManagerPin } from '../lib/sellerContext';

// PIN scopé par compte (cf. sellerContext) — plus de clé d'appareil partagée.
function hasPinConfigured(): boolean {
  return hasManagerPin();
}

interface ManagerLockProps {
  onUnlock: () => void;
}

export default function ManagerLock({ onUnlock }: ManagerLockProps) {
  const pinConfigured = hasPinConfigured();

  // ── Pas encore de PIN : mode création ─────────────────────────────────────
  if (!pinConfigured) {
    return <SetupPinScreen onDone={onUnlock} />;
  }

  // ── PIN existant : mode saisie ─────────────────────────────────────────────
  return <EnterPinScreen onUnlock={onUnlock} />;
}

// ── Écran création PIN (première fois) ────────────────────────────────────────
function SetupPinScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep]       = useState<'create' | 'confirm'>('create');
  const [pin1, setPin1]       = useState('');
  const [pin2, setPin2]       = useState('');
  const [error, setError]     = useState('');
  const [shake, setShake]     = useState(false);
  const [showPin, setShowPin] = useState(false);

  const current = step === 'create' ? pin1 : pin2;
  const setter  = step === 'create' ? setPin1 : setPin2;

  const PIN_DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  const handleDigit = (digit: string) => {
    if (digit === '⌫') { setter(prev => prev.slice(0, -1)); setError(''); return; }
    if (current.length >= 4) return;
    const next = current + digit;
    setter(next);
    setError('');

    if (next.length === 4) {
      setTimeout(() => {
        if (step === 'create') {
          setStep('confirm');
        } else {
          // Confirmation
          if (next === pin1) {
            setManagerPin(pin1);
            onDone();
          } else {
            setShake(true);
            setError('Les codes ne correspondent pas');
            setPin2('');
            setTimeout(() => setShake(false), 500);
          }
        }
      }, 120);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center px-4 py-8">
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}`}</style>
      <div style={{ width: '100%', maxWidth: 360, animation: shake ? 'shake 0.4s ease' : undefined }}>

        {/* En-tête */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 72, height: 72, borderRadius: 99, background: 'rgba(83,125,20,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <KeyRound style={{ width: 32, height: 32, color: '#537d14' }} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0a0e14', margin: '0 0 6px' }}>
            {step === 'create' ? 'Créer votre code Manager' : 'Confirmer le code'}
          </h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
            {step === 'create'
              ? 'Ce code protège les rapports, l\'équipe et les données sensibles.'
              : 'Saisissez à nouveau le même code pour confirmer.'}
          </p>
        </div>

        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid rgba(0,0,0,0.08)', padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          {/* Points */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 20 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{
                width: 52, height: 52, borderRadius: 12,
                border: `2px solid ${error ? '#dc2626' : current.length > i ? '#537d14' : '#e5e7eb'}`,
                background: error ? 'rgba(220,38,38,0.05)' : current.length > i ? 'rgba(83,125,20,0.08)' : '#f9fafb',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 700, color: '#537d14',
                transition: 'all 0.12s',
                transform: current.length > i ? 'scale(1.05)' : 'scale(1)',
              }}>
                {current.length > i ? (showPin ? current[i] : '•') : ''}
              </div>
            ))}
          </div>

          {/* Afficher/masquer */}
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <button type="button" onClick={() => setShowPin(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#9ca3af', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {showPin ? <EyeOff size={13}/> : <Eye size={13}/>}
              {showPin ? 'Masquer' : 'Afficher'}
            </button>
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontSize: 13, marginBottom: 14, justifyContent: 'center' }}>
              <ShieldAlert size={14} /> {error}
            </div>
          )}

          {/* Pavé numérique */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {PIN_DIGITS.map((digit, i) => (
              <button key={i} onClick={() => digit ? handleDigit(digit) : undefined} disabled={!digit}
                style={{
                  height: 52, borderRadius: 12, border: 'none', cursor: digit ? 'pointer' : 'default',
                  background: digit === '⌫' ? 'rgba(0,0,0,0.04)' : digit ? '#f3f4f6' : 'transparent',
                  fontSize: 20, fontWeight: 600, color: '#1f2937',
                  visibility: digit ? 'visible' : 'hidden',
                  transition: 'background 0.1s, transform 0.1s',
                }}
                onMouseDown={e => digit && ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.94)')}
                onMouseUp={e => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)')}
              >{digit}</button>
            ))}
          </div>
        </div>

        {/* Étapes */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 20 }}>
          {['create','confirm'].map(s => (
            <div key={s} style={{ width: 24, height: 4, borderRadius: 99, background: step === s ? '#537d14' : '#e5e7eb', transition: 'background 0.2s' }} />
          ))}
        </div>

        {step === 'confirm' && (
          <button type="button" onClick={() => { setStep('create'); setPin1(''); setPin2(''); setError(''); }}
            style={{ display: 'block', margin: '12px auto 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#9ca3af' }}>
            ← Recommencer
          </button>
        )}
      </div>
    </div>
  );
}

// ── Écran saisie PIN (PIN déjà configuré) ─────────────────────────────────────
function EnterPinScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin]     = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  const PIN_DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  const handleDigit = (digit: string) => {
    if (digit === '⌫') { setPin(prev => prev.slice(0, -1)); setError(''); return; }
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    setError('');
    if (next.length === 4) {
      setTimeout(() => {
        if (next === getManagerPin()) {
          onUnlock();
        } else {
          setShake(true);
          setError('Code incorrect');
          setPin('');
          setTimeout(() => setShake(false), 500);
        }
      }, 120);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center px-4 py-8">
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}`}</style>
      <div style={{ width: '100%', maxWidth: 360, animation: shake ? 'shake 0.4s ease' : undefined }}>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 72, height: 72, borderRadius: 99, background: 'rgba(15,23,42,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Lock style={{ width: 30, height: 30, color: '#6b7280' }} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0a0e14', margin: '0 0 6px' }}>Code Manager</h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Saisissez votre code pour accéder à cette section</p>
        </div>

        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid rgba(0,0,0,0.08)', padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          {/* Points */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 20 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{
                width: 52, height: 52, borderRadius: 12,
                border: `2px solid ${error ? '#dc2626' : pin.length > i ? '#374151' : '#e5e7eb'}`,
                background: error ? 'rgba(220,38,38,0.05)' : pin.length > i ? '#f9fafb' : '#f9fafb',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, fontWeight: 700, color: '#374151',
                transition: 'all 0.12s',
                transform: pin.length > i ? 'scale(1.05)' : 'scale(1)',
              }}>
                {pin.length > i ? '•' : ''}
              </div>
            ))}
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontSize: 13, marginBottom: 14, justifyContent: 'center' }}>
              <ShieldAlert size={14} /> {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {PIN_DIGITS.map((digit, i) => (
              <button key={i} onClick={() => digit ? handleDigit(digit) : undefined} disabled={!digit}
                style={{
                  height: 52, borderRadius: 12, border: 'none', cursor: digit ? 'pointer' : 'default',
                  background: digit === '⌫' ? 'rgba(0,0,0,0.04)' : digit ? '#f3f4f6' : 'transparent',
                  fontSize: 20, fontWeight: 600, color: '#1f2937',
                  visibility: digit ? 'visible' : 'hidden',
                  transition: 'background 0.1s, transform 0.1s',
                }}
                onMouseDown={e => digit && ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.94)')}
                onMouseUp={e => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)')}
              >{digit}</button>
            ))}
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#d1d5db', marginTop: 16 }}>
          Section réservée au gestionnaire de la pharmacie
        </p>
      </div>
    </div>
  );
}
