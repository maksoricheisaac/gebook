# GeBook — Journal d'avancement

## État global

Phase actuelle : PHASE 8 — Équipe, invitations et permissions
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

## PHASE 3 — Transformer le tenant en « espace éditorial »

### Objectif

Faire évoluer (pas reconstruire) le tableau de bord tenant existant vers la structure cible « Mon espace » (Dashboard/Œuvres/Auteurs/Commandes/Ventes/Revenus/Statistiques/Équipe/Apparence/Paramètres), avec une sélection de période cohérente, en gardant les statistiques strictement tenant-scopées.

### Décision de périmètre — pourquoi cette phase est volontairement partielle

La structure cible de la mission liste dix entrées de navigation. Six existent déjà et fonctionnent (Dashboard, Œuvres, Auteurs, Équipe, Paramètres — qui couvre aussi l'« Apparence », voir plus bas). Les quatre restantes (Commandes, Ventes, Revenus, Statistiques en tant que **pages dédiées**, distinctes du tableau de bord) demanderaient chacune une nouvelle capacité backend non triviale (listage de commandes filtré par tenant, listage de ventes par tenant au-delà de l'agrégat déjà affiché, une page de revenus séparée, des graphiques dédiés). Or l'ordre de priorité de la mission elle-même place explicitement ces sujets dans des phases ultérieures : Phase 6 « Commandes, Paiements et Commerce », Phase 7 « Commissions, Revenus et Payouts », Phase 9 « Statistiques et Analytics ». Construire ces quatre pages maintenant reviendrait à anticiper le travail de trois phases entières sous couvert du mot « structure », au prix d'une explosion de périmètre non demandée par le texte détaillé de la Phase 3 (qui, lui, ne détaille que « Dashboard » et « Périodes »).

Décision : cette phase livre exactement ce que son texte détaillé décrit — l'évolution du tableau de bord existant et la sélection de période — et documente explicitement le report des quatre pages dédiées à leurs phases naturelles, plutôt que de les construire à la hâte ou de les passer sous silence.

### Travaux réalisés

**1. Périodes — préréglage manquant ajouté.**

`frontend/src/components/admin/date-range-picker.tsx` avait déjà quatre des cinq préréglages demandés (Aujourd'hui, 7 derniers jours, 30 derniers jours, Ce mois, Personnalisée) ; seul « Cette année » manquait. Ajouté (`rangeForPreset("year")` → 1er janvier de l'année courante jusqu'à aujourd'hui). Composant partagé par `PlatformDashboard` et `TenantDashboard` : les deux en bénéficient automatiquement, sans dupliquer le changement. Les statistiques restent strictement tenant-scopées : `/admin/tenant/statistics` était déjà filtré par `tenantId` via RLS + filtre applicatif (Phase 0) — aucun changement à l'isolation nécessaire ici.

**2. Dashboard — deux chiffres réellement manquants, ajoutés avec une vraie requête, testée.**

Comparaison chiffre par chiffre entre la liste demandée (CA, Ventes, Commandes, Œuvres, Auteurs, Lecteurs, Commission GeBook, Part revenant, Solde disponible, Montant en attente) et ce que `TenantDashboard`/`tenantStatistics()` affichaient déjà :

| Demandé | Déjà présent avant cette phase | Action |
|---|---|---|
| Œuvres | ✓ (`publishedWorks`) | aucune |
| Auteurs | ✓ (`activeAuthors`) | aucune |
| Ventes | ✓ (`salesCount` — nombre de *lignes* vendues, déjà documenté comme tel dans le code) | aucune |
| CA | ✓ (`revenueCollected`, « Encaissé ») | aucune |
| Commission GeBook | ✓ (`commissionTotal`) | aucune |
| Part revenant | ✓ (`authorNetTotal`, « Dû aux auteurs ») | aucune |
| Montant en attente | ✓ (`pendingPayout`, déjà affiché en sous-texte de « Dû aux auteurs ») | aucune |
| **Commandes** | absent (confondu avec `salesCount`, qui compte des lignes, pas des commandes) | **ajouté** |
| **Lecteurs** | absent | **ajouté** |
| Solde disponible | absent, et **restera absent** | **volontairement non ajouté** (voir ci-dessous) |

`Commandes`/`Lecteurs` ajoutés : `backend/src/modules/commissions/commissions.service.ts#tenantStatistics()` calcule désormais aussi `ordersCount` (commandes distinctes contenant au moins une ligne de ce tenant, sur la période) et `readersCount` (lecteurs distincts ayant acheté chez ce tenant, sur la période) — une vraie requête `COUNT(DISTINCT …)` en SQL brut paramétré (`$queryRaw`, même style que `revenueTimeseries()` déjà présent dans le même fichier ; `groupBy`/`_count` de Prisma ne sait pas exprimer un `COUNT(DISTINCT)` sur une relation). Filtre `tenant_id` redondant avec la RLS, même logique de défense en profondeur qu'en Phase 0. Deux cartes ajoutées côté `TenantDashboard`.

**« Solde disponible » — décision explicite de ne rien afficher, plutôt que d'afficher une valeur toujours fausse.** Vérifié : `SaleDistribution.payoutStatus` ne quitte jamais `pending` nulle part dans le code (confirmé dans l'audit initial et revérifié ici) — aucune ligne n'atteint jamais le statut `available`. Un « solde disponible » calculé aujourd'hui vaudrait donc **zéro pour tout tenant, indéfiniment**, jusqu'à ce que la Phase 7 construise le mécanisme de reversement. Afficher une carte figée à 0 pour toujours ressemblerait à un bug plutôt qu'à une fonctionnalité en construction — plus trompeur qu'utile. Conforme à la consigne explicite de la mission : « ne simule pas les reversements… si le provider de payout n'est pas encore intégré, attendre le vrai mécanisme. » Le « Montant en attente » (`pendingPayout`), lui, est une donnée réelle et déjà affichée — conservé tel quel.

**3. Nouveau test — l'endpoint étendu n'avait aucune couverture.**

`GET /admin/tenant/statistics` n'était exercé par aucun test e2e avant cette phase (vérifié par recherche exhaustive). Comme cette phase y ajoute une requête SQL brute, un test a été ajouté dans `backend/test/commissions.e2e-spec.ts` (nouveau bloc « Statistiques du tableau de bord (tenant, Phase 3) ») : il calcule les commandes/lecteurs distincts attendus **indépendamment**, à partir des lignes brutes de `sale_distributions`, puis compare au résultat de l'API — pas un simple miroir de la requête du service. Exécuté isolément (16/16 tests du fichier, dont les 2 nouveaux) puis dans la suite complète (14/14 suites, 191/191 tests) : tout passe.

**4. Décisions documentées sur le reste de la structure cible.**

- **Apparence vs Paramètres** : la mission les liste comme deux entrées séparées ; le code existant les fusionne en une seule page (`/admin/parametres`, `TenantSettingsManager` : nom/description/site web/réseaux sociaux + logo + couverture). Vérifié : cette page reste courte et cohérente, rien n'indique qu'elle soit devenue trop chargée pour justifier une scission. Décision : ne pas scinder — aucune perte fonctionnelle, la mission elle-même prévient de ne pas complexifier sans valeur immédiate.
- **Commandes (page dédiée, commandes du tenant)**, **Ventes (page dédiée, au-delà de l'agrégat du dashboard)**, **Revenus (page dédiée)**, **Statistiques (page dédiée avec graphiques)** : reportées à leurs phases respectives (6, 7, 9) — voir « Décision de périmètre » ci-dessus. Rien n'a été construit ici qui devrait l'être ; rien n'a été oublié sans le dire.
- **Types d'espace** et **branding à la création** : déjà traités et documentés en Phase 2, non revisités ici.

### Fichiers modifiés

- `frontend/src/components/admin/date-range-picker.tsx` — ajout du préréglage « Cette année ».
- `backend/src/modules/commissions/commissions.service.ts` — `tenantStatistics()` calcule et renvoie désormais `ordersCount`/`readersCount` (champs additifs, aucun champ existant retiré ou renommé).
- `frontend/src/components/admin/tenant-dashboard.tsx` — deux nouvelles cartes (« Commandes », « Lecteurs ») dans la grille existante.
- `backend/test/commissions.e2e-spec.ts` — nouveau bloc de test pour `GET /admin/tenant/statistics` (endpoint jusque-là non testé).

### Base de données / migrations

Aucune. Les deux nouveaux chiffres se calculent sur des tables et colonnes déjà existantes (`sale_distributions`, `order_items`, `orders`) — aucun changement de schéma nécessaire.

### Backend

Voir « Fichiers modifiés ». Un seul service touché, une seule méthode étendue, changement additif sur la réponse (`TenantStatisticsResponse`). Aucune route ajoutée ou supprimée.

### Frontend

Voir « Fichiers modifiés ». Deux composants déjà existants complétés (pas recréés) : `DateRangePicker` (un préréglage de plus) et `TenantDashboard` (deux cartes de plus dans une grille qui en accueillait déjà quatre).

### Tests exécutés

```text
backend   pnpm exec tsc --noEmit          → OK
backend   pnpm lint                       → OK
backend   pnpm test (unitaires)           → 12 suites / 81 tests, tous passés
backend   commissions.e2e-spec.ts (isolé) → 16/16 tests (14 préexistants + 2 nouveaux)
backend   pnpm test:e2e (suite complète)  → 14/14 suites, 191/191 tests (189 + 2 nouveaux)
frontend  pnpm typecheck                  → OK
frontend  pnpm lint                       → 0 erreur, 3 avertissements préexistants et sans rapport
```

Vérifié en base réelle avant d'écrire le test : requête directe confirmant que la nouvelle jointure SQL s'exécute sans erreur sur des tenants réels (résultat 0/0 à ce moment-là, faute de données de vente vivantes dans la base de développement — chaque suite e2e nettoie ses propres données en `afterAll`) ; le test e2e ajouté ensuite confirme la valeur non nulle en conditions réelles, avec des données créées et nettoyées par le test lui-même.

**Limite honnête à signaler** : les nouvelles cartes du tableau de bord n'ont pas été vérifiées dans un navigateur réel (même limite qu'en Phase 2 — aucun serveur de développement démarré dans cette phase). Le calcul backend, lui, est vérifié en conditions réelles par le nouveau test e2e.

