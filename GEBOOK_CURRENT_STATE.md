# GeBook — État actuel du projet (audit du 2026-08-29)

Audit technique et fonctionnel en lecture seule. Aucune modification de code, de schéma, de route ou de permission n'a été effectuée pendant cet audit. Commit de référence : `2a5ddce` (« chore: divers ajustements de configuration et ports »), branche `main`.

Méthode : lecture directe du code source (backend NestJS, frontend Next.js, migrations Prisma/SQL, tests), pas de confiance aveugle dans la documentation existante. Le document `docs/AUDIT_V2_MULTI_TENANT.md` (daté du 2026-08-23) décrit un **plan proposé** à un instant donné — une bonne partie a depuis été implémentée, et cet audit distingue explicitement ce qui est réellement dans le code aujourd'hui de ce qui était seulement proposé. Chaque affirmation ci-dessous s'appuie sur une référence `fichier:ligne` vérifiée.

---

## 0. Résumé exécutif

GeBook est nettement plus avancé que ne le laisse penser `docs/AUDIT_V2_MULTI_TENANT.md`, qui est aujourd'hui **obsolète** sur plusieurs points majeurs :

- Le multi-tenant n'est **pas** juste préparé dans le schéma : la création d'espace en self-service, l'appartenance multi-tenant, les rôles par tenant et la **Row-Level Security PostgreSQL** sont réellement implémentés et itérés (plusieurs migrations correctives).
- Mais une régression **critique** a été introduite dans le dernier commit (`2a5ddce`) : le script d'initialisation Docker qui crée le rôle Postgres applicatif restreint (`gebook_user`, sans `BYPASSRLS`) a été **supprimé sans remplacement**. Sans ce rôle, `FORCE ROW LEVEL SECURITY` — le mécanisme dont dépend toute l'isolation multi-tenant au niveau base de données — n'est plus garanti sur un déploiement neuf. Voir §4.G.
- Le moteur commercial (commandes, paiements, webhooks, remboursements, commissions) est solide et transactionnel, mais **il n'existe aucun mécanisme de reversement (payout) aux auteurs** — c'est de la plomberie d'affichage autour d'un statut qui reste éternellement `pending`.
- Le seul prestataire de paiement réellement actif est un simulateur de développement (`fake`). Chariow et MTN Mobile Money existent en base de données (seed, statut `inactive`) mais **aucune classe de pilote n'existe** pour eux.
- Le workflow de publication éditoriale (`submitted → under_review → approved → published/rejected`) est modélisé dans l'enum mais **jamais utilisé** : le frontend ne propose même pas ces statuts, et rien ne les fait transiter côté backend.

---

## 1. Architecture

```text
Frontend   Next.js 16 (App Router), React 19, TanStack Query, Tailwind v4, shadcn/radix — frontend/
Backend    NestJS 11 + Prisma 7 (adapter-pg) — backend/
Database   PostgreSQL, accès direct (pas de Supabase), RLS PostgreSQL native — backend/prisma/
Auth       Maison : sessions serveur opaques (table `sessions`), cookie httpOnly, argon2 — backend/src/modules/auth/
Authz      RolesGuard (rôles globaux) + TenantAccessGuard/RLS (rôles par tenant) — backend/src/modules/{auth,tenants}/
Storage    StorageDriver (interface) + LocalStorageDriver (disque local) — backend/src/modules/files/
Payments   PaymentDriver (interface) + PaymentDriverRegistry + FakePaymentDriver (seul pilote réel) — backend/src/modules/payments/
Email      Aucun service d'e-mail trouvé nulle part dans le dépôt
Other      ActivityLogService (journal, partiel) ; SampleThrottleService (throttle en mémoire, non partagé)
```

Aucune dépendance `@supabase/*` dans le dépôt (vérifié dans les deux `package.json`). Flux de données : `PostgreSQL → Prisma → service NestJS → API HTTP → Next.js → écran`.

**Communication frontend ↔ backend** (`frontend/src/lib/api.ts`, `admin-api.ts`, `account-api.ts`, `proxy.ts`) :
- Côté serveur (Server Components / Server Actions), le frontend appelle directement `NEXT_PUBLIC_API_URL` avec le cookie de session relayé manuellement (`apiFetch()`).
- Côté client, aucun appel direct à l'API NestJS : tout passe par des routes proxy Next.js same-origin (`/api/admin/*`, `/api/account/*`, `/api/library/[id]/download`, `/api/media/*`) qui relaient le cookie httpOnly côté serveur — nécessaire car frontend et API sont deux origines distinctes en production, et un cookie posé directement par l'API serait tiers-partie côté navigateur.
- Les mutations qui doivent poser le cookie de session (login, register, achat, paiement) passent par des **Server Actions** (`auth-actions.ts`, `order-actions.ts`, `payment-actions.ts`, `tenant-actions.ts`), qui relisent le `Set-Cookie` de la réponse API et le re-posent elles-mêmes en premier-parti httpOnly sur l'origine Next.js.
- `frontend/proxy.ts` est en réalité le `middleware.ts` renommé de Next.js 16 : il fait un contrôle rapide (cookie présent/absent) sur `/mon-espace`, `/auteur`, `/admin`, sans jamais lui-même valider la session — la validation réelle passe par `requireUser`/`requireRole`/`requireAdminAccess` (`src/lib/auth.ts`), qui interrogent `/auth/me`.
- Un second cookie non-httpOnly, `gebook_active_tenant`, mémorise le tenant actif choisi côté UI — il n'est **jamais** traité comme une preuve d'autorisation (revalidé côté serveur à chaque requête tenant-scopée), seulement comme un indice d'affichage.

---

## 2. Authentification et utilisateurs

Module : `backend/src/modules/auth/`.

