# Audit GeBook V2 — de plateforme mono-tenant à infrastructure multi-tenant

Analyse du `new_stack/` existant (NestJS + Prisma + PostgreSQL + Next.js), écart avec le brief V2 fourni, modèle multi-tenant proposé, plan de migration et plan d'implémentation par phases.

- **Périmètre analysé** : `new_stack/backend` (7 228 lignes TS hors fichiers générés) et `new_stack/frontend` (10 821 lignes TS/TSX)
- **Nature** : audit — aucun fichier n'a été modifié
- **Commit de référence** : `c10cbcb` (phase 10 — commissions et revenus auteurs)

---

## 0. Constat préalable — écart de stack avec le brief

**Le brief V2 suppose Supabase (Auth, Storage, Postgres, RLS) comme backend. Ce n'est pas ce qui existe.**

Vérifié dans `new_stack/backend/package.json` et `new_stack/frontend/package.json` : aucune dépendance `@supabase/*` n'est présente, nulle part dans le dépôt. Le backend réel est :

| Élément supposé par le brief | Élément réellement présent |
|---|---|
| Supabase (backend principal) | **NestJS 11** + **Prisma 7** (`@prisma/adapter-pg`) + **PostgreSQL** en accès direct |
| Supabase Auth | Auth maison : sessions serveur opaques (table `sessions`), cookie `httpOnly`, argon2, throttle double-clé (compte + IP) |
| Supabase Storage | `StorageDriver` maison (interface + `LocalStorageDriver` sur disque, conçue pour être remplacée par un driver S3 sans toucher le reste du code) |
| Row Level Security (Supabase) | **Aucune RLS actuellement** — l'isolation se fait entièrement en code applicatif (guards NestJS + clauses `where` Prisma) |
| React + Vite + React Router + Zustand | **Next.js 16 (App Router)** + **TanStack Query** — pas de Vite, pas de React Router, pas de Zustand |

Le brief lui-même dit : *« Respecte l'architecture existante du projet »* et *« Ne crée PAS un backend NestJS/Express séparé simplement pour le plaisir de l'architecture »*. Le backend NestJS n'est pas à créer — **il existe déjà**, avec 7 228 lignes de code fonctionnel couvrant l'auth, le catalogue, les commandes, les paiements (architecture multi-prestataires), la bibliothèque lecteur et les commissions (phases 1 à 10 du plan de migration V1→V2 déjà exécutées).

Deux lectures possibles du brief, avec des conséquences radicalement différentes :

1. **Le multi-tenant se construit sur la stack existante** (NestJS + Prisma + PostgreSQL). PostgreSQL a nativement des Row Level Security policies — ce n'est pas une fonctionnalité propriétaire de Supabase, Supabase l'utilise simplement. On peut donc satisfaire l'exigence RLS du brief (§6, §28) sans jamais introduire Supabase. C'est l'option qui préserve les 18 000 lignes de code déjà écrites et testées.
2. **Le brief demande une migration complète vers Supabase**, ce qui impliquerait de retirer NestJS, réécrire l'auth avec Supabase Auth, migrer le storage, et reconstruire l'API — un projet différent, en contradiction avec la consigne « ne réécris pas inutilement ce qui fonctionne » (brief §4).

Je recommande l'option 1 et j'ai construit le reste de ce rapport sur cette base : **multi-tenancy natif dans Prisma/PostgreSQL, RLS PostgreSQL appliquée via des migrations, NestJS conservé comme couche API**. Je vous demande de confirmer ce choix avant la Phase 2 (ci-dessous, section 9) — c'est la seule décision qui peut invalider tout le reste du plan.

---

## 1. Architecture actuelle

```text
new_stack/
├── backend/     NestJS 11 · Prisma 7 (adapter-pg) · PostgreSQL · argon2 · class-validator
└── frontend/    Next.js 16 (App Router) · React 19 · TanStack Query · Tailwind v4 · shadcn/radix · GSAP · three.js
```

**Backend — 9 modules** (`backend/src/modules/`) :

