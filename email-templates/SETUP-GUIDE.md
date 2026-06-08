# 📧 Configuration des emails personnalisés JunglePharm

Guide pas-à-pas pour que vos utilisateurs reçoivent des emails depuis **noreply@junglepharm.org** au lieu de Supabase.

---

## 🎯 Plan en 3 phases

| Phase | Durée | Difficulté |
|-------|-------|------------|
| 1. Créer compte Resend + obtenir clé API | 5 min | ⭐ Facile |
| 2. Vérifier le domaine junglepharm.org (DNS Netlify) | 15 min | ⭐⭐ Moyen |
| 3. Configurer Supabase SMTP + templates | 10 min | ⭐ Facile |

**Total : ~30 minutes** pour une configuration définitive.

---

## 📦 Phase 1 — Compte Resend (gratuit, 100 emails/jour)

### Étape 1.1
Aller sur **https://resend.com** → "Sign up"
- S'inscrire avec ton email
- Confirmer l'email reçu

### Étape 1.2
Une fois connecté, dans le dashboard :
- Cliquer **"Add Domain"** (en haut à droite)
- Entrer **`junglepharm.org`**
- Choisir la région **EU (Frankfurt)** pour latence Afrique optimale
- Cliquer "Add"

### Étape 1.3
Resend te montre **3 enregistrements DNS** à ajouter. Note-les pour la Phase 2 :

```
Type    Name                    Value                                Priority
MX      send                    feedback-smtp.eu-west-1.amazonses.com  10
TXT     send                    "v=spf1 include:amazonses.com ~all"
TXT     resend._domainkey       p=MIGfMA0GCSq... (clé DKIM longue)
```

*Note : ton interface Resend te donnera les valeurs exactes à copier.*

### Étape 1.4
Aller dans **API Keys** (menu de gauche) :
- Cliquer "Create API Key"
- Nom : `JunglePharm Production`
- Permission : **Full access**
- Cliquer "Add"
- **⚠️ COPIER LA CLÉ IMMÉDIATEMENT** (format : `re_xxxxxxxxxxx`)
- La garder précieusement (tu en auras besoin Phase 3)

---

## 🌐 Phase 2 — DNS sur Netlify

### Étape 2.1
Aller sur **https://app.netlify.com** → ton site JunglePharm
- Menu **Domain settings** (ou Domain management)
- Onglet **DNS**

### Étape 2.2
Pour **chaque** des 3 enregistrements de la Phase 1.3, cliquer **"Add new record"** :

**Record 1 : MX**
- Record type : `MX`
- Name : `send`
- Value : `feedback-smtp.eu-west-1.amazonses.com`
- Priority : `10`
- TTL : 3600
- → Save

**Record 2 : SPF (TXT)**
- Record type : `TXT`
- Name : `send`
- Value : `v=spf1 include:amazonses.com ~all`
- TTL : 3600
- → Save

**Record 3 : DKIM (TXT)**
- Record type : `TXT`
- Name : `resend._domainkey`
- Value : la longue clé `p=MIGfMA0GCSq...` copiée depuis Resend
- TTL : 3600
- → Save

### Étape 2.3
Retourner sur **Resend → Domains → junglepharm.org**
- Cliquer **"Verify DNS Records"**
- Attendre 5-15 minutes (propagation DNS)
- Quand les 3 records passent **✅ Verified** → la phase 2 est OK

### Étape 2.4 (optionnel mais recommandé)
Ajouter aussi un **DMARC** pour la délivrabilité maximale :
- Record type : `TXT`
- Name : `_dmarc`
- Value : `v=DMARC1; p=none; rua=mailto:postmaster@junglepharm.org`

---

## ⚙️ Phase 3 — Configurer Supabase

### Étape 3.1 — SMTP

Aller sur **https://supabase.com/dashboard/project/psuqzlcxwuqnkssgasts**

**Project Settings → Authentication → SMTP Settings**

Activer le toggle **"Enable Custom SMTP"** et remplir :

| Champ | Valeur |
|-------|--------|
| **Sender email** | `noreply@junglepharm.org` |
| **Sender name** | `JunglePharm` |
| **Host** | `smtp.resend.com` |
| **Port** | `587` |
| **Username** | `resend` |
| **Password** | la clé API copiée à l'étape 1.4 (`re_xxxxxxxxxxx`) |
| **Minimum interval** | `60` (secondes — anti-spam) |

→ Cliquer **Save**

### Étape 3.2 — Templates

Aller dans **Authentication → Email Templates**

Pour chacun des 4 templates :

1. **Confirm signup**
   - Subject : `🌿 Bienvenue sur JunglePharm — Confirmez votre inscription`
   - Body : **copier-coller** le contenu de `01-confirm-signup.html`

2. **Magic Link**
   - Subject : `🔑 Votre lien de connexion JunglePharm`
   - Body : **copier-coller** le contenu de `02-magic-link.html`

3. **Reset Password**
   - Subject : `🌿 Réinitialisation de votre mot de passe JunglePharm`
   - Body : **copier-coller** le contenu de `03-reset-password.html`

4. **Change Email Address**
   - Subject : `📧 Confirmez votre nouvelle adresse email JunglePharm`
   - Body : **copier-coller** le contenu de `04-change-email.html`

→ **Save** pour chacun

---

## ✅ Phase 4 — Test

1. Aller sur https://junglepharm.org → Créer un compte de test avec une **vraie adresse**
2. Vérifier la réception du mail :
   - **De :** `JunglePharm <noreply@junglepharm.org>` ✅
   - **Sujet :** `🌿 Bienvenue sur JunglePharm — Confirmez votre inscription` ✅
   - **Contenu :** logo + design JunglePharm + version FR + version EN ✅

3. Si le mail arrive bien → 🎉 Configuration terminée !

---

## 🐛 Dépannage

### Le mail n'arrive jamais
- Vérifier les **logs Resend** : Dashboard → Logs (tu y vois chaque envoi avec statut)
- Vérifier que DNS est bien **Verified** chez Resend
- Vérifier les **logs Supabase** : Project → Logs → Auth

### Le mail arrive dans les **spams**
- C'est normal au début (réputation domaine neuve)
- Ajouter le DMARC (étape 2.4) améliore beaucoup
- Demander à 2-3 testeurs de marquer "Pas spam" → la réputation augmente vite

### Variables dans le template (`{{ .Email }}`, `{{ .ConfirmationURL }}`)
- Ces variables sont automatiquement remplacées par Supabase au moment de l'envoi
- **Ne pas les modifier**, copier-coller le HTML tel quel
- Variables disponibles selon le template :
  - `{{ .Email }}` — email du destinataire
  - `{{ .ConfirmationURL }}` — lien de confirmation/connexion
  - `{{ .NewEmail }}` — nouvel email (template "change email")
  - `{{ .SiteURL }}` — URL du site (configurable dans Supabase)

---

## 📊 Limites du plan gratuit Resend

| Métrique | Limite gratuite |
|----------|----------------|
| Emails par jour | 100 |
| Emails par mois | 3 000 |
| Domaines | 1 |
| Logs conservés | 3 jours |

**Pour passer au-delà :** plan Pro Resend = **$20/mois** = 50 000 emails/mois.

À ce stade tu seras déjà rentable avec ta pharmacie 😉.

---

## 🚀 Bonus — Statistiques d'ouverture

Resend te donne **gratuitement** les stats par email :
- Combien d'utilisateurs ouvrent le mail de bienvenue ?
- Combien cliquent sur "Confirmer mon inscription" ?

Visible dans **Resend Dashboard → Emails**.

Utile pour mesurer l'engagement de tes nouveaux utilisateurs.
