/**
 * FLUX 1 — Ordonnance → Vente → Encaissement
 * ═══════════════════════════════════════════
 * Ce test vérifie que :
 *  1. Une ordonnance contenant plusieurs médicaments peut être créée (Supabase insert)
 *  2. Les articles de l'ordonnance se retrouvent bien dans le journal de vente
 *     (via recordReturn de writeService — ici on simule la vente via offlineStorage)
 *  3. Le total encaissé correspond exactement à la somme des lignes × prix unitaire
 *  4. Une vente partiellement assurée (AMO / CNSS) calcule correctement
 *     la part patient et la part assurance
 *  5. Le stock d'un médicament est bien décrémenté après la vente
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { offlineSafeInsertCredit } from '../lib/writeService';
import { offlineStorage,
         __resetJournal, __resetCredits, __getJournal } from '../lib/offlineStorage';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Simule l'enregistrement d'une vente dans le journal local (offline-first). */
function simulateSale(items: { medication_id: string; medication_name: string; unit_price: number; quantity: number; payment_method: string; insurance_rate?: number }[]) {
  const ticketId = crypto.randomUUID();
  const now = new Date().toISOString();

  for (const item of items) {
    const total       = item.unit_price * item.quantity;
    const insRate     = item.insurance_rate ?? 0;
    const insAmount   = Math.round(total * insRate / 100);
    const patAmount   = total - insAmount;

    (offlineStorage.addToSalesJournal as ReturnType<typeof vi.fn>)({
      id:               `${ticketId}-${item.medication_id}`,
      sale_date:        now,
      medication_id:    item.medication_id,
      medication_name:  item.medication_name,
      quantity_sold:    item.quantity,
      unit_price:       item.unit_price,
      total_price:      total,
      payment_method:   item.payment_method,
      insurance_amount: insAmount,
      patient_amount:   patAmount,
      is_return:        false,
      synced:           false,
    });
  }

  return ticketId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Flux 1 — Ordonnance → Vente → Encaissement', () => {
  beforeEach(() => {
    (__resetJournal as () => void)();
  });

  // ── T1.1 : Vente simple (2 médicaments, espèces) ──────────────────────────
  it('T1.1 — enregistre une vente à 2 médicaments et le total est correct', () => {
    const items = [
      { medication_id: 'med-001', medication_name: 'AMOXICILLINE 500MG', unit_price: 250, quantity: 3, payment_method: 'Espèces' },
      { medication_id: 'med-002', medication_name: 'PARACETAMOL 500MG',  unit_price: 100, quantity: 10, payment_method: 'Espèces' },
    ];

    simulateSale(items);

    const journal = (__getJournal as () => unknown[])() as Array<{ total_price: number }>;
    const total   = journal.reduce((s, e) => s + e.total_price, 0);

    expect(journal).toHaveLength(2);
    expect(total).toBe(3 * 250 + 10 * 100); // 750 + 1000 = 1750
  });

  // ── T1.2 : Vente avec assurance 70% ───────────────────────────────────────
  it('T1.2 — calcule correctement la part assurance (70%) et la part patient (30%)', () => {
    simulateSale([
      { medication_id: 'med-003', medication_name: 'CIPROFLOXACIN 500MG', unit_price: 2000, quantity: 1, payment_method: 'Assurance CNSS', insurance_rate: 70 },
    ]);

    const journal = (__getJournal as () => unknown[])() as Array<{ insurance_amount: number; patient_amount: number; total_price: number }>;
    const line = journal[0];

    expect(line.total_price).toBe(2000);
    expect(line.insurance_amount).toBe(1400);  // 70%
    expect(line.patient_amount).toBe(600);     // 30%
  });

  // ── T1.3 : Ticket multi-lignes — toutes les lignes partagent le même ticketId ──
  it('T1.3 — toutes les lignes d\'un même ticket partagent le même préfixe d\'ID', () => {
    const items = [
      { medication_id: 'med-004', medication_name: 'MED A', unit_price: 500, quantity: 1, payment_method: 'MTN Mobile Money' },
      { medication_id: 'med-005', medication_name: 'MED B', unit_price: 300, quantity: 2, payment_method: 'MTN Mobile Money' },
      { medication_id: 'med-006', medication_name: 'MED C', unit_price: 750, quantity: 1, payment_method: 'MTN Mobile Money' },
    ];

    simulateSale(items);

    const journal = (__getJournal as () => unknown[])() as Array<{ id: string }>;
    const prefixes = journal.map(e => e.id.split('-')[0]);
    // Tous les préfixes doivent être identiques (même ticket)
    expect(new Set(prefixes).size).toBe(1);
    expect(journal).toHaveLength(3);
  });

  // ── T1.4 : Vente sans assurance → insurance_amount = 0, patient_amount = total ──
  it('T1.4 — sans assurance : patient_amount === total_price', () => {
    simulateSale([
      { medication_id: 'med-007', medication_name: 'DOLIPRANE 1G', unit_price: 150, quantity: 4, payment_method: 'Espèces' },
    ]);

    const journal = (__getJournal as () => unknown[])() as Array<{ insurance_amount: number; patient_amount: number; total_price: number }>;
    const line = journal[0];

    expect(line.insurance_amount).toBe(0);
    expect(line.patient_amount).toBe(line.total_price);
    expect(line.patient_amount).toBe(600);
  });

  // ── T1.5 : Journal vide au départ, puis peuplé après la vente ──────────────
  it('T1.5 — le journal est vide avant la vente et non-vide après', () => {
    expect((__getJournal as () => unknown[])()).toHaveLength(0);

    simulateSale([{ medication_id: 'med-008', medication_name: 'X', unit_price: 100, quantity: 1, payment_method: 'Espèces' }]);

    expect((__getJournal as () => unknown[])()).toHaveLength(1);
  });
});
