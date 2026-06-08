/**
 * tourRegistry.ts — Définition centralisée des guides interactifs par onglet
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque onglet principal possède son propre tour guidé, déclenché UNE fois à
 * la première visite (flag scopé par utilisateur), et rejouable depuis
 * Réglages › Aide.
 *
 * Les `selector` pointent des ancres `data-tour="…"` posées dans les composants.
 * Quand un onglet n'a pas d'ancre (ou qu'elle n'est pas encore montée), l'étape
 * s'affiche centrée — le guide reste donc fiable partout.
 *
 * ⚠️ Versionner le `tourId` (`_v1`, `_v2`…) à chaque refonte de contenu pour que
 * les utilisateurs revoient le guide mis à jour.
 */

import type { TourStep } from '../components/ProductTour';

export interface TabTour {
  /** Onglet déclencheur (doit matcher activeTab dans App.tsx). */
  tab: string;
  /** Clé de persistance localStorage (versionnée). */
  tourId: string;
  /** Libellé affiché dans Réglages › Aide. */
  label: string;
  /** Emoji d'en-tête pour la liste Réglages. */
  icon: string;
  /**
   * Sélecteur qui doit être présent dans le DOM pour déclencher le guide.
   * Évite d'afficher le tour au-dessus d'un écran de verrouillage (Aperçu
   * protégé par PIN) ou d'un inventaire encore vide. Si absent, le guide se
   * déclenche immédiatement (cas des tours purement centrés).
   */
  requireSelector?: string;
  steps: TourStep[];
}

/* ════════════════════════════════════════════════════════════════════════════
   APERÇU / TABLEAU DE BORD
   ════════════════════════════════════════════════════════════════════════════ */
const DASHBOARD_TOUR: TabTour = {
  tab: 'dashboard',
  tourId: 'dashboard_v2',
  label: 'Aperçu (tableau de bord)',
  icon: '📊',
  requireSelector: '[data-tour="kpi-ventes"]', // pas au-dessus du verrou PIN
  steps: [
    {
      placement: 'center',
      emoji: '📊',
      title: 'Votre tableau de bord',
      body: "C'est la première chose à regarder chaque matin. Faisons le tour de chaque indicateur — vous saurez exactement ce que chacun vous dit.",
    },
    {
      selector: '[data-tour="kpi-ventes"]',
      placement: 'bottom',
      emoji: '💰',
      title: '1. Ventes du jour',
      body: "Le total encaissé aujourd'hui. Le badge coloré compare à hier (vert = en hausse, rouge = en baisse). S'il y a eu des retours, le montant remboursé est précisé.",
    },
    {
      selector: '[data-tour="kpi-tickets"]',
      placement: 'bottom',
      emoji: '🧾',
      title: '2. Tickets émis',
      body: "Le nombre de ventes réalisées aujourd'hui, avec votre panier moyen (montant moyen par ticket). Utile pour mesurer l'affluence et la valeur de chaque passage en caisse.",
    },
    {
      selector: '[data-tour="kpi-casemaine"]',
      placement: 'bottom',
      emoji: '📅',
      title: '3. CA de la semaine',
      body: "Votre chiffre d'affaires depuis lundi, comparé à la semaine précédente. Parfait pour voir si la semaine est bien partie.",
    },
    {
      selector: '[data-tour="kpi-camois"]',
      placement: 'bottom',
      emoji: '📆',
      title: '4. CA du mois',
      body: "Le chiffre d'affaires du mois en cours, comparé au mois dernier. C'est votre indicateur de tendance de fond pour piloter l'officine.",
    },
    {
      selector: '[data-tour="kpi-rupture"]',
      placement: 'top',
      emoji: '⚠️',
      title: '5. Stock critique',
      body: "Le nombre de références en rupture ou sous le seuil d'alerte. Vert = stock sain. Rouge = à recommander d'urgence pour ne pas perdre de ventes.",
    },
    {
      selector: '[data-tour="kpi-peremption"]',
      placement: 'top',
      emoji: '⏳',
      title: '6. Péremption < 30 jours',
      body: "Les lots qui périment dans le mois. À écouler en priorité (mise en avant, promotion) avant de devoir les jeter — c'est de l'argent immobilisé.",
    },
    {
      selector: '[data-tour="dash-chart"]',
      placement: 'top',
      emoji: '📈',
      title: 'La courbe du chiffre d\'affaires',
      body: "Visualisez l'évolution de vos ventes jour après jour. Le pourcentage en haut compare la période à la précédente.",
    },
    {
      selector: '[data-tour="dash-period"]',
      placement: 'bottom',
      emoji: '🔀',
      title: 'Changez la période',
      body: "Basculez la courbe entre 7 jours, 30 jours et 90 jours. Le bouton calendrier juste à côté permet même de choisir une plage de dates sur mesure.",
    },
    {
      selector: '[data-tour="dash-alerts"]',
      placement: 'left',
      emoji: '🚨',
      title: 'Stock critique & recommandations',
      body: "La liste des produits à recommander aujourd'hui, avec une prédiction de réassort. Cliquez sur « Créer une commande » pour préparer le bon directement.",
    },
    {
      selector: '[data-tour="dash-report"]',
      placement: 'bottom',
      emoji: '🖨️',
      title: 'Le rapport mensuel',
      body: "Imprimez ou exportez en un clic le bilan complet du mois (ventes, marges, stock) — pratique pour votre comptable ou vos archives.",
    },
    {
      placement: 'center',
      emoji: '🌿',
      title: 'À vous de jouer',
      body: "Vous maîtrisez maintenant votre tableau de bord. Revenez-y chaque matin d'un clic sur « Aperçu ». Bonne journée à l'officine !",
    },
  ],
};

