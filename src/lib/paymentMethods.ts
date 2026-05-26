/*
  Source unique de vérité pour les modes de paiement.

  Pourquoi : les chaînes de paiement étaient dupliquées dans ~8 composants,
  avec deux variantes incohérentes ('Especes' sans accent côté panier,
  'Espèces' accentué côté caisse/scan). Résultat : reporting faussé.

  Ce module centralise :
  - la liste canonique des méthodes (id stable + libellés),
  - un normaliseur pour fusionner les variantes héritées au moment de la lecture,
  - des helpers d'affichage (libellé court/long).

  Note : on NE réécrit pas les valeurs déjà stockées en base. Le normaliseur
  garantit que 'Especes' et 'Espèces' (et toute casse/accent) sont comptés
  ensemble dans les rapports.
*/

export type PaymentMethodId = 'especes' | 'carte' | 'mtn' | 'airtel';

export interface PaymentMethodDef {
  id: PaymentMethodId;
  /** Valeur canonique écrite en base pour les nouvelles ventes. */
  value: string;
  /** Libellé complet. */
  label: string;
  /** Libellé court (boutons compacts). */
  short: string;
}

export const PAYMENT_METHODS: PaymentMethodDef[] = [
  { id: 'especes', value: 'Espèces', label: 'Espèces', short: 'Espèces' },
  { id: 'carte', value: 'Carte Bancaire', label: 'Carte Bancaire', short: 'Carte' },
  { id: 'mtn', value: 'MTN Mobile Money', label: 'MTN Mobile Money', short: 'MTN' },
  { id: 'airtel', value: 'Airtel Money', label: 'Airtel Money', short: 'Airtel' },
];

/**
 * Ramène une valeur brute de payment_method (héritée ou non) à son id canonique.
 * Tolère les accents, la casse et les variantes connues. Renvoie null si inconnu.
 */
export function normalizePaymentMethod(raw: string | null | undefined): PaymentMethodId | null {
  if (!raw) return null;
  const k = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les accents
    .toLowerCase()
    .trim();

  if (k.includes('espece') || k === 'cash' || k.includes('comptant')) return 'especes';
  if (k.includes('carte') || k.includes('card') || k.includes('cb')) return 'carte';
  if (k.includes('mtn')) return 'mtn';
  if (k.includes('airtel')) return 'airtel';
  // "Mobile Money" générique → MTN par défaut (historique)
  if (k.includes('mobile money') || k.includes('momo')) return 'mtn';
  return null;
}

const BY_ID: Record<PaymentMethodId, PaymentMethodDef> =
  Object.fromEntries(PAYMENT_METHODS.map((m) => [m.id, m])) as Record<PaymentMethodId, PaymentMethodDef>;

/** Libellé d'affichage pour une valeur brute (normalisée). Fallback : valeur telle quelle. */
export function paymentMethodLabel(raw: string | null | undefined): string {
  const id = normalizePaymentMethod(raw);
  return id ? BY_ID[id].label : (raw || '—');
}
