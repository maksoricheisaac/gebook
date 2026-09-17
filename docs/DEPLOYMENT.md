# Déploiement — production et staging

Deux piles Docker Compose distinctes, chacune autonome.

## Production — Dokploy

Fichier : `docker-compose.yml`, à la racine.

Dokploy place Traefik devant les conteneurs et termine TLS lui-même (Let's
Encrypt). Les domaines et secrets se renseignent dans l'onglet « Environment »
de l'application Dokploy — voir `.env.docker.example` pour la liste complète,
commentée.

Avant tout déploiement, vérifier que Compose interpole correctement les
variables (repère une variable manquante ou mal orthographiée avant qu'elle
ne casse un déploiement réel) :

```sh
docker compose -f docker-compose.yml config
```

`docker-compose.local.yml` (surcouche) sert uniquement à vérifier que les
trois images se construisent et démarrent — jamais à s'y connecter, voir son
en-tête.

## Staging — serveur classique (hors Dokploy)

Fichier : `docker-compose.staging.yml`, à la racine. Autonome (pas une
surcouche de `docker-compose.yml`) : il inclut son propre reverse proxy
(Caddy, TLS automatique via Let's Encrypt), pour un serveur qui n'a pas
Dokploy/Traefik devant lui.

1. Pointer deux sous-domaines (A) vers ce serveur : un pour le frontend, un
   pour l'API (voir `STAGING_FRONTEND_DOMAIN`/`STAGING_BACKEND_DOMAIN`).
2. Copier `.env.staging.example` vers `.env`, à côté de
   `docker-compose.staging.yml`, et le compléter (domaines, secrets, adresse
   e-mail du compte Let's Encrypt, identifiants Cloudflare R2/Turnstile —
   voir les commentaires du fichier).
3. Vérifier la configuration avant de démarrer :
   ```sh
   docker compose -f docker-compose.staging.yml config
   ```
4. Démarrer :
   ```sh
   docker compose -f docker-compose.staging.yml up -d --build
   ```

Différences volontaires avec la prod, toutes documentées dans
`docker-compose.staging.yml` :
- Reverse proxy Caddy plutôt que Traefik/Dokploy (`docker/caddy/Caddyfile`).
- `PAYMENT_ENV` forcé à `sandbox`, quelle que soit la configuration fournie —
  le staging ne doit jamais pouvoir encaisser un paiement réel.
- Nom de projet (`gebook-staging`) et volumes distincts de la prod : les deux
  piles peuvent coexister sur la même machine sans collision.
- `RUN_SEED=true` par défaut (données de démonstration utiles pour explorer
  un staging fraîchement déployé), contre `false` recommandé en prod une fois
  le vrai catalogue en place.

`NODE_ENV=production` reste actif des deux côtés (backend et frontend), comme
en prod : c'est ce qui fait que le staging reproduit fidèlement le
comportement de sécurité réel (cookie de session `__Host-…`, qui exige HTTPS
— d'où le reverse proxy Caddy plutôt que de simples ports publiés en clair).

## Commun aux deux piles

- Le rôle PostgreSQL applicatif (`docker/postgres/init/01-app-role.sh`,
  partagé par les deux fichiers) est la condition dont dépend toute
  l'isolation multi-tenant (RLS) — ne jamais le contourner ni connecter l'API
  avec le rôle superuser.
- Stockage des fichiers : Cloudflare R2 par défaut sur les deux piles
  (`STORAGE_DRIVER=r2`) — voir `docs/STORAGE_R2_SETUP.md`.
- CAPTCHA (Cloudflare Turnstile) : obligatoire sur les deux piles, le
  démarrage du backend refuse la clé de test publique de Cloudflare dès que
  `NODE_ENV=production`.
