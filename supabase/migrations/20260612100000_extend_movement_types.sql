/*
  # Étendre les types de mouvement de stock autorisés

  ## Problème
  InventoryRowActions.tsx utilise 'ajustement_entree' et 'ajustement_sortie'
  mais ces valeurs n'étaient pas dans le CHECK constraint de la table.
  Résultat : tous les ajustements rapides depuis l'inventaire échouaient
  silencieusement (constraint violation catchée sans message).

  ## Fix
  Supprimer l'ancienne contrainte CHECK et la remplacer par une version
  étendue incluant les deux types d'ajustement.
*/

ALTER TABLE stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
    CHECK (movement_type IN (
      'reception_bl',
      'vente',
      'retour_client',
      'inventaire',
      'perte',
      'peremption',
      'casse',
      'ajustement_entree',
      'ajustement_sortie'
    ));

NOTIFY pgrst, 'reload schema';
