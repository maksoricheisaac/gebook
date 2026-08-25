# GeBook — nouvelle stack

Reconstruction de GeBook sur Next.js, NestJS et PostgreSQL, à partir du modèle métier
décrit dans [`AUDIT.md`](../AUDIT.md). Ce document explique comment démarrer et
travailler sur le projet ; l'audit reste la référence pour le **pourquoi** de chaque
décision d'architecture.

## Architecture

```text
new_stack/
├── backend/     API NestJS + Prisma + PostgreSQL
└── frontend/    Next.js (App Router, Server Components par défaut)
```

Le flux de données est toujours le même, sans exception :

```text
PostgreSQL → Prisma → service NestJS → API HTTP → Next.js → écran
```

Aucune donnée métier n'est écrite en dur dans le code. Les données de développement
vivent uniquement dans `backend/prisma/seed.ts`.

Les deux applications sont **indépendantes** : chacune a son `package.json` et son
verrou de dépendances. Un espace de travail commun (et un éventuel `packages/shared`)
sera introduit le jour où du code sera réellement partagé — pas avant.

## Prérequis

- Node.js 24 ou supérieur ;
- pnpm 10 ;
- PostgreSQL 16 ou supérieur.

## Démarrage

### 1. Base de données

Créer une base PostgreSQL vide, puis renseigner `DATABASE_URL` dans `backend/.env`.

### 2. Backend

```bash
cd new_stack/backend
cp .env.example .env        # puis adapter les valeurs
pnpm install
pnpm db:generate            # génère le client Prisma
pnpm db:migrate             # applique les migrations
pnpm db:seed                # données de référence et catalogue de démonstration
pnpm start:dev              # http://localhost:3001
```

Vérification : `curl http://localhost:3001/health` doit répondre
`{"status":"ok","database":"up",…}`.

### 3. Frontend

```bash
cd new_stack/frontend
cp .env.example .env.local
pnpm install
pnpm dev                    # http://localhost:3000
```

## Variables d'environnement

Toutes les variables du backend sont **validées au démarrage** : une valeur manquante
ou invalide empêche l'API de démarrer, plutôt que de la laisser tourner à moitié
configurée. Le démarrage est également refusé si `APP_DEBUG` est actif alors que
`NODE_ENV` vaut `production`.

| Application | Variable | Rôle |
|---|---|---|
| backend | `NODE_ENV` | `development`, `test` ou `production` |
| backend | `PORT` | Port d'écoute de l'API (3001 par défaut) |
| backend | `DATABASE_URL` | Chaîne de connexion PostgreSQL |
| backend | `CORS_ORIGINS` | Origines autorisées, séparées par des virgules — jamais `*` |
| backend | `APP_DEBUG` | Traces détaillées, interdit en production |
| backend | `PAYMENT_WEBHOOK_SECRET` | Secret de signature des notifications de paiement (32 caractères minimum) |
| frontend | `NEXT_PUBLIC_API_URL` | URL de l'API NestJS |

`PAYMENT_WEBHOOK_SECRET` possède une valeur de développement par défaut, pour que le
prestataire de simulation fonctionne sans configuration. Le démarrage en production
est refusé tant qu'elle n'a pas été remplacée.

`.env` et `.env.local` ne sont jamais versionnés. Seuls les `.env.example` le sont, et
ils ne contiennent que des valeurs factices.

## Base de données

Le schéma transpose fidèlement les 20 tables de `database/schema.sql` (MySQL) vers
PostgreSQL. Les points à ne pas perdre de vue sont commentés directement dans
`backend/prisma/schema.prisma`.

Deux écarts assumés par rapport au SQL d'origine, tous deux documentés dans le schéma :

- les clés primaires sont des **UUID v7** plutôt que des entiers séquentiels ;
- `payments` reçoit une **clé d'idempotence** propre à GeBook.

### Migrations

Les migrations sont la seule source de vérité de l'évolution de la base. `db push`
n'est pas utilisé.

```bash
pnpm db:migrate             # développement : crée et applique une migration
pnpm db:deploy              # production : applique les migrations existantes
```

Certaines garanties n'ont pas d'équivalent Prisma et sont écrites à la main dans
`prisma/migrations/*_check_constraints/migration.sql` : les **8 contraintes `CHECK`**
qui protègent l'intégrité financière (montants positifs, quantité strictement
positive, plafond des commissions en pourcentage). Elles ne doivent jamais être
supprimées sans décision métier explicite.

### Seed

```bash
pnpm db:seed
```

Idempotent : il peut être relancé sans rien dupliquer. Il installe les données de
référence (3 rôles, 5 catégories, 3 prestataires de paiement, 9 réglages, 1 règle de
commission) et un catalogue de démonstration (2 auteurs, 6 œuvres, 15 formats), dont
une œuvre volontairement laissée en brouillon pour vérifier qu'elle reste invisible
du public.

