/**
 * FLUX 3 — Crédit patient → Remboursement partiel → Solde
 * ════════════════════════════════════════════════════════
 * Ce test vérifie le cycle de vie complet d'un crédit patient via
 * `offlineSafeInsertCredit` et `offlineSafePayCredit` de writeService.ts.
 *
 * Scénarios couverts :
 *  T3.1 — Créer un crédit et vérifier qu'il est bien enregistré (status = 'unpaid')
 *  T3.2 — Paiement partiel : le statut reste 'unpaid', le restant est correct
 *  T3.3 — Paiement du solde exact : status passe à 'paid', remaining = 0
 *  T3.4 — Surpaiement : remaining ne devient pas négatif (plancher à 0)
 *  T3.5 — Deux paiements successifs arrivent à 'paid'
 *  T3.6 — Crédit avec plusieurs médicaments : total_amount = somme des subtotals
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { offlineSafeInsertCredit, offlineSafePayCredit } from '../lib/writeService';
import { __resetCredits, __resetQueue, __getCredits } from '../lib/offlineStorage';

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  (__resetCredits as () => void)();
  (__resetQueue   as () => void)();
});

describe('Flux 3 — Crédit patient → Remboursement partiel → Solde', () => {

  // ── T3.1 : Création d'un crédit ───────────────────────────────────────────
  it('T3.1 — un nouveau crédit est créé avec status "unpaid" et amount_paid implicitement 0', async () => {
    const { id } = await offlineSafeInsertCredit({
      client_name: 'Mamadou Koné',
      total_amount: 10_000,
      items: [
        { medication_id: 'med-001', medication_name: 'QUININE 300MG', quantity: 2, unit_price: 1500, subtotal: 3000 },
        { medication_id: 'med-002', medication_name: 'AMOXICILLINE 500MG', quantity: 7, unit_price: 1000, subtotal: 7000 },
      ],
    });

    const credits = (__getCredits as () => Record<string, unknown>)();
    const credit = credits[id] as Record<string, unknown>;

    expect(credit).toBeDefined();
    expect(credit['status']).toBe('unpaid');
    expect(credit['total_amount']).toBe(10_000);
    expect(credit['client_name']).toBe('Mamadou Koné');
  });

  // ── T3.2 : Paiement partiel ───────────────────────────────────────────────
  it('T3.2 — paiement partiel (4 000 sur 10 000) : status = "unpaid", remaining = 6 000', async () => {
    const { id } = await offlineSafeInsertCredit({
      client_name: 'Fatoumata Diallo',
      total_amount: 10_000,
      items: [{ medication_id: 'med-X', medication_name: 'MED X', quantity: 10, unit_price: 1000, subtotal: 10_000 }],
    });

    const result = await offlineSafePayCredit(
      { id, total_amount: 10_000, amount_paid: 0 },
      4_000,
      'Espèces',
    );

    expect(result.status).toBe('unpaid');
    expect(result.newAmountPaid).toBe(4_000);
    expect(result.remaining).toBe(6_000);
  });

  // ── T3.3 : Paiement du solde exact ───────────────────────────────────────
  it('T3.3 — paiement du solde exact : status passe à "paid", remaining = 0', async () => {
    const { id } = await offlineSafeInsertCredit({
      client_name: 'Ibrahim Coulibaly',
      total_amount: 5_000,
      items: [{ medication_id: 'med-Y', medication_name: 'MED Y', quantity: 5, unit_price: 1000, subtotal: 5_000 }],
    });

    const result = await offlineSafePayCredit(
      { id, total_amount: 5_000, amount_paid: 0 },
      5_000,
      'MTN Mobile Money',
    );

    expect(result.status).toBe('paid');
    expect(result.remaining).toBe(0);
    expect(result.newAmountPaid).toBe(5_000);
  });

  // ── T3.4 : Surpaiement ───────────────────────────────────────────────────
  it('T3.4 — surpaiement : remaining est plafonné à 0 (ne devient pas négatif)', async () => {
    const { id } = await offlineSafeInsertCredit({
      client_name: 'Aissata Traoré',
      total_amount: 3_000,
      items: [{ medication_id: 'med-Z', medication_name: 'MED Z', quantity: 3, unit_price: 1000, subtotal: 3_000 }],
    });

    const result = await offlineSafePayCredit(
      { id, total_amount: 3_000, amount_paid: 0 },
      5_000, // surpaiement de 2 000
      'Airtel Money',
    );

    expect(result.status).toBe('paid');
    expect(result.remaining).toBe(0);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  // ── T3.5 : Deux paiements successifs ─────────────────────────────────────
  it('T3.5 — deux paiements successifs (3 000 + 7 000) soldent un crédit de 10 000', async () => {
    const TOTAL = 10_000;
    const { id } = await offlineSafeInsertCredit({
      client_name: 'Oumar Sanogo',
      total_amount: TOTAL,
      items: [{ medication_id: 'med-W', medication_name: 'MED W', quantity: 10, unit_price: 1000, subtotal: TOTAL }],
    });

    // 1er paiement
    const p1 = await offlineSafePayCredit(
      { id, total_amount: TOTAL, amount_paid: 0 },
      3_000,
      'Espèces',
    );
    expect(p1.status).toBe('unpaid');
    expect(p1.remaining).toBe(7_000);

    // 2ème paiement (on utilise le newAmountPaid du 1er)
    const p2 = await offlineSafePayCredit(
      { id, total_amount: TOTAL, amount_paid: p1.newAmountPaid },
      7_000,
      'Espèces',
    );
    expect(p2.status).toBe('paid');
    expect(p2.remaining).toBe(0);
    expect(p2.newAmountPaid).toBe(TOTAL);
  });

  // ── T3.6 : Total = somme des subtotals ────────────────────────────────────
  it('T3.6 — le total_amount passé doit correspondre à la somme des subtotals des items', async () => {
    const items = [
      { medication_id: 'med-001', medication_name: 'MED 1', quantity: 2, unit_price: 1500, subtotal: 3_000 },
      { medication_id: 'med-002', medication_name: 'MED 2', quantity: 4, unit_price: 500,  subtotal: 2_000 },
      { medication_id: 'med-003', medication_name: 'MED 3', quantity: 1, unit_price: 2500, subtotal: 2_500 },
    ];
    const expectedTotal = items.reduce((s, i) => s + i.subtotal, 0); // 7 500

    const { id } = await offlineSafeInsertCredit({
      client_name: 'Test Patient',
      total_amount: expectedTotal,
      items,
    });

    const credits = (__getCredits as () => Record<string, unknown>)();
    const credit  = credits[id] as Record<string, unknown>;

    expect(credit['total_amount']).toBe(expectedTotal);
    expect(expectedTotal).toBe(7_500);
  });
});