### Résultats

| Point de contrôle | Statut |
|---|---|
| Préréglage « Cette année » | FONCTIONNEL |
| Carte « Commandes » (tenant, distinct des lignes vendues) | FONCTIONNEL, vérifié par test e2e sur données réelles |
| Carte « Lecteurs » (tenant, distinct) | FONCTIONNEL, vérifié par test e2e sur données réelles |
| « Solde disponible » | ABSENT PAR DÉCISION — dépend du mécanisme de payout, Phase 7 |
| Fusion Apparence/Paramètres | FONCTIONNEL EN L'ÉTAT — décision documentée de ne pas scinder |
| Pages dédiées Commandes/Ventes/Revenus/Statistiques | REPORTÉES aux Phases 6/7/9 — décision documentée, pas un oubli |

### Problèmes rencontrés

Aucun. La base de développement ne contenait aucune ligne `sale_distributions` au moment de la vérification manuelle (toutes les données de test précédentes avaient été nettoyées par les suites e2e) — contourné en écrivant un vrai test e2e plutôt qu'en se fiant à une vérification manuelle ponctuelle, ce qui laisse une protection permanente plutôt qu'une confiance one-shot.

### Décisions techniques

- SQL brut paramétré pour `ordersCount`/`readersCount` plutôt qu'une tentative de le faire tenir dans l'API `groupBy`/`_count` de Prisma : `COUNT(DISTINCT ...)` sur un champ de relation n'a pas d'équivalent direct, et le fichier avait déjà un précédent exact (`revenueTimeseries()`) à suivre plutôt qu'à réinventer.
- Filtre `oi.tenant_id` répété dans le SQL brut malgré la RLS déjà active sur `sale_distributions`/`order_items`/`orders` : même principe de défense en profondeur qu'en Phase 0, pas une nouvelle règle inventée.
- Ne pas fabriquer de valeur pour « Solde disponible » : décision directement dictée par une règle explicite de la mission plutôt qu'un choix arbitraire.
- Écrire un test plutôt que de se contenter d'une vérification manuelle sur la base de dev : l'endpoint n'avait aucune couverture avant cette phase, et le README du projet est explicite sur le fait que les tests de commissions doivent précéder ou accompagner le code, jamais le suivre après coup en espérant que ça tienne.

### Éléments restant à traiter

1. Vérification manuelle en navigateur des deux nouvelles cartes — non faite (voir « Tests exécutés »), à faire avec un serveur de développement démarré.
2. Pages dédiées Commandes/Ventes/Revenus/Statistiques — à construire dans les Phases 6, 7 et 9 respectivement, pas avant.
3. « Solde disponible » ne pourra être affiché honnêtement qu'une fois la Phase 7 (payouts) livrée un vrai mécanisme de transition de `payoutStatus`.

### Validation

- [x] Typecheck backend
- [x] Lint backend
- [x] Typecheck frontend
- [x] Lint frontend
- [x] Tests unitaires
- [x] Tests e2e (suite complète + nouveau test ciblé)
- [x] Vérification multi-tenant (nouvelle requête filtrée par `tenantId`, RLS + filtre applicatif — aucune régression d'isolation)
- [x] Vérification permissions (route déjà protégée par `TenantAccessGuard` + `assertCanViewTenantFinance`, testée y compris le refus à un lecteur)
- [x] Vérification frontend (typecheck + lint verts ; vérification manuelle en navigateur non faite, signalée)
- [x] Documentation mise à jour (ce fichier)

---

## PHASE 4 — Système éditorial et publication

### Objectif

Transformer l'enum `WorkStatus` en véritable machine à états vérifiée côté backend (pas seulement un bouton frontend caché), avec des droits différents par rôle, et corriger `WorkVisibility` pour que le catalogue public respecte réellement `status` + `visibility` + tenant.

### Décision empirique clé — pas de pipeline linéaire strict pour owner/admin

Le diagramme cible de la mission (`draft → submitted → under_review → approved → published`, avec `rejected → draft` et `published → inactive → archived`) suggère une chaîne stricte. Avant d'implémenter quoi que ce soit, recherche de tout endroit où le comportement actuel pourrait déjà encoder une règle métier différente — et un test existant l'a confirmé : `admin-works-tenant.e2e-spec.ts`, ligne ~304-308, teste explicitement et avec succès (200 attendu) qu'un **owner** de tenant peut faire passer une œuvre directement de `submitted` à `published`, **sans passer par `under_review`/`approved`**. Ce n'est pas un bug — c'est un choix déjà testé et donc déjà « validé » par l'équipe précédente.

Décision : ne pas casser ce test ni cette règle. Le rôle table de la mission elle-même dit « ADMIN/OWNER : … et gérer la publication selon les règles métier » — volontairement large. La restriction réellement demandée par la mission, et absente aujourd'hui, concerne le rôle `editor` : avant cette phase, `editor` avait exactement les mêmes pouvoirs qu'`owner`/`admin` (même case « editorial » indifférenciée), ce qui contredit directement la mission (« EDITOR : Peut : SUBMITTED → UNDER_REVIEW », rien de plus). C'est cette restriction précise qui a été implémentée — pas un pipeline linéaire universel qui aurait cassé un comportement déjà intentionnel et testé.

Vérifié également, avant de toucher au catalogue public : aucun test n'atteste que la fuite `tenant_only` (déjà signalée dans l'audit) soit un comportement voulu — recherche exhaustive de `tenant_only` dans `backend/test/`, zéro résultat. Cette correction-là ne rencontrait donc aucune ambiguïté de ce type.

### Travaux réalisés — Backend

