/*
  # Rendre code_produit nullable dans stock_entries

  1. Changement
    - Modifier la colonne code_produit pour accepter NULL
    - Permet d'enregistrer du stock même sans code produit assigné
  
  2. Raison
    - Certains médicaments existants n'ont pas de code_produit
    - Le medication_id reste la référence principale
    - code_produit est utilisé pour faciliter la recherche mais n'est pas obligatoire
*/

-- Rendre la colonne code_produit nullable
ALTER TABLE stock_entries 
ALTER COLUMN code_produit DROP NOT NULL;
