# GeBook — Journal de la plateforme de paiement, commissions, revenus et payouts

Mission distincte de `GEBOOK_PROGRESS.md` (qui couvre le socle multi-tenant type
« Chariow »). Branche : `feature/payment-platform`, créée depuis `main` (ce dépôt
n'a jamais eu de branche `develop` — voir la décision explicite ci-dessous).
Fusionnée dans `main` à la fin de chaque phase entièrement verte.

**Décision de convention actée dès le départ** : le brief demande de créer la
branche depuis `develop` et d'y fusionner chaque phase validée. `develop`
n'existe pas et n'a jamais existé dans ce dépôt (`git branch -a` → seulement
`main`) ; toute la session précédente (Phases 0-10, missions B et C) a
exclusivement utilisé `main`. Conformément à l'instruction du brief elle-même
(« adapte-toi aux conventions déjà en place dans le projet »), `main` remplace
`develop` partout où le brief le mentionne.

**Rappel de sécurité, valable pour toute la mission** : aucune clé API, aucun
secret, aucun jeton n'apparaît jamais dans ce journal, dans les logs, ni dans un
commit — seuls les *noms* des variables d'environnement sont documentés.
Sandbox-first (`PAYMENT_ENV=sandbox`) tant qu'aucune clé de production n'est
fournie.

---

## Phase 1 — Architecture providers

### Objectif

Scinder l'architecture de paiement en deux abstractions indépendantes et
interchangeables : `PaymentProvider` (pay-in, déjà existant) et `PayoutProvider`
(payout, à créer), configurables séparément par variable d'environnement, sans
toucher à la logique métier pour ajouter/retirer un prestataire.

### Analyse

Inspection de l'existant avant toute écriture (`payment-driver.ts`,
`payment-driver.registry.ts`, `payments.module.ts`, `payments.service.ts`,
`webhooks.controller.ts`, `commission.ts`, `commissions.service.ts`,
`environment.ts`, `schema.prisma`) :

- Le pilote pay-in (`PaymentDriver` + `PaymentDriverRegistry`, injection NestJS
  par jeton `PAYMENT_DRIVER`) est déjà exactement le patron à répliquer côté
  payout — architecture par interface, jamais un `switch` sur le nom du
  prestataire.
- `POST /webhooks/:providerCode` est déjà générique : satisfait telle quelle
  l'exigence « un point d'entrée par prestataire » du brief, aucun changement
  nécessaire pour le pay-in.
- Idempotence webhook déjà portée par une contrainte unique DB
  `(payment_provider_id, event_id)`, jamais applicative seule — le même patron
  est repris pour `PayoutEvent`.
- `CommissionRule` n'était scopée que par `authorId` (ou `null` = global) : pas
  de portée tenant ni type de tenant. `PaymentProvider` n'avait pas de capacité
  payout distincte. Aucun modèle de conditions de distribution versionnées
  n'existait.
- Aucune clé PawaPay/CinetPay/FeexPay dans `.env`/`.env.example` — confirmé par
  recherche ciblée. Validation live des sandboxes impossible tant que
  l'utilisateur ne les fournit pas ; honnêtement étiqueté NON TESTÉ ci-dessous.

### Implémentation

**Architecture payout** (miroir volontaire du pay-in, mêmes noms de concepts
côté GeBook) :
- `payout-driver.ts` — interface `PayoutDriver`, jeton `PAYOUT_DRIVER`,
  types `PayoutInitRequest/Result`, `PayoutVerification`, `PayoutOutcome`
  (`successful | failed | pending` — `pending` existe ici contrairement au
  pay-in car un virement/mobile money sortant reste souvent asynchrone),
  `PayoutWebhookParseResult`.
- `payout-driver.registry.ts` — `PayoutDriverRegistry`, résolution par code,
  503 (pas 400) si un prestataire existe en base sans pilote installé.
- `drivers/fake-payout.driver.ts` + `.spec.ts` — pilote de simulation,
  signature HMAC-SHA256 réelle (réutilise `PAYMENT_WEBHOOK_SECRET`, pas de
  secret dédié inventé), fenêtre anti-rejeu 300 s, 9 tests couvrant signature
  absente/falsifiée/corps modifié/rejeu/JSON illisible/notification
  incomplète/simulation échec-attente-succès. Permet de tester toute
  l'architecture payout sans attendre de vraies clés sandbox.
- `payments.module.ts` — `PayoutDriverRegistry` et `FakePayoutDriver`
  enregistrés, `PAYOUT_DRIVER` fourni par factory (même patron que
  `PAYMENT_DRIVER`), `PayoutDriverRegistry` exporté pour un futur
  `PayoutsModule` (Phase 9).

### Base de données

Une migration foundation (`20260830132024_add_payment_platform_foundation`) +
une migration de contraintes `CHECK` (`20260830142043_add_commission_rule_scope_check`,
même esprit que `20260812231600_check_constraints`) :

- `payment_providers.supports_payout` (bool, défaut `false`) — capacité PAYOUT
  distincte de `supports_mobile_money`/`supports_card` (pay-in). Un même
  prestataire (PawaPay, CinetPay, FeexPay) peut n'exposer que l'un des deux
  sens, jamais supposé depuis sa documentation.
- `payouts` — demande de reversement : tenant, demandeur, montant/devise,
  bénéficiaire (nom/pays/compte — sensible, jamais journalisé en clair),
  prestataire payout, référence, statut (`PayoutRequestStatus` : pending →
  approved → processing → paid/failed/cancelled), approbateur/date
  d'approbation (validation manuelle, brief : « commence par une architecture
  permettant le mode manuel si l'automatique n'est pas encore sécurisé »).
  `CHECK (amount > 0)`.
- `payout_events` — trace brute de chaque notification payout, même contrat
  que `payment_events` (idempotence par contrainte unique
  `(payout_provider_id, event_id)`, jamais applicative seule).
- `sale_distributions.payout_id` (nullable, `SET NULL`) — quelle demande de
  reversement a consommé cette ligne ; permet de faire transiter réellement
  `PayoutStatus` (`available → paid`, ou retour à `available` si le `Payout`
  échoue) au lieu de rester bloqué à `pending` pour toujours.
- `commission_rules.tenant_id`/`tenant_type` (nullables) — portée
  tenant-spécifique et type-de-tenant, en plus de `author_id` déjà existant.
  `CHECK` : au plus un des trois est renseigné à la fois
  (`chk_commission_rules_scope`) — la priorité de résolution (auteur > tenant >
  type de tenant > globale) sera implémentée dans `selectRule()` en Phase 3 ;
  le schéma est posé maintenant pour éviter une seconde migration.
- `distribution_terms` / `tenant_terms_acceptances` — conditions de
  distribution versionnées par type de tenant + table d'acceptation
  (tenant/utilisateur/version/date/IP) ; posées maintenant (foundation), le
  contenu et le câblage applicatif (blocage à l'activation commerciale d'un
  tenant, page Superadmin, page tenant) restent Phase 3.

