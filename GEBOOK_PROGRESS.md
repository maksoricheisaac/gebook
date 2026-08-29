# GeBook — Journal d'avancement

## État global

Phase actuelle : PHASE 2 — Expérience « Créer mon espace »
Statut : TERMINÉE
Dernière mise à jour : 2026-08-29
Commit de référence au début de la Phase 0 : `2a5ddce` (« chore: divers ajustements de configuration et ports »)

---

## PHASE 0 — Audit et sécurisation

### Objectif

Avant toute évolution fonctionnelle vers le modèle « Chariow », sécuriser les fondations existantes : vérifier que la régression RLS identifiée par `GEBOOK_CURRENT_STATE.md` existe toujours, vérifier réellement l'isolation multi-tenant, corriger l'absence de filtre `tenantId` applicatif sur `AdminWorksService.findOne()`, et stabiliser la suite de tests e2e sans modifier les tests eux-mêmes.

### Travaux réalisés

**0.1 — Régression Docker / PostgreSQL / RLS**

Vérification (pas de supposition) :
- `git log --all --oneline -- docker/` confirme que `docker/postgres/init/01-app-role.sh` a été supprimé dans le commit `2a5ddce` (52 lignes supprimées, aucun remplacement).
- Le message de ce commit (« chore: divers ajustements de configuration et ports ») ne mentionne aucune suppression volontaire de ce script ; les trois autres changements du même commit (`backend/src/config/environment.ts`, `docker-compose.local.yml`, `frontend/Dockerfile`) sont sans rapport — cette suppression a tout l'air d'un accident survenu pendant une session de nettoyage, pas d'une décision délibérée.
- `docker-compose.yml` continue de monter `./docker/postgres/init:/docker-entrypoint-initdb.d:ro` — le chemin attendu existait donc bien mais était vide sur un checkout neuf : sur un premier démarrage (volume `database-data` non initialisé), aucun script n'aurait créé le rôle `gebook_user`, et les services `migrate`/`backend` (qui se connectent avec ce rôle) auraient échoué à l'authentification.
- Le contenu original du script a été récupéré par `git show 2a5ddce~1:docker/postgres/init/01-app-role.sh` et restauré à l'identique via `git checkout 2a5ddce~1 -- docker/postgres/init/01-app-role.sh`, ce qui a aussi restauré le mode exécutable d'origine (`100755`, vérifié via `git ls-files -s`). Fin de ligne LF confirmée (`.gitattributes` impose déjà `*.sh text eol=lf`, et une inspection binaire du fichier restauré ne montre aucun `\r`).
- Le script crée `gebook_user` avec `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT`, puis lui donne la propriété de la base et du schéma — condition nécessaire pour que `FORCE ROW LEVEL SECURITY` (posé par la migration `20260823020000_add_rls_policies`) soit réellement contraignant, puisque `FORCE` ne s'applique ni aux superusers ni aux rôles `BYPASSRLS`.
- **Vérification sur la base de développement locale réellement utilisée** (`localhost:5432/gebook_db`, hors Docker — Docker Desktop n'était pas accessible dans cet environnement d'audit) : requête directe sur `pg_roles` confirmant `gebook_user` → `rolsuper: false, rolbypassrls: false, rolcanlogin: true` ; requête sur `pg_class` confirmant `relrowsecurity: true` et `relforcerowsecurity: true` sur `works`, `authors`, `tenants`, `tenant_members`, `orders`, `order_items`, propriétaire `gebook_user`. **Cette base locale n'a jamais été affectée par la régression** (elle a été provisionnée indépendamment de Docker, probablement avant la suppression du script, ou manuellement) — mais elle confirme que la configuration du script restauré correspond exactement à ce qui fait fonctionner RLS en pratique.

**0.2 — Isolation multi-tenant**

Plutôt que de fabriquer un scénario manuel Tenant A / Tenant B, réutilisation de la suite e2e existante et dédiée à cette exigence : `backend/test/multi-tenant-rls.e2e-spec.ts`. Elle couvre concrètement :
- Lecture des œuvres : un membre du tenant A ne voit jamais une œuvre privée du tenant B (absente du résultat, pas juste 403) ; les deux tenants voient bien le catalogue public commun ; un visiteur anonyme voit le catalogue public sans les brouillons ; un `platform_admin` voit tout, y compris les brouillons des deux tenants.
- Écriture des œuvres : un membre du tenant A ne peut ni modifier, ni supprimer, ni créer une œuvre pour le tenant B (testé dans les deux sens A→B et B→A) ; peut modifier ses propres œuvres.
- Auteurs : même isolation en écriture (modification/suppression d'un auteur d'un autre tenant refusée).
- `tenant_members` : un tenant ne voit pas la composition de l'autre, ne peut pas y ajouter de membre.
- `tenant_settings` : isolation en lecture et en écriture.
- Commandes/ventes : un lecteur peut acheter dans les deux tenants en une seule commande (panier multi-tenant confirmé) ; chaque tenant ne voit que sa propre ligne de commande ; l'acheteur voit les deux ; `sale_distributions` reste isolée par tenant vendeur.
- Rôles : un membre `viewer` du tenant A peut lire mais pas modifier les œuvres de A.