/* ════════════════════════════════════════════════════════════════════════════
   CAISSE / VENTES
   ════════════════════════════════════════════════════════════════════════════ */
const SALES_TOUR: TabTour = {
  tab: 'sales',
  tourId: 'sales_v2',
  label: 'Caisse (point de vente)',
  icon: '🛒',
  requireSelector: '[data-tour="sales-search"]',
  steps: [
    {
      placement: 'center',
      emoji: '🛒',
      title: 'La caisse, votre poste de vente',
      body: "C'est ici que vous encaissez vos clients. Faisons le tour des outils : recherche, scanner, panier, paiement et clôture de journée.",
    },
    {
      selector: '[data-tour="sales-stats"]',
      placement: 'bottom',
      emoji: '📊',
      title: 'Vos chiffres en direct',
      body: "CA du jour, nombre de tickets, unités vendues et panier moyen — mis à jour à chaque vente. Vous suivez votre journée d'un coup d'œil.",
    },
    {
      selector: '[data-tour="sales-search"]',
      placement: 'bottom',
      emoji: '🔍',
      title: 'Trouvez un produit',
      body: "Tapez le nom, le DCI ou le code. Cliquez sur un résultat pour l'ajouter au panier. C'est la façon la plus rapide d'encaisser.",
    },
    {
      selector: '[data-tour="sales-scanner"]',
      placement: 'bottom',
      emoji: '📷',
      title: 'Scanner un code-barres',
      body: "Branchez une douchette USB ou Bluetooth et scannez directement le produit : il s'ajoute au panier sans rien taper. Idéal en heure de pointe.",
    },
    {
      selector: '[data-tour="sales-return"]',
      placement: 'bottom',
      emoji: '↩️',
      title: 'Gérer un retour / avoir',
      body: "Un client rapporte un produit ? Retrouvez la vente d'origine et enregistrez le remboursement ou l'avoir. Le stock est automatiquement réajusté.",
    },
    {
      selector: '[data-tour="sales-categories"]',
      placement: 'top',
      emoji: '🗂️',
      title: 'Parcourir par catégorie',
      body: "Pas de nom en tête ? Naviguez par rayon (antibiotiques, antipaludéens, dermato…) pour retrouver un produit visuellement.",
    },
    {
      selector: '[data-tour="sales-fond"]',
      placement: 'left',
      emoji: '💵',
      title: 'Le fond de caisse',
      body: "Saisissez le fond de caisse du matin. En fin de journée, le Rapport Z le compare aux ventes en espèces pour vérifier votre tiroir-caisse.",
    },
    {
      selector: '[data-tour="sales-cart"]',
      placement: 'left',
      emoji: '🧾',
      title: "Le panier et l'encaissement",
      body: "Les produits s'empilent ici. Ajustez les quantités, appliquez une remise, puis choisissez le paiement : espèces, carte, MTN/Airtel Money, ou crédit client.",
    },
    {
      selector: '[data-tour="sales-rapportz"]',
      placement: 'left',
      emoji: '📑',
      title: 'Le Rapport Z (clôture)',
      body: "En fin de journée, générez le Rapport Z : total des ventes par mode de paiement, écart de caisse éventuel. La clôture comptable de votre officine.",
    },
    {
      placement: 'center',
      emoji: '💳',
      title: 'Vente à crédit',
      body: "Pour un patient connu, vendez à crédit : la dette est enregistrée dans son compte (onglet Crédits) et suivie automatiquement jusqu'au remboursement.",
    },
    {
      placement: 'center',
      emoji: '🌿',
      title: 'Prêt à encaisser !',
      body: "Vous maîtrisez la caisse. Bonne vente avec JunglePharm — et rappelez-vous : le bouton « ? » relance ce guide à tout moment.",
    },
  ],
};