- **Inscription** — `POST /auth/register` (`auth.controller.ts:45-62` → `auth.service.ts:43-105`). Mot de passe haché en argon2. Tout nouveau compte reçoit automatiquement et uniquement le rôle global **`reader`** (`auth.service.ts:33,79-95`) — l'inscription publique ne peut jamais produire un rôle `admin`/`author`.
- **Connexion** — `POST /auth/login` (`auth.service.ts:107-150`), throttle double-clé (email + IP, 5 tentatives/15 min, `login-throttle.service.ts:16-59`), message d'erreur identique que le compte existe ou non (anti-énumération).
- **Sessions** — table `sessions`, jeton opaque 32 octets, seul le hachage SHA-256 est stocké (`session.service.ts:25,104-106`) — une fuite de base ne suffit pas à rejouer une session. Cookie `__Host-gebook_session` (prod) / `gebook_session` (dev), `httpOnly`, `sameSite=lax`, `Secure` en prod, TTL 30 jours.
- **Rôles globaux** (`Role`/`UserRole`, seedés : `reader`, `author`, `admin`) — vérifiés par `RolesGuard` (`guards/roles.guard.ts:18-44`) contre `request.user.roles`, un seul rôle correspondant suffit.
- **Protection des routes** — `AuthGuard` (par route), `OriginGuard` **global** (`guards/origin.guard.ts:27-57`, enregistré via `APP_GUARD`) qui bloque toute requête non-GET dont l'en-tête `Origin` n'est pas dans `CORS_ORIGINS` — c'est la défense CSRF du projet (pas de jeton CSRF dédié, protection par `sameSite=lax` + contrôle d'Origin).
- **Superadmin** — rôle global `admin`. Bootstrap unique via `backend/src/modules/setup/` : `GET /setup/status` (public) et `POST /setup/superadmin` protégé par un `SETUP_TOKEN` comparé en temps constant, définitivement fermé dès qu'un rôle `admin` existe (double vérification en transaction contre les races, `setup.service.ts:76-80,121-129,166-175`).
- **Ce qu'un `admin` (superadmin plateforme) peut faire de plus** : accès aux routes globales `@Roles('admin')` (paiements, commandes, commissions, catégories) ; dans tout module tenant-scopé, `TenantContextService.resolve()` traite `roles.includes('admin')` comme `isPlatformAdmin: true` (`tenant-context.service.ts:30`), ce qui lui permet de choisir n'importe quel tenant existant sans en être membre, et chaque politique RLS contient un `OR app_is_platform_admin()` — il voit et écrit partout, systématiquement.
- Il n'existe **pas** de `PlatformRolesGuard`/`TenantRolesGuard` distincts comme le proposait `docs/AUDIT_V2_MULTI_TENANT.md` — la distinction existe mais autrement : `RolesGuard` (rôles globaux, routes plateforme) coexiste avec `TenantAccessGuard` (routes tenant, qui délègue le détail des rôles à la RLS plutôt que de le dupliquer en application).

---

## 3. Multi-tenant

**C'est la partie la plus avancée et la plus divergente de la documentation existante.** Modules : `backend/src/modules/tenants/`, contexte RLS dans `backend/src/prisma/`.

### A. Un utilisateur peut-il appartenir à plusieurs tenants ?
**Oui**, fonctionnellement. `TenantMember` a une contrainte `@@unique([tenantId, userId])` (`schema.prisma:315`) — un utilisateur a au plus une ligne par tenant, mais peut avoir des lignes dans plusieurs tenants. `TenantsService.listMemberships()` (`tenants.service.ts:73-87`) liste toutes les adhésions.

### B/C. Qui peut créer un tenant ?
**N'importe quel utilisateur authentifié**, sans distinction de rôle global. `POST /tenants` n'est protégé que par `AuthGuard` (`tenants.controller.ts:34-57`). Un simple `reader` peut créer son espace.

### D. Qui devient OWNER ?
Le créateur, automatiquement, dans la même transaction que la création du tenant (`tenants.service.ts:40-46`, `role: 'owner', status: 'active'`). Le cookie tenant-actif est posé immédiatement, l'utilisateur atterrit directement sur un `/admin` fonctionnel.