Résultat : **suite passée intégralement (voir §Tests exécutés)**, confirmant l'isolation multi-tenant sur les axes testés.

**Limite honnête à signaler** : cette suite teste explicitement les rôles *owner/admin (implicite, créateur du tenant)* et *viewer*, plus une isolation générique « membre du tenant ». Elle ne fait **pas** de test dédié par rôle pour `editor`, `author`, `marketing`, `finance` sur chaque action (le test générique « un membre du tenant A ne peut pas... » ne précise pas systématiquement quel rôle tenant porte le compte de test). La matrice complète de permissions par rôle demandée pour la Phase 8 n'est donc pas encore couverte de bout en bout par les tests — seule l'isolation *inter-tenant* (A ≠ B) est confirmée exhaustivement, pas la granularité *intra-tenant par rôle*.

**0.3 — Faille `AdminWorksService.findOne()` et instances analogues**

Correction appliquée : ajout d'un filtre applicatif `tenantId` (défense en profondeur, RLS conservée comme protection fondamentale — jamais désactivée) sur les recherches par identifiant qui n'en avaient pas, en réutilisant le même pattern déjà en place dans `list()`/`stats()` (`...(tenant.tenantId !== null && { tenantId: tenant.tenantId })`, qui laisse un `platform_admin` sans tenant actif continuer à tout voir, exactement comme avant).

Instance nommée par la mission, corrigée :
- `backend/src/modules/catalog/admin/admin-works.service.ts` — `findOne()` : `findUnique({ where: { id } })` → `findFirst({ where: { id, tenantId? } })`.

Instances analogues trouvées par grep pendant la correction (même catégorie de faille, corrigées par cohérence) :
- `backend/src/modules/catalog/admin/admin-works.service.ts` — `remove()` : la vérification d'existence avant suppression avait le même trou, corrigée de la même façon.
- `backend/src/modules/catalog/admin/admin-authors.service.ts` — `findOne()`, `update()` (vérification d'existence), `remove()` (vérification d'existence) : les trois corrigées de la même façon. `updatePhoto()` appelle déjà `findOne()` en amont, donc protégée indirectement.

Instances examinées et **volontairement non modifiées** :
- `backend/src/modules/orders/orders.service.ts` (`findUnique` sur `Order`, lignes ~203 et ~249) — `Order` n'a pas de `tenantId` par conception (le multi-tenant vit sur `OrderItem`, une commande peut légitimement contenir des lignes de plusieurs tenants) et ces routes sont réservées au `platform_admin` (`@Roles('admin')`, pas `TenantAccessGuard`) : un filtre `tenantId` n'aurait ni sens ni utilité ici.

**Gap distinct repéré mais explicitement hors périmètre de la Phase 0** : `AdminAuthorsService.update()`/`.remove()` n'appellent toujours pas `assertCanWriteCatalog()` (contrairement à `.create()`) — un trou d'*autorisation par rôle*, différent du trou de *filtrage tenant* que la mission demandait de corriger ici. Non touché pour ne pas élargir le périmètre de cette phase sans mandat explicite ; à traiter en Phase 1 ou dans une phase de sécurité dédiée. Signalé dans « Éléments restant à traiter ».

**0.4 — Fiabilité des tests e2e**

Diagnostic confirmé : `backend/test/jest-e2e.json` ne fixait aucune limite de parallélisme (`maxWorkers`). Chaque fichier `*.e2e-spec.ts` démarre sa propre application NestJS complète (donc son propre pool de connexions Prisma) dans `beforeAll` ; Jest les exécutait par défaut en parallèle sur les cœurs disponibles, contre une seule instance PostgreSQL locale — d'où l'épuisement du pool et les échecs par timeout de transaction observés dans l'audit (`Unable to start a transaction in the given time`).

Correction strictement limitée à la configuration : ajout de `"maxWorkers": 1` dans `backend/test/jest-e2e.json`. Aucun fichier de test n'a été modifié.

### Fichiers modifiés

- `docker/postgres/init/01-app-role.sh` — **restauré** (ajout), contenu identique à la version d'avant régression (blob git `eb86750589b615df29f8607b0ac10404b35de8cd`).
- `backend/src/modules/catalog/admin/admin-works.service.ts` — `findOne()` et `remove()` : ajout du filtre `tenantId`.
- `backend/src/modules/catalog/admin/admin-authors.service.ts` — `findOne()`, `update()`, `remove()` : ajout du filtre `tenantId`.
- `backend/test/jest-e2e.json` — ajout de `"maxWorkers": 1`.

### Base de données / migrations

Aucune migration créée ni modifiée. Aucun schéma touché. Le correctif de sécurité de cette phase est un fichier d'infrastructure (script d'init Docker) et deux filtres applicatifs Prisma — pas un changement de schéma.

### Backend

Voir « Fichiers modifiés ». Aucune route, aucun contrat d'API, aucune forme de réponse changée — uniquement un resserrement des clauses `where` internes et un fichier d'infrastructure restauré.

### Frontend

