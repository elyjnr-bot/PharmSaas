# API JunglePharm — Chatbot WhatsApp

Documentation complète de l'API sécurisée pour intégration chatbot WhatsApp.

---

## 🔐 Authentification

Toutes les requêtes nécessitent une **clé API unique** passée dans le header `X-API-Key`.

```bash
X-API-Key: votre_cle_api_secrete
```

Les clés API :
- Sont **unique par utilisateur** (pharmacie)
- Peuvent être **désactivées** sans suppression
- Tracent la **dernière utilisation** pour audit
- Sont **hashées** en base de données (jamais stockées en plaintext)

### Créer une clé API

Les clés API doivent être générées depuis l'interface JunglePharm (future fonctionnalité).

**Format de clé** : 48 caractères alphanumériques
```
sk_live_VOTRE_CLE_API_ICI_PLACEHOLDER
```

---

## 📋 Endpoints

### 1. Consulter le Stock d'un Produit

**Endpoint :**
```
GET /chatbot-api/stock?q={nom_ou_code_ean}
```

**Headers :**
```
X-API-Key: sk_live_xxxxx
Content-Type: application/json
```

**Paramètres :**

| Param | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `q` | string | Oui | Nom du produit ou code EAN (code-barres) |

**Exemples de requête :**

```bash
# Par nom de produit
curl -X GET "https://votre-instance.supabase.co/functions/v1/chatbot-api/stock?q=Paracetamol" \
  -H "X-API-Key: sk_live_xxxxx"

# Par code EAN
curl -X GET "https://votre-instance.supabase.co/functions/v1/chatbot-api/stock?q=3664492810089" \
  -H "X-API-Key: sk_live_xxxxx"
```

**Réponse Succès (200) :**
```json
{
  "success": true,
  "data": {
    "product_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Paracetamol 500mg",
    "ean_code": "3664492810089",
    "total_quantity": 45,
    "unit_quantity": 12,
    "expiry_date": "2026-12-31"
  }
}
```

**Réponse Erreur (404) :**
```json
{
  "success": false,
  "error": "Produit non trouvé"
}
```

**Codes de réponse :**

| Code | Signification |
|------|---------------|
| `200` | Succès — Stock trouvé |
| `400` | Paramètre `q` manquant |
| `401` | Clé API manquante |
| `403` | Clé API invalide ou inactive |
| `404` | Produit non trouvé |

---

### 2. Récupérer le Prix d'un Produit

**Endpoint :**
```
GET /chatbot-api/price?q={nom_ou_code_ean}
```

**Headers :**
```
X-API-Key: sk_live_xxxxx
Content-Type: application/json
```

**Paramètres :**

| Param | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `q` | string | Oui | Nom du produit ou code EAN (code-barres) |

**Exemples de requête :**

```bash
# Par nom de produit
curl -X GET "https://votre-instance.supabase.co/functions/v1/chatbot-api/price?q=Paracetamol" \
  -H "X-API-Key: sk_live_xxxxx"

# Par code EAN
curl -X GET "https://votre-instance.supabase.co/functions/v1/chatbot-api/price?q=3664492810089" \
  -H "X-API-Key: sk_live_xxxxx"
```

**Réponse Succès (200) :**
```json
{
  "success": true,
  "data": {
    "product_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Paracetamol 500mg",
    "price_public": 2500,
    "price_cession": 1800
  }
}
```

**Réponse Erreur (404) :**
```json
{
  "success": false,
  "error": "Produit non trouvé"
}
```

**Champs de réponse :**

| Champ | Type | Description |
|-------|------|-------------|
| `product_id` | UUID | Identifiant unique du produit |
| `name` | string | Nom commercial du produit |
| `price_public` | number | Prix de vente public (FCFA) |
| `price_cession` | number ⚠️ | Prix de cession (peut être null) |

---

## 🔒 Sécurité

### Bonnes pratiques

1. **Stockez la clé API en variable d'environnement**
   ```
   JUNGLEPHARM_API_KEY=sk_live_xxxxx
   ```

2. **Ne commitez JAMAIS votre clé API**
   ```
   # .gitignore
   .env
   .env.local
   ```

3. **Régénérez la clé en cas de compromission**
   - Via l'interface JunglePharm : Paramètres → Clés API
   - Vieilles clés : désactivées automatiquement

4. **Utilisez HTTPS uniquement**
   - Les requêtes en HTTP sont rejetées
   - L'URL est sécurisée par défaut

5. **Rate limiting (à venir)**
   - 1000 requêtes/jour par clé API
   - Contacter support pour augmentation

### Audit & Logs