/* ════════════════════════════════════════════════════════════════════════════
   INVENTAIRE / STOCK  (tour riche, ancré, avec démos interactives)
   ════════════════════════════════════════════════════════════════════════════ */
const STOCK_TOUR: TabTour = {
  tab: 'stock',
  tourId: 'inventory_v1',
  label: 'Inventaire (stock)',
  icon: '📦',
  requireSelector: '[data-tour="category-picker"]', // uniquement si le catalogue a des produits
  steps: [
    {
      placement: 'center',
      emoji: '🎉',
      title: 'Votre catalogue est prêt !',
      body: "En 30 secondes, découvrez 3 astuces qui vont vous faire gagner du temps tous les jours. C'est parti.",
    },
    {
      selector: '[data-tour="category-picker"]',
      placement: 'bottom',
      emoji: '🏷️',
      title: 'Classez vos produits par rayon',
      body: "Cliquez sur la catégorie d'un produit pour la changer. JunglePharm devine le rayon automatiquement et apprend de vos corrections — bientôt tout sera classé sans effort.",
    },
    {
      selector: '[data-tour="row-actions"]',
      placement: 'left',
      emoji: '⚡',
      title: 'Actions rapides sur chaque ligne',
      body: "Au survol d'un produit, ajustez le stock d'un clic, modifiez la fiche, ou envoyez-le directement en caisse pour une vente éclair.",
    },
    {
      selector: '[data-tour="bulk-bar"]',
      placement: 'top',
      emoji: '✅',
      title: 'Modifiez plusieurs produits à la fois',
      body: "Cochez plusieurs lignes pour faire apparaître cette barre : changez les prix en lot (+10 %, −500 F…), le fournisseur ou le seuil d'alerte — idéal après une livraison.",
    },
    {
      placement: 'center',
      emoji: '🌿',
      title: 'Vous êtes prêt(e) !',
      body: "Vous pouvez rejouer ce guide à tout moment depuis Réglages › Aide. Bonne gestion avec JunglePharm.",
    },
  ],
};

/* ════════════════════════════════════════════════════════════════════════════
   PATIENTS
   ════════════════════════════════════════════════════════════════════════════ */
