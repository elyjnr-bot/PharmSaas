# Configuration de l'Authentification

## Vue d'ensemble

L'application dispose maintenant de deux rôles utilisateur :
- **Vendeur (staff)** : Accès limité aux fonctionnalités de vente et de stock
- **Gérant (manager)** : Accès complet incluant les analytics, rapports financiers et gestion des dépenses

## Créer le premier utilisateur gérant

Pour créer votre premier compte gérant, suivez ces étapes :

### 1. Inscription initiale

L'application nécessite une authentification. Pour créer le premier compte, vous devez utiliser la console Supabase :

1. Allez sur https://app.supabase.com
2. Sélectionnez votre projet
3. Dans le menu de gauche, cliquez sur "Authentication" → "Users"
4. Cliquez sur "Add user" → "Create new user"
5. Remplissez :
   - Email : votre@email.com
   - Password : choisissez un mot de passe sécurisé
   - Confirm email : Oui

### 2. Promouvoir l'utilisateur en gérant

Par défaut, tous les nouveaux utilisateurs sont créés avec le rôle "staff". Pour promouvoir un utilisateur en gérant :

1. Dans Supabase, allez dans "SQL Editor"
2. Exécutez cette requête SQL (remplacez l'email) :

```sql
UPDATE user_profiles
SET role = 'manager'
WHERE email = 'votre@email.com';
```

3. Vérifiez que la mise à jour a fonctionné :

```sql
SELECT * FROM user_profiles WHERE email = 'votre@email.com';
```

### 3. Connexion

Une fois votre compte créé et promu en gérant, vous pouvez vous connecter à l'application avec vos identifiants.

## Créer des comptes vendeurs

Pour créer des comptes vendeurs pour votre personnel :

1. Créez les utilisateurs via la console Supabase (même processus que ci-dessus)
2. Ils seront automatiquement créés avec le rôle "staff" (vendeur)
3. Pas besoin de modification SQL pour les vendeurs

## Différences entre les rôles

### Vendeur (Staff)
- Tableau de bord simplifié
- Effectuer des ventes
- Gérer le stock
- Scanner des produits
- Voir ses paramètres

### Gérant (Manager)
- Dashboard Analytics avec :
  - Chiffre d'affaires (jour/semaine/mois)
  - Montant en caisse par méthode de paiement
  - Ruptures de stock critiques
  - Top ventes
  - Journal des dépenses
- Toutes les fonctionnalités vendeur
- Gestion complète des dépenses
- Accès aux rapports financiers

## Sécurité

- Les mots de passe sont hashés par Supabase
- Row Level Security (RLS) est activé sur toutes les tables
- Les utilisateurs ne peuvent accéder qu'à leurs propres données de profil
- Les données sensibles (analytics, finances) ne sont accessibles qu'aux gérants

## Support

En cas de problème avec l'authentification :
1. Vérifiez que les variables d'environnement Supabase sont correctement configurées
2. Assurez-vous que RLS est activé sur toutes les tables
3. Vérifiez que le rôle de l'utilisateur est correctement défini dans `user_profiles`