### E. Rôles au niveau tenant
Enum `TenantMemberRole` : `owner, admin, editor, author, marketing, finance, viewer` (`schema.prisma:99-109`). Réellement vérifiés à **deux niveaux** : application (`tenant-context.ts:24-39` — `TENANT_CATALOG_WRITE_ROLES`, `TENANT_MANAGEMENT_ROLES`, `TENANT_FINANCE_ROLES`, utilisés notamment dans `team.service.ts` pour empêcher l'auto-élévation) et base de données (chaque politique RLS teste `app_is_tenant_member(tenant_id, ARRAY[...])`).

### F. Sélection / changement de tenant
Cookie `gebook_active_tenant` (non-httpOnly, jamais utilisé comme preuve d'autorisation — toujours revalidé côté serveur contre les vraies lignes `TenantMember`). Résolution par requête : `TenantContextService.resolve()` (`tenant-context.service.ts:26-73`), appelé par `TenantAccessGuard`. Route de changement : `POST /tenants/me/active` (revalidée, `tenants.service.ts:96-110`).

`LEGACY_SINGLE_TENANT_ID` (`modules/tenants/legacy-tenant.ts:15`) — présenté dans son propre commentaire comme un point de rattachement **temporaire** censé disparaître une fois la Phase 5 (TenantContext) livrée — est **toujours utilisé** en réalité : `admin-authors.service.ts:180` s'en sert de repli quand un platform admin crée un auteur sans tenant actif sélectionné. N'a pas été confirmé ailleurs (p. ex. `admin-works.service.ts`) faute de temps d'audit exhaustif.

### G. Isolation réelle des données — RLS PostgreSQL
**Oui, implémentée et itérée**, contrairement à ce qu'affirme `docs/AUDIT_V2_MULTI_TENANT.md` (« Aucune RLS actuellement », ligne 22 — obsolète). Migration `20260823020000_add_rls_policies` (552 lignes) active `ENABLE ROW LEVEL SECURITY` **et** `FORCE ROW LEVEL SECURITY` sur 13 tables (`tenants, tenant_members, tenant_settings, authors, works, work_formats, work_files, order_items, orders, payments, payment_events, sale_distributions, activity_logs`), plus `work_translations`/`author_translations` ajoutées dans une migration ultérieure (15 tables au total). Trois fonctions SQL (`app_current_tenant_id()`, `app_current_user_id()`, `app_is_platform_admin()`) lisent des GUC de session posées par `PrismaService.applyRlsContext()` (`backend/src/prisma/prisma.service.ts:67-93`) via `set_config(..., is_local => true)`, **scopées à la transaction**.

Cinq migrations correctives ultérieures (`fix_orders_rls_recursion`, `orders_payments_delete_policies`, `fix_orders_update_policy`, `sale_distributions_delete_policy`, `order_items_author_visibility`, `tenant_members_owner_bootstrap`) montrent que ce mécanisme a été testé contre de vrais bugs (dont une récursion infinie de politique entre `orders` et `order_items`, corrigée en dénormalisant `order_number` sur `order_items`).

**⚠️ Régression critique découverte dans le commit HEAD (`2a5ddce`).** `docker-compose.yml`/`.env.docker.example` exigent que l'application se connecte avec un rôle Postgres restreint (`gebook_user`, `NOSUPERUSER NOBYPASSRLS`), créé par un script monté dans `docker-entrypoint-initdb.d` (`./docker/postgres/init`). **Ce script (`docker/postgres/init/01-app-role.sh`) a été supprimé dans le commit `2a5ddce` sans remplacement** (`git show 2a5ddce --stat` confirme `delete mode 100755`), et le répertoire `docker/` n'existe plus du tout dans le dépôt. Sans ce rôle, soit le conteneur `database` échoue à démarrer (montage d'un chemin hôte inexistant), soit `gebook_user` n'est jamais créé — dans les deux cas, **le mécanisme dont dépend `FORCE ROW LEVEL SECURITY` n'est plus garanti sur un déploiement neuf**, ce qui contredit directement les commentaires du code (`prisma/rls-context.ts`, `prisma.service.ts`) et la propre recommandation de `docs/AUDIT_V2_MULTI_TENANT.md` (ligne 276). Non vérifié en exécution (audit en lecture seule) — mais l'absence du fichier est un fait établi par `git`.

**Double filet, mais un trou confirmé côté application.** La plupart des services tenant-scopés filtrent aussi par `tenantId` dans leurs clauses `where` (ex. `admin-works.service.ts:177,207`). Mais `AdminWorksService.findOne()` (`admin-works.service.ts:236-244`) fait `tx.work.findUnique({ where: { id } })` **sans filtre `tenantId`** — sa correction dépend à 100 % de la RLS étant réellement active, ce qui aggrave l'impact de la régression ci-dessus.

### H. Endroits où un utilisateur pourrait accéder à un autre tenant
Dans le code tel qu'écrit, et **si la RLS fonctionne**, aucune fuite confirmée sur les modules audités (auth, tenants, catalogue admin, commandes, paiements, commissions, bibliothèque). Le risque concret identifié est celui de §G : la combinaison « régression du rôle DB + requêtes `findUnique` sans filtre applicatif » rend cette isolation **entièrement dépendante d'une pièce d'infrastructure actuellement absente du dépôt**.

Par ailleurs, `admin/categories` reste protégé par `@Roles('admin')`/`RolesGuard` **global**, pas par `TenantAccessGuard` — les catégories sont une ressource plateforme partagée entre tenants (pas de `tenantId` en base), ce qui semble être un choix délibéré plutôt qu'un oubli (catalogue de taxonomie global), mais le code ne le documente pas explicitement.

### I. Le multi-tenant est-il réellement fonctionnel de bout en bout ?
**Oui pour le parcours cœur** : inscription → `/creer-un-espace` → devient OWNER → atterrit sur `/admin` avec un Tenant Dashboard fonctionnel (statistiques, branding, équipe). Vérifié à la fois côté backend (routes réelles) et côté frontend (formulaire → Server Action → redirection). Sous réserve de la régression §G pour la garantie d'isolation en production.

### Routes tenant

| Route | Accès | Fonction | Statut |
|---|---|---|---|
| `POST /tenants` | Auth (tout utilisateur) | Création tenant, créateur devient OWNER | FONCTIONNEL |
| `GET /tenants/me` | Auth | Liste des adhésions | FONCTIONNEL |
| `POST /tenants/me/active` | Auth | Changer de tenant actif (revalidé) | FONCTIONNEL |
| `POST /tenants/me/active/clear` | Auth | Effacer le tenant actif | FONCTIONNEL |
| `GET/PATCH /admin/tenant` | Auth + TenantAccessGuard | Profil/branding du tenant | FONCTIONNEL |
| `GET /admin/tenant/statistics` | idem | Tableau de bord tenant | FONCTIONNEL |
| `POST /admin/tenant/logo`, `/cover` | idem | Upload branding | FONCTIONNEL |
| `GET/POST/PATCH/DELETE /admin/team` | idem | Gestion de l'équipe | **PARTIEL** — voir §6 |
| `GET/POST/PATCH/DELETE /admin/authors`, `/admin/works` | idem | Catalogue tenant | FONCTIONNEL (RLS) |
| `admin/categories/*` | `@Roles('admin')` global | Catégories | Plateforme uniquement, pas tenant-scopé |

---

## 4. Parcours lecteur

```text
Inscription (POST /auth/register) → FONCTIONNEL, rôle reader auto-assigné
Connexion (POST /auth/login) → FONCTIONNEL, throttle actif
/mon-espace → FONCTIONNEL, résumé commandes/bibliothèque, lien vers /admin ou /creer-un-espace
/livres, /livres/[slug] → FONCTIONNEL, catalogue public, filtres, JSON-LD
Achat → POST /orders → FONCTIONNEL, pas de panier persistant (achat direct, 1 à N lignes en un appel)
Commande → /paiement/[orderNumber] → UI fonctionnelle, paiement réel désactivé (voir §10)
Bibliothèque → /bibliotheque → FONCTIONNEL, GET /library
Accès au contenu → /api/library/[id]/download → FONCTIONNEL, contrôles complets (voir §9)
```

Aucun problème fonctionnel détecté sur ce parcours, hormis le paiement réel désactivé (comportement voulu, cf. §10) et une page marketing (`/a-propos`) au contenu obsolète (annonce la bibliothèque comme « à venir » alors qu'elle est pleinement fonctionnelle).

---

## 5. Parcours auteur / éditeur

Deux surfaces parallèles coexistent :

1. **Auteur tenant-scopé** (le modèle actuel) : un membre du tenant avec rôle `owner/admin/editor` peut créer/modifier des `Author` (y compris des auteurs « fantômes » sans compte utilisateur — `userId` nullable) et des `Work` via `/admin/oeuvres`, `/admin/auteurs`. Un membre avec le rôle tenant `author` ne peut modifier que les œuvres liées à son propre profil auteur (`assertCanWriteWork`, `admin-works.service.ts:101-123`).
2. **Auteur à rôle global** (`/auteur/tableau-de-bord`) : gardé par le rôle global `author` (pas par une adhésion tenant), lit `/authors/me/revenue` et `/authors/me/sales`. C'est un modèle plus ancien, encore vivant en parallèle du modèle tenant — duplication architecturale à noter, pas un bug.

**Workflow de publication — PARTIEL, pas de vraie machine à états.** `assertAllowedStatus()` (`admin-works.service.ts:132-150`) ne restreint que le rôle `author` (auteur-lui-même) à `[draft, submitted]`. Pour tout rôle éditorial (owner/admin/editor, ou platform admin), **n'importe quelle valeur** de `WorkStatus` peut être posée dans n'importe quel ordre — aucune vérification de transition. Les statuts `under_review`, `approved`, `rejected` existent dans l'enum mais ne sont **jamais** lus ni écrits par le code applicatif, et sont absents du sélecteur frontend (`frontend/src/lib/work-status.ts`, `work-editor.tsx`). Le workflow réellement pratiqué est `draft → submitted → (editorial) published/inactive/archived`, pas la chaîne complète modélisée.

**`WorkVisibility` — stockée mais non appliquée.** `visibility` est dérivée mécaniquement de `status` (`visibilityForStatus()`, `admin-works.service.ts:75-84` : published→public, sinon→private) ; le catalogue public ne lit **jamais** ce champ (`works.service.ts:29-32` ne filtre que par `status`/`author.status`), et n'agrège pas non plus par `tenantId` — tout travail publié + auteur actif est visible globalement, quel que soit `tenantId`. `tenant_only` est donc actuellement **inutilisable en pratique**, un état explicitement reconnu dans un commentaire de code (« Phase 9 » à venir).

**Formats, fichiers, couverture** — CRUD complet et fonctionnel (`WorkFormat`, `WorkFile`), un format par type imposé uniquement par une contrainte unique en base (pas de pré-vérification applicative). Upload de fichiers avec détection MIME réelle (magic bytes), plafond de taille configurable, empreinte SHA-256 vérifiée à chaque lecture. Les types de fichier `cover`/`supplement` existent dans l'enum mais ne sont jamais utilisés (les couvertures passent par un champ/endpoint dédié).

**Catégories** — modèle global (pas de `tenantId`), hiérarchie parent/enfant présente côté API (`parentId`) mais **absente de l'interface** (`category-manager.tsx` n'expose jamais `parentId`) : API fonctionnelle, UI absente sur ce point précis.

---

## 6. Création d'un tenant — parcours « Créer mon espace »

**Ce parcours existe et est réellement testé** :

```text
Lecteur connecté → /creer-un-espace (page, requireUser) → CreateWorkspaceForm
   → Server Action createTenantAction → POST /tenants
   → Tenant créé + créateur = TenantMember(role=owner, status=active)
   → cookie gebook_active_tenant posé
   → redirect("/admin")
   → /admin détecte l'adhésion → TenantDashboard fonctionnel
```
Aucun élément manquant identifié sur ce parcours précis (hors la régression RLS de §3.G, qui affecte l'isolation, pas l'existence du parcours).

**Point faible attenant** : la fonctionnalité « inviter un membre » (`POST /admin/team`) n'implémente pas réellement une invitation — `TeamService.invite()` (`team.service.ts:100-116`) exige que la personne cible ait déjà un compte GeBook et l'ajoute **immédiatement** avec `status: 'active'`. Le statut `TenantMemberStatus.invited` existe dans le schéma mais n'est **jamais utilisé** par le code — pas d'état « en attente », pas d'e-mail, pas d'étape d'acceptation. PARTIEL par rapport à ce que « invitation » suggère.

---

## 7. Dashboards et administration

### Superadmin (`admin` global)
- `/admin` → `PlatformDashboard` (statistiques plateforme, tout tenant confondu)
- `GET /admin/statistics`, `/admin/statistics/timeseries` — chiffres calculés en direct depuis la base (agrégats Prisma/SQL brut), pas de cache
- Gestion globale : catégories, commandes (toutes), paiements, remboursements, règles de commission — toutes `@Roles('admin')`
- Peut sélectionner et administrer n'importe quel tenant existant (bypass RLS)
- Bootstrap superadmin unique (`/configuration-initiale`)

### Tenant OWNER / ADMIN
- `/admin` → `TenantDashboard` (statistiques du tenant : œuvres publiées, auteurs actifs, ventes, revenus, commissions, `pendingPayout`)
- Gestion : œuvres, auteurs, équipe (owner/admin peuvent gérer les rôles), paramètres/branding du tenant
- `FINANCE`(owner/admin/finance) peut voir les statistiques financières du tenant

### Auteur / éditeur (rôle tenant `author`, ou rôle global `author`)
- Peut créer/modifier ses propres œuvres (si rôle tenant `author`)
- Peut consulter ses propres revenus/ventes (`/authors/me/revenue`, `/authors/me/sales`) — scellé côté serveur (jamais un `authorId` fourni par le client)
- Ne peut pas gérer l'équipe, les paramètres tenant, ni les catégories

### Lecteur
- `/mon-espace` : résumé commandes + bibliothèque
- Peut créer un tenant (devient alors OWNER de ce nouveau tenant)
- Aucun accès administratif tant qu'il n'a pas d'adhésion tenant ni de rôle global `admin`

---

## 8. Œuvres (modèle `Work`)

Voir détails complets en §5. Résumé du modèle : `tenantId` (dénormalisé depuis l'auteur), `authorId`, `categoryId` (optionnel), statut (`WorkStatus`, 8 valeurs dont 3 mortes en pratique), visibilité (`WorkVisibility`, stockée mais non appliquée), métadonnées complètes (ISBN, pages, année/date de publication, édition, table des matières — toutes exposées publiquement), formats multiples avec prix/stock/livraison propres, fichiers (plein/extrait) avec contrôle MIME et somme de contrôle. Traductions FR/EN fonctionnelles pour œuvres, auteurs et catégories.

**Éléments prévus dans le schéma mais non utilisés par l'application** :
- `WorkStatus.under_review`, `.approved`, `.rejected`
- `WorkVisibility` (toutes les valeurs, écrites mécaniquement, jamais lues en lecture)
- `FileType.cover`, `.supplement`
- `Category.parentId`/hiérarchie (API oui, UI non)
- `TenantSetting` (modèle entier, jamais lu ni écrit — voir §12)
- `ActivityLog.tenantId` (colonne nullable existe, jamais renseignée par le code applicatif)

---

## 9. Commandes et paiements

**Pas d'entité panier.** `POST /orders` (`orders.controller.ts:32-39`) crée directement une commande avec 1 à N lignes (`CreateOrderDto.items`, min 1). L'API est architecturalement multi-lignes, mais le frontend n'envoie aujourd'hui qu'un item à la fois (« Acheter maintenant ») — aucune UI de panier n'existe.

**Instantanés figés réels** : `orders.service.ts:290-337` copie titre, nom d'auteur, prix unitaire, total de ligne au moment de l'achat — rien ne les recalcule ensuite. `OrderItem.tenantId` est dénormalisé par ligne (pas sur `Order`), ce qui permet réellement à une commande de contenir des lignes de plusieurs tenants — décision confirmée implémentée, pas seulement proposée.

**Machine à états des commandes — réelle et appliquée.** `ALLOWED_TRANSITIONS` (`order-status.ts:11-25`) est vérifiée à chaque changement de statut (admin, webhook, remboursement). Un seul statut spécial est explicitement bloqué en écriture directe : `refunded` (doit passer par `/admin/orders/:id/refund`).

**⚠️ Incohérence trouvée** : `awaiting_payment → paid` reste une transition légale via `PATCH /admin/orders/:id/status`, atteignable par un admin sans paiement réel. Ce chemin ne déclenche **ni** l'octroi d'accès bibliothèque **ni** le gel des commissions (ces deux effets ne se produisent que dans `PaymentsService.applyOutcome()`, déclenché uniquement par un webhook réel). Intention non confirmée par le code (peut-être un override manuel volontaire pour règlement hors-ligne) — signalé comme IMPORTANT.

**Paiements — architecture multi-prestataires réelle, un seul prestataire opérationnel.**
- Interface `PaymentDriver` + `PaymentDriverRegistry`, un seul pilote enregistré : `FakePaymentDriver` (simulateur de développement), avec vraie signature HMAC-SHA256, comparaison en temps constant, fenêtre anti-rejeu de 300 s.
- `chariow` et `mtn_momo` existent en tant que lignes `PaymentProvider` (statut `inactive`) dans le seed, **mais aucune classe de pilote n'existe** pour eux nulle part dans le dépôt — absence totale, pas juste inactive.
- Webhook (`POST /webhooks/:providerCode`) : toutes les garanties du README vérifiées dans le code — corps brut, HMAC vérifié en temps constant, événement enregistré **avant** tout traitement (même signature invalide), idempotence portée par la contrainte unique DB `(payment_provider_id, event_id)` (capture du code `P2002`), une seule transaction pour paiement + commande + bibliothèque + gel des commissions.
- Remboursement (`POST /admin/orders/:id/refund`) : transactionnel (paiement `refunded` + commande `refunded` + accès `revoked` ensemble), appel au prestataire fait **avant** l'ouverture de la transaction DB (si le prestataire échoue, rien n'est écrit).

### Routes commandes/paiements

| Route | Accès | Statut |
|---|---|---|
| `POST /orders` | Auth | FONCTIONNEL |
| `GET /orders/me`, `/orders/:orderNumber` | Auth (propriétaire) | FONCTIONNEL |
| `GET/PATCH /admin/orders*` | admin | FONCTIONNEL (voir incohérence ci-dessus) |
| `POST /payments` | Auth (propriétaire) | FONCTIONNEL |
| `POST /payments/:id/simulate` | Auth, hors production | FONCTIONNEL (dev/test uniquement) |
| `POST /webhooks/:providerCode` | signature HMAC | FONCTIONNEL |
| `POST /admin/orders/:id/refund` | admin | FONCTIONNEL |
| — routes Chariow/MTN MoMo | — | ABSENTES (seed uniquement) |
| — panier persistant | — | ABSENT (non nécessaire, achat direct) |

---

## 10. Commissions et reversements

**Moteur de calcul (`commission.ts`) — réel, testé, réellement invoqué.** Formule vérifiée ligne à ligne : montant brut = `line_total` figé, frais prestataire proratisés (dernier item absorbe l'arrondi), commission pourcentage ou fixe (fixe = par exemplaire), plafonnée au net, règle spécifique à l'auteur prioritaire sur la règle générale, règle la plus récente gagne à portée égale, aucune règle applicable = aucun prélèvement. Invoqué à l'intérieur de la transaction du webhook de paiement (`payments.service.ts:635-639`), gèle des lignes `SaleDistribution` — pas de code mort.

| Élément | Schéma | Backend | API | Frontend | Fonctionnel |
|---|---|---|---|---|---|
| Calcul de commission | ✅ | ✅ | ✅ | ✅ (revenus auteur) | ✅ OUI |
| `CommissionRule` | ✅ (globale plateforme, **pas** de `tenantId` malgré la proposition V2) | ✅ | ✅ (`/admin/commission-rules`) | ✅ | ✅ OUI |
| Gel des montants (`SaleDistribution`) | ✅ | ✅ | ✅ (lecture) | ✅ | ✅ OUI |
| `PayoutStatus` (pending/available/partially_paid/paid/cancelled) | ✅ | ❌ jamais transité | ❌ aucune route ne le modifie | affichage lecture seule uniquement | ❌ **NON — reste `pending` pour toujours** |
| Reversement effectif (virement, mobile money) | ❌ | ❌ | ❌ | ❌ | ❌ **ABSENT totalement** |
| `Author.payoutPhone`/`payoutMethod` | ✅ | stocké/affiché uniquement | formulaire admin | formulaire admin | Donnée inerte, jamais lue par une logique de paiement |

**Conclusion sans ambiguïté : les reversements aux auteurs n'existent pas.** Ce n'est pas une fonctionnalité partielle — c'est de l'affichage autour d'un champ qui ne change jamais de valeur. Toute mention de « commission rate » ou « revenue share » dans le schéma ne doit pas être confondue avec une fonctionnalité terminée (consigne de l'audit respectée).

`GET /authors/me/revenue`, `/authors/me/sales` — fonctionnels, calculs faits en base (agrégats SQL), pas en mémoire.

---

## 11. Statistiques

Toutes calculées **en direct** depuis la base à chaque requête — aucun cache ni précalcul trouvé.

| Statistique | Source | Endpoint | Niveau | Filtres |
|---|---|---|---|---|
| Œuvres publiées, auteurs actifs, commandes payées, lecteurs, revenus, commissions, part auteur, en attente de reversement | Agrégats Prisma | `GET /admin/statistics` | Plateforme | Plage de dates |
| Revenu quotidien (série temporelle) | SQL brut (`$queryRaw`, `date_trunc`) | `GET /admin/statistics/timeseries` | Plateforme | Plage de dates, plafonné à 366 jours |
| Œuvres publiées, auteurs actifs, ventes, revenu, commission, part auteur, en attente | `SaleDistribution` scopé par tenant | `GET /admin/tenant/statistics` | Tenant | Plage de dates |
| Revenu cumulé, ventes | Agrégats Prisma | `GET /authors/me/revenue`, `/authors/me/sales` | Auteur individuel | Pagination uniquement (pas de plage de dates) |

Les téléchargements (`Download`) ne sont affichés dans **aucun** tableau de bord — seulement comptés dans la liste personnelle de bibliothèque du lecteur.

---

## 12. Journal d'activité et réglages

**`ActivityLogService`** — PARTIEL. Utilisé dans 8 services (équipe, règles de commission, catégories, œuvres, auteurs, configuration initiale, commandes, paiements — mais seulement `payment.initialize` et le remboursement, **pas** le webhook de succès de paiement, l'événement financier le plus significatif). Un second mécanisme parallèle et redondant existe dans `auth.service.ts` (`logActivity()` privé) plutôt que de réutiliser le service commun. **La colonne `tenantId` (nullable, ajoutée pour le multi-tenant) n'est jamais renseignée par le code applicatif — elle vaut toujours `NULL` en pratique**, malgré son existence en base. **Aucune interface d'administration** ne permet de consulter ce journal — il est strictement en écriture seule.

**`Setting` (plateforme)** — 9 réglages seedés, mais seulement 3 réellement lus par le code (`default_payment_provider`, `max_pdf_size_mb`, `download_limit`). Les 6 autres (`site_name`, `site_slogan`, `default_currency`, `default_commission_rate`, `commission_calculation_base`, `support_email`) ne sont lus nulle part. **Aucune interface d'administration** pour les modifier.

**`TenantSetting` (par tenant)** — modèle entièrement défini en base (clé/valeur par tenant), **jamais lu ni écrit par aucun code applicatif** — un modèle mort. Ce que l'interface `/admin/parametres` modifie réellement, ce sont des colonnes directes du modèle `Tenant` (nom, description, site web, réseaux sociaux, logo, couverture) — pas des lignes `TenantSetting`, malgré un nom de service (`TenantSettingsService`) qui pourrait le laisser penser.

---

## 13. Bibliothèque lecteur et téléchargement

Toutes les garanties du README **vérifiées et confirmées réelles** :
- `GET /library` : filtré strictement par `userId`, dans un contexte RLS.
- `GET /library/:id/download` : propriété vérifiée via `reader_library` uniquement (jamais de jointure vers `orders`), statut d'accès, date d'expiration, quota (`download_limit`, réglage **global plateforme**, pas par œuvre ni par tenant — 0 = illimité), somme de contrôle SHA-256 recalculée à l'envoi, journalisation dans `Download` avant l'envoi des octets, `Content-Disposition: attachment`, `Cache-Control: private, no-store`, nom de fichier dérivé du titre.
- Extraits gratuits (`/works/:slug/formats/:id/sample`) : limités par IP (20 requêtes/10 min, en mémoire — **non partagé entre instances**, limite documentée si l'API est mise à l'échelle horizontalement).
- `storage/private` confirmé **jamais** monté en route statique (seul `storage/public` l'est, via `ServeStaticModule` dans `files.module.ts`).
- Relais frontend `/api/library/[id]/download` : relais pur confirmé, aucune décision d'autorisation propre, redirige vers `/connexion` si absence de session, vers `/bibliotheque?echec=...` en cas de refus API.

---

## 14. Routes — cartographie complète

### Routes publiques (aucune authentification)
```
GET  /works, /works/:slug                         Catalogue public                    FONCTIONNEL
GET  /authors, /authors/:slug                      Auteurs publics                     FONCTIONNEL
GET  /categories                                    Catégories publiques                FONCTIONNEL
GET  /works/:slug/formats/:id/sample                Extrait gratuit (throttle IP)       FONCTIONNEL
GET  /setup/status                                   Statut bootstrap superadmin         FONCTIONNEL
POST /auth/register, /auth/login, /auth/logout       Auth                                 FONCTIONNEL
POST /webhooks/:providerCode                         Webhook paiement (signature HMAC)   FONCTIONNEL
GET  /public/*                                       Fichiers publics (couvertures...)   FONCTIONNEL
```

### Routes lecteur (AuthGuard)
```
GET/PATCH /auth/me, POST /auth/me/password           Profil                               FONCTIONNEL
POST /orders, GET /orders/me, /orders/:orderNumber    Commandes                            FONCTIONNEL
POST /payments, GET /orders/:n/payments               Paiements                            FONCTIONNEL
POST /payments/:id/simulate                            Simulation (hors prod)               FONCTIONNEL
GET  /library, /library/:id/download                  Bibliothèque                         FONCTIONNEL
POST /tenants, GET /tenants/me, POST /tenants/me/active  Création/gestion tenant            FONCTIONNEL
```

### Routes tenant (AuthGuard + TenantAccessGuard, rôles vérifiés par RLS)
```
GET/PATCH /admin/tenant, /admin/tenant/statistics      Dashboard/branding tenant            FONCTIONNEL
GET/POST/PATCH/DELETE /admin/authors, /admin/works      Catalogue tenant                     FONCTIONNEL
GET/POST/PATCH/DELETE /admin/team                       Équipe                                PARTIEL (pas de vraie invitation)
GET /authors/me/revenue, /authors/me/sales               Revenus auteur                       FONCTIONNEL
```

### Routes superadmin plateforme (RolesGuard, `@Roles('admin')`)
```
GET/POST/PATCH/DELETE /admin/categories                 Taxonomie globale                    FONCTIONNEL
GET/PATCH /admin/orders*, /admin/orders/:id/refund       Commandes/remboursements globaux     FONCTIONNEL
GET/POST/PATCH/DELETE /admin/commission-rules            Règles de commission                 FONCTIONNEL
GET /admin/statistics, /admin/statistics/timeseries       Statistiques plateforme              FONCTIONNEL
POST /setup/superadmin                                     Bootstrap (jeton, usage unique)      FONCTIONNEL
```

### Routes frontend (Next.js App Router) — voir §7 pour le détail par rôle
Marketing (`/`, `/a-propos`, `/contact`, `/livres*`, `/auteurs*`), auth (`/connexion`, `/inscription`), lecteur (`/mon-espace`, `/mes-commandes`, `/paiement/[n]`, `/bibliotheque`, `/creer-un-espace`), auteur legacy (`/auteur/tableau-de-bord`), admin/tenant (`/admin/*`), bootstrap (`/configuration-initiale`) — cartographiés en détail par l'un des audits, tous confirmés fonctionnels sauf mention contraire (paiement réel désactivé, copie `/a-propos` obsolète).

---

## 15. Base de données — schéma et migrations

24+ modèles Prisma (voir `backend/prisma/schema.prisma`). Clés primaires en UUID v7. 15 migrations chronologiques, dont :
- `init_gebook` (schéma initial, 17 enums + 21 tables)
- `check_constraints` (8 contraintes CHECK d'intégrité financière — montants ≥0, quantité >0, plafond commission ≤100% en pourcentage, année de publication bornée)
- `add_sessions_and_login_attempts`
- `add_multi_tenant_core` (Tenant/TenantMember/TenantSetting, `tenantId` sur authors/works/order_items/activity_logs, tenant historique « Mampouya Éditions »)
- 2 correctifs immédiats (visibilité des œuvres déjà publiées, `created_by` nullable)
- `add_rls_policies` (RLS sur 13 tables) + 6 migrations correctives (récursion de politique, suppression, bootstrap du premier membre)
- `add_catalog_translations` (FR/EN œuvres, auteurs, catégories)

**Utilisé réellement** : tous les modèles listés au §1 sont vivants. **Prévu pour le futur / non utilisé** : `TenantSetting` (mort), `ActivityLog.tenantId` (jamais renseigné), `WorkStatus.{under_review,approved,rejected}`, `WorkVisibility` (écrite, jamais lue), `FileType.{cover,supplement}`, `Category.parentId` (API seulement), `PayoutStatus` (bloqué à `pending`), `TenantMemberStatus.invited` (jamais posé), `Setting` (6 lignes sur 9 mortes).

**Incohérence de schéma vs proposition** : `CommissionRule` et `PaymentProvider` restent globaux à la plateforme (pas de `tenantId`) — la proposition de `docs/AUDIT_V2_MULTI_TENANT.md` de les rendre configurables par tenant n'a **pas** été implémentée.

---

## 16. Tests

- **Tests unitaires backend** : 12 fichiers (`*.spec.ts`), couvrant validation d'environnement, inscription/session, guards (Origin, Roles), moteur de commission, détection MIME, santé, numérotation de commande, machine à états de commande, pilote de paiement factice, conversion monétaire, bootstrap superadmin. **81 tests, tous passent.**
- **Typecheck backend** (`tsc --noEmit`) : **OK**, aucune erreur.
- **Lint backend** : **OK**, aucune erreur.
- **Typecheck frontend** : **OK**, aucune erreur.
- **Tests e2e backend** (14 fichiers, incl. une suite dédiée `multi-tenant-rls.e2e-spec.ts`) : **92 échecs sur 189 tests**, dans 6 suites sur 14 (isolation RLS, bibliothèque, équipe, paiements, auteurs-tenant, commandes). Cause identifiée : épuisement du pool de connexions PostgreSQL dû à l'absence de `runInBand`/`maxWorkers: 1` dans `test/jest-e2e.json` — chaque suite démarre sa propre application NestJS complète en parallèle contre une seule base locale. **Ce n'est pas un bug applicatif**, mais un problème d'infrastructure de test (signalé, non corrigé, conformément à la consigne de l'audit).
- Avertissement récurrent Jest : « A worker process has failed to exit gracefully » (fuite de handle non identifiée, non creusée).

---

## 17. Bugs et problèmes identifiés

**CRITIQUE**
1. Le script d'initialisation Docker créant le rôle Postgres applicatif restreint (`gebook_user`, sans `BYPASSRLS`) a été supprimé dans le commit `2a5ddce` sans remplacement. Sur un déploiement neuf, le mécanisme dont dépend toute l'isolation multi-tenant en base (`FORCE ROW LEVEL SECURITY`) n'est plus garanti. (§3.G)

**BLOQUANT**
2. 92/189 tests e2e échouent à cause d'un épuisement du pool de connexions (config Jest sans `runInBand`) — bloque la confiance en CI même si le code applicatif semble correct. (§16)

**IMPORTANT**
3. `AdminWorksService.findOne()` interroge par `id` sans filtre `tenantId` applicatif, reposant entièrement sur la RLS — aggrave l'impact du point 1. (§3.G)
4. Un admin peut forcer une commande à `paid` via `PATCH /admin/orders/:id/status` sans paiement réel, sans déclencher l'octroi d'accès bibliothèque ni le gel des commissions — incohérence potentielle. (§9)
5. Le webhook de succès de paiement (l'événement financier le plus significatif) n'est pas journalisé dans `ActivityLogService`. (§12)
6. `ActivityLog.tenantId` n'est jamais renseigné par le code — colonne morte en pratique malgré son existence en base. (§12)
7. L'« invitation » d'équipe n'en est pas une : ajout immédiat en statut actif, pas d'état `invited`, pas d'e-mail, pas d'étape d'acceptation. (§6)
8. `LEGACY_SINGLE_TENANT_ID` reste référencé en dur dans `admin-authors.service.ts`, alors que son propre commentaire le décrit comme scaffolding temporaire censé disparaître après la Phase 5. (§3.F)

**MINEUR**
9. Page `/a-propos` : copie marketing obsolète (annonce la bibliothèque comme « à venir » alors qu'elle est fonctionnelle).
10. Deux tableaux de bord auteur parallèles (rôle global vs adhésion tenant) — duplication architecturale, pas un bug, mais source de confusion potentielle pour un auteur avec seulement le rôle global.
11. `FileType.cover`/`.supplement` jamais utilisés ; `Category.parentId` sans UI ; `WorkVisibility` jamais lue en pratique.
12. Fuite de handle Jest non identifiée (avertissement récurrent, sans échec de test associé).
13. 6 des 9 réglages plateforme (`Setting`) ne sont lus par aucun code — poids mort silencieux.

---

## 18. Matrice de maturité des fonctionnalités

| Fonctionnalité | Existe | Fonctionnelle | Partielle | Prévue seulement | Absente | Notes |
|---|:---:|:---:|:---:|:---:|:---:|---|
| Inscription | ✅ | ✅ | | | | Rôle `reader` auto-assigné |
| Parcours lecteur complet | ✅ | ✅ | | | | Achat → bibliothèque → téléchargement, tout vérifié |
| Création tenant (self-service) | ✅ | ✅ | | | | N'importe quel utilisateur, devient OWNER |
| Multi-tenant (isolation réelle) | ✅ | | ⚠️ | | | RLS implémentée en code, mais script de provisioning du rôle DB supprimé (§3.G) |
| Dashboard tenant | ✅ | ✅ | | | | Statistiques, branding, équipe |
| Gestion œuvres (CRUD) | ✅ | ✅ | | | | Formats, fichiers, traductions tous fonctionnels |
| Workflow de publication (review) | ✅ (enum) | | ⚠️ | ✅ | | `submitted/under_review/approved/rejected` jamais utilisés en pratique |
| Commandes | ✅ | ✅ | ⚠️ | | | Incohérence : `paid` forçable sans paiement réel |
| Paiements | ✅ | | ⚠️ | | | Seul le prestataire factice fonctionne ; Chariow/MTN absents de code |
| Statistiques | ✅ | ✅ | | | | Plateforme + tenant + auteur, calcul en direct |
| Commissions | ✅ | ✅ | | | | Moteur réel, gelé en transaction |
| Reversements (payouts) | ✅ (schéma) | | | | ✅ | Aucune transition de statut, aucun virement, jamais implémenté |
| Superadmin | ✅ | ✅ | | | | Bootstrap unique par jeton, bypass RLS partout |

---

## 19. Briques déjà prêtes pour un modèle type « Chariow »

Sans proposer de plan d'implémentation (hors périmètre de cet audit), les éléments suivants existent déjà et sont directement réutilisables pour le parcours cible *Lecteur → Créer son espace → Tenant → OWNER → Publier → Vendre → Statistiques → Gérer son activité* :

- **Création d'espace self-service** avec attribution automatique du rôle OWNER (§6) — déjà le parcours cible, pas à construire.
- **Rôles tenant granulaires** (owner/admin/editor/author/marketing/finance/viewer) déjà modélisés et vérifiés à deux niveaux (§3.E).
- **RLS PostgreSQL** comme filet de sécurité indépendant du code applicatif (une fois la régression §3.G corrigée).
- **Moteur de commission pur et testé**, prêt à être rendu configurable par tenant si besoin (actuellement global — §10, §15).
- **Statistiques tenant déjà séparées des statistiques plateforme**, avec le même moteur d'agrégation (§11).
- **Architecture de stockage abstraite** (`StorageDriver`), prête pour un espace nommé par tenant si nécessaire (actuellement stockage à plat, pas de risque de collision grâce aux noms de fichiers aléatoires).
- **Architecture de paiement par interface** (`PaymentDriver`), prête à accueillir un vrai pilote (Chariow ou autre) sans toucher au reste du système.

Ce qui manque clairement pour ce modèle cible : un mécanisme de reversement réel aux auteurs (absent, §10), un vrai pilote de paiement en production, un workflow de publication réellement appliqué (au-delà de l'enum), et la correction de la régression d'infrastructure RLS (§3.G) avant toute mise en production multi-tenant.

---

## Incertitudes signalées par les audits

- Comportement réel de `docker compose up` contre le commit HEAD (script de rôle DB manquant) non testé en exécution — fait établi par `git`, effet en exécution non vérifié.
- Couverture exhaustive de `LEGACY_SINGLE_TENANT_ID` et des requêtes `findUnique` sans filtre `tenantId` non garantie au-delà des occurrences confirmées (`admin-authors.service.ts`, `admin-works.service.ts`).
- Le caractère volontaire ou non de la transition `awaiting_payment → paid` sans effets de bord n'a pas pu être tranché par lecture statique seule.
- Reproductibilité des échecs e2e non re-testée (un seul passage, pour éviter d'altérer davantage l'état de la base pendant l'audit).
- Contenu exact de chaque politique RLS non re-vérifié table par table au-delà de `orders`/`order_items`/`payment_events`.

---

*Fin du rapport. Document destiné à servir de référence à un futur agent ou une future session sans modification supplémentaire du projet.*