Aucun compte utilisateur n'est créé.

## Paiements

Le cœur de l'application ne connaît aucun prestataire : il ne manipule que
l'interface `PaymentDriver` (`backend/src/modules/payments/payment-driver.ts`).
Ajouter un prestataire consiste à écrire une classe et à l'enregistrer dans
`PaymentsModule` — aucun autre fichier ne change.

Un prestataire n'est proposé au lecteur que s'il est **actif en base** *et* qu'un
pilote existe dans l'API. Aujourd'hui, seul le prestataire de simulation (`fake`)
remplit les deux conditions ; `chariow` reste inactif tant que son pilote n'est pas
écrit. Le prestataire retenu par défaut est le réglage `default_payment_provider`,
modifiable par un administrateur sans redéploiement.

### Notifications

```text
POST /webhooks/:providerCode        corps brut, ni cookie ni en-tête Origin
```

La séquence suit l'audit §33, dans cet ordre exact :

1. le pilote analyse le corps **brut** et vérifie la signature HMAC en temps
   constant, ainsi qu'une fenêtre d'horodatage de 5 minutes contre le rejeu ;
2. l'événement est enregistré dans `payment_events` **avant tout traitement**, même
   lorsque la signature est invalide — c'est la seule façon de diagnostiquer une
   attaque ou une panne du prestataire ;
3. l'idempotence vient de la contrainte unique `(payment_provider_id, event_id)`,
   jamais d'une vérification applicative : elle seule est atomique. Un conflit
   `P2002` est traité comme un succès et répond `200` ;
4. le montant notifié est comparé au montant attendu ; un écart est refusé ;
5. paiement, commande, accès du lecteur et événement changent dans **une seule
   transaction**, ou pas du tout.

### Remboursement

```text
POST /admin/orders/:id/refund       administrateur uniquement
```

Un remboursement n'est **pas** un changement de statut : il rend les fonds chez le
prestataire, puis retire au lecteur l'accès qu'il avait acquis. Les trois écritures
— paiement `refunded`, commande `refunded`, droits d'accès `revoked` — vont ensemble
ou pas du tout.

L'accès est **révoqué, jamais supprimé** : la commande et ses instantanés de prix
restent lisibles pour la comptabilité et le service client (règles n° 6 et 18). Pour
la même raison, `PATCH /admin/orders/:id/status` **refuse** le statut `refunded` —
l'accepter laisserait une commande remboursée sur le papier, paiement encore
confirmé et lecteur toujours servi.

Le remboursement exige que le prestataire le gère, à la fois dans son pilote
(`capabilities.supportsRefund`) et dans la base (`payment_providers.supports_refund`,
qu'un administrateur peut retirer sans redéploiement). Seul le remboursement
**intégral** est géré : un montant partiel change la répartition auteur, sujet de la
phase 10.

### Paiement simulé

En développement, le règlement se déclenche depuis la page de commande. La
simulation produit une **vraie notification signée** qui emprunte le chemin de
vérification habituel : rien n'est marqué comme payé par raccourci. L'endpoint
correspondant est refusé lorsque `NODE_ENV` vaut `production`, et n'accepte que le
pilote factice.

## Tests

```bash
# Backend
pnpm test                   # tests unitaires
pnpm test:e2e               # tests d'API (nécessite la base)

# Frontend
pnpm typecheck
```

Les tests s'écrivent avec le code, jamais après — en particulier pour les commissions
et les paiements, où ils doivent précéder l'implémentation.

Les tests d'API tournent avec un délai de 30 s (`testTimeout` dans
`test/jest-e2e.json`) et non les 5 s par défaut de Jest : leur mise en place démarre
l'application puis inscrit plusieurs comptes, et argon2 est lent par conception.
Avec huit suites en parallèle, le délai par défaut échouait sans qu'aucun code ne
soit en cause.

## Qualité

Une fonctionnalité n'est terminée que lorsque ces quatre commandes passent :

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

La CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) exécute exactement
ces vérifications sur les deux applications, plus les migrations et le seed.

## Commissions et revenus auteurs

```text
GET    /authors/me/revenue          revenus cumulés de l'auteur connecté
GET    /authors/me/sales            détail de ses ventes
GET    /admin/commission-rules      administration des règles
POST   /admin/commission-rules
PATCH  /admin/commission-rules/:id
DELETE /admin/commission-rules/:id
GET    /admin/statistics            chiffres du tableau de bord, comptés en base
```

### La formule

Elle n'était écrite nulle part dans le projet d'origine — c'est le manque que
l'audit qualifie de risque critique R-03. Elle vit désormais en tête de
[`commission.ts`](backend/src/modules/commissions/commission.ts), en fonctions
pures sans accès à la base, et chaque montant des tests est calculé à la main
depuis cette formule.

Pour une ligne de commande :