Toutes les nouvelles clés étrangères suivent les mêmes règles d'intégrité
historique que l'existant (`SET NULL` sur ce qui ne doit jamais effacer un
montant figé, `RESTRICT` sur ce qui ne doit jamais être supprimé silencieusement).

### API

Aucune route nouvelle dans cette phase — Phase 1 est strictement l'architecture
interne (interfaces + schéma). Les routes Superadmin/tenant pour configurer et
consulter tout cela sont Phase 2/3/9.

### Frontend

Aucun changement — hors périmètre de Phase 1.

### Sécurité

- Aucun secret réel n'existe encore pour PawaPay/CinetPay/FeexPay ; les 7
  nouvelles variables d'environnement (`PAWAPAY_API_URL`/`_TOKEN`,
  `CINETPAY_API_URL`/`_API_KEY`/`_SITE_ID`, `FEEXPAY_API_URL`/`_API_KEY`) sont
  toutes `@IsOptional()` dans `environment.ts` : leur absence ne bloque jamais
  le démarrage, elle rend seulement ce prestataire indisponible (503 via le
  registre, jamais une erreur de configuration serveur).
- `PAYMENT_ENV` (sandbox/production) ajouté, indépendant de `NODE_ENV` —
  permet de rester en sandbox même sur un serveur `NODE_ENV=production` tant
  que les clés réelles ne sont pas fournies.
- `Payout.beneficiaryAccount`/`beneficiaryName` marquées en commentaire de
  schéma comme sensibles, jamais destinées aux logs — rappel pour les phases
  suivantes qui les manipuleront réellement.
- Aucune valeur de secret n'a été écrite dans ce fichier, dans un commit, ou
  dans un log à aucun moment de cette phase.

### Tests

```text
backend   pnpm exec tsc --noEmit    → OK
backend   pnpm lint                 → OK (2 erreurs prettier auto-corrigées avant commit)
backend   pnpm test (unitaires)     → 13/13 suites, 90/90 tests (+1 suite, +9 tests : fake-payout.driver.spec.ts)
backend   pnpm test:e2e (complète)  → 14/14 suites, 206/206 tests (inchangé, aucune régression)
```

### Résultats

- `PayoutDriver`/`PayoutDriverRegistry` : IMPLÉMENTÉ — VALIDÉ (testé
  unitairement avec un vrai pilote factice, signatures HMAC réelles).
- PawaPay/CinetPay/FeexPay (pilotes réels) : NON IMPLÉMENTÉ — Phases 4-6 et
  10-11. Aucune clé sandbox disponible à ce stade → sera NON TESTÉ tant que
  l'utilisateur ne les fournit pas, quelle que soit la qualité du code écrit.
- Schéma `Payout`/`PayoutEvent`/`DistributionTerms`/`TenantTermsAcceptance`/
  extension `CommissionRule` : IMPLÉMENTÉ — migré et appliqué avec succès sur
  la base de développement, aucune donnée existante perdue ou modifiée
  (colonnes toutes nullables ou à valeur par défaut, migration purement
  additive).

### Problèmes rencontrés

Aucun blocage technique. Le seul point d'attention : le brief structure
« Commissions et conditions » comme Phase 3 distincte de Phase 1
(« Architecture providers »), mais le schéma des deux phases a été posé dans la
même migration (plus simple qu'une migration en deux temps sur un schéma qui se
référence lui-même — `Payout` référence `SaleDistribution` et
`CommissionRule` référence `Tenant`/`TenantType`, tous introduits ou étendus
ensemble). Le câblage applicatif (service, routes, UI) de la partie
Commissions/Conditions reste bien fait en Phase 3, pas anticipé ici.

### Corrections

2 erreurs `prettier/prettier` (formatage de saut de ligne) sur
`fake-payout.driver.ts` et `payout-driver.ts`, corrigées par
`eslint --fix` avant le commit — aucune erreur de logique.

### Commit

`feat(payments): Phase 1 - PayoutDriver architecture and foundational schema`
(`1f9cc81`)

### Push

`git push -u origin feature/payment-platform` — effectué.

### Merge main

Non fusionné à ce stade — Phase 1 continue (routes/services restent à écrire
pour certaines briques posées ici) ; la fusion vers `main` interviendra à la
fin d'une phase pleinement autonome et testée de bout en bout, conformément au
brief.

### État

**VALIDÉ** pour le périmètre de cette phase (architecture + schéma, testés).

Note de portée : le brief liste séparément une Phase 9 « Payout architecture »
— la lecture retenue est que l'instruction d'ouverture (« commence par
l'architecture PaymentProvider/PayoutProvider », étape 6 de la directive
finale, avant « travaille phase par phase », étape 7) demande de poser
l'interface/le registre payout dès maintenant ; Phase 9 construira par-dessus
le service applicatif (`PayoutsService`, résolution du prestataire actif à
partir d'un réglage configurable, workflow de demande/validation/webhook,
routes). `PaymentsService.defaultProviderCode()` continue de lire le réglage
`Setting.default_payment_provider` (existant, modifiable sans redéploiement) —
Phase 2 en fera de même côté payout (`default_payout_provider`) plutôt que de
figer le choix dans une variable d'environnement relue seulement au démarrage ;
`PAYIN_PROVIDER`/`PAYOUT_PROVIDER` servent de valeur d'amorçage (seed), pas de
source de vérité en fonctionnement — cohérent avec l'exigence Superadmin d'un
changement de prestataire sans redéploiement.

Poursuite immédiate vers Phase 2 (Configuration Superadmin), sans attendre de
confirmation (brief : autonomie totale entre phases).

---

## Phase 2 — Configuration Superadmin (Paramètres → Paiements)

### Objectif

Une page Superadmin qui montre l'état réel de chaque prestataire (pay-in et
payout) sans jamais exposer un secret ni prétendre gérer en base ce qui ne
vit que dans l'environnement serveur, avec un vrai bouton « Tester la
connexion » par prestataire.

### Analyse

Aucune interface de gestion des prestataires n'existait avant cette phase —
seul `Setting.default_payment_provider` (déjà existant) permet de choisir le
prestataire pay-in par défaut, sans UI dédiée. Le brief est explicite (§9) :
si les secrets restent dans `.env`, ne pas construire une UI qui prétend les
gérer en base — un affichage en lecture seule dérivé de l'environnement
suffit et est plus honnête.

### Implémentation

