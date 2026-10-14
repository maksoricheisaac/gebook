# Intégration FeexPay (PayIn Mobile Money)

Pilote : `backend/src/modules/payments/drivers/feexpay-payment.driver.ts`
(code prestataire `feexpay`). Il s'insère dans l'architecture existante
`PaymentsController → PaymentsService → PaymentDriver` ; aucun appel FeexPay
n'est fait ailleurs. **Le frontend ne reçoit jamais la clé API, ni le shop ID.**

> ⚠ **Statut de validation : NON validé de bout en bout.** Aucune boutique
> FeexPay permettant une vraie transaction n'est disponible à ce jour. Tout ce
> qui est testé l'est avec des **mocks** (`*.spec.ts`). Aucun test ne prouve
> qu'un paiement réel aboutit.

## 1. Configuration (développement / sandbox)

Variables (`backend/.env`, jamais versionné ; modèle : `backend/.env.example`) :

| Variable | Rôle |
|---|---|
| `FEEXPAY_API_URL` | `https://api-v2.feexpay.me` (HTTPS obligatoire en production) |
| `FEEXPAY_API_KEY` | **Secret.** Clé API (Bearer) |
| `FEEXPAY_SHOP_ID` | Identifiant de boutique (menu Développeurs) |
| `FEEXPAY_NETWORK` | Canal par défaut (`mtn_cg`) si la requête n'en précise pas |
| `FEEXPAY_MIN_AMOUNT` / `FEEXPAY_MAX_AMOUNT` | Bornes (défauts 100 / 2 000 000) |
| `PAYMENT_ENV` | `sandbox` ou `production` |
| `PAYIN_PROVIDER` | `feexpay` pour l'utiliser par défaut |

Les identifiants peuvent aussi être saisis (chiffrés AES-256-GCM) depuis
Superadmin → Paiements → Configurer ; l'environnement n'est qu'un repli.
Les variables sont validées au démarrage (`config/environment.ts`).
Le prestataire doit être `active` dans `payment_providers` et sélectionné par le
réglage `default_payment_provider`.

## 2. Tests

```bash
cd backend
npx jest src/modules/payments src/config   # PayIn, erreurs, idempotence, env
npx jest                                   # toute la suite
```

## 3. Fonctionnement du PayIn

1. `POST /payments { orderNumber, customerPhone, providerChannel? }` — le
   montant vient **toujours de la commande**, jamais du client.
2. Contrôles serveur : propriétaire, statut de commande, prestataire actif.
3. Idempotence : une tentative `initialized`/`pending` existante est renvoyée
   telle quelle. Une **contrainte unique partielle** en base
   (`uq_payments_in_flight`, migration `20260920100000`) protège des requêtes
   concurrentes ; le perdant de la course reçoit la tentative gagnante.
4. Le pilote valide (montant entier 100–2 000 000, devise XAF/XOF, téléphone
   `242` + 9 chiffres pour `mtn_cg`, formats `+242 …`/`00242…` normalisés),
   puis appelle `POST /api/transactions/public/requesttopay/{channel}`.
   `callback_info` = clé d'idempotence interne (aucune donnée sensible).
5. La référence FeexPay est stockée (`providerTransactionId`) ; statut local
   `pending`. **`PENDING` n'est jamais un paiement réussi.**

**Aucun retry** d'initiation. Timeout, erreur réseau/DNS, 5xx, réponse illisible
= issue **incertaine** : la tentative reste `initialized` (aucune relance tant
qu'elle est protégée), elle n'est jamais marquée `failed`. Une tentative sans
référence depuis plus de 10 min est abandonnée pour autoriser une nouvelle
tentative (risque résiduel : la demande USSD a expiré côté lecteur).

## 4. Suivi du statut

`POST /payments/:id/status` interroge
`GET /api/transactions/public/single/status/{reference}` et synchronise :
`SUCCESSFUL` → paiement/commande payés, accès lecteur, commissions (même
chemin transactionnel que le webhook) ; `FAILED` → échec ; `PENDING` → aucun
changement. Le frontend rappelle la route à intervalle borné (ex. toutes les
5 s, 3 min max) — pas de boucle côté serveur. Le traitement est protégé par un
`UPDATE` conditionnel : deux vérifications/webhooks simultanés ne livrent qu'une fois.

## 5. Webhook

`POST /webhooks/feexpay` (idempotent : contrainte unique
`(payment_provider_id, event_id)` + garde atomique). **Aucune signature, secret,
en-tête ou liste d'IP n'est documenté par FeexPay** : le corps reçu n'est donc
jamais cru ; le pilote relit le statut via l'API authentifiée.
`TODO — information FeexPay requise` : mécanisme de signature, IP officielles,
politique de retry, forme exacte de la notification unitaire.

## 6. Erreurs

Normalisées en erreurs internes (`ERR_INVALID_API_KEY`, `ERR_IP_NOT_AUTHORIZED`,
`RATE_LIMIT_EXCEEDED`, `ERR_NETWORK_UNAVAILABLE`, …). Les 400 « corrigeables par
le lecteur » (montant, téléphone, solde) sont renvoyés en 400 ; les erreurs de
configuration en 503 avec un message générique. `success: false` sur un HTTP 200
est traité comme un refus. Le corps brut FeexPay n'est jamais relayé au client.

## 7. Logs

JSON structurés : `payment.initiated`, `feexpay.error`,
`payment.initiation_uncertain`, … (provider, référence, montant, statut, durée,
code d'erreur). Jamais la clé, l'en-tête `Authorization`, ni les corps
bruts ; le téléphone est masqué (`242******567`).

## 8. Passage en production

Aucun changement de code : remplacer les variables (ou les identifiants du
Superadmin) — `FEEXPAY_API_KEY`, `FEEXPAY_SHOP_ID`, `PAYMENT_ENV=production`.

À obtenir auprès de FeexPay :
- API Key **production** et Shop ID **production**
- Activation de **MTN Congo** (`mtn_cg`) sur la boutique
- **IP whitelist** éventuelle (l'IP sortante du backend) — `ERR_IP_NOT_AUTHORIZED`
- URL webhook production (HTTPS) et son éventuelle sécurité (signature/secret)

Checklist avant activation :

- [ ] clé + shop production reçus, stockés dans le gestionnaire de secrets
- [ ] MTN Congo activé ; IP backend autorisée si nécessaire
- [ ] webhook configuré (HTTPS) si disponible
- [ ] migration `20260920100000_add_payments_in_flight_unique` appliquée
- [ ] tests automatisés OK
- [ ] test réel faible montant : `SUCCESSFUL` vérifié côté FeexPay
- [ ] cas `FAILED` et `PENDING` testés en réel
- [ ] logs relus : aucun secret

## 9. Hors périmètre (volontairement)

Payout FeexPay : pilote déjà présent (`feexpay-payout.driver.ts`), non modifié.
Historique (`/api/transactions/history`) et solde en flux de paiement : non
implémentés (le solde n'est utilisé que par « Tester la connexion »).
Réconciliation automatique des tentatives sans référence (recherche par
`callback_info`) : à faire si FeexPay le permet.