```text
montantBrut      = order_items.line_total            instantané figé (règle 6)
fraisPrestataire = part de la ligne, au prorata de son montant
netApresFrais    = montantBrut − fraisPrestataire

base             = gross_amount → montantBrut
                   after_provider_fee → netApresFrais       (règle 16)

commission       = pourcentage : base × valeur / 100
                   fixe        : valeur × quantité
commission       = min(commission, netApresFrais)           plafond
partAuteur       = netApresFrais − commission
```

Trois décisions explicites : la **commission fixe est prélevée par exemplaire**,
elle est **plafonnée au net** — sans quoi la part auteur deviendrait négative, ce
que la contrainte `CHECK` refuse — et **sans règle applicable, rien n'est
prélevé**. Les frais du prestataire, facturés une fois pour la commande entière,
sont répartis au prorata des lignes ; la dernière absorbe l'écart d'arrondi, pour
que la somme des parts égale exactement les frais facturés.

Une règle propre à un auteur l'emporte sur la règle générale ; à portée égale, la
plus récemment entrée en vigueur s'applique.

### Les montants sont figés

Le figeage a lieu **dans la transaction du paiement** : une vente confirmée sans
répartition serait une erreur comptable. `sale_distributions` stocke les montants
calculés, jamais une référence à recalculer — changer une règle ne touche donc
aucune vente passée (règle 13), et supprimer la règle laisse les montants intacts
grâce au `ON DELETE SET NULL` (règle 14). L'unicité de `order_item_id` interdit
une seconde répartition sur la même ligne (règle 15).

L'interface d'administration le dit explicitement, parce que c'est le point sur
lequel un administrateur peut se tromper : croire qu'il corrige le passé.

## Bibliothèque et téléchargement

```text
GET /library                             bibliothèque du lecteur connecté
GET /library/:id/download                ouvrage acheté, après contrôles
GET /works/:slug/formats/:id/sample      extrait gratuit, public
```

Le droit d'accès vient de `reader_library` et **de nulle part ailleurs** : la
requête de téléchargement ne joint jamais `orders` (règle n° 17). Un remboursement
révoque l'accès sans toucher à l'historique de commande, et le refus est immédiat.

Chaque téléchargement traverse la séquence de l'audit §34 : propriété du lecteur,
statut d'accès, date d'expiration, quota `download_limit` (`0` = illimité), puis
journalisation dans `downloads` avant diffusion. L'empreinte `sha256` enregistrée au
téléversement est recalculée à l'envoi : un fichier corrompu sur le disque est
signalé plutôt que livré.

Le fichier part en `Content-Disposition: attachment` avec `Cache-Control:
private, no-store`, sous un nom dérivé du titre — jamais le nom aléatoire du disque.

**Aucun fichier privé n'est joignable par URL.** `storage/private` n'est raccordé à
aucune route statique : seul `storage/public` (couvertures, photos d'auteur) l'est.
Vérifié sur un serveur réellement démarré, `/public/<couverture>` répond 200 tandis
que tout chemin vers `storage/private` répond 404, y compris avec remontée de
dossier encodée.

Les extraits (`sample`) suivent le même chemin contrôlé, sans contrôle de propriété
mais derrière une limitation par adresse IP. Ils se téléversent par la route
d'administration existante, avec le champ `fileType=sample`.

Côté frontend, `/bibliotheque` liste les ouvrages du lecteur et le téléchargement
passe par `app/api/library/[id]/download`. Ce relais ne décide rien — ni propriété,
ni quota, ni statut : il transmet la session, parce qu'un lien pointant directement
vers l'API ne porterait pas le cookie `httpOnly` posé sur l'origine du frontend. Un
refus de l'API ramène le lecteur sur sa bibliothèque, qui affiche le motif à jour
plutôt qu'une réponse JSON brute.

## Conventions

- **Anglais technique, français utilisateur.** Classes, méthodes, tables et colonnes
  en anglais ; URL, libellés, messages d'erreur et documentation en français. Cette
  règle vient de la version PHP, où elle était appliquée sans exception.
- **URL publiques en français** (`/livres/{slug}`), **API en anglais** (`/works/:slug`).
- Les commentaires expliquent le **pourquoi**, jamais le **quoi** : le typage
  TypeScript se charge du reste.
- Pas de couche `repositories/` au-dessus de Prisma, pas de module par table.

## Sécurité — règles non négociables

- `passwordHash` et `storagePath` n'apparaissent dans **aucun** DTO de réponse ;
- aucune trace d'exception ne sort dans une réponse HTTP ;
- les fichiers privés des œuvres ne sont jamais placés dans `frontend/public/` ni
  servis par une URL statique ;
- le droit d'accès à un livre vient de `reader_library`, jamais de `orders` ;
- les webhooks de paiement sont vérifiés, enregistrés avant traitement, et rendus
  idempotents par la contrainte unique de la base.