const PATIENTS_TOUR: TabTour = {
  tab: 'patients',
  tourId: 'patients_v1',
  label: 'Patients (fichier clients)',
  icon: '👥',
  requireSelector: '[data-tour="patients-add"]',
  steps: [
    {
      placement: 'center',
      emoji: '👥',
      title: 'Votre fichier patients',
      body: "Gardez une fiche pour chaque client régulier : coordonnées, historique d'achats, ordonnances et crédits. Idéal pour le suivi des maladies chroniques.",
    },
    {
      selector: '[data-tour="patients-add"]',
      placement: 'bottom',
      emoji: '➕',
      title: 'Ajoutez un patient',
      body: "Créez une fiche en quelques secondes. Vous pourrez ensuite lui rattacher ses ventes, ses ordonnances et suivre ses crédits.",
    },
    {
      placement: 'center',
      emoji: '🔁',
      title: 'Un suivi qui fait revenir vos clients',
      body: "Retrouvez l'historique complet d'un patient pour anticiper ses renouvellements de traitement — un vrai plus pour la fidélité.",
    },
  ],
};

/* ════════════════════════════════════════════════════════════════════════════
   ORDONNANCES
   ════════════════════════════════════════════════════════════════════════════ */
const ORDONNANCES_TOUR: TabTour = {
  tab: 'ordonnances',
  tourId: 'ordonnances_v1',
  label: 'Ordonnances',
  icon: '📋',
  steps: [
    {
      placement: 'center',
      emoji: '📋',
      title: 'Gérez les ordonnances',
      body: "Enregistrez les prescriptions de vos patients, suivez les renouvellements et délivrez les traitements en toute traçabilité.",
    },
    {
      placement: 'center',
      emoji: '📅',
      title: 'Renouvellements automatiques',
      body: "Pour un traitement au long cours, JunglePharm vous signale quand un patient doit revenir : vous ne perdez plus une délivrance.",
    },
  ],
};

/* ════════════════════════════════════════════════════════════════════════════
   CRÉDITS / CARNET DE DETTES
   ════════════════════════════════════════════════════════════════════════════ */
const CARNET_TOUR: TabTour = {
  tab: 'carnet',
  tourId: 'carnet_v1',
  label: 'Crédits clients',
  icon: '💳',
  steps: [
    {
      placement: 'center',
      emoji: '💳',
      title: 'Le carnet de crédits',
      body: "Fini le cahier papier : suivez ici qui vous doit de l'argent, combien, et depuis quand. Chaque vente à crédit s'y ajoute automatiquement.",
    },
    {
      placement: 'center',
      emoji: '💵',
      title: 'Enregistrez les remboursements',
      body: "Quand un client rembourse, notez-le en un clic. Le solde se met à jour et vous gardez l'historique complet des paiements.",
    },
  ],
};

/* ════════════════════════════════════════════════════════════════════════════
   COMMANDES / RÉASSORT
   ════════════════════════════════════════════════════════════════════════════ */
const COMMANDES_TOUR: TabTour = {
  tab: 'commandes',
  tourId: 'commandes_v1',
  label: 'Commandes fournisseurs',
  icon: '🚚',
  steps: [
    {
      placement: 'center',
      emoji: '🚚',
      title: 'Préparez vos commandes',
      body: "Construisez vos bons de commande à partir des ruptures et des produits qui baissent. JunglePharm vous propose les quantités à recommander.",
    },
    {
      placement: 'center',
      emoji: '📲',
      title: 'Commandez via WhatsApp',
      body: "Envoyez votre commande directement au grossiste par WhatsApp depuis l'application — pratique avec Laborex, Copharmed et vos fournisseurs habituels.",
    },
  ],
};

/* ════════════════════════════════════════════════════════════════════════════
   PÉREMPTIONS
   ════════════════════════════════════════════════════════════════════════════ */
const EXPIRATIONS_TOUR: TabTour = {
  tab: 'expirations',
  tourId: 'expirations_v1',
  label: 'Péremptions',
  icon: '⏳',
  steps: [
    {
      placement: 'center',
      emoji: '⏳',
      title: 'Anticipez les périmés',
      body: "Visualisez tous les lots qui approchent de leur date de péremption. Écoulez-les en priorité (promotion, mise en avant) avant de devoir les jeter.",
    },
  ],
};

