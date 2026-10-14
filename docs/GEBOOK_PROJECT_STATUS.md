# GeBook — Rapport d'état du projet

## 1. Date et périmètre de l'audit

| Élément | Valeur |
|---|---|
| Date | 2026-10-11 |
| Branche auditée | `feature/openpay-integration` (HEAD `1553398`, 2026-10-07) ; 127 commits ; 18 commits d'avance sur `main` |
| Méthode | Lecture du code (backend, frontend, schéma Prisma, Docker, CI), exécution de vérifications **non destructives** en local, lecture de la documentation interne |
| Hors périmètre | Aucun accès à un serveur distant (`dev.gebook.net`, production) ; aucun paiement réel ; aucune migration appliquée ; aucun test e2e lancé (voir §7) ; aucun test intrusif |
| Secrets | Aucune valeur de secret n'est reproduite. Seul l'état « renseigné / vide / absent » est indiqué |
| Limite générale | Audit statique + tests existants. Les affirmations « fonctionne » reposent sur des tests passés ou du code relu, jamais sur la seule présence d'une interface |

**Modifications faites pendant l'audit :** ce fichier uniquement. `frontend/app/favicon.ico` apparaissait déjà modifié avant l'audit (non lié). Les builds (`backend/dist`, `frontend/.next`) ont été régénérés (dossiers ignorés par Git).

---

## 2. Résumé exécutif