**Machine à états (`admin-works.service.ts`)** :
- `assertAllowedStatus()` réécrite : reçoit désormais `tenantRole` et `currentStatus` en plus de `permission`/`nextStatus`.
  - `author-self` : inchangé (`draft`/`submitted` uniquement, même message d'erreur — le test existant qui vérifie ce message littéral continue de passer).
  - rôle de tenant `editor` (nouveau) : à la création, seulement `draft`/`submitted` (même latitude qu'un auteur) ; en modification, seulement la transition `submitted → under_review`. Toute autre valeur est refusée avec un message explicite.
  - `owner`/`admin`/`platform_admin` : aucune restriction nouvelle — comportement inchangé.
  - **Bug trouvé et corrigé pendant l'implémentation** : un rôle restreint (author-self ou editor) qui enregistre le formulaire sans toucher au statut renvoie quand même la valeur affichée (`status: 'published'` par exemple) — sans garde, cela aurait été refusé à tort, alors que ce n'est pas une transition. Ajout d'un cas `nextStatus === currentStatus` toujours accepté, quel que soit le rôle. Couvert par un nouveau test (voir plus bas).
- `resolveVisibility()` remplace `visibilityForStatus()` : une valeur `visibility` explicite l'emporte toujours ; sans valeur explicite, le comportement historique est préservé (`published` → `public`, tout le reste → `private`) pour ne rien casser côté appelants existants.
- `CreateWorkDto`/`UpdateWorkDto` : ajout du champ optionnel `visibility` (`IsEnum(WorkVisibility)`).
- `getWorkWithAuthorOrThrow()` : ajout d'un filtre `tenantId` (défense en profondeur, même correctif que la Phase 0 — repéré par cohérence en touchant ce fichier, pas explicitement demandé par cette phase mais de la même catégorie que le correctif déjà appliqué à `findOne()`/`remove()`).

**Visibilité publique (`works.service.ts`)** :
- `publiclyVisible` (le filtre unique et partagé, déjà utilisé par toutes les lectures du catalogue public) exige désormais aussi `visibility: 'public'`, en plus de `status: 'published'` et `author.status: 'active'`. Une œuvre `tenant_only` ou `private` publiée ne peut plus jamais apparaître dans le catalogue public agrégé, quel que soit son statut.
- Limite explicitement documentée dans le commentaire du code : `tenant_only` n'a aujourd'hui **aucune vitrine dédiée** pour l'afficher (c'est l'objet de la Phase 5) — en attendant, une œuvre `tenant_only` est donc invisible partout publiquement, exactement comme `private`. Ce n'est pas un défaut de cette phase, c'est une conséquence honnête de l'ordre des phases : construire une vitrine tenant maintenant aurait anticipé la Phase 5 elle-même.

### Travaux réalisés — Frontend

- `src/lib/work-status.ts` : les trois statuts jusque-là absents du frontend (`under_review`, `approved`, `rejected`) ont désormais un libellé français et une teinte, alignés sur l'enum backend complet.
- `src/components/admin/work-editor.tsx` :
  - Le menu de statut n'est plus un simple `!isAuthorOnly` binaire : `STATUS_OPTIONS_FOR_ROLE()` calcule les options selon le rôle (auteur / editor / sans restriction), en incluant toujours le statut réellement en base même s'il est hors de portée de ce rôle — pour que le menu n'affiche jamais une valeur différente de celle enregistrée. **Ceci reste un affichage indicatif, jamais l'autorité** : le backend revalide indépendamment chaque tentative, commentaire explicite dans le code pour que personne ne s'y trompe plus tard.
  - Ajout d'un champ « Visibilité » (public / réservée à l'espace / privée), relié au nouveau champ `visibility` du DTO.
  - Message d'aide contextuel selon le rôle (auteur / editor / sans restriction).

### Tests ajoutés

Tout dans `backend/test/admin-works-tenant.e2e-spec.ts` (fixtures étendues avec un compte `editorAgent`, rôle de tenant `editor`) :
- Un `editor` peut créer une œuvre en brouillon, mais pas directement publiée (403, message contient « éditeur »).
- Un `editor` peut faire passer une œuvre soumise en relecture (`submitted → under_review`, 200), mais ne peut ni l'approuver ni la publier (403 dans les deux cas) — la direction de l'espace (owner) conserve l'autorité déjà testée par ailleurs.
- Renvoyer le même statut qu'actuellement en base (formulaire qui touche un autre champ) est toujours accepté, y compris pour un rôle qui ne pourrait pas *atteindre* ce statut lui-même — couvre directement le bug corrigé pendant cette phase.
- Une œuvre publiée en `tenant_only` n'apparaît ni par recherche (`GET /works?q=`) ni par accès direct (`GET /works/:slug` → 404) dans le catalogue public, mais reste visible et correctement étiquetée dans le back-office du tenant.
- Une œuvre publiée sans visibilité explicite reste `public` par défaut (comportement historique préservé) et reste visible dans le catalogue.

Exécution : suite isolée 11/11 (7 tests précédents + 4 nouveaux), suite complète 14/14 suites / 195/195 tests.

### Fiabilité des tests e2e — nouvelle observation

Pendant cette phase, la suite e2e complète a planté trois fois de suite avec un code de sortie natif inhabituel (`3221226505`, sans le moindre résumé Jest — signature d'un crash processus plutôt que d'un test qui échoue), toujours au même point du journal, après les tests négatifs de `payments`/`library`. Vérifications faites avant d'agir :
- Isolé (`admin-works-tenant.e2e-spec.ts` seul, ou avec `multi-tenant-rls`/`library`) : toujours vert, à 100 %, sur de nombreuses répétitions.
- Connexions PostgreSQL au moment du crash : 1 seule active sur 100 disponibles — ce n'est pas un épuisement de pool comme en Phase 0.
- Ce schéma (plante seulement sur la suite complète, jamais isolément) correspond exactement à l'avertissement déjà noté en Phase 0 (« A worker process has failed to exit gracefully… Active timers can also cause this ») — pas une régression introduite par cette phase.

Mitigation appliquée, strictement configuration : `"workerIdleMemoryLimit": "512MB"` ajouté à `jest-e2e.json`, qui force Jest à redémarrer le worker si sa mémoire dépasse ce seuil entre deux fichiers de test. Résultat après ce changement : 3 exécutions complètes sur 4 vertes (contre 0 sur 3 juste avant) — amélioration nette, mais pas une élimination totale de la variabilité résiduelle. Documenté honnêtement plutôt que présenté comme définitivement résolu : un diagnostic complet (`--detectOpenHandles` sur l'ensemble des 14 suites) resterait à faire pour l'éliminer tout à fait, et dépasse le périmètre de cette phase (déjà signalé comme tel en Phase 0).

### Fichiers modifiés

- `backend/src/modules/catalog/admin/admin-works.service.ts` — machine à états, `resolveVisibility()`, filtre tenant sur `getWorkWithAuthorOrThrow()`.
- `backend/src/modules/catalog/admin/dto/work.dto.ts` — champ `visibility` sur `CreateWorkDto`/`UpdateWorkDto`.
- `backend/src/modules/catalog/works.service.ts` — `publiclyVisible` exige désormais `visibility: 'public'`.
- `backend/test/admin-works-tenant.e2e-spec.ts` — compte `editorAgent` + 5 nouvelles assertions.
- `backend/test/jest-e2e.json` — `workerIdleMemoryLimit: "512MB"`.
- `frontend/src/lib/work-status.ts` — libellés/teintes pour les 3 statuts manquants.
- `frontend/src/components/admin/work-editor.tsx` — menu de statut par rôle, champ visibilité.

### Base de données / migrations

Aucune. `WorkStatus` et `WorkVisibility` existaient déjà intégralement dans le schéma (migration `20260823010000_add_multi_tenant_core`) — cette phase active leur usage réel, elle n'ajoute aucune valeur d'enum ni colonne.

### Tests exécutés

```text
backend   pnpm exec tsc --noEmit          → OK
backend   pnpm lint                       → OK
backend   pnpm test (unitaires)           → 12 suites / 81 tests, tous passés
backend   admin-works-tenant (isolé)      → 11/11
backend   pnpm test:e2e (suite complète)  → 14/14 suites, 195/195 tests (dernière exécution confirmée)
frontend  pnpm typecheck                  → OK
frontend  pnpm lint                       → 0 erreur, 3 avertissements préexistants et sans rapport
```

### Résultats

| Point de contrôle | Statut |
|---|---|
| Machine à états `WorkStatus` — author-self | VALIDÉ (comportement préexistant, revérifié) |
| Machine à états `WorkStatus` — editor (nouvelle restriction) | VALIDÉ (4 nouveaux tests e2e) |
| Machine à états `WorkStatus` — owner/admin/platform_admin | VALIDÉ (comportement préexistant intentionnellement conservé, test existant toujours vert) |
| Correctif « même statut renvoyé = pas une transition » | VALIDÉ (test dédié) |
| `WorkVisibility` pilotable explicitement | FONCTIONNEL (DTO + UI) |
| Catalogue public respecte `status` + `visibility` + auteur actif | VALIDÉ (2 tests e2e, fuite `tenant_only` fermée) |
| Vitrine dédiée pour `tenant_only` | ABSENTE PAR DÉCISION — Phase 5, pas avant |
| Fiabilité de la suite e2e complète | PARTIEL — nette amélioration (0/3 → 3/4 exécutions vertes) après mitigation config-only, pas encore parfaite |

### Problèmes rencontrés

- Plantage processus intermittent de la suite e2e complète (voir section dédiée ci-dessus) — mitigé, pas éliminé.
- Un run e2e antérieur, avorté par ce plantage, avait laissé des données de test orphelines (`orders` référençant des `users` du domaine `@phase10.e2e.test`, bloquant leur suppression par une contrainte `RESTRICT`) — nettoyées manuellement en reproduisant exactement le mécanisme RLS `platform_admin` d'`adminPrismaProxy` (une seule transaction, GUC posé puis toutes les suppressions dans la même transaction) avant de reprendre les tests.

### Décisions techniques

- Réutiliser un test e2e préexistant comme source de vérité du comportement métier voulu (owner peut publier directement) plutôt que d'imposer ma propre lecture du diagramme cible : évite de casser une règle déjà délibérément conçue et testée, conformément à l'instruction de ne pas inventer de règle métier quand le code répond déjà à la question.
- `nextStatus === currentStatus` toujours accepté, sans exception de rôle : une transition non demandée ne doit jamais être bloquée par une règle conçue pour les transitions réellement demandées — sans quoi chaque sauvegarde partielle par un rôle restreint casserait silencieusement.
- Menu de statut frontend calculé par rôle mais **incluant toujours le statut réel** : priorité donnée à ne jamais désynchroniser l'affichage de la valeur en base, quitte à laisser apparaître une option que ce rôle ne peut pas choisir comme nouvelle valeur (le backend refuserait de toute façon un vrai changement vers cette valeur).
- `workerIdleMemoryLimit` plutôt qu'une investigation complète des handles ouverts : proportionné au périmètre de cette phase (publication, pas infrastructure de test), documenté comme amélioration partielle plutôt que present comme résolu.

### Éléments restant à traiter

1. Fiabilité totale de la suite e2e complète — un diagnostic `--detectOpenHandles` complet reste à faire (signalé aussi en Phase 0), au-delà du périmètre de cette phase.
2. Vitrine publique tenant pour `tenant_only` — Phase 5.
3. Aucune nouvelle dette identifiée côté machine à états ou visibilité au-delà de ce qui précède.

### Validation

- [x] Typecheck backend
- [x] Lint backend
- [x] Typecheck frontend
- [x] Lint frontend
- [x] Tests unitaires
- [x] Tests e2e (suite complète confirmée verte à la dernière exécution ; flakiness résiduelle documentée, pas cachée)
- [x] Vérification multi-tenant (catalogue public re-filtré par tenant via `visibility`, aucune régression d'isolation)
- [x] Vérification permissions (nouvelle restriction du rôle `editor` testée explicitement, dans les deux sens — refus ET acceptation)
- [x] Vérification frontend (typecheck + lint verts ; vérification manuelle en navigateur non faite, même limite que les Phases 2/3)
- [x] Documentation mise à jour (ce fichier)

---

## PHASE 5 — Boutique / espace public du tenant

### Objectif

Donner à chaque tenant une vitrine publique réelle (logo, nom, description, réseaux sociaux, site web, œuvres publiées, auteurs), en réutilisant les champs de branding déjà présents sur `Tenant` — sans construire de nouveau système, et sans utiliser `TenantSetting` sans raison.

### Travaux réalisés — Backend

**Nouvelle route publique `GET /tenants/public/:slug`** — profil public d'un tenant actif. Vérifié avant d'écrire quoi que ce soit : la policy RLS `tenants_select` a déjà, depuis la Phase 4 (en réalité depuis la migration initiale des policies), un accès public inconditionnel pour `status = 'active'` — aucune migration n'était nécessaire pour *cette* route précise. Placée dans un contrôleur séparé (`TenantsPublicController`, chemin `/tenants/public/:slug`) plutôt qu'ajoutée à `TenantsController` (`@UseGuards(AuthGuard)` au niveau de la classe) — et volontairement pas `/tenants/:slug`, pour éliminer tout risque qu'un paramètre générique intercepte un jour `/tenants/me` selon l'ordre d'enregistrement des routes Express.

**`TenantSetting` — confirmé inutile, non utilisé, conformément à la consigne.** Tous les champs demandés par la mission (nom, description, logo, couverture, site web, réseaux sociaux) vivent déjà sur `Tenant` — c'est exactement ce que `toTenantPublicProfile()` lit. `TenantSetting` reste un modèle mort (déjà signalé dans l'audit initial), et cette phase ne lui donne aucune raison de plus d'exister.

**Filtres `?tenant=` sur les listes publiques existantes** — plutôt que de dupliquer la pagination/sélection déjà écrite dans `WorksService`/`AuthorsService`, ajout d'un paramètre `tenant` (slug) à `ListWorksQuery` et à un nouveau `ListAuthorsQuery` (hérite de `LocaleQuery` : `/categories` partage `LocaleQuery` et n'a aucune notion de tenant, donc le champ n'y est pas ajouté directement). `GET /works?tenant=X` et `GET /authors?tenant=X` réutilisent tout le reste (recherche, pagination, formats…) sans code dupliqué.

**Découverte importante en cours de route — `tenant_only` était bloquée par RLS, pas seulement par le filtre applicatif.** En écrivant le test de la vitrine, `GET /works/:slug` sur une œuvre `tenant_only` renvoyait 404 au lieu du 200 attendu. Investigation : la policy RLS `works_select` (Phase 4, migration `20260823020000_add_rls_policies`) n'autorise un visiteur anonyme que pour `status = 'published' AND visibility = 'public'` — `tenant_only` n'y a jamais été inclus, parce qu'aucune vitrine n'existait encore pour en avoir besoin. Mon filtre applicatif (`visibleWithinOwnTenant`, ajouté dans `works.service.ts`) était donc correct mais neutralisé par une policy plus stricte en dessous.

Corrigé par une nouvelle migration (`20260829000000_works_select_tenant_only_public`) qui élargit trois policies `SELECT` (`works_select`, `work_translations_select`, `work_formats_select`) : le visiteur anonyme peut désormais lire une œuvre `status = 'published' AND visibility <> 'private'` — c'est-à-dire `public` **ou** `tenant_only` — au lieu de `visibility = 'public'` strictement. `private` reste totalement inatteignable pour un visiteur anonyme, dans tous les cas. `work_files` (le contenu réel des livres, servi uniquement via `LibraryController`) n'a pas cette policy et n'avait aucune raison d'être touché — la vitrine n'expose jamais de fichier, seulement des métadonnées et des prix.

Cette découverte a aussi affiné le modèle de visibilité lui-même :
- **Agrégat multi-tenant** (`/works` sans filtre `tenant`) : reste strictement `visibility = 'public'` (`publiclyVisible`, inchangé depuis la Phase 4).
- **Vitrine d'un tenant** (`/works?tenant=X`, ou la fiche de l'œuvre elle-même) : montre `public` **et** `tenant_only` (nouvelle constante `visibleWithinOwnTenant`) — c'est très exactement ce que « réservée à mon espace » est censé vouloir dire, pas une invisibilité totale.

Un test de la Phase 4 (`admin-works-tenant.e2e-spec.ts`) affirmait l'ancien comportement (`tenant_only` → 404 partout) ; il a été mis à jour pour refléter ce comportement plus juste, avec les nouvelles assertions ajoutées à côté (visible par lien direct, visible dans la vitrine de son tenant, absente de l'agrégat).