/* ════════════════════════════════════════════════════════════════════════════
   MOUVEMENTS DE STOCK
   ════════════════════════════════════════════════════════════════════════════ */
const MOUVEMENTS_TOUR: TabTour = {
  tab: 'mouvements',
  tourId: 'mouvements_v1',
  label: 'Mouvements de stock',
  icon: '🔄',
  steps: [
    {
      placement: 'center',
      emoji: '🔄',
      title: "L'historique de votre stock",
      body: "Chaque entrée (livraison) et sortie (vente, ajustement, casse) est tracée ici. Indispensable pour comprendre un écart d'inventaire.",
    },
  ],
};

/* ════════════════════════════════════════════════════════════════════════════
   ÉQUIPE
   ════════════════════════════════════════════════════════════════════════════ */
const EQUIPE_TOUR: TabTour = {
  tab: 'equipe',
  tourId: 'equipe_v1',
  label: 'Équipe',
  icon: '🧑‍⚕️',
  steps: [
    {
      placement: 'center',
      emoji: '🧑‍⚕️',
      title: 'Gérez votre équipe',
      body: "Créez un compte vendeur pour chaque membre de l'équipe, avec son propre code PIN et ses permissions. Chaque vente est ainsi rattachée à son auteur.",
    },
    {
      placement: 'center',
      emoji: '🔐',
      title: 'Des droits sur mesure',
      body: "Vous décidez qui peut faire des remises, voir les marges ou modifier les prix. Vos données sensibles restent protégées.",
    },
  ],
};

/* ════════════════════════════════════════════════════════════════════════════
   RAPPORTS
   ════════════════════════════════════════════════════════════════════════════ */
const RAPPORTS_TOUR: TabTour = {
  tab: 'rapports',
  tourId: 'rapports_v1',
  label: 'Rapports',
  icon: '📈',
  steps: [
    {
      placement: 'center',
      emoji: '📈',
      title: 'Pilotez votre officine',
      body: "Chiffre d'affaires, marges, top ventes, performance par vendeur… Générez vos rapports sur la période de votre choix et exportez-les.",
    },
    {
      placement: 'center',
      emoji: '📤',
      title: 'Exports comptables',
      body: "Exportez vos données en Excel/CSV pour votre comptable ou vos déclarations. Tout est prêt à transmettre.",
    },
  ],
};

/* ════════════════════════════════════════════════════════════════════════════
   FOURNISSEURS
   ════════════════════════════════════════════════════════════════════════════ */
const FOURNISSEURS_TOUR: TabTour = {
  tab: 'fournisseurs',
  tourId: 'fournisseurs_v1',
  label: 'Fournisseurs',
  icon: '🏢',
  steps: [
    {
      placement: 'center',
      emoji: '🏢',
      title: 'Votre carnet de grossistes',
      body: "Enregistrez vos fournisseurs avec leur téléphone. Vous pourrez les appeler ou leur commander par WhatsApp en un clic depuis l'application.",
    },
  ],
};

/* ──────────────────────────────────────────────────────────────────────────── */

/** Tous les tours, dans l'ordre logique d'apparition dans Réglages. */
export const TAB_TOURS: TabTour[] = [
  DASHBOARD_TOUR,
  SALES_TOUR,
  STOCK_TOUR,
  PATIENTS_TOUR,
  ORDONNANCES_TOUR,
  CARNET_TOUR,
  COMMANDES_TOUR,
  EXPIRATIONS_TOUR,
  MOUVEMENTS_TOUR,
  EQUIPE_TOUR,
  RAPPORTS_TOUR,
  FOURNISSEURS_TOUR,
];

/** Retourne le tour associé à un onglet, s'il existe. */
export function getTourForTab(tab: string): TabTour | undefined {
  return TAB_TOURS.find(t => t.tab === tab);
}