| Module | Rôle |
|---|---|
| `auth` | Inscription/connexion, sessions serveur opaques, guards (`AuthGuard`, `RolesGuard`, `OriginGuard`), throttle de connexion |
| `catalog` | Auteurs, catégories, œuvres — lecture publique (`catalog.controller.ts`) + CRUD admin (`catalog/admin/*`) |
| `files` | `StorageDriver` (interface), `LocalStorageDriver`, détection MIME réelle, validation d'upload |
| `orders` | Commandes avec snapshots figés, machine à états de statut |
| `payments` | `PaymentDriver` (interface), registre par injection, `FakePaymentDriver`, webhooks, remboursement |
| `library` | Droit d'accès lecteur (`reader_library`), téléchargement contrôlé, extraits gratuits |
| `commissions` | Calcul pur (`commission.ts`), figeage en base, règles par auteur ou générales |
| `health` | Sonde de disponibilité |
| `common` (transverse) | `ActivityLogService`, filtre d'exception global, factory de validation |

**Auth actuelle** : `AuthenticatedUser { id, firstName, lastName, email, roles: string[] }`, attaché à la requête par `AuthGuard`. C'est le nœud le plus connecté du graphe de dépendances (58 arêtes selon l'analyse graphify) — **tout** module en dépend directement.

**Rôles actuels** (table `roles`, seedés) : `reader`, `author`, `admin` — **globaux, non scopés**. `RolesGuard` vérifie `request.user.roles.includes(...)`, sans aucune notion de tenant.

**Frontend** : App Router avec deux groupes de routes, `(site)` (public + espace lecteur/auteur) et `(admin)` (back-office). Composants organisés par domaine (`components/{account,admin,auth,catalog,layout,motion,payment,ui}`), pas encore en `src/features/*` comme le demande le brief §21.

---

## 2. Fonctionnalités existantes (réutilisables telles quelles ou presque)

Toutes fonctionnelles, couvrant les phases 1 à 10 du plan de migration V1 (audité dans `AUDIT.md` à la racine du dépôt) :

- **Authentification complète** : inscription, connexion, déconnexion, session serveur révocable, régénération de session, protection CSRF via `OriginGuard` + `sameSite`, throttle anti-force-brute double clé.
- **Catalogue** : œuvres avec formats multiples (PDF/EPUB/audio/papier), catégories hiérarchiques, recherche/filtres/pagination, CRUD admin complet.
- **Commandes** : création avec snapshots figés (titre, auteur, prix au moment de l'achat — jamais recalculés).
- **Paiements** : architecture multi-prestataires par interface (`PaymentDriver`), webhook sécurisé (corps brut, HMAC, idempotence par contrainte unique, fenêtre anti-rejeu), remboursement avec révocation d'accès.
- **Bibliothèque lecteur** : droit d'accès matérialisé (`reader_library`), téléchargement contrôlé (propriété, statut, expiration, quota, checksum), extraits gratuits limités par IP.
- **Commissions** : formule en fonction pure et testée, figeage en base au moment de la vente, règles par auteur ou générale, jamais recalculées après coup.
- **Journal d'activité** : `ActivityLogService`, déjà présent et générique (`userId`, `action`, `entityType`, `entityId`, `oldValues`/`newValues` JSON) — **structure quasiment identique** à ce que demande le brief §25 pour l'audit multi-tenant.

---

## 3. Modèle de données actuel

24 modèles Prisma, mono-tenant par construction :

```text
Identité      User · Role · UserRole · Session · LoginAttempt
Catalogue     Author · Category · Work · WorkFormat · WorkFile
Commande      Order · OrderItem
Paiement      PaymentProvider · ProviderProduct · Payment · PaymentEvent
Accès         ReaderLibrary · Download
Finance       CommissionRule · SaleDistribution
Exploitation  Setting · ActivityLog
```

Points structurants à noter avant de proposer le modèle multi-tenant :

- `Author.userId` est **nullable et unique** — un auteur peut exister sans compte (déjà pensé pour un auteur qui ne se connecte jamais). Cette décision se transpose bien au multi-tenant.
- `Work.authorId` pointe directement vers un `Author`, lui-même global. **Aucune notion d'éditeur/tenant n'existe entre les deux.**
- `PaymentProvider` et `CommissionRule` sont globaux à la plateforme — pertinent de les garder configurables par tenant en V2, mais avec un fallback plateforme (cf. §7).
- `ReaderLibrary` est rattachée à `userId` + `orderItemId`, **jamais à un tenant** — c'est exactement le modèle demandé par le brief §17 (« la bibliothèque appartient à l'utilisateur, pas au tenant »). Rien à changer ici.
- `Setting` est une table clé/valeur globale — deviendra `tenant_settings` scopée + une table `platform_settings` globale distincte.

