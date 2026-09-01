# Stockage des fichiers sur Cloudflare R2

Ce guide couvre uniquement ce que **vous** devez faire côté Cloudflare — tout
le reste (le pilote qui parle à R2, le choix entre disque local et R2, la
diffusion des fichiers publics) est déjà en place dans le code
(`R2StorageDriver`, `STORAGE_DRIVER`). Rien à coder, seulement à configurer.

## Ce qui existe déjà, pour comprendre ce que vous configurez

GeBook range ses fichiers en deux catégories :

- **Publics** — couvertures, photos d'auteur, logos de tenant. Diffusés à
  quiconque en visite le catalogue.
- **Privés** — les ouvrages numériques eux-mêmes (PDF). Jamais accessibles
  par une URL directe : ils ne sortent que via un contrôleur qui vérifie
  d'abord que le lecteur les a bien achetés.

Avec R2, les deux catégories vivent dans **un seul bucket**, sous deux
préfixes internes (`public/…` et `private/…`) que le code gère lui-même. Le
bucket peut — et doit — rester **entièrement privé** côté Cloudflare : GeBook
ne s'appuie jamais sur un accès public au bucket lui-même, même pour les
fichiers « publics ». C'est toujours l'API GeBook qui sert le fichier
(après l'avoir récupéré sur R2), jamais R2 directement au navigateur. Ça
simplifie la configuration (pas de domaine personnalisé à brancher sur le
bucket, pas de bascule « Public Access » à activer) et ça garde le contrôle
entier côté GeBook.

## 1. Créer le bucket

1. Dans le tableau de bord Cloudflare, ouvrez **R2 Object Storage**.
2. **Create bucket** → donnez-lui un nom (ex. `gebook-storage`). La région
   par défaut convient.
3. Ne touchez à aucun réglage d'accès public — le bucket reste privé.

## 2. Créer un jeton d'API R2

1. Toujours dans **R2 Object Storage** → **Manage API Tokens** (ou
   **{ } API** selon la version de l'interface).
2. **Create API Token**.
3. Permissions : **Object Read & Write**.
4. Portée : limitez-le au bucket créé à l'étape 1 si l'interface le propose
   — inutile de donner accès à d'autres buckets.
5. Validez. Cloudflare affiche alors, **une seule fois** :
   - un **Access Key ID**,
   - un **Secret Access Key**.

   Copiez les deux immédiatement — le secret ne sera plus jamais réaffiché
   (seul un nouveau jeton pourrait en produire un autre).

## 3. Retrouver votre Account ID

Dans le tableau de bord Cloudflare, la barre latérale de n'importe quelle
page R2 affiche l'**Account ID** (une chaîne hexadécimale). C'est la même
valeur que celle utilisée pour construire l'URL de l'API S3-compatible de
R2 — vous n'avez qu'à la copier, GeBook construit cette URL lui-même.

## 4. Renseigner les variables

Cinq variables au total, toutes documentées avec leur exemple dans
`backend/.env.example` (développement local) et `.env.docker.example`
(Dokploy) :

| Variable                | Valeur                                      |
| ------------------------ | -------------------------------------------- |
| `STORAGE_DRIVER`         | `r2`                                        |
| `R2_ACCOUNT_ID`          | L'Account ID de l'étape 3                   |
| `R2_ACCESS_KEY_ID`       | L'Access Key ID de l'étape 2                |
| `R2_SECRET_ACCESS_KEY`   | Le Secret Access Key de l'étape 2           |
| `R2_BUCKET`              | Le nom du bucket créé à l'étape 1           |

**En production (Dokploy)** : onglet *Environment* de l'application, puis
redéployez.

**En local**, si vous voulez tester R2 sans passer par Docker : ajoutez ces
cinq lignes à `backend/.env`, puis relancez `pnpm dev`. Sans elles (ou avec
`STORAGE_DRIVER=local`, la valeur par défaut), rien ne change — le disque
local continue de servir, exactement comme avant ce guide.

## 5. Vérifier que ça fonctionne

Après redémarrage :

1. Téléversez une couverture ou une photo d'auteur depuis le back-office.
2. Elle doit s'afficher normalement sur le site — si `STORAGE_DRIVER=r2`
   est actif, ce fichier est déjà sur R2, pas sur le disque du serveur.
3. Dans le tableau de bord Cloudflare (**R2** → votre bucket → **Objects**),
   vous devriez voir apparaître un objet sous `public/covers/…` ou
   `public/authors/…`.

Si le démarrage du serveur échoue avec un message mentionnant
`STORAGE_DRIVER=r2 exige …`, une des quatre variables `R2_*` est absente ou
vide — GeBook refuse délibérément de démarrer à moitié configuré plutôt que
de laisser échouer le premier téléversement en silence.

## À savoir

- **Aucun coût de sortie (egress)** chez R2, contrairement à S3 — c'est
  l'argument principal de Cloudflare pour ce service. Le niveau gratuit
  couvre 10 Go de stockage et un volume confortable d'opérations pour un
  catalogue qui démarre.
- **Basculer de local vers R2 (ou l'inverse) ne migre rien automatiquement.**
  Les fichiers déjà sur disque local restent sur disque, ceux déjà sur R2
  restent sur R2 — seuls les *nouveaux* téléversements suivent le pilote
  actif au moment où ils sont faits. Une migration des fichiers existants
  d'un pilote à l'autre, si elle devient nécessaire un jour, est un travail
  séparé, non couvert ici.
- Le SDK AWS officiel (`@aws-sdk/client-s3`) parle à R2 via son API
  compatible S3 — aucun compte AWS n'est nécessaire, seulement les
  identifiants R2 ci-dessus.
