/*
  # Migration du stock existant vers le système d'entrées unitaires

  1. Objectif
    - Migrer toutes les quantités existantes dans medications vers stock_entries
    - Créer une ligne par unité pour suivre individuellement chaque produit
    - Préserver les informations de lot et date de péremption
  
  2. Processus
    - Pour chaque medication avec quantity > 0
    - Créer quantity lignes dans stock_entries
    - Utiliser le code_produit (peut être NULL), batch_number et expiry_date
    - Définir entry_date à la date de création du médicament
  
  3. Impact
    - 28 médicaments avec 413 unités totales à migrer
    - Permet le suivi unitaire FIFO pour les ventes futures
*/

-- Insérer les entrées de stock basées sur les quantités actuelles
INSERT INTO stock_entries (medication_id, code_produit, entry_date, batch_number, expiry_date, is_sold, created_at)
SELECT 
  m.id,
  m.code_produit,
  COALESCE(m.created_at::date, CURRENT_DATE) as entry_date,
  m.batch_number,
  m.expiry_date,
  false,
  NOW()
FROM medications m
CROSS JOIN generate_series(1, GREATEST(m.quantity, 0)) as series
WHERE m.quantity > 0;