---

## 4. Problèmes identifiés pour le multi-tenant

1. **Rôles globaux non scopés** — `RolesGuard` ne connaît que `request.user.roles: string[]`, sans distinction de tenant. C'est exactement l'anti-pattern que le brief interdit en §3 (`User -> role=AUTHOR -> books`).
2. **Un seul `Author` par `User`** — la contrainte `@unique` sur `Author.userId` empêche aujourd'hui un même utilisateur d'avoir plusieurs profils auteur dans plusieurs maisons d'édition. À revoir pour le multi-tenant (un `User` peut être `Author` dans plusieurs `Tenant`).
3. **`Work` sans tenant** — nécessite l'ajout de `tenantId` partout où `authorId` apparaît aujourd'hui en clé de partition implicite.
4. **Storage non namespacé par tenant** — `LocalStorageDriver` écrit dans `public/{directory}` et `private/{directory}` sans notion de tenant ; deux tenants pourraient théoriquement collisionner sur un `directory` généré côté service.
5. **Panel admin unique** — les contrôleurs `admin-*` actuels supposent un seul back-office global. Il faut les scinder conceptuellement en **Tenant Dashboard** (données du tenant actif) et **Platform Admin** (vision globale), avec des permissions distinctes.
6. **Aucune RLS en base** — toute l'isolation est aujourd'hui applicative (le `where: { ... }` dans chaque service Prisma). C'est un point de rupture unique : un bug dans un service, une clause `where` oubliée, expose les données d'un autre tenant demain. Le brief a raison d'insister sur une isolation **au niveau PostgreSQL**, pas seulement applicative.
7. **`ActivityLog` sans `tenantId`** — à ajouter (nullable, pour les actions plateforme).

---

## 5. Éléments réutilisables sans modification