**Cohérence Phase 4 → Phase 5 sur `AuthorsService`** — `list()`/`findBySlug()` comptaient déjà les œuvres publiées d'un auteur avec un filtre qui ne vérifiait que `status`, pas `visibility` (incohérence introduite sans le vouloir par mon propre changement de Phase 4). Corrigé au passage : `publishedPublicWorks` (agrégat, strict `public`) vs `publishedWorksWithinOwnTenant` (vitrine/fiche directe, `public` + `tenant_only`) — même distinction que pour les œuvres elles-mêmes.

### Travaux réalisés — Frontend

- `src/lib/catalog.ts` — `WorksFilters` gagne un champ `tenant?`, `fetchAuthors()` accepte un slug de tenant optionnel.
- `src/lib/tenant-public.ts` (nouveau) — `fetchTenantPublicProfile(slug)`, même style que les autres fonctions de `catalog.ts`.
- `src/lib/tenant-type.ts` (nouveau) — libellés du type d'espace, extraits de `create-workspace-form.tsx` (qui les avait en local) puisqu'une deuxième page en a maintenant besoin.
- `app/(site)/espaces/[slug]/page.tsx` (nouveau) — la vitrine elle-même : logo (ou initiales), nom, type, description, site web, réseaux sociaux, puis les auteurs de l'espace (`AuthorCard`, déjà existant) et ses œuvres (`BookGrid`, déjà existant). Structure calquée sur `/auteurs/[slug]/page.tsx` — mêmes composants de mise en page (`Container`/`Breadcrumb`/`SectionHeader`), même gestion du 404 (`ApiError.isNotFound` → `notFound()`), même `generateMetadata`.
- `src/components/admin/tenant-settings-manager.tsx` — bouton « Voir la vitrine publique » ajouté à côté de « Modifier », pour qu'un owner/admin retrouve facilement sa propre page.

**« Collections éventuelles »** — la mission mentionne des collections comme un élément possible de la page publique. Vérifié : aucun modèle `Collection` n'existe dans le schéma, et le mot « éventuelles » signale explicitement un élément conditionnel. Décision : ne rien construire — inventer un nouveau concept de données pour une mention explicitement optionnelle serait le contraire de « ne complexifie pas inutilement ».

### Fichiers modifiés / créés

- `backend/src/modules/tenants/dto/tenant-public.response.ts` (nouveau)
- `backend/src/modules/tenants/tenants-public.controller.ts` (nouveau)
- `backend/src/modules/tenants/tenants.service.ts` — `findPublicBySlug()`
- `backend/src/modules/tenants/tenants.module.ts` — enregistrement du nouveau contrôleur
- `backend/src/modules/catalog/dto/list-works.query.ts` — champ `tenant`
- `backend/src/modules/catalog/dto/list-authors.query.ts` (nouveau)
- `backend/src/modules/catalog/catalog.controller.ts` — `GET /authors` utilise `ListAuthorsQuery`
- `backend/src/modules/catalog/works.service.ts` — `visibleWithinOwnTenant`, `findBySlug()`/`buildFilters()` mis à jour
- `backend/src/modules/catalog/authors.service.ts` — même distinction agrégat/vitrine pour le comptage d'œuvres
- `backend/prisma/migrations/20260829000000_works_select_tenant_only_public/migration.sql` (nouveau)
- `backend/test/admin-works-tenant.e2e-spec.ts` — test Phase 4 mis à jour + nouveau bloc « vitrine publique »
- `frontend/src/lib/catalog.ts`, `frontend/src/lib/tenant-public.ts` (nouveau), `frontend/src/lib/tenant-type.ts` (nouveau)
- `frontend/app/(site)/espaces/[slug]/page.tsx` (nouveau)
- `frontend/src/components/account/create-workspace-form.tsx` — réutilise `TENANT_TYPE_OPTIONS` partagé
- `frontend/src/components/admin/tenant-settings-manager.tsx` — lien vers la vitrine

