import { useState, useCallback } from 'react';

export interface InsuranceOrg {
  id: string;
  name: string;
  default_rate: number; // 0–100
  custom?: boolean;     // true = ajouté par l'utilisateur
}

export const DEFAULT_ORGS: InsuranceOrg[] = [
  { id: 'cnss',     name: 'CNSS',                  default_rate: 80  },
  { id: 'camu',     name: 'CAMU',                  default_rate: 100 },
  { id: 'activa',   name: 'Activa Assurances',      default_rate: 75  },
  { id: 'sonas',    name: 'SONAS',                  default_rate: 70  },
  { id: 'mutuelle', name: "Mutuelle d'entreprise",  default_rate: 70  },
];

const KEY = 'jp_insurance_orgs';

function loadOrgs(): InsuranceOrg[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [...DEFAULT_ORGS];
    const saved: InsuranceOrg[] = JSON.parse(raw);
    // Assure que les defaults sont toujours présents
    const ids = new Set(saved.map(o => o.id));
    const missing = DEFAULT_ORGS.filter(d => !ids.has(d.id));
    return [...saved, ...missing];
  } catch {
    return [...DEFAULT_ORGS];
  }
}

function persist(orgs: InsuranceOrg[]) {
  try { localStorage.setItem(KEY, JSON.stringify(orgs)); } catch { /* quota */ }
}

export function useInsuranceOrgs() {
  const [orgs, setOrgs] = useState<InsuranceOrg[]>(loadOrgs);

  const addOrg = useCallback((name: string, default_rate: number): InsuranceOrg => {
    const org: InsuranceOrg = {
      id:           `custom_${Date.now()}`,
      name:         name.trim(),
      default_rate: Math.min(100, Math.max(0, default_rate)),
      custom:       true,
    };
    setOrgs(prev => {
      const next = [...prev, org];
      persist(next);
      return next;
    });
    return org;
  }, []);

  const removeOrg = useCallback((id: string) => {
    // On ne peut supprimer que les orgs custom
    if (DEFAULT_ORGS.some(d => d.id === id)) return;
    setOrgs(prev => {
      const next = prev.filter(o => o.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const updateOrgRate = useCallback((id: string, default_rate: number) => {
    setOrgs(prev => {
      const next = prev.map(o => o.id === id ? { ...o, default_rate } : o);
      persist(next);
      return next;
    });
  }, []);

  return { orgs, addOrg, removeOrg, updateOrgRate };
}
