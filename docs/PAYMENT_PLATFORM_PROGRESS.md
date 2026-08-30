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

**PARTIEL** — commissions (moteur + API + UI) VALIDÉ ; conditions de
distribution non commencées. Poursuite immédiate, sans attendre de
confirmation (brief : autonomie totale entre phases).