GeBook est une marketplace de livres numériques multi-espaces (« tenants » : maisons d'édition / auteurs indépendants), construite sur **NestJS 11 + Prisma 7 + PostgreSQL** (backend) et **Next.js 16 + React 19** (frontend). Le socle technique est **sérieux et nettement au-dessus d'un prototype** : isolation multi-tenant en base (RLS), webhooks de paiement journalisés et idempotents, sessions hachées, OTP e-mail, antivirus sur les uploads, aperçus filigranés, stack Docker de production et de staging.

### Ce qui fonctionne réellement aujourd'hui
- Compilation, lint et typecheck backend et frontend passent ; les builds de production passent (§7).
- **298 tests unitaires backend sur 298 réussissent** (32 suites), dont les 4 pilotes de paiement (avec appels HTTP simulés), la mécanique de commissions, l'argent, le MIME, l'antivirus, les aperçus.
- Le schéma de base de données de la base locale est à jour avec les 32 migrations (`prisma migrate status` : « Database schema is up to date »). L'API locale répond `{"status":"ok","database":"up"}`.
- Chaîne de traitement d'un paiement confirmé (code relu) : événement enregistré avant traitement, idempotence par contrainte unique, garde atomique, contrôle du montant, commande + accès bibliothèque + commissions figées dans **une** transaction.

### Ce qui est développé mais pas encore vérifié
- **Aucun paiement n'a été vérifié contre un prestataire réel dans cet audit.** FeexPay, CinetPay, PawaPay et OpenPay ont du code et des tests avec réponses simulées ; la preuve d'un encaissement sandbox/réel de bout en bout n'existe pas dans le dépôt.
- **Les 17 fichiers de tests e2e (RLS, commandes, paiements, auth…) n'ont pas été exécutés** : ils écrivent dans la base locale, ce que l'audit s'interdit.
- Le parcours complet navigateur (inscription → achat → paiement → lecture) n'a pas été rejoué ; aucun test frontend n'existe (0 fichier de test).
- Emails transactionnels, stockage R2, antivirus ClamAV : code présent, services non joignables / non vérifiés ici (ClamAV local : port 3310 fermé).

### Ce qui manque pour lancer commercialement
1. Validation des comptes marchands (aucun prestataire réel démontré fonctionnel).
2. Pages légales : **encore des champs `[À COMPLÉTER]`** (raison sociale, RCCM, hébergeur…) — 21 occurrences sur 5 pages.
3. **Récupération de mot de passe : absente.**
4. **Sauvegardes / restauration de la base : aucune procédure ni job trouvé.**
5. Mise à jour des dépendances vulnérables (Next.js notamment).
6. Reversements aux auteurs : manuel uniquement (le « marquer payé » est un acte administratif ; aucun versement automatique n'est branché).
7. Remboursement en ligne : **aucun prestataire réel ne le supporte** (seul `fake`).

### Cinq principaux risques / bloqueurs
1. **Paiement réel non démontré** + identifiants prestataire de dev incomplets (`FEEXPAY_API_KEY`, `FEEXPAY_SHOP_ID`, `CINETPAY_SECRET_KEY`, `PAWAPAY_*` vides dans le `.env` local) — hypothèse : les identifiants peuvent aussi être saisis chiffrés en base par le superadmin, non vérifié.
2. **Webhooks FeexPay / OpenPay / PawaPay sans signature** : le corps n'est jamais authentifié ; la confirmation repose sur un rappel serveur vers l'API du prestataire. Acceptable mais plus fragile que HMAC (CinetPay seul vérifie une signature).
3. **Dépendances vulnérables** : `pnpm audit --prod` → frontend 3 critiques / 9 hautes (Next.js 16.3.0, correctif ≥ 16.3.8) ; backend 1 critique / 13 hautes (voir §9).
4. **Aucune récupération de compte, aucune sauvegarde documentée, aucun remboursement réel** → incidents clients non traitables sans intervention manuelle en base.
5. **Conformité légale incomplète** (mentions légales, CGU, CGV, confidentialité en brouillon avec champs vides) et **incohérence de domaine** (`gebook.com` dans le code, `gebook.org` dans le SMTP ; `gebook.net` n'apparaît nulle part dans le dépôt).

### Dix prochaines actions à privilégier
1. Mettre à jour Next.js (≥ 16.3.8) et les dépendances critiques/hautes, relancer lint/tests/build.
2. Exécuter la suite e2e sur une base **jetable** (CI GitLab déjà prévue) et en publier le résultat.
3. Obtenir et configurer un compte sandbox d'un prestataire (FeexPay ou OpenPay en priorité), réaliser un paiement de test complet avec webhook réel.
4. Décider du/des prestataires de production et du mode de remboursement (manuel assumé, ou API).
5. Compléter et faire relire les pages légales ; fixer le domaine officiel et les adresses e-mail.
6. Implémenter la récupération de mot de passe (lien e-mail à usage unique).
7. Mettre en place sauvegardes automatiques PostgreSQL + test de restauration + sauvegarde/versioning R2.
8. Brancher supervision minimale (logs centralisés, alerte sur webhooks `failed`, healthcheck externe).
9. Rejouer en navigateur le parcours acheteur et auteur sur staging avec e-mails réels (SMTP).
10. Publier la CI sur la branche par défaut et exiger le passage e2e + audit des dépendances avant déploiement.

### Verdict
**Poursuite du développement et stabilisation, avec ouverture possible d'une bêta fermée de staging en paiements `sandbox`.** Pas de mise en production commerciale. Justification : socle solide et bien testé unitairement, mais (a) aucun encaissement réel démontré, (b) e2e non rejoués dans cet audit, (c) absence de récupération de compte et de sauvegardes, (d) dépendances à correctif critique, (e) documents légaux incomplets. Une **bêta fermée avec paiements simulés ou sandbox** est réaliste dès que les points 1-3 ci-dessus sont traités ; la mise en production exige en plus 5-8.

---

## 3. État global du projet

| Axe | Appréciation | Preuve |
|---|---|---|
| Socle backend | Solide | typecheck/lint/build OK ; 298/298 tests ; 229 fichiers `.ts` src dont 32 specs |
| Socle frontend | Complet côté pages ; non testé automatiquement | build OK (51 routes) ; 5 warnings lint ; 0 test |
| Base de données | Cohérente | `prisma validate` OK ; `migrate status` : à jour (32 migrations) |
| Paiements | Code présent pour 4 prestataires + simulateur ; aucune preuve réelle | §6 |
| Reversements auteurs | Manuel (demande → approbation → « marqué payé ») | `payouts/admin-payouts.service.ts:175` |
| Déploiement | Fichiers présents (Dokploy prod, Caddy staging, CI) ; disponibilité réelle non vérifiable | §10 |
| Légal / support | Incomplet | §12 |

**Score global :** aucun pourcentage n'est donné. Les critères de lancement ne sont pas pondérables objectivement ; le tableau §11 et la checklist §13 donnent l'état par exigence.

**Remarque sur la documentation existante :** `README.md` est périmé (parle de « new_stack », d'un seul pilote `fake`, de 20 tables). `docs/GEBOOK_CURRENT_STATE.md` (2026-08-29) est une photo ancienne ; sa « régression critique » sur `docker/postgres/init/01-app-role.sh` est **corrigée** (le fichier existe et est référencé par la CI et les compose). `docs/PAYMENT_PLATFORM_PROGRESS.md` s'arrête à une mise en pause du 2026-09-01. Le présent rapport décrit le code tel qu'il est.

---

## 4. Architecture technique réelle

### Stack et versions principales (source : `package.json`, lockfiles)

| Couche | Technologie | Version |
|---|---|---|
| Runtime | Node.js | v24.15.0 (local) ; CI sur `node:22` ; pnpm 10.33.2 (le CLI local rapporte 12.3.4) |
| Backend | NestJS | ^11.0.1 |
| ORM | Prisma + adapter-pg | ^7.9.1 |
| BDD | PostgreSQL | 16+ (README) ; 17 en CI |
| Auth | Sessions opaques maison, argon2 | argon2 ^0.45.1 |
| Sécurité HTTP | helmet ^8.3, @nestjs/throttler ^6.7, cookie-parser, class-validator ^0.15 |
| Fichiers | multer ^2.2, @aws-sdk/client-s3 (Cloudflare R2), pdfjs-dist + @napi-rs/canvas (aperçus), sanitize-html |
| E-mail | nodemailer ^10 |
| Frontend | Next.js 16.3.0 (App Router, Turbopack), React 19.2.8, TanStack Query 5, Tailwind 4, Radix/shadcn, Tiptap 3, Recharts 3, GSAP | |

Deux projets pnpm **indépendants** (`backend/`, `frontend/`), plus un `package.json` racine ne servant que pour husky/lint-staged.

### Organisation
- `backend/src/modules/` : `activity-log, auth, catalog, commissions, contact, files, health, library, mail, orders, payments, payouts, preview, settings, setup, system, tenants`.
- `backend/test/` : 17 fichiers `*.e2e-spec.ts` + `support/`.
- `backend/prisma/` : `schema.prisma` (1 349 lignes), 32 migrations, `seed.ts`.
- `frontend/app/` : routes App Router ; `frontend/src/` : composants et `lib/` (clients API, Server Actions).
- `docker/` : `caddy/Caddyfile`, `postgres/init/01-app-role.sh` ; compose : `docker-compose.yml` (prod Dokploy), `.staging.yml`, `.local.yml`.

### Flux de données
`PostgreSQL → Prisma → service NestJS → API HTTP → Next.js (Server Components/Server Actions + routes proxy `/api/*`) → navigateur`.
Le navigateur n'appelle jamais directement l'API NestJS : les routes `frontend/app/api/{account,admin,author,library,media,preview}/…` relaient le cookie httpOnly. `frontend/proxy.ts` (middleware Next 16) ne fait qu'un contrôle de présence du cookie ; la validation réelle passe par l'API.

### Base de données (`prisma/schema.prisma`)
- 36 modèles, 27 enums. Principaux : `Tenant, TenantMember, User, Role, Session, LoginAttempt, EmailVerificationToken, LoginOtp, Author, Category, Work, WorkFormat, WorkFile, WorkPreviewPage, Order, OrderItem, Payment, PaymentEvent, PaymentProvider, PaymentProviderCredential, ReaderLibrary, Download, CommissionRule, SaleDistribution, Payout, PayoutEvent, DistributionTerms, TenantTermsAcceptance, Setting, ActivityLog`.
- UUID v7 pour les clés primaires ; montants en `Decimal` ; contraintes `CHECK` financières écrites à la main en migration ; **RLS PostgreSQL** activée et forcée sur les tables métier, contexte par transaction (`app_current_tenant_id()`, `app_is_platform_admin()`…) posé par `PrismaService.applyRlsContext`.
- Migration la plus récente : `20260927120000_add_payouts_provider_reference_unique`.

### Authentification et autorisations
- Inscription publique : rôle global `reader` uniquement. Rôles globaux : `reader, author, admin` ; rôles par espace : `owner, admin, editor, author, marketing, finance, viewer`.
- Connexion : mot de passe + **OTP e-mail 6 chiffres obligatoire** (`login-otp.service.ts`, TTL 10 min, haché SHA-256, comparaison à temps constant, tentatives limitées via `LoginThrottleService`), vérification d'e-mail à l'inscription, **Cloudflare Turnstile** sur inscription/connexion.
- Sessions : jeton aléatoire, **seul le hachage est stocké** ; cookie `__Host-gebook_session` en production, httpOnly, `sameSite=lax`.
- CSRF : `OriginGuard` global (refuse les écritures dont `Origin` ∉ `CORS_ORIGINS`) + `sameSite=lax`.
- Les permissions sont **appliquées côté serveur** : `RolesGuard`, `TenantAccessGuard`, contrôles de rôle dans les services, et RLS en base comme second filet.
- Bootstrap du superadmin : `POST /setup/superadmin` protégé par `SETUP_TOKEN`, fermé dès qu'un admin existe.

### Intégrations externes
Cloudflare R2 (stockage), SMTP (nodemailer), Cloudflare Turnstile, ClamAV (conteneur), FeexPay, CinetPay, PawaPay, OpenPay (pay-in) ; FeexPay et PawaPay (payout, **non appelés automatiquement**).

### Configuration, journalisation, erreurs
- Validation d'environnement au démarrage (`config/environment.ts`) avec refus de démarrer en production si : `APP_DEBUG` actif, secrets de développement conservés (`PAYMENT_WEBHOOK_SECRET`, `SETUP_TOKEN`, `CREDENTIALS_ENCRYPTION_KEY`), clé Turnstile de test, FeexPay hors HTTPS.
- Journal d'activité (`ActivityLog`) exposé au superadmin et aux propriétaires d'espace ; logs JSON en production ; `HttpExceptionFilter` global ; `ValidationPipe` en `whitelist + forbidNonWhitelisted`.
- Rate limit global 100 req/min (`ThrottlerGuard`, désactivé en `NODE_ENV=test`).

### Production / CI
`docker-compose.yml` (Dokploy/Traefik : backend, frontend, postgres, clamav, job de migration/seed), `docker-compose.staging.yml` (Caddy + `PAYMENT_ENV=sandbox` forcé), `.gitlab-ci.yml` (lint, tsc, tests unitaires, `db:deploy`, e2e backend ; lint, tsc, build frontend — **pas de build/déploiement**, pas d'audit de dépendances).

---

## 5. Inventaire des fonctionnalités

Légende : **FT** fonctionnel et testé (tests auto passés) · **IN** implémenté, non vérifié · **PA** partiel · **NI** non implémenté · **BD** bloqué par dépendance externe · **ID** indéterminé

### A. Lecteurs
| Fonctionnalité | État | Preuve |
|---|---|---|
| Accueil, catalogue, recherche/filtres, catégories | IN | routes `/`, `/livres`, `/livres/[slug]` au build ; `catalog.e2e-spec.ts` non exécuté |
| Pages livre, auteur, espace (`/auteurs/[slug]`, `/espaces/[slug]`) | IN | build OK |
| Extrait gratuit / aperçu filigrané non téléchargeable | PA→IN | `preview-policy.spec.ts` (passé) ; génération réelle dépend de pdfjs/canvas, non rejouée |
| Inscription + vérification e-mail + OTP | IN | code relu ; `auth.service.spec.ts`, `turnstile*.spec.ts` passés ; e2e `auth` non exécuté |
| Connexion avec limitation de tentatives | FT (unitaire) | `login-throttle` ; `origin.guard.spec.ts` |
| **Récupération de mot de passe** | **NI** | aucun `reset/forgot` dans `backend/src` ni `frontend` |
| Panier | PA | client uniquement (`localStorage`, `cart-shared.ts`) ; prix revalidés côté serveur à la commande |
| Commande, annulation avant paiement | IN | `orders.e2e-spec.ts` non exécuté |
| Paiement Mobile Money / carte | BD | §6 |
| Bibliothèque personnelle, téléchargement contrôlé | IN | `library.service.ts:130-210` : propriété + statut d'accès + empreinte SHA-256 vérifiés ; e2e non exécuté |
| Lecture en ligne (liseuse) | **ID/NI** | aucun lecteur intégré identifié ; accès = téléchargement protégé + aperçu |
| E-mails de confirmation/remboursement/OTP | IN | `transactional-mail.service.ts` ; SMTP non testé de bout en bout |
| Commandes échouées / remboursements | PA | transitions d'état gardées ; remboursement en ligne = `fake` uniquement (§6) |

### B. Auteurs / éditeurs
| Fonctionnalité | État | Preuve |
|---|---|---|
| Création d'espace en self-service (devient `owner`) | IN | `tenants.e2e-spec.ts` non exécuté |
| Profils auteur (y compris « fantômes »), réseaux sociaux | IN | migration `add_author_social_links` |
| Œuvres, formats, fichiers, couverture, traductions FR/EN | IN | `admin-works-tenant.e2e-spec.ts` non exécuté ; `mime-sniffer`, `upload-validator`, `pdf-active-content` specs passés |
| Antivirus à l'upload (fail-closed) | FT (unitaire) / BD (service) | `virus-scan.service.spec.ts` passé ; ClamAV non joignable en local |
| Workflow éditorial (soumission/modération) | PA | selon `docs/GEBOOK_PROGRESS.md` Phase 10, le blocage `paid` et le workflow sont appliqués ; à re-vérifier par e2e |
| Tableau de bord ventes, revenus, commissions | IN | `commissions.spec.ts` passé ; e2e non exécuté |
| Règles de commission, conditions de distribution | IN | `commission.spec.ts` (calcul) passé |
| Demande de retrait / approbation / marquage payé | PA | manuel ; `payouts.e2e-spec.ts` non exécuté ; réservation de solde corrigée au commit `fa4452c` |
| Équipe : invitation | IN | e-mail d'invitation (commit `d2e3499`) ; `team.e2e-spec.ts` non exécuté |

### C. Administration
| Capacité | État | Preuve |
|---|---|---|
| Superadmin : paiements/prestataires (identifiants chiffrés), commandes, remboursements, commissions, retraits, catégories, paramètres économiques, aperçus, journal | IN | contrôleurs `@Roles('admin')` ; `admin-payment-providers.e2e-spec.ts` non exécuté |
| Propriétaire / admin d'espace : œuvres, auteurs, équipe, branding, statistiques, retraits | IN | `TenantAccessGuard` + RLS ; `multi-tenant-rls.e2e-spec.ts` non exécuté |
| Responsable financier (`finance`) | IN | `TENANT_FINANCE_ROLES` appliqué dans `payouts.service.ts:assertCanRequestPayout` |
| Permissions côté serveur | **Oui** | guards + RLS ; l'interface n'est pas la seule barrière |
| Gestion des utilisateurs globaux (suspension, liste) | **ID** | pas de module « users » identifié dans `modules/` |

---

## 6. État des paiements et du modèle économique

### Matrice par fournisseur

| Critère | **FeexPay** | **CinetPay** | **PawaPay** | **OpenPay** | **fake** |
|---|---|---|---|---|---|
| Code pay-in | Oui (536 l.) | Oui (401 l.) | Oui (349 l.) | Oui (442 l.) | Oui |
| Code payout | Oui (`feexpay-payout.driver.ts`) | Non | Oui | Non | Oui |
| Statut seed | active, sandbox | active, sandbox | active, sandbox | active, sandbox | active |
| Identifiants dans `backend/.env` local | `API_URL` renseigné ; `API_KEY`, `SHOP_ID` **vides** | `API_KEY`, `SITE_ID` renseignés ; `SECRET_KEY` **vide** | `API_URL`, `API_TOKEN` **vides** | aucune variable (config via superadmin) | n/a |
| Sandbox/production | Via `PAYMENT_ENV` + environnement du prestataire en base | idem | URL par défaut `api.sandbox.pawapay.io` | idem | n/a |
| Initialisation | Oui | Oui | Oui | Oui | Oui |
| Vérification serveur | Oui (`verify()`) | Oui (relit la transaction) | Oui | Oui | Oui |
| Webhook | Oui | Oui | Oui | Oui | Oui |
| **Signature de webhook** | **Non documentée** : confirmation par rappel API | **HMAC `X-TOKEN`**, comparaison à temps constant | Non (RFC-9421 non implémenté) | **Non documentée** | HMAC interne |
| Idempotence / rejeu | Oui (commun) | Oui | Oui | Oui | Oui |
| Échecs / annulations | Oui, erreurs typées | Oui | Oui | Oui | Oui |
| Remboursement API | **Non** (`supportsRefund: false`) | **Non** | **Non** | **Non** | Oui (simulé) |
| Tests | specs + « hardening » passés | passés | passés | passés | passés |
| Preuve d'un paiement réel/sandbox de bout en bout | **Aucune dans le dépôt** | Aucune | Aucune | Aucune | Simulation |

Tests unitaires de pilotes (tous passés dans les 298) : `cinetpay-payment.driver.spec.ts`, `feexpay-payment.driver(.hardening).spec.ts`, `feexpay-payout.driver.spec.ts`, `openpay-payment.driver.spec.ts`, `pawapay-payment(.payout).driver.spec.ts`, `payments.service.feexpay.spec.ts`. Les journaux montrent des réponses HTTP simulées (200, 401, 404, erreurs réseau).

Pas de pilote pour **Chariow** ni **MTN MoMo** : présents en base (seed) en `inactive`, aucun code. **Aucun autre fournisseur** (Stripe, PayPal…) n'est présent.

### Chaîne de traitement serveur (preuve : `payments.service.ts:493-1075`)
1. Fournisseur résolu par `:providerCode` ; `driver.parseWebhook()` sur **corps brut**.
2. Événement **enregistré avant traitement** (même invalide) ; contrainte unique `(payment_provider_id, event_id)` → doublon = `200` sans effet.
3. Signature invalide → événement `failed`, `400`.
4. Paiement retrouvé par `providerTransactionId` ; déjà `successful` → ignoré.
5. Montant notifié ≠ attendu → événement `failed`, `400`.
6. Transition de commande validée par machine à états.
7. `applyOutcome` : `updateMany` conditionnel (garde atomique) puis, dans la même transaction : commande, `reader_library`, commissions figées (`freezeForOrder`), événement `processed`.
8. E-mails après commit.

Point positif : un redirect vers la page du prestataire n'est jamais pris comme preuve ; seul un webhook accepté ou `syncStatus` (relecture chez le prestataire) change l'état.

**Réserve :** pour FeexPay/OpenPay/PawaPay, `signatureValid: true` signifie « confirmé par un appel authentifié à l'API du prestataire » (commentaires de tête des pilotes). Une confirmation reste donc dépendante de la disponibilité de l'API prestataire au moment du webhook ; un identifiant de transaction deviné ne suffit toutefois pas à forger un succès.

### Remboursements
`PaymentsService.refund` (admin plateforme uniquement) : exige `supportsRefund` côté pilote **et** base ; révoque l'accès (jamais supprimé), annule les répartitions `pending/available`, envoie un e-mail. **Aucun prestataire réel ne le permet aujourd'hui** → un remboursement réel est un acte manuel hors plateforme, sans enregistrement automatique dans GeBook.

### Commissions et reversements
- Calcul : `commissions/commission.ts` (testé), répartition figée à la vente dans `sale_distributions` avec frais prestataire ventilés ; plafond/contraintes `CHECK` en base.
- Retraits : solde disponible (délai configurable) → demande (retrait total, V1) → approbation admin → « marquer payé ». Les pilotes payout FeexPay/PawaPay existent mais **ne sont appelés que pour tester la connexion** (`admin-payment-providers.service.ts:273`). Aucun versement automatique.
- Modèle économique configurable (`/admin/modele-economique`, commit `42b0d4e`).

---

## 7. Résultats des tests et du build

| # | Commande | Dossier | Résultat | Détail |
|---|---|---|---|---|
| 1 | `pnpm typecheck` (`tsc --noEmit`) | backend | **Succès** | 0 erreur |
| 2 | `pnpm lint` | backend | **Succès** | 0 erreur, 0 warning |
| 3 | `pnpm test` (jest) | backend | **Succès** | 32 suites OK / 32 ; **298 tests réussis, 0 échoué, 0 ignoré** ; 12,4 s |
| 4 | `pnpm build` (`nest build`) | backend | **Succès** | |
| 5 | `prisma validate` | backend | **Succès** | schéma valide |
| 6 | `prisma migrate status` | backend | **Succès** | « Database schema is up to date » (lecture seule, base locale) |
| 7 | `pnpm test:e2e` | backend | **Non exécuté (volontaire)** | 17 fichiers ; ils créent/suppriment des données dans la base `gebook_db` locale accessible sur `localhost:5432` ; CI GitLab les exécute sur une base jetable |
| 8 | `pnpm typecheck` (`next typegen && tsc`) | frontend | **Succès** | |
| 9 | `pnpm lint` | frontend | **Succès avec avertissements** | 0 erreur, 5 warnings `react-hooks/incompatible-library` (usage de `watch()` de react-hook-form : composants non mémoïsés par le React Compiler) |
| 10 | `pnpm build` (`next build`) | frontend | **Succès** | 51 routes, toutes dynamiques (`ƒ`) sauf `/_not-found` ; `.env.local` chargé |
| 11 | Tests frontend (unit/e2e navigateur) | frontend | **Inexistants** | 0 fichier `*.test.*`/`*.spec.*`, aucun script de test |
| 12 | `pnpm audit --prod` | backend | **Échec (vulnérabilités)** | 23 : 1 critique, 13 hautes, 8 moyennes, 1 basse |
| 13 | `pnpm audit --prod` | frontend | **Échec (vulnérabilités)** | 18 : 3 critiques, 9 hautes, 5 moyennes, 1 basse |

Couverture : non mesurée (`test:cov` non lancé). Les tests d'intégration/e2e existent mais **leur état de réussite actuel est inconnu**.

---

## 8. Constats de sécurité

Gravité : Critique / Haute / Moyenne / Basse. « Confirmé » = observé dans le code ou un outil ; « Potentiel » = dépend d'un contexte non vérifié.

| # | Constat | Gravité | Statut | Preuve |
|---|---|---|---|---|
| S1 | **Next.js 16.3.0 installé** ; 3 avis critiques (RCE : Windows, AVIF/Image Optimization, `next/og`) + SSRF image + cache poisoning, correctif ≥ 16.3.8. L'avis RCE « Windows » ne concerne pas l'hébergement Linux/Docker prévu ; l'exposition réelle des autres dépend de l'usage de `next/image`/`next/og` | Haute (critique selon l'outil) | **Confirmé** (version) / exposition **potentielle** | `pnpm audit --prod` frontend |
| S2 | Backend : `proxy-addr` (critique, spoofing IP via sous-réseau IPv4-mappé), `multer` <2.3.0 (3 DoS), `nodemailer` (DoS), `fast-uri` (SSRF/host confusion, transitif) ; `mysql2`/`deepmerge-ts` transitifs de Prisma (probablement hors chemin d'exécution) | Haute | **Confirmé** (versions) / exploitabilité **potentielle** | `pnpm audit --prod` backend. `trust proxy` = 1 : `proxy-addr` est utilisé par Express pour l'IP des throttles |
| S3 | Webhooks FeexPay/OpenPay/PawaPay non signés ; authentification par rappel API | Moyenne | **Confirmé** (par conception, documenté) | commentaires des pilotes ; §6 |
| S4 | Aucune récupération de mot de passe : compte perdu = intervention DB | Moyenne (opérationnelle) | **Confirmé** | grep sans résultat |
| S5 | `ThrottlerGuard` global 100 req/min **en mémoire** (non partagé entre instances) ; `SampleThrottleService` aussi en mémoire | Basse | **Confirmé** | `app.module.ts:37`, doc existante |
| S6 | Pas d'en-têtes de sécurité explicites côté frontend (CSP/HSTS) dans `next.config.ts` ; helmet protège uniquement l'API | Moyenne | **Confirmé** pour `next.config.ts` ; Caddy/Traefik peuvent compenser (non vérifié) | `frontend/next.config.ts` (aucun `headers()`) |
| S7 | Fichier `frontend/.env.development` versionné : clé **publique de test** Turnstile seulement | Info | Conforme (documenté dans le fichier) | `.env.development` |
| S8 | `backend/.env` local contient des valeurs réelles (SMTP, R2) : ignoré par Git (`backend/.gitignore:39`) et absent de `git ls-files` ; **ne jamais committer** | Info / hygiène | Confirmé non versionné | `git ls-files \| grep env` |
| S9 | Isolation multi-tenant par RLS dépend du rôle PostgreSQL `gebook_user` (sans `BYPASSRLS`) : script présent et appelé par compose et CI. La **base locale** utilise `gebook_user` (URL du `.env`), cohérent | — | Mitigé | `docker/postgres/init/01-app-role.sh`, `.gitlab-ci.yml` |
| S10 | Téléchargement : propriété (`userId`) + `accessStatus` + empreinte vérifiés ; aperçus filigranés non téléchargeables | — | Conforme (code relu) | `library.service.ts:130-210`, commit `b844ef8` |
| S11 | Simulation de paiement interdite en production et limitée à `fake` | — | Conforme | `payments.service.ts:852+` |
| S12 | Journalisation d'événements sensibles : activité admin, remboursements, retraits ; **pas** de journal de connexions échouées exposé en UI | Basse | Partiel | `activity-log`, `login_attempts` |
| S13 | Uploads : MIME par magic bytes, détection de contenu actif PDF, taille max, ClamAV fail-closed. Dépend de ClamAV disponible en production | — | Conforme (specs) | `upload-validator`, `pdf-active-content` specs |
| S14 | Pas de scan SAST/secrets/dependabot en CI ; `pnpm audit` non intégré | Basse | **Confirmé** | `.gitlab-ci.yml` |

**Aucun test intrusif distant n'a été réalisé.** L'absence de vulnérabilité dans un domaine non listé ne doit pas être interprétée comme une preuve de sécurité.

---

## 9. État du déploiement

| Sujet | État | Preuve / limite |
|---|---|---|
| Développement local | Opérationnel : Postgres 5432 et API 3001 actifs, `/health` = ok ; ClamAV absent (3310 fermé) | `curl localhost:3001/health` |
| Staging | **Fichiers présents** (`docker-compose.staging.yml`, `docker/caddy/Caddyfile`, `.env.staging.example`), `PAYMENT_ENV=sandbox` forcé. **Disponibilité réelle non vérifiée** | aucun accès distant |
| Production | **Fichiers présents** (`docker-compose.yml` Dokploy/Traefik, healthchecks, `restart: unless-stopped`, conteneur ClamAV). **Disponibilité non vérifiée** ; docs : « déploiement manuel via Dokploy » | `docs/DEPLOYMENT.md` |
| Domaines `gebook.net` / `dev.gebook.net` | **Aucune configuration locale ne les mentionne.** Le code référence `gebook.com` (métadonnées, e-mails, mentions légales) et le SMTP `gebook.org` | `grep` sur le dépôt |
| Variables d'environnement | Gabarits commentés (`.env.docker.example`, `.env.staging.example`, `backend/.env.example`) ; démarrage refusé si secrets par défaut en production | `config/environment.ts` |
| Migrations | `db:deploy` + conteneur éphémère ; seed rejoué à chaque déploiement si `RUN_SEED=true` | `.env.docker.example` |
| Stockage de fichiers | Cloudflare R2 par défaut ; driver local de repli ; guide `docs/STORAGE_R2_SETUP.md` | |
| E-mails | SMTP du domaine propre ; sans SMTP la vérification d'adresse/OTP ne fonctionne pas | `mail.service.ts` |
| CI | GitLab : lint, tsc, tests, e2e (service Postgres 17) ; **uniquement sur MR / branche par défaut / tag** ; pas de build image ni de déploiement | `.gitlab-ci.yml` |
| Sauvegardes BDD / R2 | **Aucune** configuration ou documentation trouvée | grep `backup/sauvegarde` |
| Logs / supervision | Logs JSON en production ; **aucune** centralisation, alerte, ni APM trouvée | |
| Reprise après incident | **Non documentée** | |

---

## 10. Tableau détaillé d'avancement

Priorités : P0 bloquant/critique · P1 indispensable au lancement · P2 important après stabilisation · P3 amélioration.

| Domaine | Fonctionnalité | État | Preuve | Problème restant | Priorité |
|---|---|---|---|---|---|
| Qualité | Compilation, lint, build back & front | Fonctionnel et testé | §7 lignes 1-2, 4, 8-10 | 5 warnings React Compiler | P3 |
| Qualité | Tests unitaires backend | Fonctionnel et testé | 298/298 | Couverture non mesurée | P2 |
| Qualité | Tests e2e backend | État indéterminé | 17 specs non exécutées | Exécuter sur base jetable | P0 |
| Qualité | Tests frontend | Non implémenté | 0 fichier | Aucun filet de non-régression UI | P1 |
| Sécurité | Dépendances à jour | Partiellement implémenté | `pnpm audit` | Next ≥ 16.3.8, multer ≥ 2.3.0, nodemailer ≥ 10.0.9 | P0 |
| Auth | Inscription + e-mail + OTP + Turnstile | Implémenté, non vérifié | specs unitaires, e2e non exécuté | SMTP réel à valider | P1 |
| Auth | Récupération de mot de passe | Non implémenté | grep | À construire | P1 |
| Auth | Sessions, CSRF par Origin | Fonctionnel et testé (unitaire) | `origin.guard.spec.ts` | — | — |
| Catalogue | Catalogue public, fiches, recherche | Implémenté, non vérifié | build, e2e non exécuté | Parcours navigateur | P1 |
| Catalogue | Aperçu / extrait filigrané | Implémenté, non vérifié | `preview-policy.spec.ts` | Rendu réel non rejoué | P1 |
| Commandes | Création/annulation | Implémenté, non vérifié | `orders.e2e` non exécuté | — | P1 |
| Commandes | Panier | Partiellement implémenté | `localStorage` seulement | Pas de persistance multi-appareil | P3 |
| Paiement | Pipeline webhook (idempotence, montant, atomicité) | Fonctionnel et testé (unitaire) | §6 ; `payments.e2e` non exécuté | Rejouer en e2e | P0 |
| Paiement | FeexPay pay-in | Bloqué par dépendance externe | pilote + tests mockés | Compte/clé sandbox ; webhook non signé | P0 |
| Paiement | OpenPay pay-in | Bloqué par dépendance externe | commit `1553398` | Aucune config ; webhook non signé | P1 |
| Paiement | CinetPay pay-in | Bloqué par dépendance externe | `X-TOKEN` HMAC vérifié | `SECRET_KEY` vide localement | P1 |
| Paiement | PawaPay pay-in | Bloqué par dépendance externe | pilote | `API_TOKEN` vide ; pas de signature | P2 |
| Paiement | Remboursement | Partiellement implémenté | `refund()` | Aucun prestataire réel ne le supporte | P1 |
| Paiement | Chariow, MTN MoMo | Non implémenté | seed `inactive` | Aucun pilote | P3 |
| Paiement | Statut `fake` actif en production | État indéterminé | seed `active` | Vérifier désactivation en prod | P0 |
| Bibliothèque | Accès protégé aux achats | Implémenté, non vérifié | `library.service.ts` | e2e non exécuté | P0 |
| Bibliothèque | Liseuse en ligne | Non implémenté | — | Téléchargement seulement | P2 |
| Auteurs | Gestion d'œuvres/formats/fichiers | Implémenté, non vérifié | specs fichiers | e2e non exécuté | P1 |
| Auteurs | Modération / workflow | Partiellement implémenté | `GEBOOK_PROGRESS.md` | Valider par e2e | P1 |
| Finance | Commissions figées | Fonctionnel et testé (unitaire) | `commission.spec.ts` | — | — |
| Finance | Retraits (manuel) | Partiellement implémenté | `admin-payouts.service.ts` | Pas de versement automatique | P1 |
| Admin | Superadmin / espace / finance | Implémenté, non vérifié | guards + RLS | Gestion utilisateurs globale indéterminée | P1 |
| Multi-tenant | RLS | Implémenté, non vérifié | `multi-tenant-rls.e2e` non exécuté | Rejouer | P0 |
| Légal | Mentions, CGU, CGV, confidentialité, cookies | Partiellement implémenté | 21 `[À COMPLÉTER]` | Contenu juridique | P0 |
| Légal | Domaine et e-mails cohérents | Partiellement implémenté | `gebook.com` vs `.org` vs `.net` | Décision fondateur | P1 |
| Ops | Sauvegardes / restauration | Non implémenté | aucun | À construire | P0 |
| Ops | Supervision / alertes | Non implémenté | aucun | À construire | P1 |
| Ops | CI | Partiellement implémenté | `.gitlab-ci.yml` | Pas d'audit dépendances, pas de déploiement | P2 |
| Ops | Staging / production déployés | État indéterminé | fichiers seulement | Accès requis | P1 |
| E-mail | Transactionnels (commande, remboursement, invitation, contact) | Implémenté, non vérifié | `transactional-mail.service.ts` | Délivrabilité (SPF/DKIM) | P1 |

---

## 11. Bloqueurs critiques

1. **B1 — Aucun encaissement réel démontré** (identifiants sandbox/production des prestataires non démontrés fonctionnels). Dépendance externe : comptes marchands.
2. **B2 — Suite e2e non rejouée** : l'isolation multi-tenant et le parcours d'achat n'ont pas de preuve d'exécution actuelle.
3. **B3 — Next.js vulnérable** (3 avis critiques) et autres dépendances à correctif.
4. **B4 — Pages légales incomplètes** (champs d'identité société/hébergeur vides).
5. **B5 — Aucune sauvegarde ni procédure de restauration** de la base et des fichiers.
6. **B6 — Récupération de mot de passe absente.**
7. **B7 — Remboursement et reversement non automatisés** : procédure opérationnelle manuelle à définir et à documenter avant tout encaissement réel.

---

## 12. Checklist de préparation au lancement

| Exigence | État actuel | Preuve | Action nécessaire | Bloquant ? |
|---|---|---|---|---|
| Parcours d'achat → lecture complet | Non vérifié bout en bout | e2e non exécutés | Rejouer e2e + parcours navigateur sur staging | **Oui** |
| Fiabilité des paiements | Code + tests simulés | §6 | Paiement sandbox réel + webhook réel | **Oui** |
| `fake` désactivé en production | Indéterminé | seed `active` | Vérifier / désactiver | **Oui** |
| Sécurité des contenus achetés | Contrôles présents | `library.service.ts` | Valider par e2e | **Oui** |
| Commissions et revenus auteurs | Calcul testé ; versement manuel | `commission.spec.ts` | Procédure de versement documentée | Oui |
| Incidents / remboursements | Manuel, non traçable côté prestataire | §6 | Procédure + choix prestataire | Oui |
| Fiabilité des e-mails | Non vérifiée | SMTP non testé | Test de délivrabilité, SPF/DKIM/DMARC | Oui |
| Pages légales | Brouillon avec champs vides | 21 occurrences | Compléter + relecture juridique | **Oui** |
| Confidentialité / données personnelles | Page présente, brouillon | `confidentialite/page.tsx` | Compléter ; exposer procédure d'effacement | Oui |
| Support / modération | Formulaire de contact ; modération éditoriale partielle | `contact` | Canal support, SLA | Non (bêta) |
| Sauvegardes / restauration | Absentes | grep | Mettre en place + tester | **Oui** |
| Mobile et performances | Non mesurés (header mobile corrigé, commit `fb4bf36`) | — | Audit Lighthouse mobile | Non |
| Validation des comptes de paiement | Dépendance externe en attente | — | Suivi fondateur | **Oui** |
| Dépendances sans critique | Non | audit | Mises à jour | **Oui** |
| Supervision / alertes | Absentes | — | Mettre en place | Oui |
| Récupération de compte | Absente | — | Implémenter | Oui |

---

## 13. Plan d'action priorisé

### Horizon 1 — Avant toute mise en production
| # | Problème | Solution | Dépendances | Critère « terminé » |
|---|---|---|---|---|
| 1 | Dépendances vulnérables | Mettre à jour Next (≥16.3.8), multer, nodemailer ; vérifier `proxy-addr` via Express | — | `pnpm audit --prod` sans critique/haute exploitable ; lint/tests/build verts |
| 2 | E2E non rejoués | Lancer la CI sur une base jetable ; corriger les échecs | Runner GitLab, Postgres | 17 suites e2e vertes, rapport archivé |
| 3 | Paiement non prouvé | Compte sandbox FeexPay ou OpenPay ; test complet avec webhook réel (callback public) | Validation du compte, URL publique de staging | Une commande sandbox passe `paid`, accès bibliothèque créé, commission figée, rejeu du webhook sans effet |
| 4 | `fake` en production | Garantir `status=inactive` ou retrait du seed en prod | #3 | Aucun paiement `fake` possible en production |
| 5 | Sauvegardes | `pg_dump`/snapshots planifiés + versioning R2 + test de restauration | Hébergeur | Restauration réussie documentée |
| 6 | Mot de passe oublié | Jeton à usage unique par e-mail, throttle, invalidation de sessions | SMTP | Parcours testé unitaire + e2e |
| 7 | En-têtes frontend | CSP/HSTS/`X-Content-Type-Options` via Next ou proxy | — | Scan d'en-têtes vérifié sur staging |

### Horizon 2 — Pour le lancement commercial
| # | Problème | Solution | Dépendances | Critère « terminé » |
|---|---|---|---|---|
| 8 | Légal | Compléter mentions, CGU, CGV, confidentialité ; domaine unique | Décision fondateur, juriste | Plus aucun `[À COMPLÉTER]` |
| 9 | Remboursements | Choisir : API prestataire (si disponible) ou procédure manuelle outillée (enregistrement du remboursement externe) | Choix prestataire | Procédure documentée + testée |
| 10 | Reversements | Procédure de versement manuel auditée ; décider si activer le payout FeexPay/PawaPay | Comptes payout | Un retrait de test traité de bout en bout |
| 11 | Observabilité | Logs centralisés, alertes sur webhooks `failed`, healthcheck externe | — | Alerte déclenchée en test |
| 12 | Tests frontend | Parcours critiques en Playwright (inscription, achat, lecture, publication) | Staging | Suite intégrée à la CI |
| 13 | E-mails | SPF/DKIM/DMARC, test de délivrabilité | DNS | Mails de test en boîte de réception |
| 14 | Onboarding auteurs | Guide, validation éditoriale, conditions de distribution acceptées | #8 | 3 auteurs pilotes publient sans aide |

### Horizon 3 — Après le lancement
Liseuse en ligne ; panier persistant ; prestataires supplémentaires (Chariow, carte) ; retraits partiels ; signature RFC-9421 PawaPay ; rate limit partagé (Redis) ; SEO/performance mobile ; tableaux de bord avancés ; acquisition d'auteurs.

---

## 14. Questions nécessitant une décision du fondateur

1. **Domaine officiel** : `gebook.net`, `gebook.com` ou `gebook.org` ? (le code mélange `.com` et `.org`, `.net` n'est nulle part).
2. **Prestataires de production** : lesquels, avec quels pays/opérateurs ? Quel prestataire pour le staging sandbox ?
3. **Remboursements** : manuels hors plateforme ou via API prestataire ? Quel délai promis aux lecteurs ?
4. **Reversements** : restent manuels au lancement ? Seuil minimum, délai, devise (XAF) ?
5. **Entité juridique** : raison sociale, RCCM/NIF, siège, hébergeur, directeur de publication.
6. **Bêta fermée** : à quelle date, combien d'auteurs, paiements simulés ou réels à faible montant ?
7. **Lecture** : téléchargement des fichiers suffit-il au lancement, ou une liseuse en ligne est-elle exigée ?
8. **Politique de rétention des données** et durée de conservation des fichiers d'un compte supprimé.
9. **Hébergement et budget** de supervision/sauvegardes.

---

## 15. Annexe — commandes exécutées et résultats importants

Toutes à la racine du dépôt (`backend/` ou `frontend/` indiqué). Aucune n'a modifié de code applicatif ni de donnée.

| Commande | Résultat |
|---|---|
| `git log`, `git branch -a`, `git status` | 127 commits ; branches `develop, feature/*, main` ; HEAD `1553398` ; seul `frontend/app/favicon.ico` modifié avant audit |
| `backend: pnpm typecheck` | EXIT 0 |
| `backend: pnpm lint` | EXIT 0 (aucun message) |
| `backend: pnpm test` | `Test Suites: 32 passed, 32 total` · `Tests: 298 passed, 298 total` · 12,4 s · EXIT 0 |
| `backend: pnpm build` | EXIT 0 |
| `backend: pnpm exec prisma validate` | « The schema … is valid » |
| `backend: pnpm exec prisma migrate status` | « Database schema is up to date! » (lecture seule) |
| `frontend: pnpm typecheck` | EXIT 0 |
| `frontend: pnpm lint` | EXIT 0 — « 5 problems (0 errors, 5 warnings) » |
| `frontend: pnpm build` | « Compiled successfully in 30.6s » · 51 routes · EXIT 0 |
| `backend: pnpm audit --prod` | EXIT 1 — 23 vulnérabilités : 1 critique, 13 hautes, 8 moyennes, 1 basse |
| `frontend: pnpm audit --prod` | EXIT 1 — 18 vulnérabilités : 3 critiques, 9 hautes, 5 moyennes, 1 basse |
| `curl http://localhost:3001/health` | `{"status":"ok","database":"up",…}` |
| Test de port 3310 (ClamAV) | refusé |
| Contrôle des variables `backend/.env` | uniquement « renseigné / vide / absent », jamais les valeurs |
| `pnpm test:e2e` | **non exécuté** (écriture en base locale) |

### Fichiers de référence principaux
`backend/src/modules/payments/payments.service.ts` (webhook 493-620, remboursement 697-845, `applyOutcome` 917-1015) · `backend/src/modules/payments/drivers/*` · `backend/src/modules/library/library.service.ts` · `backend/src/modules/auth/login-otp.service.ts` · `backend/src/modules/payouts/*` · `backend/src/config/environment.ts` · `backend/prisma/schema.prisma` · `docker-compose.yml` · `.gitlab-ci.yml` · `docs/DEPLOYMENT.md`.