- **Chaque appel API est enregistré**
- **`last_used_at`** : Dernière utilisation de la clé
- **Accessible depuis l'interface** (future fonctionnalité)

---

## 💻 Exemples d'intégration

### JavaScript / Node.js

```javascript
const JUNGLEPHARM_URL = "https://votre-instance.supabase.co/functions/v1";
const API_KEY = process.env.JUNGLEPHARM_API_KEY;

async function getProductStock(query) {
  const response = await fetch(
    `${JUNGLEPHARM_URL}/chatbot-api/stock?q=${encodeURIComponent(query)}`,
    {
      headers: {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

async function getProductPrice(query) {
  const response = await fetch(
    `${JUNGLEPHARM_URL}/chatbot-api/price?q=${encodeURIComponent(query)}`,
    {
      headers: {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Utilisation
(async () => {
  try {
    const stock = await getProductStock("Paracetamol");
    console.log("Stock:", stock.data);

    const price = await getProductPrice("Paracetamol");
    console.log("Prix:", price.data);
  } catch (error) {
    console.error(error.message);
  }
})();
```

### Python

```python
import os
import requests

JUNGLEPHARM_URL = "https://votre-instance.supabase.co/functions/v1"
API_KEY = os.getenv("JUNGLEPHARM_API_KEY")

def get_product_stock(query):
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
    }
    response = requests.get(
        f"{JUNGLEPHARM_URL}/chatbot-api/stock",
        params={"q": query},
        headers=headers
    )
    response.raise_for_status()
    return response.json()

def get_product_price(query):
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
    }
    response = requests.get(
        f"{JUNGLEPHARM_URL}/chatbot-api/price",
        params={"q": query},
        headers=headers
    )
    response.raise_for_status()
    return response.json()

# Utilisation
try:
    stock = get_product_stock("Paracetamol")
    print("Stock:", stock["data"])

    price = get_product_price("Paracetamol")
    print("Prix:", price["data"])
except Exception as e:
    print(f"Erreur: {e}")
```

### cURL

```bash
# Consulter le stock
curl -X GET \
  "https://votre-instance.supabase.co/functions/v1/chatbot-api/stock?q=Paracetamol" \
  -H "X-API-Key: sk_live_xxxxx" \
  -H "Content-Type: application/json"

# Récupérer le prix
curl -X GET \
  "https://votre-instance.supabase.co/functions/v1/chatbot-api/price?q=Paracetamol" \
  -H "X-API-Key: sk_live_xxxxx" \
  -H "Content-Type: application/json"
```

---

## 🛠️ Dépannage

### "Clé API requise"
```json
{
  "success": false,
  "error": "Clé API requise (header X-API-Key)"
}
```
**Solution** : Ajoutez le header `X-API-Key` à votre requête.

### "Clé API invalide"
```json
{
  "success": false,
  "error": "Clé API invalide"
}
```
**Solutions** :
- Vérifiez que la clé est correcte
- Vérifiez que la clé n'a pas été révoquée
- Régénérez une nouvelle clé si compromission suspectée

### "Produit non trouvé"
```json
{
  "success": false,
  "error": "Produit non trouvé"
}
```
**Solutions** :
- Vérifiez l'orthographe du nom du produit
- Vérifiez que le code EAN est correct
- Vérifiez que le produit existe dans votre stock

### "Paramètre 'q' manquant"
```json
{
  "success": false,
  "error": "Paramètre 'q' (nom ou code EAN) requis"
}
```
**Solution** : Ajoutez le paramètre `?q=...` à l'URL.

---

## 📊 Modèle de données

### Produit (Medication)
```
{
  id: UUID
  user_id: UUID (propriétaire de la pharmacie)
  name: string (nom commercial)
  code_produit: string (code EAN/barcode)
  price_public: number (prix de vente)
  price_cession: number | null (coût d'achat)
  expiry_date: string (ISO 8601)
  quantity: number (stock total)
  inventory_units: Unit[] (unités individuelles)
}
```

### Unité (Inventory Unit)
```
{
  id: UUID
  medication_id: UUID
  status: "available" | "sold" | "expired"
  unit_code: string
  entry_date: string
  supplier: string | null
}
```

---

## 🚀 Évolutions futures

- [ ] Support des commandes (endpoint POST `/chatbot-api/order`)
- [ ] Rate limiting par clé API
- [ ] Webhooks pour changements de stock
- [ ] Export des historiques d'API
- [ ] Support du pagination pour requêtes massives

---

## 📞 Support

Pour toute question, contactez : **support@junglepharm.cg**

**Version API** : 1.0  
**Dernière mise à jour** : 2026-04-22