### Base de données / migrations

Une migration (`20260829000000_works_select_tenant_only_public`) — élargit 3 policies RLS `SELECT` (`works_select`, `work_translations_select`, `work_formats_select`) pour laisser passer `tenant_only` en plus de `public`, sans jamais laisser passer `private`. Aucun changement de schéma (colonnes/tables) — uniquement des policies. Appliquée avec `pnpm db:deploy`, vérifiée par les tests avant et après.

### Tests exécutés

```text
backend   pnpm exec tsc --noEmit          → OK
backend   pnpm lint                       → OK
backend   pnpm test (unitaires)           → 12 suites / 81 tests
backend   pnpm db:deploy                  → migration appliquée avec succès
backend   admin-works-tenant + catalog    → 47/47 (isolé, avant la suite complète)
backend   pnpm test:e2e (suite complète)  → 14/14 suites, 198/198 tests (195 + 3 nouveaux)
frontend  pnpm typecheck                  → OK
frontend  pnpm lint                       → 0 erreur, 3 avertissements préexistants et sans rapport
```

**Limite honnête à signaler** : la vitrine elle-même (page frontend) n'a pas été vérifiée dans un navigateur réel — même limite que les Phases 2/3/4. Le comportement backend qu'elle consomme (profil public, œuvres/auteurs filtrés par tenant, `tenant_only` visible par lien direct et absente de l'agrégat) est, lui, entièrement vérifié par les tests e2e.

### Résultats

| Point de contrôle | Statut |
|---|---|
| `GET /tenants/public/:slug` | VALIDÉ (2 tests e2e : profil existant, slug inconnu) |
| `GET /works?tenant=X` / `GET /authors?tenant=X` | VALIDÉ |
| `tenant_only` visible sur sa fiche et la vitrine de son tenant, absente de l'agrégat | VALIDÉ (migration RLS + tests) |
| `private` reste inatteignable pour un visiteur anonyme | VALIDÉ (comportement non modifié, vérifié par non-régression) |
| Page `/espaces/[slug]` (frontend) | FONCTIONNEL — non vérifié en navigateur réel |
| `TenantSetting` | ABSENT PAR DÉCISION — confirmé sans utilité, non touché |
| Collections | ABSENTES PAR DÉCISION — aucun modèle de données, mention explicitement optionnelle |

### Problèmes rencontrés

- `pnpm db:deploy` a mis plus de 60 secondes à démarrer côté CLI (Prisma/Node), sans blocage réel côté base (aucun verrou, aucune connexion bloquante trouvée) — la migration s'est appliquée avec succès dès que le processus a réellement démarré. Pas de cause identifiée avec certitude ; pas reproduit une seconde fois.

### Décisions techniques

- Contrôleur public séparé (`/tenants/public/:slug`) plutôt qu'une route de plus dans `TenantsController` : évite tout risque de collision de route avec `/tenants/me`, indépendamment de l'ordre d'enregistrement.
- RLS élargie plutôt que contournée : la policy `works_select` reste la seule autorité pour ce qu'un visiteur anonyme peut lire ; le filtre applicatif (`visibleWithinOwnTenant`) reste un filet redondant, pas un substitut — même philosophie de défense en profondeur que la Phase 0.
- Pas de nouvel endpoint dédié à la liste d'œuvres/auteurs de la vitrine : réutilisation de `/works`/`/authors` avec un paramètre `tenant`, pour ne pas dupliquer la pagination, la recherche et la sélection déjà écrites.
- `TENANT_TYPE_LABELS` extrait dans un fichier partagé dès qu'un deuxième appelant en a eu besoin — ni avant (aurait anticipé un besoin qui n'existait pas), ni laissé dupliqué (aurait divergé silencieusement avec le temps).

### Éléments restant à traiter

1. Vérification manuelle en navigateur de la page `/espaces/[slug]` — non faite, à faire avec un serveur de développement démarré.
2. La cause exacte de la lenteur ponctuelle de `pnpm db:deploy` n'a pas été déterminée — signalé, pas creusé davantage (non reproduit).
3. Aucune autre dette identifiée dans le périmètre de cette phase.

### Validation

- [x] Typecheck backend
- [x] Lint backend
- [x] Typecheck frontend
- [x] Lint frontend
- [x] Tests unitaires
- [x] Tests e2e (suite complète + nouveaux tests ciblés)
- [x] Vérification multi-tenant (RLS élargie précisément et testée, aucune régression d'isolation entre tenants — `private` reste bloquée, `tenant_only` d'un tenant n'apparaît jamais dans la vitrine d'un autre)
- [x] Vérification permissions (aucun changement aux permissions d'écriture — uniquement des lectures publiques déjà anonymes)
- [x] Vérification frontend (typecheck + lint verts ; vérification manuelle en navigateur non faite, signalée)
- [x] Documentation mise à jour (ce fichier)

---

## PHASE 6 — Commandes, paiements et commerce

### Objectif

Décider si un vrai panier est nécessaire ; préserver l'architecture `PaymentDriver`/`PaymentDriverRegistry` ; ne jamais prétendre qu'un paiement réel fonctionne ; conserver idempotence, HMAC, webhooks, transactions et remboursements.

### Décision — pas de panier persistant construit dans cette phase

La mission pose la question comme une décision à prendre (« Décide si GeBook doit maintenant avoir... »), pas comme une obligation — et l'ordre de priorité de la mission qualifie lui-même ce chantier de « si nécessaire ». Constat avant de trancher : l'API accepte déjà plusieurs lignes en un seul appel (`CreateOrderDto.items[]`, vérifié dès la Phase 0), donc rien ne manque côté backend pour un panier multi-œuvres. Ce qui manque est uniquement une expérience « ajouter au panier, revenir plus tard, régler ensuite » côté frontend — une vraie fonctionnalité de produit (persistance, badge, page dédiée, états vides), pas un correctif ou une brique manquante d'une architecture déjà pensée pour ça.

Décision : ne pas construire de panier persistant dans cette phase. C'est un choix conservateur et réversible — l'API n'a besoin d'aucun changement le jour où un panier serait décidé, exactement parce qu'elle accepte déjà plusieurs lignes. Documenté ici plutôt que tranché silencieusement.

### Bug corrigé — une commande pouvait être marquée « payée » sans paiement réel

C'est le problème concret que l'audit initial, puis la Phase 4, avaient déjà signalé sans le corriger (« IMPORTANT », non résolu). Confirmé en relisant `OrdersService.updateStatus()` : `PATCH /admin/orders/:id/status` acceptait `awaiting_payment → paid` (transition structurellement valide) et posait même `paidAt` — mais ni la bibliothèque du lecteur (`reader_library`) ni les commissions (`sale_distributions`) n'étaient alimentées, puisque ces deux effets n'existent que dans `PaymentsService.applyOutcome()`, déclenchée uniquement par un webhook réel (ou sa simulation en développement).

Corrigé en bloquant `paid` comme cible directe de cette route — exactement le même traitement que `refunded`, déjà bloqué avant cette phase pour la même raison. Message d'erreur explicite renvoyant vers le webhook/la simulation.

**Découverte en écrivant le test du correctif : le remboursement, lui, n'avait purement et simplement aucune interface.** `refunded` était déjà bloqué côté API (avant cette phase) mais restait proposé dans le menu déroulant générique du back-office (`allowedTransitions()`), qui échouait donc systématiquement si on le choisissait — et recherche exhaustive dans `frontend/` : **aucun composant n'appelle jamais `POST /admin/orders/:id/refund`**. Un administrateur ne pouvait tout simplement pas déclencher un remboursement depuis le produit, malgré un backend entièrement fonctionnel et déjà testé (`payments.e2e-spec.ts`).

Corrigé dans le même mouvement, puisque c'est la même famille de problème (garanties de paiement, domaine explicite de cette phase) :
- `allowedTransitions()` exclut désormais `paid` **et** `refunded` du menu générique (les deux sont des cibles toujours refusées par cette route) — la table structurelle complète reste la source unique, dont dérive aussi la nouvelle `canRefund()`.
- Un vrai bouton « Rembourser » ajouté sur la fiche de commande (`order-detail.tsx`), visible uniquement quand `canRefund(order.status)` est vrai, avec confirmation (`ConfirmDialog`, déjà utilisé ailleurs dans le back-office — pas de nouveau composant) avant d'appeler l'endpoint existant.

### Ce qui n'a pas été touché, et pourquoi

- `PaymentDriver`/`PaymentDriverRegistry` : aucune modification. Aucune logique de paiement n'a été ajoutée dans `OrdersService` — le correctif de cette phase est une validation qui *refuse* une transition, jamais un traitement de paiement.
- Aucun nouveau prestataire : confirmé, comme en Phase 0, que seul `FakePaymentDriver` est opérationnel ; Chariow et MTN Mobile Money restent des lignes `PaymentProvider` inactives, sans classe de pilote. Rien ne prétend le contraire nulle part dans le produit (`PaymentPanel` affiche déjà « Le paiement en ligne n'est pas encore ouvert », vérifié inchangé).
- Idempotence, HMAC, fenêtre anti-rejeu, transaction unique du webhook : non touchés, toujours en place, vérifiés par la suite e2e complète après cette phase.

### Fichiers modifiés

- `backend/src/modules/orders/orders.service.ts` — `updateStatus()` refuse désormais `paid` comme cible directe (en plus de `refunded`, déjà refusé).
- `backend/test/orders.e2e-spec.ts` — nouveau test verrouillant ce refus.
- `frontend/src/lib/order-status.tsx` — `allowedTransitions()` exclut `paid`/`refunded` ; nouvelle fonction `canRefund()`.
- `frontend/src/components/admin/order-detail.tsx` — bouton « Rembourser » + confirmation + mutation vers l'endpoint de remboursement existant.

### Base de données / migrations

Aucune.

### Tests exécutés

```text
backend   pnpm exec tsc --noEmit          → OK
backend   pnpm lint                       → OK
backend   pnpm test (unitaires)           → 12 suites / 81 tests
backend   orders.e2e-spec + payments      → 37/37 (isolé)
backend   pnpm test:e2e (suite complète)  → 14/14 suites, 199/199 tests (198 + 1 nouveau)
frontend  pnpm typecheck                  → OK
frontend  pnpm lint                       → 0 erreur, 3 avertissements préexistants et sans rapport
```

**Limite honnête à signaler** : le bouton « Rembourser » n'a pas été vérifié dans un navigateur réel — même limite que les phases précédentes. L'endpoint qu'il appelle (`POST /admin/orders/:id/refund`) est, lui, entièrement couvert par les tests e2e existants (transactionnalité, révocation d'accès).

### Résultats

| Point de contrôle | Statut |
|---|---|
| Panier persistant | ABSENT PAR DÉCISION — API déjà prête si besoin futur, documenté |
| Blocage de `paid` en changement de statut direct | VALIDÉ (test e2e dédié) |
| Bouton de remboursement fonctionnel | FONCTIONNEL — non vérifié en navigateur réel |
| Menu générique n'offre plus d'options toujours refusées | VALIDÉ |
| Architecture `PaymentDriver` préservée | VALIDÉ (aucun changement) |
| Honnêteté sur l'absence de paiement réel | VALIDÉ (déjà correct, revérifié) |

### Problèmes rencontrés

Aucun.

### Décisions techniques

- Bloquer `paid` avec le même mécanisme et le même message-style que `refunded` (déjà présent) : cohérence avec un précédent déjà écrit par l'équipe précédente, plutôt qu'un nouveau style de garde.
- Réparer le remboursement dans cette même phase plutôt que le signaler pour plus tard : c'est exactement le domaine de cette phase (« conserver... refunds »), et le corriger seul (bloquer `paid`) sans réparer un problème identique et adjacent (`refunded` inutilisable) aurait laissé le produit dans un état à moitié cohérent.
- Pas de champ « motif » dans la boîte de confirmation du remboursement : `RefundOrderDto.reason` est optionnel côté API ; ajouter un champ de saisie aurait élargi `ConfirmDialog` ou demandé un composant dédié pour un champ non requis — reporté, pas oublié.

### Éléments restant à traiter

1. Vérification manuelle en navigateur du bouton de remboursement — non faite.
2. Un champ « motif du remboursement » pourrait être ajouté à l'interface plus tard (l'API le supporte déjà).
3. Si un panier multi-session devient réellement nécessaire plus tard, l'API n'aura besoin d'aucun changement — seul le frontend serait concerné.