- **`PaymentDriver` / `PaymentDriverRegistry`** — le pattern (interface + registre par injection de dépendances) est directement applicable à un `TenantContext` : aucune raison de le refaire différemment.
- **`StorageDriver`** — l'abstraction est prête ; seul le chemin passé à `store()` doit devenir tenant-aware (`tenants/{tenantId}/...` au lieu de `{directory}` nu).
- **Moteur de commissions** (`commission.ts`) — fonction pure, testée, indépendante de la base. Le taux devient configurable par tenant, la fonction elle-même ne change pas.
- **`ReaderLibrary` / `Download`** — modèle déjà conforme à la vision V2 (bibliothèque rattachée à l'utilisateur, pas au tenant).
- **`ActivityLogService`** — structure quasi identique à la table d'audit demandée en §25 ; ajouter `tenantId` suffit.
- **Guards NestJS** (`AuthGuard`, `OriginGuard`, throttle) — le mécanisme de session/cookie reste valide ; seul `RolesGuard` doit évoluer pour comprendre les rôles tenant.
- **Machine à états `OrderStatus`**, snapshots `OrderItem`, idempotence des webhooks par contrainte unique — tout ce qui touche à l'argent est déjà conçu correctement et n'a pas besoin d'être repensé, seulement étendu avec `tenantId`.

## 6. Éléments à refactorer

- **`RolesGuard` + décorateur `@Roles()`** → distinguer `@PlatformRoles()` et `@TenantRoles()`, avec un `TenantContext` résolu depuis l'en-tête/route active (cf. §8 ci-dessous).
- **`Author`, `Work`, `WorkFormat`, `WorkFile`, `Order`, `OrderItem`, `Payment`, `CommissionRule`, `SaleDistribution`, `Setting`, `ActivityLog`** → ajout de `tenantId` (voir schéma §7).
- **`admin-*.controller.ts`** actuels → migrer vers des routes `/dashboard/*` scopées au tenant actif ; créer un nouvel espace `/platform/*` pour l'admin plateforme.
- **Catalogue public** (`catalog.controller.ts`) → agréger tous les tenants au lieu d'un catalogue mono-source, ajouter des filtres par tenant/éditeur.
- **Frontend `components/`** → réorganiser progressivement vers `src/features/{auth,tenants,authors,works,orders,sales,library,analytics,admin}` (brief §21), sans tout réécrire d'un coup — migration module par module au moment où chaque phase le touche.
- **Frontend routing** → introduire les groupes `TENANT` et `PLATFORM` du brief §22 ; le groupe `(admin)` actuel devient la base du Tenant Dashboard, un nouveau groupe `(platform)` est créé pour l'admin globale.

---

## 7. Schéma multi-tenant proposé (Prisma / PostgreSQL)

Adapté aux conventions déjà en place dans `schema.prisma` (UUID v7, `@map`/`@@map`, `Decimal` pour l'argent, `timestamptz`, index sur `tenant_id`/`status`/`created_at`) :

```prisma
enum TenantType {
  independent_author
  publishing_house
  collective
  cultural_organization
  @@map("tenant_type")
}

enum TenantStatus {
  active
  suspended
  archived
  @@map("tenant_status")
}

enum TenantMemberRole {
  owner
  admin
  editor
  author
  marketing
  finance
  viewer
  @@map("tenant_member_role")
}

enum TenantMemberStatus {
  active
  invited
  suspended
  @@map("tenant_member_status")
}

enum PlatformRole {
  platform_admin
  platform_moderator
  platform_support
  @@map("platform_role")
}

enum WorkVisibility {
  private
  tenant_only
  public
  @@map("work_visibility")
}

// WorkStatus existant étendu : draft, submitted, under_review, approved,
// published, rejected, archived, inactive — cf. §8 workflow.

model Tenant {
  id          String       @id @default(uuid(7)) @db.Uuid
  slug        String       @unique(map: "uq_tenants_slug") @db.VarChar(120)
  name        String       @db.VarChar(150)
  type        TenantType
  description String?      @db.Text
  logoPath    String?      @map("logo_path") @db.VarChar(255)
  coverPath   String?      @map("cover_path") @db.VarChar(255)
  website     String?      @db.VarChar(255)
  socialLinks Json?        @map("social_links")
  status      TenantStatus @default(active)
  createdBy   String       @map("created_by") @db.Uuid
  createdAt   DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime     @updatedAt @map("updated_at") @db.Timestamptz(6)

  members  TenantMember[]
  authors  Author[]
  works    Work[]
  orders   Order[]
  settings TenantSetting[]

  @@index([status], map: "idx_tenants_status")
  @@map("tenants")
}

model TenantMember {
  id        String              @id @default(uuid(7)) @db.Uuid
  tenantId  String              @map("tenant_id") @db.Uuid
  userId    String              @map("user_id") @db.Uuid
  role      TenantMemberRole
  status    TenantMemberStatus  @default(active)
  createdAt DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade, map: "fk_tenant_members_tenant")
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade, map: "fk_tenant_members_user")

  @@unique([tenantId, userId], map: "uq_tenant_members")
  @@index([userId], map: "idx_tenant_members_user")
  @@map("tenant_members")
}

model TenantSetting {
  id           String   @id @default(uuid(7)) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  settingKey   String   @map("setting_key") @db.VarChar(150)
  settingValue String?  @map("setting_value") @db.Text
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade, map: "fk_tenant_settings_tenant")

  @@unique([tenantId, settingKey], map: "uq_tenant_settings")
  @@map("tenant_settings")
}
```

**Modèles existants — modifications** (liste, pas de diff complet ici) :

- `Author` : ajouter `tenantId String @db.Uuid` (obligatoire), retirer `@unique` sur `userId` (un `User` peut être auteur dans plusieurs tenants → contrainte devient `@@unique([tenantId, userId])`).
- `Work` : ajouter `tenantId String @db.Uuid`, ajouter `visibility WorkVisibility @default(private)`, étendre `WorkStatus` avec `submitted | under_review | rejected` (le workflow §8).
- `Order` : ajouter `tenantId String @db.Uuid` — une commande porte des lignes d'un seul tenant à la fois (ou alors `OrderItem` porte son propre `tenantId` si on autorise le panier multi-tenant ; à trancher en Phase 2, cf. question ouverte plus bas).
- `PaymentProvider`, `CommissionRule` : ajouter `tenantId String? @db.Uuid` (nullable = règle plateforme par défaut, non-nul = surcharge tenant — même pattern que `CommissionRule.authorId` nullable déjà existant).
- `Setting` → renommé conceptuellement en `PlatformSetting` (garder tel quel, juste documenter la distinction avec `TenantSetting`).
- `ActivityLog` : ajouter `tenantId String? @db.Uuid` (nullable pour les actions strictement plateforme).
- `Role`/`UserRole` existants : **conservés tels quels** pour les rôles plateforme (`reader` reste global — tout le monde est lecteur par défaut ; `admin` devient `platform_admin`). Les rôles `author`/`admin` actuels au sens « propriétaire du catalogue » migrent vers `TenantMember.role`.

**Question ouverte à trancher en Phase 2** : un panier peut-il contenir des œuvres de plusieurs tenants dans une seule commande (brief §17 : *« Un lecteur peut acheter des livres provenant de plusieurs tenants »*) ? Si oui, `tenantId` doit vivre sur `OrderItem`, pas sur `Order`, et le split de paiement/commission se fait par tenant au sein d'une même commande. C'est une décision produit, pas seulement technique — elle change la forme du panier et de la page de paiement.

---

## 8. Isolation multi-tenant — RLS PostgreSQL (sans Supabase)

PostgreSQL supporte nativement `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` et `CREATE POLICY`, indépendamment de Supabase. L'approche proposée :

1. **Contexte de session Postgres** : à chaque requête, NestJS exécute `SET LOCAL app.current_tenant_id = '<uuid>'` (et `app.current_user_id`, `app.is_platform_admin`) dans la transaction Prisma active, résolu depuis `AuthenticatedUser` + tenant actif (en-tête `X-Tenant-Id` ou sous-domaine).
2. **Policies RLS** lisent ce contexte via `current_setting('app.current_tenant_id', true)` :
   ```sql
   CREATE POLICY tenant_isolation_works ON works
     USING (
       tenant_id = current_setting('app.current_tenant_id', true)::uuid
       OR current_setting('app.is_platform_admin', true)::boolean = true
       OR (status = 'published' AND visibility = 'public')
     );
   ```
3. **Double filet** : les guards NestJS et les clauses Prisma continuent de filtrer par tenant côté application — la RLS est le filet de sécurité qui protège même en cas d'oubli côté code, pas le seul mécanisme.
4. **Connexion applicative non superuser** : le rôle Postgres utilisé par Prisma ne doit **pas** avoir `BYPASSRLS`, sans quoi les policies sont silencieusement ignorées.

C'est une différence d'implémentation, pas de principe, avec ce que ferait Supabase — Supabase RLS n'est que ce même mécanisme Postgres, packagé avec `auth.uid()` à la place de notre `current_setting('app.current_user_id')`.

---

## 9. Plan de migration des données existantes

**Aucune donnée supprimée.** Séquence :

1. Créer le tenant historique `Mampouya Éditions` (`slug: 'mampouya-editions'`, `type: publishing_house`, `createdBy` = premier utilisateur `admin` existant).
2. Ajouter `tenant_id` (nullable dans un premier temps) sur `authors`, `works`, `orders`, `payment_providers`, `commission_rules`, `activity_logs`.
3. Backfill : `UPDATE authors SET tenant_id = '<mampouya-id>'`, idem `works`, `orders` (join via `order_items.author_id`), `payment_providers`, `commission_rules`.
4. Créer les `tenant_members` : chaque `User` ayant le rôle `author` devient `TenantMember(role=author)` du tenant Mampouya ; chaque `admin` devient à la fois `PLATFORM_ADMIN` (conservé sur `Role`/`UserRole`) **et** `TenantMember(role=owner)` du tenant Mampouya (pour continuer à administrer le catalogue existant sans rupture).
5. Rendre `tenant_id` `NOT NULL` une fois le backfill vérifié, ajouter les index et contraintes RLS.
6. Vérifier qu'aucune régression fonctionnelle n'apparaît sur les parcours existants (catalogue, achat, bibliothèque, commissions) avant de considérer la migration terminée.

---

## 10. Plan d'implémentation par phases (adapté à NestJS + Prisma + PostgreSQL)

| Phase | Contenu | Notes |
|---|---|---|
| 1 | Audit (ce document) | Fait |
| 2 | Conception détaillée du modèle — **trancher la question OrderItem/Order** (§7), valider ce document | Bloque tout le reste |
| 3 | Migrations Prisma : `Tenant`, `TenantMember`, `TenantSetting`, `tenant_id` sur les modèles existants + backfill (§9) | |
| 4 | RLS PostgreSQL (§8) + `TenantContextMiddleware`/interceptor NestJS | Sécurité avant fonctionnalités |
| 5 | `TenantContext` (résolution du tenant actif), extension de `AuthGuard`/`RolesGuard` en `PlatformRolesGuard`/`TenantRolesGuard` | |
| 6 | Onboarding (création/choix de tenant, brief §23) | |
| 7 | Tenant Dashboard (Overview, Books, Authors, Members, Settings) | Réutilise les contrôleurs `admin-*` existants, ajoute le scoping tenant |
| 8 | Gestion des livres (CRUD scopé tenant, réutilise `catalog/admin/*`) | |
| 9 | Workflow de publication (draft → submitted → under_review → approved/rejected → published → archived) | Extension de `WorkStatus` |
| 10 | Catalogue public multi-tenant (agrégation, filtres par tenant/éditeur) | |
| 11 | Pages publiques tenant (`/editions/:slug`, `/auteur/:slug`) | |
| 12 | Orders/Sales/Commissions multi-tenant (trancher panier mono/multi-tenant) | |
| 13 | Bibliothèque lecteur (déjà tenant-agnostique — vérifications seulement) | |
| 14 | Platform Admin (nouveau, vision globale) | |
| 15 | Storage tenant-aware (`tenants/{id}/...`) | |
| 16 | SEO (métadonnées, sitemap, Open Graph par tenant/livre/auteur) | |
| 17 | Refonte UI/UX (identité éditoriale, pas un template SaaS générique — brief §18-19) | |
| 18 | Tests (unitaires permissions/commissions, intégration tenant, sécurité cross-tenant, E2E) | |
| 19 | Performance (pagination, index, requêtes ciblées) | |
| 20 | Documentation (`ARCHITECTURE.md`, `MULTI_TENANCY.md`, `SECURITY.md`, `DATABASE.md`) | |

---

## Décisions confirmées (2026-08-23)

1. **Stack** : multi-tenant construit sur NestJS + Prisma + PostgreSQL existant, avec RLS PostgreSQL native. Pas de Supabase.
2. **Panier** : multi-tenant — `tenant_id` vit sur `OrderItem` (dénormalisé, dans le même esprit que `workTitle`/`authorName`/`unitPrice` déjà figés sur cette table), pas sur `Order`. Une commande peut donc contenir des livres de plusieurs tenants ; `SaleDistribution` (déjà rattachée à `OrderItem`) porte naturellement la répartition par tenant sans changement de sa forme.

## État d'avancement

- ✅ **Phase 3 — Migration du schéma** (terminée le 2026-08-23) :
  - Modèles `Tenant`, `TenantMember`, `TenantSetting` ajoutés.
  - `tenant_id` ajouté sur `authors`, `works` (+ `visibility`), `order_items` (dénormalisé, panier multi-tenant), `activity_logs` (nullable).
  - `WorkStatus` étendu (`submitted`, `under_review`, `approved`, `rejected`) — enum prête pour la Phase 9, non encore câblée côté application.
  - Trois migrations SQL écrites à la main (`20260823010000_add_multi_tenant_core`, `20260823010100_backfill_published_work_visibility`, `20260823010200_tenant_created_by_nullable`), toutes appliquées et vérifiées sur la base locale.
  - Tenant historique `Mampouya Éditions` créé et rattaché à l'utilisateur `admin` existant (rôle `owner`).
  - `prisma/seed.ts` mis à jour pour créer son propre tenant de démonstration (le seed ne crée jamais de compte utilisateur — la migration ne peut donc pas toujours s'appuyer sur un utilisateur existant).
  - 4 sites d'appel applicatifs mis à jour pour rester compilables et corrects (`admin-authors.service.ts`, `admin-works.service.ts` — tenant dérivé de l'auteur, jamais dupliqué manuellement —, `author-revenue.controller.ts`, `orders.service.ts` — tenant dérivé de l'œuvre au moment de la commande).
  - Un point de rattachement temporaire (`LEGACY_SINGLE_TENANT_ID`, `src/modules/tenants/legacy-tenant.ts`) documente explicitement ce qui reste à remplacer en Phase 5 — aucune tentative de deviner une résolution de tenant qui n'existe pas encore.
  - Validation : `tsc --noEmit` propre, `eslint` propre, 74 tests unitaires + 121 tests e2e passent tous, seed vérifié idempotent (deux exécutions consécutives, aucun doublon).
- ⏭️ **Phase 4 — RLS PostgreSQL** : à faire ensuite.
- ⏭️ **Phase 5 — `TenantContext` + guards tenant** : remplace `LEGACY_SINGLE_TENANT_ID` partout où il apparaît.
