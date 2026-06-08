import { useState } from 'react';
import { Banknote, X, ArrowRight } from 'lucide-react';
import { offlineStorage } from '../lib/offlineStorage';

interface FondDeCaisseModalProps {
  onConfirm: (amount: number) => void;
  onSkip: () => void;
}

const C = {
  brand:   '#10785a',
  ink:     '#0a0e14',
  inkMute: '#6b7280',
  border:  'rgba(15,15,20,0.08)',
  panel:   'rgba(255,255,255,0.96)',
};

export default function FondDeCaisseModal({ onConfirm, onSkip }: FondDeCaisseModalProps) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    const val = parseFloat(amount.replace(/\s/g, '').replace(',', '.'));
    if (isNaN(val) || val < 0) {
      setError('Montant invalide');
      return;
    }
    offlineStorage.setFondDeCaisse(val);
    onConfirm(val);
  };

  const handleSkip = () => {
    // Skip = fond de caisse à 0 pour aujourd'hui
    offlineStorage.setFondDeCaisse(0);
    onSkip();
  };

  // Quick-select amounts
  const quickAmounts = [5000, 10000, 20000, 50000];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(10,14,20,0.45)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: C.panel,
        borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        border: `1px solid ${C.border}`,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(16,120,90,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Banknote size={20} color={C.brand} />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
                Fond de caisse
              </p>
              <p style={{ fontSize: 12, color: C.inkMute, marginTop: 2 }}>
                Montant en espèces à l'ouverture
              </p>
            </div>
          </div>
          <button
            onClick={handleSkip}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.inkMute }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: C.inkMute, marginBottom: 16, lineHeight: 1.5 }}>
            Entrez le montant en espèces présent dans la caisse au démarrage de la journée.
            Ce montant sert à calculer le <strong style={{ color: C.ink }}>Solde en Caisse</strong> exact en fin de journée.
          </p>

          {/* Quick amounts */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {quickAmounts.map(q => (
              <button
                key={q}
                onClick={() => { setAmount(q.toString()); setError(''); }}
                style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: amount === q.toString() ? 'rgba(16,120,90,0.1)' : 'rgba(0,0,0,0.04)',
                  border: `1px solid ${amount === q.toString() ? 'rgba(16,120,90,0.3)' : 'rgba(0,0,0,0.08)'}`,
                  color: amount === q.toString() ? C.brand : C.inkMute,
                  cursor: 'pointer', transition: 'all 0.1s',
                }}
              >
                {q.toLocaleString()} F
              </button>
            ))}
          </div>

          {/* Input */}
          <div style={{ position: 'relative', marginBottom: 6 }}>
            <input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleConfirm()}
              placeholder="0"
              autoFocus
              style={{
                width: '100%', padding: '12px 52px 12px 14px',
                fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em',
                border: `1.5px solid ${error ? '#dc2626' : 'rgba(0,0,0,0.12)'}`,
                borderRadius: 10, outline: 'none',
                background: 'rgba(255,255,255,0.8)',
                color: C.ink, boxSizing: 'border-box',
              }}
            />
            <span style={{
              position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
              fontSize: 13, fontWeight: 600, color: C.inkMute,
            }}>FCFA</span>
          </div>
          {error && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>{error}</p>}
        </div>

        {/* Footer */}
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10 }}>
          <button
            onClick={handleSkip}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 13, fontWeight: 600,
              background: 'transparent', border: `1.5px solid ${C.border}`,
              color: C.inkMute, cursor: 'pointer',
            }}
          >
            Passer (0 F)
          </button>
          <button
            onClick={handleConfirm}
            style={{
              flex: 2, padding: '10px 0', borderRadius: 9, fontSize: 13, fontWeight: 700,
              background: C.brand, border: 'none', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            Confirmer
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
