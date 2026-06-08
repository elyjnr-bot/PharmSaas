import { useState } from 'react';
import { ShieldAlert, X, Check } from 'lucide-react';

export interface StupefiantFormData {
  patient_name: string;
  doctor_name: string;
  ordonnance_number: string;
  notes: string;
}

interface StupefiantModalProps {
  medicationName: string;
  onConfirm: (data: StupefiantFormData) => void;
  onCancel: () => void;
}

const C = {
  ink:     '#0a0e14',
  inkMute: '#6b7280',
  border:  'rgba(15,15,20,0.08)',
  red:     '#c81e1e',
};

export default function StupefiantModal({ medicationName, onConfirm, onCancel }: StupefiantModalProps) {
  const [form, setForm] = useState<StupefiantFormData>({
    patient_name: '',
    doctor_name: '',
    ordonnance_number: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Partial<StupefiantFormData>>({});

  const set = (k: keyof StupefiantFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    setErrors(er => ({ ...er, [k]: '' }));
  };

  const handleConfirm = () => {
    const errs: Partial<StupefiantFormData> = {};
    if (!form.patient_name.trim())     errs.patient_name     = 'Obligatoire';
    if (!form.doctor_name.trim())      errs.doctor_name      = 'Obligatoire';
    if (!form.ordonnance_number.trim()) errs.ordonnance_number = 'Obligatoire';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onConfirm(form);
  };

  const Field = ({
    label, field, placeholder, required,
  }: {
    label: string; field: keyof StupefiantFormData; placeholder: string; required?: boolean;
  }) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
        {label} {required && <span style={{ color: C.red }}>*</span>}
      </label>
      <input
        type="text"
        value={form[field]}
        onChange={set(field)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '9px 12px', fontSize: 13,
          border: `1.5px solid ${errors[field] ? C.red : 'rgba(0,0,0,0.12)'}`,
          borderRadius: 8, outline: 'none', background: '#fff',
          color: C.ink, boxSizing: 'border-box',
        }}
      />
      {errors[field] && <p style={{ fontSize: 11, color: C.red, marginTop: 3 }}>{errors[field]}</p>}
    </div>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(10,14,20,0.55)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 420,
        background: '#fff',
        borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
        border: `1px solid ${C.border}`,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          background: 'rgba(200,30,30,0.06)',
          borderBottom: `1px solid rgba(200,30,30,0.12)`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldAlert size={20} color={C.red} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Substance contrôlée</p>
              <p style={{ fontSize: 11.5, color: C.inkMute }}>{medicationName}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.inkMute }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 12.5, color: C.inkMute, marginBottom: 16, lineHeight: 1.5 }}>
            La dispensation de ce produit doit être consignée dans le registre des stupéfiants
            conformément à la réglementation en vigueur.
          </p>

          <Field label="Nom du patient"      field="patient_name"      placeholder="Nom et prénom" required />
          <Field label="Médecin prescripteur" field="doctor_name"       placeholder="Dr …"          required />
          <Field label="N° ordonnance"        field="ordonnance_number" placeholder="ORD-XXXX"      required />

          <div style={{ marginBottom: 4 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              placeholder="Informations complémentaires (optionnel)"
              rows={2}
              style={{
                width: '100%', padding: '9px 12px', fontSize: 13,
                border: '1.5px solid rgba(0,0,0,0.12)',
                borderRadius: 8, outline: 'none', background: '#fff',
                color: C.ink, boxSizing: 'border-box', resize: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 13, fontWeight: 600,
              background: 'transparent', border: '1.5px solid rgba(0,0,0,0.1)',
              color: C.inkMute, cursor: 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            style={{
              flex: 2, padding: '10px 0', borderRadius: 9, fontSize: 13, fontWeight: 700,
              background: C.red, border: 'none', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Check size={15} />
            Confirmer et enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
