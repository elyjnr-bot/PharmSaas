# Système de Pont par le Nom (Barcode Matching)

## Vue d'ensemble

Le système de pont par le nom permet de lier automatiquement des codes-barres inconnus à des produits existants en utilisant la correspondance de noms (fuzzy matching).

## Fonctionnement

### 1. Indexation

La table `products` dans IndexedDB est indexée sur plusieurs colonnes :
- `id` (clé primaire)
- `barcode` (recherche rapide par code-barres)
- `code_produit` (recherche par code produit)
- `name` (recherche rapide par nom)
- `expiry_date` (tri par date d'expiration)

### 2. Table barcode_links

Une nouvelle table `barcode_links` stocke les associations manuelles entre codes-barres et produits :

```typescript
interface BarcodeLink {
  barcode: string;           // Code-barres scanné
  product_id: string;        // ID du produit lié
  product_name: string;      // Nom du produit (pour référence)
  match_score: number;       // Score de correspondance (0-1)
  created_at: string;        // Date de création
  synced: boolean;           // État de synchronisation avec le cloud
}
```

### 3. Correspondance Fuzzy (Fuzzy Matching)

L'algorithme de matching utilise la distance de Levenshtein pour calculer un score de similarité entre deux chaînes :

- **Score = 1.0** : Correspondance exacte
- **Score ≥ 0.8** : Correspondance forte (recommandée pour liaison automatique)
- **Score < 0.8** : Correspondance faible (nécessite validation manuelle)

#### Algorithme

1. **Normalisation** : Conversion en minuscules
2. **Correspondance exacte** : Si les noms sont identiques → score 1.0
3. **Préfixe** : Si le nom contient le terme recherché au début → score 0.85-1.0
4. **Distance de Levenshtein** : Calcul de la similarité → score 0-1.0

### 4. Workflow de Liaison

Quand un code-barres inconnu est scanné :

1. **Recherche dans barcode_links** : Vérifie si une liaison existe déjà
2. **Si trouvé** : Retourne le produit lié
3. **Si non trouvé** : Ouvre la modal de liaison avec suggestions

#### Modal de Liaison

La modal `LinkBarcodeModal` permet de :
- Rechercher un produit par nom (avec ou sans connexion internet)
- Afficher les correspondances fuzzy avec leur score
- Mettre en évidence les correspondances ≥ 80% avec badge vert
- Lier manuellement le code-barres au produit sélectionné

### 5. Synchronisation

Les liaisons sont :
1. **Sauvegardées immédiatement** dans IndexedDB avec `synced: false`
2. **Synchronisées automatiquement** avec Supabase quand la connexion revient
3. **Marquées `synced: true`** après envoi réussi au serveur

## Import Excel Pro

Le composant `CSVImport` propose deux modes :

### Mode Simple

Un seul fichier avec colonnes :
- **Designation** (ou Nom, Libelle) : Nom du produit
- **Stock** (ou Quantité, Qte) : Quantité en stock
- **Prix** (ou PrixVente, PV) : Prix de vente

Colonnes optionnelles :
- Fournisseur
- FormeProduit
- NameRayon

**Avantages** :
- Import rapide et simple
- Idéal pour catalogues basiques
- Codes produits générés automatiquement

### Mode Complet

Deux fichiers :
1. **Fichier Stock** : Catalogue produits (CodeProduit, Designation, Prix...)
2. **Fichier Codes-barres** : Associations codes-barres → CodeProduit

**Avantages** :
- Liaison automatique des codes-barres
- Support des lots et dates d'expiration
- Gestion précise des quantités

## API Fonctions

### Recherche par Nom

```typescript
// Recherche simple (contient)
const results = await searchProductsByName("Doliprane", 10);

// Recherche fuzzy avec score
const fuzzyResults = await findProductByNameFuzzy("Doliprne", 0.8);
// Retourne: [{ product, score: 0.89 }, ...]
```

### Liaison Barcode → Produit

```typescript
await linkBarcodeToProduct(
  barcode: "3400123456789",
  productId: "uuid-123",
  productName: "Doliprane 1000mg",
  matchScore: 0.92
);
```

### Récupération par Barcode

```typescript
const product = await getProductByBarcode("3400123456789");
```

## Exemples d'Utilisation

### Scan d'un code-barres inconnu

1. L'utilisateur scanne un code non reconnu
2. Le système cherche dans `barcode_links`
3. Si non trouvé, ouvre la modal de liaison
4. L'utilisateur tape le nom du produit
5. Le système affiche les correspondances avec scores
6. Les produits avec score ≥ 80% sont mis en évidence
7. L'utilisateur sélectionne le bon produit
8. La liaison est sauvegardée localement puis synchronisée

### Import de catalogue simple

1. L'utilisateur sélectionne "Mode Simple"
2. Importe un fichier Excel avec : Designation, Stock, Prix
3. Le système crée automatiquement les produits
4. Les codes produits sont générés automatiquement
5. Les produits sont disponibles immédiatement pour la vente

## Avantages

1. **Pas de connexion requise** : Fonctionne totalement hors ligne
2. **Correspondance intelligente** : Suggère automatiquement les meilleurs matches
3. **Apprentissage progressif** : Plus on lie de codes-barres, plus la base est complète
4. **Synchronisation automatique** : Les liaisons sont envoyées au cloud dès que possible
5. **Import flexible** : Support de deux modes d'import selon les besoins