Backend :
- `payment-driver.ts`/`payout-driver.ts` — méthode optionnelle
  `testConnection?(): Promise<ConnectionTestResult>` ajoutée aux deux
  contrats (`{ ok: boolean; detail: string }`), implémentée pour `fake` des
  deux côtés (vérifie que `PAYMENT_WEBHOOK_SECRET` est bien configuré — le
  seul vrai prérequis d'un pilote qui ne sollicite aucun réseau).
- `admin-payment-providers.service.ts` — `list()` (catalogue + drapeaux
  dérivés : pilote installé ou non par direction, configuration complète ou
  non) et `testConnection(code)` (appelle le vrai `testConnection()` du
  pilote résolu ; un prestataire sans pilote installé répond honnêtement
  « aucun pilote installé », jamais un succès fabriqué).
- `admin-payment-providers.controller.ts` — `GET /admin/payment-providers`,
  `POST /admin/payment-providers/:code/test-connection`, `@Roles('admin')`.
- `prisma/seed.ts` — 3 lignes catalogue ajoutées (`pawapay`, `cinetpay`,
  `feexpay`), `inactive`, capacités limitées à ce que le brief affirme
  explicitement (jamais supposées depuis la documentation du prestataire).

Frontend :
- `app/(admin)/admin/paiements/page.tsx` + `payment-providers-manager.tsx` —
  cartes de synthèse (prestataires/actifs/configurés/en production),
  tableau avec badges SANDBOX/PRODUCTION (rouge en production — volontaire,
  brief : « la production doit être sans équivoque »), pilote installé
  pay-in/payout, configuration complète (jamais la valeur, seulement les
  noms des variables manquantes), bouton « Tester la connexion » avec
  résultat affiché en ligne (texte, pas seulement un toast qui disparaît).
- `admin-sidebar.tsx` — ajout de « Paiements » et « Commissions » à la nav
  (`platformOnly`) ; corrige au passage un vrai défaut préexistant :
  `/admin/commissions` (créée lors d'une mission antérieure) n'avait
  **aucune entrée de navigation nulle part** — trouvée en grep, seulement
  atteignable en tapant l'URL. Corrigé dans le même mouvement, cohérent avec
  ce qui était déjà en cours d'édition dans ce fichier.

### API

`GET /admin/payment-providers`, `POST /admin/payment-providers/:code/test-connection`
— voir Phase 1 pour la matrice complète des routes déjà existantes.

### Frontend

`/admin/paiements` — nouvelle page, Superadmin uniquement.

### Sécurité

Vérifié par un test e2e dédié (`admin-payment-providers.e2e-spec.ts`) : la
réponse de `GET /admin/payment-providers` n'expose **que** un jeu de champs
whitelistés exact (`toEqual` sur `Object.keys`) — aucune valeur de secret ne
peut s'y glisser sans faire échouer le test, pas seulement une recherche de
motif approximative. `missingEnvVars` ne contient que des noms de variable.

### Tests

```text
backend   pnpm exec tsc --noEmit    → OK
backend   pnpm lint                 → OK
backend   pnpm test (unitaires)     → 13/13 suites, 90/90 tests
backend   pnpm test:e2e (complète)  → 15/15 suites, 211/211 tests (+5 nouveaux)
frontend  pnpm exec tsc --noEmit    → OK
frontend  pnpm lint                 → 0 nouvelle erreur/avertissement (3 avertissements préexistants sans rapport, React Compiler/react-hook-form)
frontend  pnpm build (production)   → OK, /admin/paiements compilée
```

**Vérification navigateur réelle** (pas seulement « ça compile », brief §100) :
serveurs dev backend/frontend redémarrés (l'un tournait depuis la veille, un
process worker Next.js avait fini par planter — « Jest worker encountered 2
child process exceptions » — cause d'un premier 500 rencontré pendant ce test,
sans rapport avec le code de cette phase, corrigé par un simple redémarrage).
Compte de test jetable créé (`browsercheck@paymentplatform.dev.test`, promu
admin en base comme le font les e2e), jamais le vrai compte Superadmin de
l'utilisateur (mot de passe inconnu de cette session, jamais touché) :
- Page chargée : 6 prestataires réels affichés, `fake` actif/configuré/deux
  pilotes installés, PawaPay/CinetPay/FeexPay inactifs/incomplets avec les
  noms exacts des variables manquantes.
- « Tester la connexion » sur `fake` → succès réel (toast + détail en ligne
  « Connexion réussie… »).
- « Tester la connexion » sur `pawapay` → échec honnête (« aucun pilote
  pay-in installé pour ce prestataire »), pas de succès fabriqué.
- Accès refusé aux deux niveaux : un compte lecteur simple est redirigé hors
  de `/admin/paiements` côté frontend, et l'appel API direct renvoie 403.
- Aucune erreur console.
- Comptes de test supprimés après vérification.

### Résultats

`AdminPaymentProvidersService`/`Controller` : VALIDÉ (testé e2e + navigateur
réel). Page `/admin/paiements` : VALIDÉ. Modification des identifiants
réels des prestataires : NON APPLICABLE par conception — reste
exclusivement dans `.env`, jamais géré depuis cette interface.

### Problèmes rencontrés

Un 500 rencontré pendant la vérification navigateur, dû à un worker Next.js
planté sur un serveur de développement resté ouvert depuis la session
précédente — pas un bug de cette phase. Diagnostiqué (`Jest worker
encountered 2 child process exceptions`), corrigé par redémarrage propre des
deux serveurs de développement.

### Corrections

Import `useQueryClient` laissé inutilisé après une réécriture — retiré avant
lint.

### Commit

`feat(payments): Phase 2 - Superadmin payment providers config (read-only, env-derived)` (`e54ca2a`)
`feat(admin): Phase 2 - Superadmin Paiements page, wire up nav` (`44c95cc`)

### Push

Effectué sur `feature/payment-platform`.

### Merge main

Non fusionné — poursuite immédiate vers Phase 3 (Commissions et conditions),
dont le schéma de fondation (`CommissionRule.tenantId`/`tenantType`,
`DistributionTerms`, `TenantTermsAcceptance`) est déjà posé depuis Phase 1.

### État

**VALIDÉ.**

---

## Phase 3 — Commissions et conditions (partie « Commissions »)

### Objectif

Chaîne de priorité auteur > tenant > type de tenant > globale, réellement
appliquée au moment de la vente, et une interface Superadmin pour créer ces
règles à chaque niveau — pas seulement la portée globale déjà existante.

### Implémentation

**Moteur (`commission.ts`)** : `selectRule()` étendu (`RuleSelectionContext`
remplace le simple `authorId`), 4 paliers testés unitairement un par un plus
la chaîne complète (`commission.spec.ts`, +4 tests). `freezeForOrder()`
(`commissions.service.ts`) résout le type de chaque tenant vendeur en une
seule requête par commande et construit le contexte complet.

**API** (`admin-commission-rules.service.ts`, `dto/commission-rule.dto.ts`) :
`tenantId`/`tenantType` ajoutés aux deux DTO, portée mutuellement exclusive
vérifiée en 400 clair (`assertScope`, même règle que la contrainte `CHECK`
posée en Phase 1). `UpdateCommissionRuleDto` distingue `undefined` (ne pas
toucher) de `null` (effacer explicitement) sur les trois champs de portée —
nécessaire pour repasser une règle de « propre au tenant » à « générale »
depuis le formulaire d'édition.

**Répertoire des tenants** (`GET /admin/tenants`, `AdminTenantsController`,
Phase 3) : premier point d'accès « tous les tenants » de toute l'API — rien
n'existait avant pour qu'un Superadmin choisisse un tenant précis par nom.

**Frontend** (`commission-rule-manager.tsx`) : sélecteur « Portée »
(Générale / Un tenant précis / Un type de tenant), listes déroulantes
conditionnelles alimentées par `/admin/tenants` et l'énumération
`TenantType`. Une règle propre à un auteur (créable seulement via l'API,
comportement antérieur à cette mission, inchangé) s'affiche en lecture
seule plutôt que de proposer un changement de portée trompeur, faute de
sélecteur d'auteur global dans cette interface.

### Bug réel trouvé et corrigé en testant en navigateur

`dialog.tsx` (composant partagé, utilisé par `author-manager.tsx`,
`category-manager.tsx`, `work-list.tsx`, `team-manager.tsx`,
`tenant-settings-manager.tsx` et ce fichier) : la chaîne flex/`overflow-y-auto`
entre `DialogContent`/`DialogBody`/`DialogFooter` se rompt dès que le
`<form>` qui enveloppe `DialogBody` + `DialogFooter` n'a lui-même aucune
classe flex — un `<form>` nu est un bloc ordinaire, pas un item flex
contraint. `DialogBody` grandissait alors à sa hauteur naturelle plutôt que
de défiler en interne, et le bouton d'envoi du pied de formulaire finissait
positionné hors de la fenêtre visible, physiquement inatteignable — jamais
déclenché avant parce qu'aucun formulaire existant n'était assez long pour
dépasser la hauteur maximale du dialogue.

Diagnostiqué par inspection directe du DOM et des styles calculés (pas
supposé) : `document.querySelector('[data-slot="dialog-body"]')` montrait
`clientHeight === scrollHeight` (568px des deux côtés) alors que son parent
`dialog-content` était correctement plafonné à 550px — la preuve que le
corps ne se voyait jamais réellement contraint par son parent flex.

Corrigé à la source, dans `dialog.tsx` lui-même (`[&>form]:flex
[&>form]:min-h-0 [&>form]:flex-1 [&>form]:flex-col` sur `DialogContent`),
plutôt que de rustiner chaque formulaire un par un — corrige aussi tout
formulaire futur qui grandirait suffisamment pour reproduire le même
problème. Re-testé après correction : le corps défile bien en interne
(`clientHeight` 410px contre 568px de contenu), le bouton reste dans la
fenêtre visible, une vraie requête `PATCH` part au clic.

### Tests

```text
backend   pnpm exec tsc --noEmit    → OK
backend   pnpm lint                 → OK
backend   pnpm test (unitaires)     → 13/13 suites, 94/94 tests
backend   pnpm test:e2e (complète)  → 15/15 suites, 216/216 tests
frontend  pnpm exec tsc --noEmit    → OK
frontend  pnpm lint                 → 0 nouvelle erreur (4 avertissements watch()/React Compiler préexistants, même motif que 3 autres fichiers)
frontend  pnpm build (production)   → OK
```

**Vérification navigateur réelle**, compte de test jetable (créé, promu
admin, supprimé après coup — jamais le vrai compte Superadmin de
l'utilisateur) :
- Création d'une règle de portée générale : réussie du premier coup, ligne
  réelle apparue, compteurs mis à jour.
- Édition vers portée « tenant » (Mampouya Éditions) : bloquée par le bug
  ci-dessus lors des toutes premières tentatives (bouton inatteignable) —
  diagnostiquée, corrigée, puis **réellement réussie** (`PATCH 200`, ligne
  affichant « Propre à Mampouya Éditions », compteur « 1 à portée réduite »).
- Retour à la portée générale (`tenantId: null` explicite) : réussi, ligne
  redevenue « Règle générale ».
- Création d'une règle de portée « type de tenant » (Maison d'édition) :
  réussie, libellé français correct affiché.
- Aucune erreur console sur l'ensemble de la vérification.
- Règles et compte de test supprimés après vérification.

### Résultats

Chaîne de priorité (moteur) : VALIDÉ (unitaire + e2e réel via webhook).
API de portée (tenant/type de tenant) : VALIDÉ (e2e + navigateur réel).
UI Superadmin de sélection de portée : VALIDÉ (navigateur réel, bug trouvé
et corrigé avant validation, pas après).

### Commit

`feat(commissions): Phase 3 - tenant-scoped commission rule priority chain` (`b5895b5`)
`feat(commissions): Phase 3 - expose tenant/tenant-type scoping in the admin API` (`d7581bd`)
`feat(tenants): Phase 3 - admin tenant directory for scope pickers` (`17aadbb`)
`feat(commissions): Phase 3 - Superadmin UI for tenant/tenant-type commission scope` (`c68d147`)

### Push

Effectué sur `feature/payment-platform`.

### Reste à faire en Phase 3

Conditions de distribution (`DistributionTerms`/`TenantTermsAcceptance`,
schéma déjà posé en Phase 1) : contenu administrable marqué « à compléter »,
UI Superadmin de gestion des versions, acceptation à la création/activation
commerciale d'un tenant, affichage tenant-facing dans « Paramètres →
Distribution ». Non commencé — Phase 3 reste **PARTIEL** tant que ce volet
n'est pas construit.

### État

**VALIDÉ** — commissions (moteur + API + UI) et conditions de distribution
toutes deux terminées et vérifiées (voir la suite ci-dessous). Phase 3
close.

---

## Phase 3 (suite) — Conditions de distribution

### Objectif

Conditions de distribution versionnées par type de tenant, jamais de contenu
juridique fictif, acceptation réellement enregistrée à la création d'un
tenant — pas affichée pour la forme.

### Implémentation

**Schéma** : déjà posé en Phase 1 (`DistributionTerms`, `TenantTermsAcceptance`).

**Seed** : une version 1 par type de tenant (4 lignes), contenu explicitement
marqué `[À COMPLÉTER]` — jamais de texte juridique inventé (brief §16). Sans
ce placeholder, le circuit d'acceptation n'aurait rien de réel à exercer tant
qu'un Superadmin n'a rien publié.

**Backend** (`distribution-terms.service.ts`, deux contrôleurs) :
- `GET /distribution-terms/:tenantType` — n'importe quel compte authentifié,
  version en vigueur pour l'onboarding.
- `GET/POST /admin/distribution-terms` — Superadmin, liste et publication.
  `publish()` calcule la version suivante et désactive l'ancienne dans la
  même transaction (au plus une version active par type), audité
  (`ActivityLogService`).
- `CreateTenantDto.acceptTerms` (requis `true`, même motif qu'`RegisterDto`).
  `TenantsService.create()` cherche la version active du type choisi et crée
  la ligne `TenantTermsAcceptance` **dans la même transaction** que la
  création du tenant — jamais une étape séparée qui pourrait être oubliée.

**Frontend** : `creer-un-espace/page.tsx` charge les 4 versions en vigueur
côté serveur en un seul chargement de page ; `CreateWorkspaceForm` affiche le
texte du type sélectionné et exige une case à cocher native (`required`)
avant l'envoi — aucun aller-retour réseau supplémentaire au changement de
type.

### Tests

```text
backend   pnpm exec tsc --noEmit    → OK
backend   pnpm lint                 → OK
backend   pnpm test (unitaires)     → 13/13 suites, 94/94 tests
backend   pnpm test:e2e (complète)  → 16/16 suites, 221/221 tests (+5 nouveaux, +1 corrigé)
frontend  pnpm exec tsc --noEmit    → OK
frontend  pnpm lint                 → 0 nouvelle erreur
frontend  pnpm build (production)   → OK
```

**Vérification navigateur réelle**, compte de test jetable (créé, supprimé
après coup) :
- Texte réel affiché (« [À COMPLÉTER]… », version 1) pour le type par défaut.
- Soumission sans cocher la case → bloquée par la validation native du
  navigateur (« Veuillez cocher cette case… »), aucune requête envoyée.
- Case cochée puis soumission → tenant réellement créé, redirection vers
  `/admin`.
- Vérifié directement en base (pas seulement au succès HTTP) : ligne
  `TenantTermsAcceptance` présente, `termsVersion: 1`,
  `termsType: independent_author`, `acceptedAt` réel, `ipAddress` réelle.
- Aucune erreur console. Tenant et compte de test supprimés après vérification.

### Résultats

Publication/versionnage : VALIDÉ. Acceptation à la création : VALIDÉ
(vérifiée en base, pas seulement en façade). Affichage tenant-facing dans
« Paramètres → Distribution » (montrer la version acceptée sur la page de
paramètres du tenant, après création) : NON FAIT — hors périmètre immédiat,
non explicitement requis pour que l'acceptation elle-même soit fonctionnelle ;
noté comme reste à faire si le brief y revient explicitement en Phase 8/9.

### Commit

`feat(tenants): Phase 3 - Conditions de distribution (Terms/Conditions)` (`2fd6d62`)

### Push

Effectué sur `feature/payment-platform`.

### État

**VALIDÉ.**

---

## Bilan de la Phase 3

Commissions (moteur + API + UI Superadmin) : VALIDÉ.
Conditions de distribution (versionnage + acceptation) : VALIDÉ.
Phase 3 entièrement close.

**Déviation actée par rapport à l'ordre initialement prévu** : l'utilisateur a
explicitement demandé de traiter CinetPay avant PawaPay (« Utilisons d'abord
cinetpay »), et a lui-même renseigné `CINETPAY_API_KEY`/`CINETPAY_SITE_ID`
dans `.env`. La Phase 4 ci-dessous couvre donc CinetPay ; PawaPay et FeexPay
suivront (Phases 5-6), FeexPay avec un rappel explicite que son SDK React
côté client ne convient pas à l'architecture de GeBook (voir plus bas).

---

## Phase 4 — Pay-in CinetPay

### Objectif

Pilote pay-in CinetPay réel (`PaymentDriver`), pour l'international et les
cartes, en respectant strictement les mêmes garanties que le prestataire
factice : jamais le corps brut d'une notification n'est traité comme source
de vérité, jamais un remboursement n'est prétendu possible s'il ne l'est pas
réellement.

### Analyse préalable (documentation officielle CinetPay)

Deux particularités structurent tout le pilote :

1. **Le corps de la notification ne porte jamais le vrai statut du
   paiement** — volontairement, pour qu'une notification forgée ne suffise
   jamais. Un rappel serveur-à-serveur (`POST /v2/payment/check`) est
   obligatoire pour connaître l'issue réelle. Cela a forcé un changement
   d'interface : `PaymentDriver.parseWebhook()` est désormais `async`
   (`Promise<WebhookParseResult>`) — les deux seuls sites d'appel touchés
   (`PaymentsService.handleWebhook()`, `FakePaymentDriver.parseWebhook()`)
   ont été mis à jour et re-testés.
2. **La signature `X-TOKEN`** se vérifie en concaténant les *valeurs* du
   corps `application/x-www-form-urlencoded` dans leur ordre d'arrivée
   (`HMAC-SHA256` avec `CINETPAY_SECRET_KEY`, distincte de
   `CINETPAY_API_KEY`), comparée en temps constant.

Aucune API de remboursement n'est documentée pour le produit CinetPay
Checkout (recherché explicitement) : `capabilities.supportsRefund = false`,
et `refund()` rejette explicitement plutôt que de prétendre réussir.

### Implémentation

- `backend/src/modules/payments/provider-errors.ts` (nouveau) :
  `PaymentProviderError`/`PayoutProviderError`/`ProviderTimeout`/
  `ProviderUnavailable`/`InvalidProviderResponse` — vocabulaire interne
  commun aux pilotes réels ; la garde déjà en place dans `PaymentsService`
  (jamais `error.message` renvoyé tel quel au frontend) restait déjà
  suffisante et n'a pas eu besoin d'être modifiée.
- `backend/src/modules/payments/drivers/cinetpay-payment.driver.ts`
  (nouveau) : `initialize()`, `verify()`, `parseWebhook()` (async, HMAC +
  rappel `check`), `refund()` (rejet explicite), `testConnection()`.
  Montants convertis via `money.ts` (`fromMinorUnits`/`toMinorUnits` — l'API
  CinetPay attend des unités majeures, GeBook ne manipule que des unités
  mineures en interne).
- `payments.module.ts` : `CinetPayPaymentDriver` enregistré dans les
  `providers` et dans la fabrique `PAYMENT_DRIVER`, aux côtés du pilote
  factice.
- `prisma/seed.ts` : ligne `payment_providers` du code `cinetpay` passée de
  `inactive` à `active` — même règle que les autres lignes de cette table
  (« un prestataire n'est actif que si son pilote existe réellement »).
- `environment.ts`/`.env.example`/`.env` : ajout de `CINETPAY_SECRET_KEY`
  (distincte de `CINETPAY_API_KEY`) et `API_PUBLIC_URL` (URL publique de
  cette API, nécessaire pour construire le `notify_url` que CinetPay exige à
  l'initialisation — concept nouveau, absent du brief Phase 1). Toutes deux
  optionnelles : leur absence rend seulement CinetPay indisponible (503),
  jamais le démarrage bloqué.

### Tests

```text
backend   pnpm exec tsc --noEmit    → OK
backend   pnpm lint                 → OK
backend   pnpm test (unitaires)     → 14/14 suites, 106/106 tests (+1 suite, +12 tests)
backend   pnpm test:e2e (complète)  → 16/16 suites, 221/221 tests
```

Tests unitaires du nouveau pilote (`cinetpay-payment.driver.spec.ts`,
`fetch` simulé) : montant envoyé en unités majeures, URL de paiement
retournée, réponse incomplète rejetée, statuts `ACCEPTED`/`REFUSED`
traduits correctement, notification sans `x-token` refusée, signature
falsifiée refusée, notification signée puis vérifiée `ACCEPTED` acceptée,
notification signée mais vérification `PENDING` refusée (pas d'issue
fabriquée), notification sans identifiant de transaction refusée,
`refund()` rejette explicitement, `testConnection()` distingue succès et
échec sans fuiter de détail interne.

**Vérification sandbox réelle contre l'API CinetPay** : tentée
explicitement (`testConnection()` contre `POST /v2/payment/check`, avec les
vraies `CINETPAY_API_KEY`/`CINETPAY_SITE_ID` fournies par l'utilisateur dans
`.env`). **Bloquée par l'environnement d'exécution de cette session** : la
résolution DNS de `api-checkout.cinetpay.com` échoue systématiquement
(`getaddrinfo ENOTFOUND`), alors que la résolution DNS générale fonctionne
(`github.com` résout normalement) — confirmé par un test isolé en dehors du
pilote. Cause probable : restriction réseau propre à ce bac à sable, pas un
problème côté CinetPay ni un défaut du code. Un contournement (WebSearch au
lieu de WebFetch) avait déjà permis de lire leur documentation plus tôt dans
la session malgré la même restriction sur `docs.cinetpay.com` — mais aucun
contournement de ce type n'existe pour un appel API sortant réel.

**`CINETPAY_SECRET_KEY` non encore fournie** par l'utilisateur au moment de
cette phase : la vérification HMAC des notifications reste donc, elle
aussi, non testable contre un vrai webhook CinetPay tant qu'elle ne l'est
pas — seule la logique interne (testée avec un secret de test) est
vérifiée.

### Résultats

Code du pilote (toutes méthodes) : IMPLÉMENTÉ — NON VALIDÉ. Logique
interne (mapping de statut, HMAC, conversion d'unités, gestion d'erreurs) :
VALIDÉE par les tests unitaires. Connectivité réelle contre le sandbox
CinetPay : NON TESTÉ — bloqué par une restriction réseau de cet
environnement (DNS), pas par le code. **Action requise côté utilisateur**
pour valider réellement ce pilote : exécuter GeBook (ou au moins ce pilote)
depuis un environnement qui peut atteindre `api-checkout.cinetpay.com`, puis
fournir `CINETPAY_SECRET_KEY` pour permettre un test de notification de bout
en bout.

### Commit

`feat(payments): Phase 4 - pilote pay-in CinetPay` (`5c89300`)

### Push

Effectué sur `feature/payment-platform`.

### État

**IMPLÉMENTÉ — NON VALIDÉ** (bloqué en environnement de développement pour
la vérification réseau réelle ; logique interne validée par tests
unitaires).

---

## Phase 5 — Pay-in FeexPay

### Objectif

Pilote pay-in FeexPay (Mobile Money : Bénin, Togo, Côte d'Ivoire, Congo
Brazzaville, Sénégal, Burkina Faso, Mali), suite directe de la Phase 4 —
l'utilisateur a fourni la documentation REST officielle payin/payout/statut/
historique/solde/erreurs juste après la clôture de cette dernière.

### Analyse préalable

**Décision architecturale actée sans nouvelle confirmation** (déjà tranchée
en Phase 3/4 avec la même justification) : plus tôt dans la mission,
l'utilisateur avait collé la documentation du SDK React client de FeexPay
(`react-sdk-feexpay`, composant `<FeexPay>`) — délibérément **non utilisée**,
car un bouton de paiement côté client contredit l'architecture de GeBook
(le backend, via webhook/vérification, doit rester seule source de vérité).
La documentation REST reçue cette fois-ci est au contraire exactement le
bon outil : serveur-à-serveur, avec un point de statut authentifié — elle
s'intègre nativement au patron `PaymentDriver` déjà en place.

Trois écarts par rapport à CinetPay, chacun documenté dans le code :

1. **FeexPay déclenche lui-même le paiement** (push USSD « request to pay »)
   au lieu d'exposer une page hébergée : `initialize()` a donc besoin d'un
   numéro de téléphone et d'un canal (opérateur + pays), qu'aucun champ de
   `PaymentInitRequest` ne portait. Deux champs optionnels ajoutés
   (`customerPhone`, `channel`) — les pilotes qui n'en ont pas besoin (Fake,
   CinetPay) les ignorent simplement. Répercuté jusqu'au DTO
   (`InitializePaymentDto.customerPhone`/`providerChannel`, tous deux
   validés et optionnels) et à `PaymentsService.initialize()`.
2. **Aucun code de canal n'est codé en dur.** La documentation reçue ne
   confirme explicitement qu'un seul canal (`mtn_cg`, MTN Congo
   Brazzaville) parmi les sept pays annoncés — deviner les autres
   (`mtn_bj`, `moov_ci`, `wave_sn`…) aurait violé la règle « ne jamais
   fabriquer ce qui n'est pas vérifié ». Le canal transmis par l'appelant
   est donc utilisé tel quel dans l'URL ; FeexPay répond lui-même
   `{channel} channel not configured` (404, documenté) si le code est
   invalide — c'est la seule source de vérité fiable ici, jamais une
   table interne inventée.
3. **Aucune signature de notification n'est documentée** pour FeexPay
   (contrairement au X-TOKEN de CinetPay — vérifié en cherchant
   spécifiquement, y compris dans le SDK PHP officiel sur GitHub, qui ne
   documente lui non plus aucune vérification de signature). `parseWebhook()`
   ignore donc entièrement le statut porté par le corps brut de la
   notification et ne fait jamais confiance qu'à un rappel authentifié vers
   l'API de statut (`GET /transactions/public/single/status/:reference`,
   protégée par la clé d'API) — sans cette défense, n'importe qui aurait pu
   POSTer un faux succès sur cette URL. `signatureValid: true` signifie ici
   « confirmé par ce rappel authentifié », faute de toute signature
   cryptographique fournie par le prestataire lui-même — redéfinition
   documentée explicitement dans le code, pas silencieuse.

Aucune API de remboursement documentée pour le pay-in FeexPay :
`capabilities.supportsRefund = false`, `refund()` rejette explicitement.

### Implémentation

- `payment-driver.ts` : `PaymentInitRequest` gagne deux champs optionnels,
  `customerPhone`/`channel`.
- `dto/initialize-payment.dto.ts` : `customerPhone` (validé, format
  international chiffres uniquement) et `providerChannel` (validé,
  `[a-z0-9_]+`), tous deux optionnels.
- `payments.service.ts` : `initialize()` transmet ces deux champs au pilote.
- `drivers/feexpay-payment.driver.ts` (nouveau) : `initialize()` (exige
  téléphone + canal, sinon refuse explicitement), `verify()`, `parseWebhook()`
  (défensif comme décrit ci-dessus), `refund()` (rejet explicite),
  `testConnection()` (sonde `GET /balance/public/getByShop/:shopId` —
  confirme à la fois la clé d'API et l'identifiant de boutique, sans effet
  de bord).
- `payments.module.ts` : `FeexPayPaymentDriver` enregistré aux côtés de
  Fake et CinetPay.
- `prisma/seed.ts` : ligne `feexpay` passée de `inactive` à `active` côté
  pay-in uniquement — `supportsPayout` (déjà `true` depuis la Phase 1)
  reste un axe distinct, non couvert par un pilote payout réel pour
  l'instant (à venir, la documentation payout FeexPay a aussi été reçue).
- `environment.ts`/`.env.example`/`.env` : ajout de `FEEXPAY_SHOP_ID`
  (identifiant de boutique, distinct de `FEEXPAY_API_KEY`, exigé dans le
  corps de chaque appel payin/payout).

### Tests

```text
backend   pnpm exec tsc --noEmit    → OK
backend   pnpm lint                 → OK
backend   pnpm test (unitaires)     → 15/15 suites, 119/119 tests (+1 suite, +13 tests)
backend   pnpm test:e2e (complète)  → 16/16 suites, 221/221 tests
```

Tests unitaires du nouveau pilote (`feexpay-payment.driver.spec.ts`, `fetch`
simulé) : refus sans téléphone/canal, montant envoyé en unités majeures vers
le bon canal, réponse sans référence rejetée, statuts SUCCESSFUL/FAILED
traduits correctement, notification illisible refusée, notification sans
référence identifiable refusée, **notification dont le corps prétend un
statut différent de la vérification authentifiée — le corps est ignoré, seul
le rappel fait foi**, notification vérifiée PENDING refusée (pas d'issue
fabriquée), extraction de la référence depuis `transref` quand `reference`
est absent, `refund()` rejette explicitement, `testConnection()` distingue
succès et échec sans fuiter de détail interne.

**Vérification sandbox réelle** : impossible pour l'instant — ni
`FEEXPAY_API_KEY` ni `FEEXPAY_SHOP_ID` n'ont encore été fournis par
l'utilisateur. Point positif néanmoins vérifié : contrairement à
`api-checkout.cinetpay.com`, le domaine `api-v2.feexpay.me` **résout bien**
en DNS depuis cet environnement — une fois les identifiants fournis, un test
sandbox réel devrait donc être possible directement depuis cette session
(pas de restriction réseau connue ici, contrairement à CinetPay).

### Résultats

Code du pilote (toutes méthodes) : IMPLÉMENTÉ — NON VALIDÉ. Logique interne
(mapping de statut, extraction défensive de référence, conversion d'unités,
gestion d'erreurs) : VALIDÉE par les tests unitaires. Connectivité réelle
contre le sandbox FeexPay : NON TESTÉ — identifiants (`FEEXPAY_API_KEY`,
`FEEXPAY_SHOP_ID`) non encore fournis, pas de restriction réseau connue
sinon. **Couverture des canaux** : un seul confirmé (`mtn_cg`) sur les sept
pays annoncés par FeexPay — les autres ne sont pas fabriqués, simplement
transmis tels quels si l'appelant les fournit.

### Commit

`feat(payments): Phase 5 - pilote pay-in FeexPay` (`0cca518`)

### Push

Effectué sur `feature/payment-platform`.

### État

**IMPLÉMENTÉ — NON VALIDÉ** (identifiants sandbox non fournis ; logique
interne validée par tests unitaires ; couverture des canaux volontairement
limitée à ce qui est confirmé).

---

## Phase 6 — Payout FeexPay

### Objectif

Pilote payout FeexPay (reversement Mobile Money), à partir de la
documentation officielle payout/statut fournie par l'utilisateur dans la
même série que la Phase 5. Confirmé par l'utilisateur (« Entame déjà »)
juste après la clôture de cette dernière.

### Analyse préalable

**Constat avant d'écrire quoi que ce soit** : aucune `PayoutsService` ni
route de webhook payout n'existe encore dans le code (recherché
explicitement — seuls l'interface `PayoutDriver`, le registre
`PayoutDriverRegistry` et `FakePayoutDriver` existaient, posés en Phase 1).
Construire la couche métier complète (déclenchement d'un reversement,
approbation, route de webhook) est un chantier distinct et plus large que
« le pilote payout » demandé — hors périmètre de cette phase, qui se limite
donc au pilote lui-même, exactement comme pour CinetPay/FeexPay pay-in.

**Deux écarts supplémentaires par rapport au pilote pay-in, actés dans le
code** :

1. **`PayoutDriver.parseWebhook()` devient asynchrone**, exactement pour la
   raison qui avait rendu `PaymentDriver.parseWebhook()` asynchrone en
   Phase 4 — mais ici la documentation FeexPay le dit **explicitement** :
   « Status verification is mandatory for payouts. After initiating a
   payout (PENDING status), you must call this endpoint to confirm the
   final status ». Seul appelant existant (`FakePayoutDriver.parseWebhook()`,
   aucune `PayoutsService` en production) mis à jour en conséquence, avec
   son fichier de tests.
2. **`PayoutInitRequest` gagne un champ optionnel `channel`**, même
   justification que côté pay-in (l'endpoint payout FeexPay est lui aussi
   scindé par opérateur/pays, `/api/payouts/public/{channel}`) — transmis
   tel quel, jamais de table de canaux fabriquée.

**Différence de traitement de `PENDING`, documentée dans le code et les
tests** : contrairement au pay-in (`PaymentOutcome` n'a que
successful/failed/cancelled), `PayoutOutcome` porte explicitement `pending`
— un reversement encore en cours est donc accepté par `parseWebhook()` avec
`outcome: 'pending'`, pas rejeté comme une notification non résolue. Cela
reflète honnêtement le vocabulaire de l'interface plutôt que de forcer une
issue binaire sur une opération qui reste fréquemment asynchrone.

### Implémentation

- `payout-driver.ts` : `parseWebhook()` → `Promise<PayoutWebhookParseResult>` ;
  `PayoutInitRequest` gagne `channel?: string`.
- `drivers/fake-payout.driver.ts` + son fichier de tests : mis à jour en
  `async`/`await`, comportement inchangé.
- `drivers/feexpay-payout.driver.ts` (nouveau) : `initiate()` (exige un
  canal, sinon refuse explicitement), `verify()` (renvoie honnêtement
  `pending` plutôt que de fabriquer une issue), `parseWebhook()` (même
  défense que le pilote pay-in : le corps n'est jamais authentifié, seul le
  rappel vers `GET /payouts/status/public/:reference` fait foi),
  `testConnection()` (même sonde solde que le pilote pay-in, réutilisable
  puisque partagée entre payin/payout chez FeexPay).
- `payments.module.ts` : `FeexPayPayoutDriver` enregistré dans
  `PAYOUT_DRIVER`, aux côtés de `FakePayoutDriver`.
- Aucun changement de seed nécessaire : `feexpay.supportsPayout` était déjà
  `true` depuis la Phase 1, et `AdminPaymentProvidersService` lit déjà
  dynamiquement `PayoutDriverRegistry.has(code)` — la Superadmin verra donc
  automatiquement ce pilote comme installé, sans changement de ce fichier.

### Tests

```text
backend   pnpm exec tsc --noEmit    → OK
backend   pnpm lint                 → OK
backend   pnpm test (unitaires)     → 16/16 suites, 130/130 tests (+1 suite, +11 tests)
backend   pnpm test:e2e (complète)  → 16/16 suites, 221/221 tests (inchangé : aucune route payout n'existe encore)
```

Tests unitaires du nouveau pilote (`feexpay-payout.driver.spec.ts`, `fetch`
simulé) : refus sans canal, montant envoyé en unités majeures vers le bon
canal, `motif` correctement construit, réponse sans référence rejetée,
statuts SUCCESSFUL traduit en succès, **PENDING traduit honnêtement en
`pending` plutôt que fabriqué**, notification illisible refusée,
notification dont le corps prétend un statut différent de la vérification
authentifiée — le corps est ignoré, notification acceptée avec `pending`
quand la vérification confirme un état encore en cours, notification
refusée seulement si le statut vérifié est totalement inconnu,
`testConnection()` distingue succès et échec sans fuiter de détail interne.

**Vérification sandbox réelle** : toujours impossible — mêmes identifiants
manquants que la Phase 5 (`FEEXPAY_API_KEY`, `FEEXPAY_SHOP_ID`), le pilote
payout réutilisant la même authentification que le pilote pay-in.

### Résultats

Code du pilote (toutes méthodes) : IMPLÉMENTÉ — NON VALIDÉ. Logique interne :
VALIDÉE par les tests unitaires. Connectivité réelle : NON TESTÉ (mêmes
identifiants manquants qu'en Phase 5). **Couche métier payout** (service de
déclenchement, route de webhook, flux d'approbation) : NON FAIT — hors
périmètre explicite de cette phase, qui livrait le pilote seul ; à
construire dans une phase dédiée (le brief prévoyait initialement les
Phases 10-11 pour ce chantier).

### Commit

`feat(payments): Phase 6 - pilote payout FeexPay` (`9c6f663`)

### Push

Effectué sur `feature/payment-platform`.

### État

**IMPLÉMENTÉ — NON VALIDÉ** (identifiants sandbox non fournis ; logique
interne validée par tests unitaires ; couche métier payout volontairement
hors périmètre de cette phase).

---

## Note d'infrastructure — Docker/Dokploy laissé en retard sur les Phases 4-6

Demande explicite de l'utilisateur : « Faudrait bien différencier les
environnements, regardes les dockerfiles, dockercompose, env et différencie :
prod; dev ». Audit de `backend/Dockerfile`, `frontend/Dockerfile`,
`docker-compose.yml`, `docker-compose.local.yml`, `.env.docker.example`,
`backend/.env.example`, `frontend/.env.example`/`.env.local`.

**Constat** : le socle dev/prod (préfixe `__Host-` du cookie selon
`NODE_ENV`, refus du démarrage en production avec les secrets de
développement, `.env` jamais versionné, `docker-compose.local.yml`
explicitement documenté comme non destiné au développement réel) était déjà
solide et n'a pas eu besoin de changer. **Le vrai trou** : les variables de
la plateforme de paiement ajoutées aux Phases 4-6
(`PAYMENT_ENV`/`PAYIN_PROVIDER`/`PAYOUT_PROVIDER`, les identifiants
PawaPay/CinetPay/FeexPay, `API_PUBLIC_URL`) n'avaient jamais été répercutées
dans `docker-compose.yml` ni `.env.docker.example` — un déploiement Dokploy
n'aurait donc jamais pu activer un prestataire réel, quelles que soient les
valeurs saisies dans son onglet Environment, puisque le conteneur `backend`
ne les recevait tout simplement pas.

**Corrigé** :
- `docker-compose.yml` : les 12 variables ajoutées au service `backend`,
  toutes optionnelles comme dans `environment.ts` (un prestataire sans
  identifiants reste indisponible, jamais un échec de démarrage).
- `API_PUBLIC_URL` calculée par défaut depuis `BACKEND_DOMAIN` (déjà
  obligatoire dans ce fichier), via l'interpolation imbriquée
  `${API_PUBLIC_URL:-https://${BACKEND_DOMAIN}}` — même patron déjà utilisé
  par `DATABASE_URL` dans ce fichier, validé en relisant le rendu réel
  (`docker compose config`) plutôt que supposé. Sans ce défaut, quiconque
  configurerait CinetPay en production sans penser à `API_PUBLIC_URL`
  aurait obtenu un webhook silencieusement indisponible (503) au lieu d'une
  configuration correcte par défaut.
- `.env.docker.example` : nouvelle section « Plateforme de paiement »,
  miroir de `backend/.env.example`, documentant chaque variable pour
  l'opérateur Dokploy.

**Observation, non corrigée (comportement volontaire, pas un bug)** :
`PAYMENT_ENV` est validé (`sandbox`/`production`) mais n'est lu par aucun
pilote — ni CinetPay ni FeexPay n'exposent d'URL sandbox distincte de leur
URL de production ; leur bascule sandbox/live se fait entièrement côté
prestataire, via quelles identifiants (clé de test vs clé réelle) sont
utilisés, pas via une URL différente. `PAYMENT_ENV` reste donc un signal de
politique/documentation (« rester prudent tant que rien n'est prêt »)
plutôt qu'un interrupteur technique — signalé ici pour que ça ne soit pas
pris pour un oubli si quelqu'un cherche où cette variable est consommée.

### Vérification

```text
docker compose -f docker-compose.yml config                      → rendu correct (variables interpolées vérifiées une à une)
docker compose -f docker-compose.yml -f docker-compose.local.yml config --quiet → OK, sans erreur
```

Vérifié explicitement : `API_PUBLIC_URL` non fournie se résout bien en
`https://<BACKEND_DOMAIN>` ; une valeur fournie explicitement prend le pas
sur ce défaut (`docker compose config` avec et sans `API_PUBLIC_URL` en
entrée, sortie comparée).

### Commit

`fix(infra): wire payment-platform env vars into the Docker/Dokploy path` (`e8c76ee`)

### État

**VALIDÉ** (rendu réel du fichier Compose vérifié, pas seulement la syntaxe
YAML) — aucun changement de code applicatif, seulement l'infrastructure de
déploiement.

---

## Mission mise en pause — 2026-09-01

**Décision de l'utilisateur** (verbatim) : *« Mettons 2s les paiements de
côté. [...] Pensons d'abord stockage et processus de validation, [...]
qu'en est-il pour le stockage des livres et la validation ainsi que la
publication »*.

Phases 1-6 closes (architecture providers, Superadmin paiements, commissions
+ conditions de distribution, pay-in CinetPay, pay-in FeexPay, payout
FeexPay) + le correctif d'infrastructure Docker/env ci-dessus. Toutes
poussées sur `feature/payment-platform`, non encore fusionnées dans `main`
(dernier merge : `6391316`, fin de Phase 3).

**Reprise prévue** à partir de la Phase 7 (pilote pay-in PawaPay), une fois
le chantier stockage/validation/publication des livres traité. Ce dernier
fait l'objet d'un audit séparé, hors du périmètre de ce journal (dédié à la
plateforme de paiement) — ses conclusions vivront ailleurs si elles donnent
lieu à un travail de développement.