Aucun changement. Aucune modification nécessaire : le contrat d'API n'a pas changé (mêmes routes, mêmes réponses ; `findOne()`/`remove()` renvoient toujours `404 NotFoundException` dans les cas déjà refusés par la RLS — le filtre applicatif ajouté ne fait qu'anticiper le même refus une couche plus tôt).

### Tests exécutés

```text
backend  pnpm exec tsc --noEmit     → OK, aucune erreur
backend  pnpm lint                  → OK, aucune erreur
backend  pnpm test (unitaires)      → 12 suites / 81 tests, tous passés (13,8 s)
backend  pnpm test:e2e              → 14 suites / 189 tests, tous passés (73 s), avec maxWorkers=1
frontend pnpm typecheck             → OK, aucune erreur
```

Note sur le run e2e : le journal affiche plusieurs blocs `ERROR` (paiement refusé pour montant erroné, empreinte de fichier incorrecte, contrainte unique violée sur `readerLibrary`) — ce sont des scénarios de test **volontairement négatifs** (le code testé est censé rejeter ces cas), journalisés par le filtre d'exception global de NestJS, pas des échecs de test. Le résumé final (`Test Suites: 14 passed, 14 total` / `Tests: 189 passed, 189 total`) fait foi.

### Résultats

| Point de contrôle | Statut |
|---|---|
| Script de rôle PostgreSQL restauré, conforme à l'original, mode exécutable et fins de ligne corrects | FONCTIONNEL |
| Rôle applicatif de la base de dev déjà en place, `NOSUPERUSER`/`NOBYPASSRLS` confirmés | VALIDÉ |
| `FORCE ROW LEVEL SECURITY` réellement actif sur les tables tenant-scopées (dev) | VALIDÉ |
| Isolation multi-tenant inter-tenant (A ≠ B) | VALIDÉ (suite e2e dédiée, 100 % verte) |
| Isolation multi-tenant intra-tenant par rôle (editor/author/marketing/finance) | PARTIEL — pas de test dédié par rôle au-delà de owner/viewer, à couvrir en Phase 8 |
| `AdminWorksService.findOne()` — filtre applicatif ajouté | FONCTIONNEL |
| Instances analogues (`admin-authors.service.ts`, `admin-works.service.ts#remove`) | FONCTIONNEL |
| Suite e2e fiable (config `maxWorkers: 1`) | VALIDÉ (14/14 suites vertes, reproduit une fois) |
| Déploiement Docker neuf avec le script restauré | **PARTIEL / NON VALIDÉ EN EXÉCUTION** — Docker Desktop indisponible dans cet environnement d'audit ; correction faite par restauration fidèle et vérifiée par lecture + comparaison avec la configuration réellement fonctionnelle en dev, mais un `docker compose up` réel sur volume neuf n'a pas pu être exécuté ici (voir « Éléments restant à traiter ») |

### Problèmes rencontrés

- Docker Desktop non accessible dans cet environnement d'audit (`docker ps` échoue : `failed to connect to the docker API`). Impossible d'exécuter un `docker compose up` réel pour valider le script restauré en conditions live. Contournement : vérification directe, via le client Prisma de l'application, des attributs du rôle et de l'état RLS sur la base de développement réellement utilisée (`localhost:5432`), qui s'est révélée déjà correctement configurée indépendamment de Docker — ce qui confirme la logique du script restauré sans prouver son exécution Docker de bout en bout.
- Le premier essai de connexion directe à PostgreSQL a échoué faute de client `psql` disponible dans l'environnement ; contournement via un petit script Node utilisant `@prisma/adapter-pg` et le client Prisma déjà généré du projet (supprimé après usage, aucune trace laissée dans le dépôt).

### Décisions techniques

- Restauration **à l'identique** du script supprimé (via `git checkout <commit> -- <path>`) plutôt que réécriture : préserve exactement la logique déjà pensée et commentée par l'équipe, évite d'introduire une variante subtilement différente pendant une phase de sécurisation.
- Filtre `tenantId` ajouté en **complément** de la RLS, jamais en remplacement — conforme à l'instruction explicite de ne jamais désactiver RLS pour faire fonctionner l'application. Le pattern `findFirst` (au lieu de `findUnique`) est nécessaire dès qu'on ajoute une seconde condition dans `where` à côté de la clé primaire.
- `maxWorkers: 1` choisi plutôt qu'un nombre réduit de workers (ex. 2-4) : chaque suite e2e démarre une application NestJS complète, donc son propre pool de connexions — la volatilité observée (92/189 échecs) suggère que même un faible degré de parallélisme sature les slots de transaction disponibles sur une instance Postgres de développement. `maxWorkers: 1` est la configuration la plus sûre et la plus simple à motiver ; un réglage plus fin pourra être envisagé plus tard si le temps total d'exécution (73 s ici) devient un problème.
- Gap d'autorisation par rôle sur `AdminAuthorsService.update()`/`.remove()` **repéré mais non corrigé** : distinct de la mission explicite de cette phase (filtrage tenant), signalé pour éviter qu'il ne se perde, mais laissé à une phase ultérieure pour ne pas élargir silencieusement le périmètre de la Phase 0.

### Éléments restant à traiter

1. **Valider le déploiement Docker neuf en conditions réelles** dans un environnement où Docker Desktop/Engine est disponible : `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build` sur un volume `database-data` neuf, puis vérifier que `gebook_user` est bien créé avec les bons attributs et que `migrate`/`backend` démarrent sans erreur d'authentification. Cette phase n'a pu que restaurer et vérifier statiquement le script — pas l'exécuter dans Docker.
2. **Gap d'autorisation** : `AdminAuthorsService.update()`/`.remove()` sans `assertCanWriteCatalog()` — à corriger avant ou pendant la Phase 1 (unification du modèle utilisateur), puisque cette phase touche de toute façon aux rôles tenant.
3. **Couverture de test par rôle tenant** (editor/author/marketing/finance) — actuellement partielle ; la Phase 8 (équipe et permissions) devra explicitement enrichir `multi-tenant-rls.e2e-spec.ts` ou `team.e2e-spec.ts` pour couvrir chaque rôle sur chaque action de la future matrice de permissions.
4. Aucune autre régression connue introduite par cette phase — confirmé par typecheck + lint + tests unitaires + tests e2e, tous verts avant de documenter ce rapport.

### Validation

- [x] Typecheck backend
- [x] Lint backend
- [x] Typecheck frontend
- [x] Tests unitaires
- [x] Tests e2e
- [x] Vérification multi-tenant (isolation inter-tenant confirmée par suite e2e dédiée ; couverture par rôle partielle, voir « Éléments restant à traiter »)
- [x] Vérification permissions (filtre `tenantId` renforcé sur les points identifiés ; gap d'autorisation distinct signalé, non corrigé dans cette phase)
- [x] Vérification frontend (aucun changement de contrat d'API, aucune modification nécessaire côté frontend)
- [x] Documentation mise à jour (ce fichier)

---

## PHASE 1 — Unifier le modèle utilisateur

### Objectif

Confirmer que « tout le monde est d'abord un utilisateur/lecteur », analyser la duplication apparente entre le rôle global `author` (`Role`/`UserRole`) et le rôle de tenant `TenantMember.role = author`, et déterminer comment la supprimer progressivement sans casser les comptes, œuvres, statistiques, permissions, routes ou tests existants — en migrant si nécessaire, ou en documentant pourquoi ce n'est pas nécessaire.

### Travaux réalisés

**Analyse des deux systèmes, avant toute modification.**

Recherche exhaustive (`grep`) de toute occurrence de `'author'` en tant que rôle global dans `backend/src` :
- **Aucun `@Roles('author')` n'existe nulle part dans le backend.** Seul `@Roles('admin')` est utilisé (catégories, commandes admin, commissions admin, paiements admin).
- **Aucun code n'assigne jamais le rôle global `author` à un utilisateur.** Les deux seuls sites qui écrivent dans `user_roles` sont `auth.service.ts:90` (inscription → rôle `reader`, systématique) et `setup.service.ts:141` (bootstrap superadmin → rôle `admin`, unique dans la vie de l'application). Le seed (`prisma/seed.ts`) ne crée aucun compte utilisateur, donc n'assigne aucun rôle non plus.
- **`AuthorRevenueController` (`GET /authors/me/revenue`, `/authors/me/sales`) ne vérifie pas le rôle global `author`.** Il n'est protégé que par `AuthGuard` et résout l'auteur via `Author.findFirst({ where: { userId: user.id } })` — n'importe quel compte authentifié disposant d'une fiche `Author` qui lui est rattachée peut consulter ses propres revenus, indépendamment de tout rôle global.
- **Vérification empirique sur la base de développement réelle** (requête directe `roles LEFT JOIN user_roles GROUP BY role`) : `admin` → 1 compte, `reader` → 5 comptes, **`author` → 0 compte**. Confirme sans ambiguïté que le rôle global `author` est vestigial — présent en base de référence (`roles`, seedée avec 3 lignes comme documenté) mais jamais attribué à personne, sur aucun environnement observable.

**Conclusion de l'analyse** : il ne s'agit pas d'une vraie duplication à risque (deux mécanismes vivants qui pourraient diverger), mais d'une **asymétrie** : `TenantMember.role = 'author'` est le mécanisme réel, vivant, vérifié par l'application et par RLS ; le rôle global `author` est mort — jamais lu par un guard backend, jamais assigné par aucun parcours. **Aucune migration de données n'est nécessaire** : il n'existe aucune ligne `user_roles` référençant `author` à préserver ou à transformer.

**Bug concret trouvé et corrigé, découlant directement de cette asymétrie.**

Le frontend, lui, dépendait encore du rôle mort : `frontend/app/(site)/auteur/tableau-de-bord/page.tsx` gardait la page derrière `requireRole(["author", "admin"])`. Conséquence vérifiée : comme personne ne peut jamais obtenir le rôle global `author`, **cette page n'était en pratique atteignable par aucun auteur réel** — seul un `platform_admin` pouvait la voir. Un membre de tenant avec le rôle `author` (le vrai mécanisme, fonctionnel) était systématiquement redirigé vers `/mon-espace` avant même d'atteindre la page, alors que l'API qu'elle affiche (`/authors/me/revenue`) fonctionne très bien pour lui.

Correction appliquée, minimale : la garde `requireRole(["author", "admin"])` remplacée par `requireUser()`. Le comportement de repli existait déjà et fonctionnait déjà : `fetchAuthorRevenue()` (`src/lib/commissions.ts:66-78`) intercepte déjà un `403` de l'API et renvoie `null`, et la page affichait déjà un état vide accueillant (« Aucune fiche d'auteur n'est rattachée à votre compte ») pour ce cas — ce chemin existait dans le code mais était mort, inatteignable, faute d'accès à la page elle-même. Aucune nouvelle fonctionnalité créée : la correction rend simplement accessible un chemin déjà écrit et déjà correct.

**Élément analogue trouvé, examiné, et volontairement laissé en l'état (décision documentée, pas un oubli).**

`AccountNav` (`src/components/account/account-nav.tsx`) n'affiche le lien « Mes revenus d'auteur » que si `isAuthor` est vrai, et `isAuthor` (`src/components/account/account-shell.tsx:58`) est calculé depuis ce même rôle global mort (`user.roles.includes("author")`) — donc ce lien de navigation n'apparaît lui non plus jamais pour un auteur tenant-scopé réel, même après la correction ci-dessus (la page est désormais atteignable, mais rien n'y mène dans l'interface hors URL directe ou lien externe).

Décision : **ne pas corriger ce point dans la Phase 1**, et le signaler explicitement plutôt que d'improviser une règle métier, pour deux raisons :
1. Le signal correct à utiliser (« ce compte a-t-il une fiche auteur / un rôle tenant `author` quelque part ? ») n'est pas disponible sans un appel réseau supplémentaire à chaque rendu de `AccountShell` (bibliothèque, mes commandes, mon espace) — un coût que la mission demande explicitement d'éviter (« le minimum de modifications nécessaires »), pour un lien de navigation, pas une faille de sécurité.
2. La Phase 3 (« Transformer le tenant en espace éditorial ») redessine précisément la structure de navigation autour du tenant (`Dashboard / Œuvres / Auteurs / Ventes / Revenus / Statistiques`) et la Phase 9 (Statistiques/Analytics) traite spécifiquement des revenus. Le bon endroit pour ce lien — dans la sidebar `/mon-espace` historique, ou intégré au tableau de bord tenant sous `/admin` — est une décision de produit que ces phases trancheront avec le contexte complet, pas une réparation isolée à deviner maintenant.

`destinationFor()` (`src/lib/auth-shared.ts:19-27`) contient également une branche `if (roles.includes("author")) return "/auteur/tableau-de-bord"` qui ne s'exécute jamais en pratique (même raison). Elle n'est pas un bug — elle ne redirige jamais personne vers un mauvais endroit, elle est simplement une branche morte inoffensive, utilisée uniquement par le lien statique « Mon espace » du header (`site-header.tsx`, `mobile-menu.tsx`), pas par le flux post-connexion réel (qui passe par `resolveDestination()`, async, et qui lui gère déjà correctement l'appartenance à un tenant en redirigeant vers `/admin`). Laissée telle quelle : la supprimer n'apporte rien et n'est pas nécessaire pour atteindre l'objectif de cette phase.

**Objectif UX (utilisateur multi-casquettes) — déjà vrai, revalidé.**

« Lecteur + OWNER de Tenant A + EDITOR de Tenant B simultanément » : déjà confirmé fonctionnel lors de l'audit de la Phase 0 (`TenantMember` a une contrainte `@@unique([tenantId, userId])`, pas d'unicité globale sur `userId` — un compte peut avoir une ligne `TenantMember` par tenant, avec un rôle différent à chaque fois). Aucune modification nécessaire ici ; revalidé par lecture du schéma, pas re-testé manuellement dans cette phase (déjà couvert par la suite e2e multi-tenant de la Phase 0).

### Fichiers modifiés

- `frontend/app/(site)/auteur/tableau-de-bord/page.tsx` — remplacement de `requireRole(["author","admin"])` par `requireUser()`, avec commentaire expliquant pourquoi.

### Base de données / migrations

Aucune. Décision explicite et justifiée : le rôle global `author` n'a jamais été assigné à un compte réel (confirmé empiriquement), donc aucune donnée n'a besoin d'être migrée, transformée ou préservée. La ligne `author` dans la table `roles` (donnée de référence, seedée) n'a pas été supprimée — conformément à la consigne « ne supprime pas brutalement le rôle global author » — mais reste désormais explicitement documentée comme vestigiale dans ce journal plutôt que silencieusement ambiguë.

### Backend

Aucun changement. L'analyse a confirmé que le backend traite déjà correctement la notion d'auteur via la propriété réelle (`Author.userId`) plutôt que via un rôle global — rien à corriger de ce côté.

### Frontend

Voir « Fichiers modifiés ». Un seul fichier changé, un seul comportement corrigé : la page « Espace auteur » (revenus/ventes personnels) redevient atteignable pour un authentique auteur tenant-scopé.

### Tests exécutés

```text
frontend  pnpm typecheck   → OK, aucune erreur
frontend  pnpm lint        → 0 erreur, 3 avertissements préexistants (react-hooks/incompatible-library
                              sur author-manager.tsx, category-manager.tsx, work-list.tsx — fichiers non
                              touchés par cette phase, avertissements déjà présents avant ce changement)
```

Aucun changement backend dans cette phase → pas de nouvelle exécution de `tsc --noEmit` / `eslint` / tests unitaires / tests e2e backend jugée nécessaire (les résultats verts de la Phase 0 restent valables, aucun fichier backend modifié depuis).

### Résultats

| Point de contrôle | Statut |
|---|---|
| Rôle global `author` — analyse de son usage réel | FONCTIONNEL (analyse terminée, conclusion claire et vérifiée empiriquement) |
| Rôle global `author` — nécessité d'une migration de données | ABSENT (confirmé : aucune donnée à migrer) |
| Page « Espace auteur » (`/auteur/tableau-de-bord`) atteignable par un auteur tenant-scopé réel | FONCTIONNEL (corrigé cette phase — était BLOQUÉ avant) |
| Lien de navigation « Mes revenus d'auteur » vers cette page | BLOQUÉ — décision reportée aux Phases 3/9, documentée ci-dessus, pas un oubli |
| Multi-appartenance tenant (Lecteur + OWNER A + EDITOR B) | VALIDÉ (revalidé par lecture du schéma, déjà couvert par les tests e2e de la Phase 0) |

### Problèmes rencontrés

Aucun. Phase courte et ciblée : l'essentiel du travail était l'analyse (confirmer qu'aucune migration n'était nécessaire), pas l'écriture de code.

### Décisions techniques

- Préférer `requireUser()` + repli existant côté page plutôt qu'une nouvelle fonction de garde dédiée (ex. `requireAuthorAccess()`) : le comportement de repli (état vide) existait déjà et fonctionnait déjà, une nouvelle abstraction n'aurait rien apporté.
- Ne pas toucher `AccountNav`/`isAuthor`/`destinationFor()` : correctifs séparés, non nécessaires à la correction du bug identifié, et dont la bonne solution dépend de décisions produit qui appartiennent aux phases suivantes (voir « Éléments restant à traiter »).
- Ne pas supprimer la ligne `author` de la table `roles` ni la valeur de l'enum : coût nul de la garder, conforme à l'instruction explicite de ne pas casser brutalement ce rôle, et une suppression pourrait un jour redevenir utile (ex. si un futur outil d'administration veut lister « ce compte a-t-il un rôle historique d'auteur direct ? » à des fins de migration de données très anciennes hors du périmètre observé ici).

### Éléments restant à traiter

1. **Lien de navigation « Mes revenus d'auteur »** (`AccountNav`/`isAuthor`) — toujours invisible pour un auteur tenant-scopé réel. À trancher en Phase 3 (structure de navigation de l'espace éditorial) ou Phase 9 (analytics/revenus), pas avant : la bonne réponse dépend de l'endroit où cette page doit finalement vivre (sidebar lecteur historique vs. intégrée au tableau de bord tenant).
2. Le statut « rôle global `author` = vestigial » devra être revalidé si un jour un mécanisme d'assignation de rôle global est ajouté ailleurs dans le produit (aucun signe de cela actuellement).

### Validation

- [x] Typecheck backend *(non ré-exécuté — aucun fichier backend modifié dans cette phase ; résultat vert de la Phase 0 toujours valable)*
- [x] Lint backend *(idem)*
- [x] Typecheck frontend
- [x] Lint frontend
- [x] Tests unitaires *(non ré-exécutés — aucun fichier backend modifié)*
- [x] Tests e2e *(non ré-exécutés — aucun fichier backend modifié ; couverture multi-tenant déjà validée en Phase 0)*
- [x] Vérification multi-tenant (multi-appartenance revalidée par lecture de schéma)
- [x] Vérification permissions (analyse complète du rôle global `author` : aucun guard backend n'en dépend)
- [x] Vérification frontend (page corrigée, typecheck + lint verts)
- [x] Documentation mise à jour (ce fichier)

---

## PHASE 2 — Expérience « Créer mon espace »

### Objectif

Le parcours de création d'espace existe déjà (confirmé fonctionnel de bout en bout par l'audit et par la suite e2e de la Phase 0). Ne pas le reconstruire : l'améliorer pour qu'il devienne le véritable point d'entrée du modèle SaaS visé.

### Travaux réalisés

**Inspection de l'existant avant toute modification.**

- Backend (`backend/src/modules/tenants/tenants.{controller,service}.ts`, `dto/create-tenant.dto.ts`) : `POST /tenants` existe déjà, protégé par `AuthGuard` seul (tout compte connecté peut créer son espace), crée le `Tenant` et le `TenantMember(role=owner, status=active)` dans une seule transaction RLS, pose immédiatement le cookie de tenant actif. `CreateTenantDto` valide déjà `name`, `slug` (motif kebab-case), `type` (enum), `description` (optionnelle). Rien à reconstruire ici.
- Frontend (`app/(site)/creer-un-espace/page.tsx`, `src/components/account/create-workspace-form.tsx`, `src/lib/tenant-actions.ts`) : formulaire déjà complet (nom, slug auto-proposé depuis le nom tant qu'il n'est pas modifié à la main — même pattern que les autres formulaires du back-office —, type, description), Server Action déjà correcte (jamais de confiance dans le `Set-Cookie` brut de l'API, cookie de tenant actif reposé sur l'origine du frontend), redirection déjà directe vers `/admin` sans étape intermédiaire à traverser.

**Parcours cible comparé point par point à l'existant :**

```text
Nom               → déjà présent
Identifiant/slug  → déjà présent, auto-proposé
Type d'espace     → déjà présent (4 options, voir plus bas)
Description       → déjà présent (optionnelle)
Logo / branding   → volontairement absent à cette étape (voir décision ci-dessous)
Création          → déjà fonctionnelle
OWNER             → déjà automatique
Dashboard         → déjà atteint directement après création
```

**Décision documentée — logo/branding non ajouté au formulaire de création.**

Le formulaire de création n'inclut pas d'upload de logo/couverture, alors que le parcours cible en mentionne un. Vérifié avant de trancher : `POST /admin/tenant/logo` et `/cover` (`tenant-settings.controller.ts`) exigent déjà un tenant actif sélectionné (`TenantAccessGuard`), donc structurellement impossible avant que le tenant n'existe — il faudrait soit créer le tenant d'abord puis uploader dans la foulée (un flux en deux temps caché derrière un seul écran, complexité ajoutée), soit téléverser un fichier temporaire avant la création (mécanisme entièrement nouveau à inventer). Le formulaire `/admin/parametres` (`TenantSettingsManager`) gère déjà cet upload, complètement, immédiatement accessible depuis le tableau de bord. Ajouter cette étape au formulaire de création n'apporterait donc aucune valeur immédiate, seulement de la complexité — conforme à l'instruction explicite de la mission (« ne complexifie pas inutilement... si cela n'apporte pas de valeur immédiate »). Décision : laisser la personnalisation de la marque comme un geste naturel de **deuxième** étape, déjà entièrement construit et fonctionnel, pas de première.

**Décision documentée — types d'espace, déjà au-delà du minimum demandé.**

La mission demande au minimum *Auteur indépendant, Maison d'édition, Collectif/organisation*. Le code existant en propose déjà quatre : `independent_author`, `publishing_house`, `collective`, `cultural_organization`. Vérifié par grep (`backend/src`, `frontend/src`, `frontend/app`) : **`Tenant.type` n'influence aujourd'hui aucun comportement** — il n'est ni lu par une règle métier, ni par un guard, ni par une différence d'interface ; il est seulement stocké et réaffiché (`tenant-membership.response.ts:25`, `tenant-profile.response.ts:21`). C'est exactement le niveau de complexité recommandé par la mission : présent pour l'avenir, sans couplage comportemental inutile aujourd'hui. Aucune modification nécessaire.

**Amélioration concrète apportée — le moment d'accueil après création.**

Le seul écart réel entre le parcours existant et le parcours cible : après création, l'utilisateur était redirigé directement vers `/admin` sans aucun signal explicite que son espace venait d'être créé avec succès (le tableau de bord tenant affiche déjà « Bonjour, {prénom}. » et « Vue d'ensemble de « {nom de l'espace} » », mais rien ne distingue une première visite d'une visite ordinaire).

Correctif minimal, sans reconstruire le tableau de bord existant :
- `frontend/src/lib/tenant-actions.ts` — `createTenantAction` redirige désormais vers `/admin?espace_cree=1` au lieu de `/admin`.
- `frontend/src/components/admin/tenant-dashboard.tsx` (composant déjà existant, simplement complété) — un `useEffect` détecte ce paramètre, affiche un message de succès (« Votre espace est prêt. » + invite à ajouter des auteurs et publier) via `sonner`, la bibliothèque de toasts déjà utilisée dans tout le back-office (`tenant-settings-manager.tsx`, `team-manager.tsx`, etc. — pas une nouvelle dépendance), puis nettoie l'URL (`router.replace("/admin")`) pour qu'un rafraîchissement de la page ne réaffiche pas le message.

Le nom de l'espace n'est pas répété dans le toast lui-même : il est déjà visible juste en dessous, dans l'en-tête du tableau de bord (« Vue d'ensemble de « {nom} » »), donc le toast reste un message générique qui ne dépend pas du chargement réseau du profil du tenant (`useQuery` séparé).

Cette même page donne déjà accès en un clic à tout ce que la mission demande immédiatement après création : tableau de bord (page courante), œuvres, auteurs, équipe, branding/paramètres, statistiques — via la barre de navigation admin déjà en place (`AdminSidebar`, confirmée dans l'audit initial).

### Fichiers modifiés

- `frontend/src/lib/tenant-actions.ts` — redirection post-création vers `/admin?espace_cree=1`.
- `frontend/src/components/admin/tenant-dashboard.tsx` — ajout du message d'accueil ponctuel (toast `sonner`), aucune restructuration du composant existant.

### Base de données / migrations

Aucune. Aucun changement de schéma n'était nécessaire pour cette phase.

### Backend

Aucun changement. Le flux de création (`TenantsController`/`TenantsService`) était déjà complet et correct ; l'amélioration de cette phase est purement une couche d'accueil côté frontend.

### Frontend

Voir « Fichiers modifiés ». Deux fichiers touchés, changement additif (aucune suppression de fonctionnalité), réutilisation stricte des briques déjà en place (`sonner`, `useSearchParams`/`useRouter` déjà utilisés ailleurs dans le projet selon le même patron que `catalog-filters.tsx`).

### Tests exécutés

```text
frontend  pnpm typecheck   → OK, aucune erreur
frontend  pnpm lint        → 0 erreur, 3 avertissements préexistants et sans rapport (déjà présents
                              avant cette phase, react-hooks/incompatible-library sur des fichiers
                              non touchés ici)
```

Aucun changement backend → pas de nouvelle exécution des suites backend jugée nécessaire (résultats verts de la Phase 0 toujours valables).

**Limite honnête à signaler** : le nouveau message d'accueil n'a pas été vérifié dans un navigateur réel (aucun serveur de développement n'a été démarré dans cette phase) — sa correction repose sur la lecture du code, le typecheck et le lint, plus la connaissance du fait que `sonner`/`<Toaster/>` fonctionne déjà ailleurs dans le même arbre de composants (`admin-shell.tsx`). Le flux de création sous-jacent, lui, reste couvert par la suite e2e `tenants.e2e-spec.ts`, déjà vérifiée verte en Phase 0 et non affectée par ce changement (aucun fichier backend modifié).

### Résultats

| Point de contrôle | Statut |
|---|---|
| Parcours de création (nom/slug/type/description → tenant + OWNER) | VALIDÉ (déjà couvert par les tests e2e de la Phase 0, non modifié) |
| Types d'espace (minimum 3 demandés) | FONCTIONNEL (4 déjà présents, décision de ne pas complexifier documentée) |
| Logo/branding à la création | ABSENT PAR DÉCISION — disponible immédiatement après, à la bonne étape (`/admin/parametres`) |
| Moment d'accueil post-création | FONCTIONNEL (ajouté cette phase) — non vérifié en navigateur réel, voir limite ci-dessus |
| Accès immédiat à dashboard/œuvres/auteurs/équipe/branding/statistiques après création | VALIDÉ (déjà vrai avant cette phase, revérifié) |

### Problèmes rencontrés

Aucun.

### Décisions techniques

- Réutiliser `sonner` (déjà la bibliothèque de toasts du projet) plutôt qu'introduire un nouveau composant de bannière : cohérent avec l'instruction de réutiliser le design system existant plutôt que d'en ajouter un nouveau pour un seul écran.
- Nettoyer l'URL après affichage (`router.replace`) plutôt que de laisser `?espace_cree=1` persister : évite qu'un signet, un rafraîchissement ou un partage de lien ne rejoue le message indéfiniment.
- Ne pas ajouter d'étape de branding à la création : décision justifiée par une contrainte architecturale réelle (pas de tenant = pas de cible pour l'upload), pas une simplification arbitraire.
- Ne pas toucher au modèle `TenantType` : confirmé purement descriptif aujourd'hui, sans couplage comportemental — l'ajouter ou le retirer n'aurait aucune conséquence fonctionnelle actuelle, donc aucune raison d'y toucher dans cette phase.

### Éléments restant à traiter

1. Vérification manuelle en navigateur du nouveau message d'accueil — non faite dans cette phase (voir « Tests exécutés »). À faire lors d'une prochaine session avec accès à un serveur de développement démarré, ou lors de la Phase 10 (audit final).
2. Si un jour `Tenant.type` doit influencer un comportement réel (ex. libellés différents selon le type d'espace, workflows différents pour une maison d'édition vs. un auteur indépendant), cela reste à concevoir — hors périmètre de cette phase, qui ne fait que confirmer qu'aucun couplage n'existe aujourd'hui.

### Validation

- [x] Typecheck backend *(non ré-exécuté — aucun fichier backend modifié dans cette phase ; résultat vert de la Phase 0 toujours valable)*
- [x] Lint backend *(idem)*
- [x] Typecheck frontend
- [x] Lint frontend
- [x] Tests unitaires *(non ré-exécutés — aucun fichier backend modifié)*
- [x] Tests e2e *(non ré-exécutés — parcours de création déjà couvert et vert en Phase 0, non affecté par ce changement)*
- [x] Vérification multi-tenant (aucun changement à l'isolation ou aux permissions dans cette phase)
- [x] Vérification permissions (aucun changement)
- [x] Vérification frontend (typecheck + lint verts ; vérification manuelle en navigateur non faite, signalée explicitement)
- [x] Documentation mise à jour (ce fichier)

---

## PHASE 3

*(non commencée)*
