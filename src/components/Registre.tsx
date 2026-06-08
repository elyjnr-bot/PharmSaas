import { useState, useEffect } from 'react';
import { ShieldAlert, ChevronLeft, ChevronRight, Download, Calendar } from 'lucide-react';
import { offlineStorage, StupefiantEntry } from '../lib/offlineStorage';

const MONTH_FR = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];

export default function Registre() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [entries, setEntries] = useState<StupefiantEntry[]>([]);

  useEffect(() => {
    setEntries(offlineStorage.getStupefiantByMonth(year, month));
  }, [year, month]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    const today = new Date();
    if (year === today.getFullYear() && month === today.getMonth()) return;
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  const exportCSV = () => {
    const header = 'Date,Médicament,Quantité,Patient,Médecin,N° Ordonnance,Notes';
    const rows = entries.map(e => [
      new Date(e.date).toLocaleDateString('fr-FR'),
      `"${e.medication_name}"`,
      e.quantity,
      `"${e.patient_name}"`,
      `"${e.doctor_name}"`,
      `"${e.ordonnance_number}"`,
      `"${e.notes || ''}"`,
    ].join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registre_stupefiants_${MONTH_FR[month]}_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pb-20 space-y-4">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: 'rgba(200,30,30,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ShieldAlert size={18} color="#c81e1e" />
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0a0e14', margin: 0 }}>
              Registre des stupéfiants
            </h2>
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
              {entries.length} dispensation{entries.length !== 1 ? 's' : ''} ce mois
            </p>
          </div>
        </div>

        {entries.length > 0 && (
          <button
            onClick={exportCSV}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
              background: 'transparent', border: '1.5px solid rgba(0,0,0,0.1)',
              color: '#374151', cursor: 'pointer',
            }}
          >
            <Download size={13} />
            Exporter CSV
          </button>
        )}
      </div>

      {/* Navigateur de mois */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(255,255,255,0.7)',
        border: '1px solid rgba(255,255,255,0.55)',
        borderRadius: 10, padding: '8px 12px',
        backdropFilter: 'saturate(180%) blur(20px)',
      }}>
        <button
          onClick={prevMonth}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#6b7280', display: 'flex' }}
        >
          <ChevronLeft size={16} />
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0a0e14' }}>
            {MONTH_FR[month]} {year}
          </span>
        </div>
        <button
          onClick={nextMonth}
          disabled={isCurrentMonth}
          style={{
            background: 'none', border: 'none', cursor: isCurrentMonth ? 'default' : 'pointer',
            padding: 4, color: isCurrentMonth ? 'transparent' : '#6b7280', display: 'flex',
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Table / Empty state */}
      {entries.length === 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.7)',
          border: '1px solid rgba(255,255,255,0.55)',
          borderRadius: 12, padding: '48px 20px', textAlign: 'center',
          backdropFilter: 'saturate(180%) blur(20px)',
        }}>
          <Calendar size={36} color="#d1d5db" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Aucune dispensation ce mois</p>
          <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
            Les substances contrôlées vendues apparaîtront ici automatiquement.
          </p>
        </div>
      ) : (
        <div style={{
          background: 'rgba(255,255,255,0.7)',
          border: '1px solid rgba(255,255,255,0.55)',
          borderRadius: 12, overflow: 'hidden',
          backdropFilter: 'saturate(180%) blur(20px)',
        }}>
          {/* Desktop table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  {['Date', 'Médicament', 'Qté', 'Patient', 'Médecin', 'N° Ordonnance', 'Notes'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: 'left',
                      fontSize: 11, fontWeight: 700, color: '#6b7280',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr
                    key={e.id}
                    style={{
                      borderBottom: i < entries.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)',
                    }}
                  >
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#6b7280' }}>
                      {new Date(e.date).toLocaleDateString('fr-FR')}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0a0e14' }}>
                      {e.medication_name}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#c81e1e' }}>
                      {e.quantity}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>{e.patient_name}</td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>{e.doctor_name}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontFamily: 'monospace', fontSize: 11.5, fontWeight: 700,
                        background: 'rgba(200,30,30,0.08)', color: '#991b1b',
                        padding: '2px 7px', borderRadius: 5,
                      }}>
                        {e.ordonnance_number}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12 }}>
                      {e.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Note légale */}
      <p style={{
        fontSize: 11.5, color: '#9ca3af', lineHeight: 1.5,
        padding: '0 2px',
      }}>
        ⚠️ Ce registre est obligatoire. Conservez une copie signée pendant 10 ans conformément
        à la réglementation pharmaceutique en vigueur.
      </p>
    </div>
  );
}