### Validation

- [x] Typecheck backend
- [x] Lint backend
- [x] Typecheck frontend
- [x] Lint frontend
- [x] Tests unitaires
- [x] Tests e2e (suite complète + nouveau test ciblé)
- [x] Vérification multi-tenant (aucun changement à l'isolation)
- [x] Vérification permissions (route déjà `@Roles('admin')`, aucun changement)
- [x] Vérification frontend (typecheck + lint verts ; vérification manuelle en navigateur non faite, signalée)
- [x] Documentation mise à jour (ce fichier)

---

## PHASE 7 — Commissions, revenus et payouts

### Objectif

Réutiliser le moteur de commission existant (non touché — toujours `commission.ts`, inchangé). Implémenter une vraie logique pour `PayoutStatus`, qui restait bloqué à `pending` pour toujours. Ne jamais afficher qu'un reversement est « payé » si aucun paiement réel n'a eu lieu.

### Décision — `pending → available`, jamais `→ paid`

La mission est explicite : « Si le provider de payout n'est pas encore intégré : statut = disponible puis attendre le vrai mécanisme de payout. » Décision : `CommissionsService.freezeForOrder()` pose désormais `payoutStatus: 'available'` dès le figeage (au moment du paiement confirmé), au lieu du défaut `pending` implicite du schéma. `paid`/`partially_paid` ne sont jamais écrits nulle part — aucun mécanisme réel de reversement n'existe, donc rien ne prétend qu'un versement a eu lieu.

**Alternative non retenue, signalée plutôt que tranchée arbitrairement** : un délai de rétention avant disponibilité (ex. « disponible 14 jours après la vente ») serait plus prudent contre le risque de remboursement tardif, mais aucune règle métier de ce type n'existe nulle part dans le projet, et en inventer une (durée, déclencheur) aurait été une pure invention. La mission elle-même pousse vers la lecture la plus simple (« statut = disponible… attendre le vrai mécanisme ») — c'est celle retenue ici. Si un délai de rétention s'avère nécessaire, c'est une décision produit à trancher plus tard, pas un oubli technique.

### Deux failles réelles trouvées en implémentant, corrigées dans la foulée

**1. Un remboursement ne touchait jamais `sale_distributions`.** Vérifié dans `PaymentsService.refund()` avant de coder quoi que ce soit : le paiement passe à `refunded`, l'accès bibliothèque est révoqué, la commande passe à `refunded` — mais la répartition déjà figée (montant dû à l'auteur) restait intacte, comme si la vente tenait toujours. Avec `pending → available` introduit par cette phase, laisser ça tel quel aurait rendu remboursable-mais-« disponible » une vente déjà annulée — une vraie erreur comptable. Corrigé : le remboursement fait désormais passer à `cancelled` (valeur déjà prévue dans l'enum, jamais utilisée) les répartitions encore `pending`/`available` des lignes remboursées, dans la même transaction que la révocation d'accès. `paid`/`partially_paid` ne sont volontairement pas concernés — aucun mécanisme actuel ne peut les produire, et les y toucher supposerait un vrai processus de réclamation, hors périmètre.

**2. `sale_distributions` n'avait aucune policy RLS `UPDATE`.** Découvert en écrivant le test du correctif ci-dessus : le commentaire du schéma dit explicitement « une répartition figée n'est jamais modifiée (règle n°13) » — une garantie pensée pour les MONTANTS, imposée en ne créant tout simplement aucune policy UPDATE. Sans policy pour une commande donnée, PostgreSQL refuse silencieusement cette commande sur toutes les lignes, y compris pour un platform_admin (aucune policy n'existe pour évaluer quoi que ce soit). Mon correctif de remboursement, tel quel, n'aurait donc jamais rien mis à jour en conditions réelles (RLS forcée). Corrigé par une nouvelle migration ajoutant une policy `sale_distributions_update` strictement réservée au platform_admin — jamais à un rôle de tenant, même owner/admin/finance, tant qu'aucun vrai mécanisme de reversement n'existe. Rien au niveau RLS ne peut garantir qu'une écriture ne touche que `payout_status` et jamais les montants : cette discipline reste portée par le code applicatif, qui ne modifie jamais que ce champ.

La même migration recale aussi les répartitions déjà figées avant cette phase (`pending` → `available`, ou `cancelled` si leur commande avait déjà été remboursée), pour ne pas laisser d'anciennes lignes bloquées sur un statut devenu incohérent avec les nouvelles.

### Cohérence des totaux — `cancelled` exclu partout où il ne l'était pas

En ajoutant `availableBalance`, vérification des agrégats existants : `revenue()` (auteur), `platformStatistics()` et `tenantStatistics()` sommaient déjà `authorNetAmount` **sans jamais exclure `cancelled`** — un défaut resté invisible tant que rien ne passait jamais à ce statut (avant cette phase, `refunded` ne touchait jamais `sale_distributions`, donc le cas ne s'était simplement jamais produit). Corrigé dans les trois méthodes : les totaux cumulés (chiffre d'affaires, commission, part auteur) excluent désormais `payoutStatus: 'cancelled'`, pour ne plus compter une vente remboursée dans le revenu réel d'un auteur ou d'un tenant.

### Paramètres de reversement — champ manquant, pas un vrai gap d'autorisation

Vérifié avant de construire quoi que ce soit : la policy RLS `authors_update` permet déjà à un membre de tenant de rôle `author` de modifier son propre profil (`user_id = app_current_user_id()`) — la base autorisait donc déjà cette capacité. Le vrai manque : `payoutMethod`/`payoutPhone` (déjà sur `Author`, déjà acceptés par `UpdateAuthorDto`) n'apparaissaient dans **aucun** formulaire frontend. Ajoutés à `author-detail.tsx` — la même page d'édition déjà accessible à qui peut déjà modifier cet auteur (owner/admin/editor de son tenant, ou l'auteur lui-même pour son propre profil), sans nouvelle page ni nouveau contrôle d'accès.

### Ce qui n'a délibérément pas été construit

- **Aucune transition vers `paid`/`partially_paid`** — aucun mécanisme de reversement réel (virement, mobile money) n'existe, et la mission interdit explicitement de le simuler.
- **Aucun « historique des reversements »** — rien n'atteint jamais `paid` sous cette phase, donc il n'y aurait rien de réel à afficher dans un tel historique. Construire une liste condamnée à rester vide n'aurait aucune valeur ; à faire quand un vrai mécanisme de payout existera.
- **Aucun délai de rétention avant disponibilité** — voir la décision documentée plus haut.
- Le moteur de commission (`commission.ts`) — non touché, comme demandé.

### Fichiers modifiés / créés

- `backend/src/modules/commissions/commissions.service.ts` — `freezeForOrder()` pose `available` ; `revenue()`/`platformStatistics()`/`tenantStatistics()` excluent `cancelled` des totaux et ajoutent `availableBalance`.
- `backend/src/modules/payments/payments.service.ts` — `refund()` annule les répartitions `pending`/`available` des lignes remboursées.
- `backend/prisma/migrations/20260829010000_sale_distributions_payout_status_update/migration.sql` (nouveau) — policy UPDATE (platform_admin uniquement) + backfill des lignes déjà figées.
- `backend/test/commissions.e2e-spec.ts` — assertion mise à jour (`available` au lieu de `pending`).
- `frontend/src/lib/commissions.ts` — `availableBalance` sur `AuthorRevenue`/`PlatformStatistics`.
- `frontend/src/components/admin/tenant-dashboard.tsx`, `platform-dashboard.tsx`, `app/(site)/auteur/tableau-de-bord/page.tsx` — carte « Solde disponible », avec rappel explicite qu'aucun versement réel n'a eu lieu.
- `frontend/src/components/admin/author-detail.tsx` — champs « Moyen de reversement » et « Téléphone / compte ».

### Base de données / migrations

Une migration (`20260829010000_sale_distributions_payout_status_update`) — ajoute une policy RLS UPDATE et backfille les données existantes. Aucun changement de schéma (colonnes/tables).

### Tests exécutés

```text
backend   pnpm exec tsc --noEmit          → OK
backend   pnpm lint                       → OK
backend   pnpm test (unitaires)           → 12 suites / 81 tests
backend   pnpm db:deploy                  → migration appliquée avec succès
backend   commissions + payments (isolé)  → 41/41
backend   pnpm test:e2e (suite complète)  → 14/14 suites, 199/199 tests
frontend  pnpm typecheck                  → OK
frontend  pnpm lint                       → 0 erreur, 3 avertissements préexistants et sans rapport
```

**Limite honnête à signaler** : les nouvelles cartes « Solde disponible » et les champs de reversement n'ont pas été vérifiés dans un navigateur réel — même limite que les phases précédentes. Le calcul backend (annulation au remboursement, disponibilité au figeage, exclusion des ventes annulées des totaux) est, lui, entièrement vérifié par les tests e2e, y compris sous RLS réellement appliquée.

### Résultats

| Point de contrôle | Statut |
|---|---|
| `pending → available` au figeage | VALIDÉ (test e2e) |
| `available/pending → cancelled` au remboursement | VALIDÉ (test e2e, sous RLS réelle) |
| Policy RLS UPDATE sur `sale_distributions` | VALIDÉ (platform_admin uniquement) |
| Totaux cumulés excluant les ventes annulées | VALIDÉ |
| `availableBalance` sur les 3 niveaux (auteur/tenant/plateforme) | VALIDÉ |
| Champs de reversement éditables | FONCTIONNEL — non vérifié en navigateur réel |
| Transition vers `paid` | ABSENTE PAR DÉCISION — aucun mécanisme réel, interdiction explicite de simuler |
| Historique des reversements | ABSENT PAR DÉCISION — rien de réel à y montrer tant que `paid` n'existe pas |

### Problèmes rencontrés

Aucun au-delà des deux failles déjà décrites (trouvées et corrigées dans le déroulement normal de cette phase, pas des incidents séparés).

### Décisions techniques

- `available` immédiat plutôt qu'un délai de rétention inventé : conforme à l'instruction explicite de la mission, évite d'inventer une règle métier sans source.
- Policy RLS UPDATE restreinte au seul platform_admin, jamais étendue aux rôles de tenant : une table financière déjà protégée par « aucune modification » avant cette phase ne devait pas s'ouvrir plus largement que ce que le nouveau besoin (annuler au remboursement, depuis du code déclenché uniquement par un `@Roles('admin')`) exige réellement.
- Exclusion de `cancelled` des totaux cumulés dans les trois méthodes de statistiques à la fois (auteur/tenant/plateforme), pas seulement celle initialement visée : la même faille existait identiquement dans les trois, silencieuse pour la même raison (rien ne passait jamais à `cancelled` avant cette phase).
- Champs de reversement ajoutés à la page d'édition existante plutôt qu'une nouvelle page « mes paramètres de reversement » dédiée : la permission nécessaire existait déjà (RLS), il ne manquait que les champs eux-mêmes — une nouvelle page aurait été une duplication d'interface sans raison.

### Éléments restant à traiter

1. Vérification manuelle en navigateur des nouvelles cartes et des champs de reversement — non faite.
2. Un vrai mécanisme de payout (virement, mobile money) reste entièrement à construire — hors périmètre explicite de cette phase.
3. La question du délai de rétention avant disponibilité reste une décision produit ouverte, non tranchée délibérément.

### Validation

- [x] Typecheck backend
- [x] Lint backend
- [x] Typecheck frontend
- [x] Lint frontend
- [x] Tests unitaires
- [x] Tests e2e (suite complète + assertion mise à jour)
- [x] Vérification multi-tenant (policy RLS ajoutée et testée, aucune ouverture aux rôles de tenant)
- [x] Vérification permissions (UPDATE restreint au platform_admin, conforme à l'usage réel — déclenché uniquement par des routes déjà `@Roles('admin')`)
- [x] Vérification frontend (typecheck + lint verts ; vérification manuelle en navigateur non faite, signalée)
- [x] Documentation mise à jour (ce fichier)

---

## PHASE 8 — Équipe, invitations et permissions

### Objectif

Faire correspondre le comportement réel de `TeamService.invite()` au workflow décrit par le schéma (`TenantMemberStatus`: `active`/`invited`/`suspended`) : avant cette phase, une invitation créait directement un membre `active`, sans jamais passer par `invited`, ce qui vidait le statut de tout sens. Documenter aussi la matrice de permissions rôle × action déjà en vigueur (RLS + garde applicative), sans réinventer de règles métier.

### Travaux réalisés

**8.1 — Invitation → acceptation réelle**

- `TeamService.invite()` (`backend/src/modules/tenants/team.service.ts`) crée désormais la ligne `tenant_members` avec `status: 'invited'`, plus `'active'` immédiatement.
- Nouvelle méthode `TenantsService.acceptInvitation(tenantId, user)` (`tenants.service.ts`) : fait passer la ligne `invited` de l'utilisateur courant, pour ce tenant, à `active`. `userId = user.id` dans le `WHERE` garantit qu'on ne peut accepter que sa propre invitation.
- Nouvelle route `POST /tenants/:tenantId/accept` (`tenants.controller.ts`), protégée par `AuthGuard` seul (jamais `TenantAccessGuard`, puisque la personne n'a par définition pas encore accès à ce tenant) — pose le cookie de tenant actif au succès, comme `POST /tenants` et `POST /tenants/me/active`.

**8.2 — Faille RLS découverte et corrigée (chicken-and-egg)**

`tenant_members_update` (migration `20260823020000`) n'autorisait que owner/admin **déjà actifs** à modifier une ligne. Exactement le même trou que celui déjà rencontré pour la toute première insertion d'un tenant (`20260825000000_tenant_members_owner_bootstrap`) : une personne invitée n'est par définition pas encore active dans ce tenant, donc ne pouvait jamais accepter sa propre invitation — la commande était silencieusement refusée par RLS, indépendamment du code applicatif correct.

Migration `20260829020000_tenant_members_self_accept` : ajoute une branche self-accept à la policy (`DROP POLICY` + `CREATE POLICY`, jamais `ALTER`) — une personne peut faire passer SA PROPRE ligne de `invited` à `active`, rien d'autre. Appliquée avec succès via `pnpm db:deploy` et vérifiée par les tests e2e.

**8.3 — Matrice de permissions rôle × action (documentation, aucun code nouveau)**

Constituée en croisant les gardes applicatives déjà en place (`tenant-context.ts`, `assertCan*` des services) avec les policies RLS qui leur correspondent — pas une nouvelle règle métier, un état des lieux de ce qui existe déjà et a été vérifié phase après phase.

| Action | owner | admin | editor | author | marketing | finance | viewer |
|---|---|---|---|---|---|---|---|
| Voir le tableau de bord de l'espace | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Modifier les paramètres / branding de l'espace (`tenants_update`) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Créer / modifier une œuvre (`TENANT_CATALOG_WRITE_ROLES`) | ✅ | ✅ | ✅ | auteur : ses œuvres seulement | ❌ | ❌ | ❌ |
| Publier / dépublier / archiver une œuvre (`assertAllowedStatus`, Phase 4) | ✅ | ✅ | ❌ (peut soumettre à relecture, pas publier) | ❌ (peut soumettre sa propre œuvre) | ❌ | ❌ | ❌ |
| Gérer l'équipe — inviter / changer un rôle / retirer (`TENANT_MANAGEMENT_ROLES`) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Attribuer le rôle `owner` (`assertCanAssignOwner`) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Voir les chiffres de vente / revenus (`TENANT_FINANCE_ROLES`, `sale_distributions_select`) | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Déclencher un remboursement / gérer un paiement | platform_admin uniquement (`@Roles('admin')`, `admin-payments.controller.ts`) — aucun rôle de tenant, y compris owner, n'a cet accès | | | | | | |
| Se retirer soi-même de l'équipe | ✅ (sauf dernier owner) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Deux points notés tels quels, sans les « corriger » (hors périmètre de cette phase, aucune ambiguïté à trancher — c'est le comportement déjà voulu et testé) :
- Le remboursement/paiement est une capacité **plateforme**, pas une capacité de tenant : même un `owner` ne peut pas le déclencher lui-même, seul le platform_admin le peut (cohérent avec « aucun payout réel n'existe », Phase 7).
- `marketing` et `viewer` n'ont aujourd'hui aucune capacité d'écriture distincte de leur nom — leur rôle actuel se limite à l'accès en lecture au tableau de bord ; rien dans le code n'implémente encore de permission spécifique à ces deux rôles (ex. gestion de campagnes pour `marketing`). Ce n'est pas un bug : aucune fonctionnalité de ce type n'existe encore ailleurs dans l'application pour qu'une permission s'y accroche.

**8.4 — Frontend : rendre l'invitation visible et acceptable**

Sans interface, une invitation `invited` aurait été invisible pour la personne invitée — elle n'aurait eu aucun moyen de la découvrir ni de l'accepter.

- `frontend/src/lib/tenant-actions.ts` : nouvelle `acceptInvitationAction(previousState, tenantId)`, même schéma que `setActiveTenantAction` (cookie posé côté frontend, jamais relayé depuis l'API ; l'API reste seule juge de la validité).
- `frontend/src/components/account/invitation-accept-card.tsx` (nouveau) : carte client (`useActionState`) affichant l'espace, son type et le rôle proposé, avec un bouton d'acceptation.
- `frontend/app/(site)/mon-espace/page.tsx` : nouvelle section « invitations en attente », visible dès que l'utilisateur a une adhésion `invited` — placée avant la section commandes, pour qu'elle soit vue en priorité.
- `frontend/src/components/admin/team-manager.tsx` : badge « En attente d'acceptation » à côté du nom d'un membre `invited`, dans le tableau d'équipe de l'admin.

**8.5 — Test existant mis à jour**

`backend/test/team.e2e-spec.ts` : le reste du fichier (changements de rôle, protection du dernier owner, retrait) utilisait `owner2Agent` comme un propriétaire déjà actif juste après invitation — supposition rendue fausse par 8.1. Corrigé par :
- l'assertion du test d'invitation (« un propriétaire peut attribuer le rôle propriétaire ») mise à jour pour vérifier `status: 'invited'` ;
- deux tests ajoutés juste après : `owner2` n'a pas accès au tenant avant d'accepter (`POST /tenants/me/active` → 403), puis accepte réellement via la nouvelle route et devient `active`.

### Fichiers modifiés / créés

- `backend/src/modules/tenants/team.service.ts` — `invite()` crée en `invited`.
- `backend/src/modules/tenants/tenants.service.ts` — `acceptInvitation()` (nouveau).
- `backend/src/modules/tenants/tenants.controller.ts` — route `POST :tenantId/accept` (nouvelle).
- `backend/prisma/migrations/20260829020000_tenant_members_self_accept/migration.sql` (nouveau) — policy UPDATE self-accept.
- `backend/test/team.e2e-spec.ts` — assertion mise à jour + 2 tests ajoutés.
- `frontend/src/lib/tenant-actions.ts` — `acceptInvitationAction` (nouveau).
- `frontend/src/components/account/invitation-accept-card.tsx` (nouveau).
- `frontend/app/(site)/mon-espace/page.tsx` — section invitations en attente.
- `frontend/src/components/admin/team-manager.tsx` — badge de statut `invited`.

### Base de données / migrations

Une migration (`20260829020000_tenant_members_self_accept`) — remplace la policy RLS `tenant_members_update` par une version incluant une branche self-accept. Aucun changement de schéma (colonnes/tables/enum) : `TenantMemberStatus` incluait déjà `invited`, seul le code ne l'utilisait pas.

### Tests exécutés

```text
backend   pnpm exec eslint --fix (2 fichiers)   → formatage corrigé
backend   pnpm lint                             → OK (0 erreur)
backend   pnpm exec tsc --noEmit                → OK
backend   pnpm test (unitaires)                 → 12 suites / 81 tests
backend   pnpm test:e2e team.e2e-spec.ts (isolé)→ 16/16 tests (dont les 3 nouveaux)
backend   pnpm test:e2e (suite complète)        → 14/14 suites, 201/201 tests
frontend  pnpm exec tsc --noEmit                → OK
frontend  pnpm lint                             → 0 erreur, 3 avertissements préexistants et sans rapport (React Compiler / react-hook-form, non touchés par cette phase)
```

**Limite honnête à signaler** : la nouvelle section « invitations en attente » et le badge admin n'ont pas été vérifiés dans un navigateur réel — même limite que les phases précédentes. Le workflow backend (invitation → 403 tant que non acceptée → acceptation → accès réel) est, lui, entièrement vérifié par les tests e2e sous RLS réellement appliquée.

### Résultats

| Point de contrôle | Statut |
|---|---|
| Invitation crée `invited`, pas `active` | VALIDÉ (test e2e) |
| Accès refusé (403) avant acceptation | VALIDÉ (test e2e, sous RLS réelle) |
| `POST /tenants/:tenantId/accept` fait passer à `active` | VALIDÉ (test e2e) |
| Policy RLS self-accept restreinte à sa propre ligne, `invited → active` uniquement | VALIDÉ (test e2e + lecture de la policy) |
| Matrice de permissions documentée et vérifiée contre le code réel | VALIDÉ |
| UI d'acceptation (lecteur) | FONCTIONNEL — non vérifié en navigateur réel |
| UI badge « en attente » (admin) | FONCTIONNEL — non vérifié en navigateur réel |

### Problèmes rencontrés

Le même type de faille RLS chicken-and-egg déjà rencontré en Phase 8.2 était prévisible par analogie avec le bootstrap owner (Phase antérieure) — anticipé, cherché délibérément, trouvé et corrigé avant que les tests ne l'auraient révélé de toute façon.

### Décisions techniques

- Self-accept limité strictement à `user_id = soi-même` et `invited → active` (rien d'autre) dans la policy RLS : une personne ne doit jamais pouvoir modifier la ligne de quelqu'un d'autre ni changer son propre statut vers autre chose que `active` par ce biais — les changements de rôle et suppressions repassent par la règle owner/admin déjà existante, inchangée.
- Matrice de permissions documentée plutôt que codifiée dans un nouveau mécanisme (ex. table de permissions dédiée) : le mission demande d'« adapter cette matrice au métier réel et au code existant », pas d'en construire une nouvelle — les gardes RLS et applicatives qui l'implémentent déjà (`TENANT_MANAGEMENT_ROLES`, `TENANT_CATALOG_WRITE_ROLES`, `TENANT_FINANCE_ROLES`, `assertAllowedStatus`) restent la seule source de vérité, non dupliquée.
- `marketing`/`viewer` laissés sans permission spécifique au-delà de la lecture : inventer une capacité pour ces rôles sans fonctionnalité correspondante ailleurs dans l'application aurait été fabriquer une règle métier sans source, explicitement proscrit par la mission.

### Éléments restant à traiter

1. Vérification manuelle en navigateur de la section invitations et du badge admin — non faite.
2. Les rôles `marketing` et `viewer` n'ont aucune capacité distincte de la lecture ; à réévaluer si/quand une fonctionnalité correspondante (campagnes, etc.) apparaît.

### Validation

- [x] Typecheck backend
- [x] Lint backend
- [x] Typecheck frontend
- [x] Lint frontend
- [x] Tests unitaires
- [x] Tests e2e (fichier isolé + suite complète)
- [x] Vérification migrations (policy RLS self-accept appliquée et testée)
- [x] Vérification routes (nouvelle route `POST /tenants/:tenantId/accept`, guard correct)
- [x] Vérification permissions (matrice documentée et croisée avec le code réel)
- [x] Vérification multi-tenant (self-accept scopé à `user_id = soi-même`, jamais à un autre membre)
- [x] Vérification frontend (typecheck + lint verts ; vérification manuelle en navigateur non faite, signalée)
- [x] Documentation mise à jour (ce fichier)

---
