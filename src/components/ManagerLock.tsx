import { useState } from 'react';
import { Lock, ShieldAlert } from 'lucide-react';
import { getManagerPin } from '../lib/sellerContext';

interface ManagerLockProps {
  onUnlock: () => void;
}

export default function ManagerLock({ onUnlock }: ManagerLockProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  const PIN_DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  const handleDigit = (digit: string) => {
    if (digit === '⌫') {
      setPin(prev => prev.slice(0, -1));
      setError('');
      return;
    }
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
          setError('Code Manager incorrect');
          setPin('');
          setTimeout(() => setShake(false), 500);
        }
      }, 120);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center px-4 py-8">
      <div className={`w-full transition-all ${shake ? 'animate-shake' : ''}`}>
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
            <Lock className="w-9 h-9 text-slate-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Acces Manager</h2>
          <p className="text-sm text-gray-500 mt-1.5">Entrez le code Manager pour continuer</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          <div className="flex gap-4 justify-center">
            {[0,1,2,3].map(i => (
              <div
                key={i}
                className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all duration-150 ${
                  error
                    ? 'border-red-400 bg-red-50'
                    : pin.length > i
                      ? 'border-slate-600 bg-slate-50 scale-105'
                      : 'border-gray-200 bg-gray-50'
                }`}
              >
                {pin.length > i ? '•' : ''}
              </div>
            ))}
          </div>

          {error && (
            <div className="flex items-center justify-center gap-2 text-red-600">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {PIN_DIGITS.map((digit, i) => (
              <button
                key={i}
                onClick={() => digit ? handleDigit(digit) : undefined}
                disabled={!digit}
                className={`h-14 rounded-xl font-semibold text-xl transition-all active:scale-95 ${
                  digit === '⌫'
                    ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    : digit
                      ? 'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300'
                      : 'invisible'
                }`}
              >
                {digit}
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Cet onglet est reserve au gestionnaire
        </p>
      </div>
    </div>
  );
}
