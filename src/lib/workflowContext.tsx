import { createContext, useContext, useState, useCallback } from 'react';

export type WorkflowMode = 'global' | 'unit';

export interface PendingCartItem {
  medication_id?: string;  // FK vers medications.id — prioritaire pour le matching
  name: string;
  qty: number;
  ordonnanceRef?: string;
}

interface WorkflowContextType {
  workflowMode: WorkflowMode;
  setWorkflowMode: (mode: WorkflowMode) => void;
  isUnitMode: boolean;
  isGlobalMode: boolean;
  /** Items prefilled from an ordonnance — consumed once by Sales.tsx */
  pendingOrdCart: PendingCartItem[] | null;
  setPendingOrdCart: (items: PendingCartItem[] | null) => void;
}

const WorkflowContext = createContext<WorkflowContextType | null>(null);

export function WorkflowProvider({ children }: { children: React.ReactNode }) {
  const [workflowMode, setWorkflowModeState] = useState<WorkflowMode>(() => {
    const saved = localStorage.getItem('workflow_mode');
    return (saved === 'unit' || saved === 'global') ? saved : 'global';
  });
  const [pendingOrdCart, setPendingOrdCart] = useState<PendingCartItem[] | null>(null);

  const setWorkflowMode = useCallback((mode: WorkflowMode) => {
    setWorkflowModeState(mode);
    localStorage.setItem('workflow_mode', mode);
  }, []);

  return (
    <WorkflowContext.Provider value={{
      workflowMode,
      setWorkflowMode,
      isUnitMode: workflowMode === 'unit',
      isGlobalMode: workflowMode === 'global',
      pendingOrdCart,
      setPendingOrdCart,
    }}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error('useWorkflow must be used inside WorkflowProvider');
  return ctx;
}

export function generateUnitCodes(
  medicationId: string,
  quantity: number,
  receptionBatch: string,
  batchNumber: string,
  expiryDate: string
): Array<{ unit_code: string; batch_number: string; expiry_date: string; reception_batch: string }> {
  const medHash = medicationId.replace(/-/g, '').substring(0, 6).toUpperCase();
  const ts = Date.now();
  const units = [];

  for (let i = 0; i < quantity; i++) {
    const increment = String(i + 1).padStart(4, '0');
    const unit_code = `JP-${medHash}-${ts}-${increment}`;
    units.push({
      unit_code,
      batch_number: batchNumber,
      expiry_date: expiryDate,
      reception_batch: receptionBatch,
    });
  }

  return units;
}
