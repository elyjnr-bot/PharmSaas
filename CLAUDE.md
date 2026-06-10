# JunglePharm — Instructions pour Claude

## Workflow de déploiement OBLIGATOIRE

À chaque fois que tu fais un déploiement, tu dois **toujours** suivre ces 5 étapes dans l'ordre :

### 1. Git commit (versionner)
```bash
git add <fichiers modifiés>
git commit -m "type: description courte\n\nDétails si nécessaire\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### 2. Build de production
```bash
npm run build
```

### 3. Déploiement Netlify (production)
```bash
npx netlify-cli deploy --prod --dir=dist \
  --site=b6c265b8-5633-48db-8eeb-5f270eb5490d \
  --auth=$NETLIFY_AUTH_TOKEN
```
> Le token est dans la variable d'environnement `NETLIFY_AUTH_TOKEN` (ne jamais le committer).

### 4. Push git (synchroniser le remote)
```bash
git push origin main
```

### 5. Relancer le serveur local (localhost)
```bash
npm run dev
```
Le serveur tourne sur **http://localhost:5176** (voir `.claude/launch.json`).

---

## Infos projet

- **URL production** : https://junglepharm.org
- **Netlify Site ID** : b6c265b8-5633-48db-8eeb-5f270eb5490d
- **Supabase** : https://psuqzlcxwuqnkssgasts.supabase.co
- **Stack** : React + TypeScript + Vite + Workbox PWA + Supabase

## Architecture mode unitaire

Deux flux stricts — NE PAS mélanger :

| Flux | Fichier | Code unitaire |
|------|---------|---------------|
| Import Excel | `ImportService.ts` | EAN du fichier (`resolveImportUnitCode`) |
| Manuel / réception | `writeService.ts` | `JP-XXXXXX` généré (`reserveUnitCodes`) |
