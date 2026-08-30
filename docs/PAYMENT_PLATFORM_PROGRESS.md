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
