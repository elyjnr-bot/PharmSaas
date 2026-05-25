# Système Offline - JunglePharm

## Vue d'ensemble

L'application JunglePharm est maintenant totalement fonctionnelle hors ligne grâce à IndexedDB via Dexie.js.

## Architecture

### Base de données locale (IndexedDB)

La base de données `JunglePharmDB` contient 5 tables :

#### 1. **products** - Catalogue produits
- Stocke tous les médicaments du catalogue
- Synchronisé depuis Supabase quand en ligne
- Utilisé pour la recherche et le scan hors ligne
- Champs : id, name, dosage, price, quantity, barcode, expiry_date, etc.

#### 2. **sales** - Journal des ventes
- Enregistre chaque vente avec le flag `synced: false` par défaut
- Synchronisé automatiquement avec Supabase quand la connexion revient
- Permet de conserver toutes les ventes même hors ligne

#### 3. **cart** - Panier en cours
- Sauvegarde automatique du panier à chaque modification
- Restauration automatique au redémarrage de l'application
- Survit aux rafraîchissements de page et redémarrages

#### 4. **settings** - Paramètres
- Stocke les préférences utilisateur localement
- Format clé-valeur simple

#### 5. **syncQueue** - File de synchronisation
- Stocke les opérations en attente de synchronisation
- Retry automatique en cas d'échec

## Fonctionnement

### 1. Persistance du Stock

Quand l'application est en ligne :
- Les produits sont chargés depuis Supabase
- Ils sont automatiquement copiés dans IndexedDB
- La recherche et le scan utilisent les données en mémoire

Quand l'application est hors ligne :
- Les produits sont chargés depuis IndexedDB
- Toutes les fonctionnalités de recherche et scan continuent de fonctionner

### 2. Gestion des Ventes

Chaque vente est :
1. Enregistrée immédiatement dans IndexedDB avec `synced: false`
2. Envoyée à Supabase si en ligne
3. Marquée `synced: true` en cas de succès
4. Conservée en attente si hors ligne

### 3. Gestion du Panier

Le panier est :
- Sauvegardé automatiquement à chaque ajout/modification
- Restauré automatiquement au démarrage
- Vidé uniquement après validation de la vente

### 4. Synchronisation Différée

La synchronisation se fait :
- Automatiquement toutes les 30 secondes si en ligne
- Immédiatement quand la connexion revient
- Manuellement via le SyncIndicator

## Indicateur de Synchronisation

Le `SyncIndicator` dans le header affiche :

- 🟢 **Vert** - "Synchronisé" : Tout est à jour
- 🔵 **Bleu clignotant** - "Synchronisation..." : Synchronisation en cours
- 🟠 **Orange clignotant** - "X en attente" : Données non synchronisées
- 🔴 **Rouge** - "Hors ligne" : Pas de connexion internet

L'utilisateur peut cliquer sur l'indicateur orange pour forcer la synchronisation.

## Fichiers clés

- `src/lib/db.ts` - Configuration Dexie.js et définition des tables
- `src/lib/syncManager.ts` - Logique de synchronisation et hooks
- `src/lib/useMedications.ts` - Hook pour charger les médicaments avec support offline
- `src/components/SyncIndicator.tsx` - Indicateur visuel de synchronisation
- `src/lib/cartContext.tsx` - Gestion du panier avec persistance

## Avantages

1. **Fiabilité** : Aucune vente perdue même sans connexion
2. **Performance** : Recherche instantanée avec données locales
3. **UX** : Application toujours fonctionnelle
4. **Transparence** : L'utilisateur voit clairement l'état de synchronisation
