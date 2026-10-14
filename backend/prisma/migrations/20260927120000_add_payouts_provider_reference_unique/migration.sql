-- Une même référence prestataire ne doit jamais être attribuée à deux
-- retraits distincts (audit FeexPay — écart HAUTE : `Payment.providerTransactionId`
-- est déjà unique côté pay-in, `Payout.providerReference` ne l'était pas côté
-- payout, alors même que le champ est aujourd'hui saisi manuellement par un
-- administrateur lors du marquage "payé"). Constrainte standard (pas d'index
-- partiel) pour rester alignée avec ce que `@unique` génère côté
-- schema.prisma : Postgres traite déjà plusieurs NULL comme distincts.
--
-- ⚠ Échoue s'il existe déjà, en base, deux retraits partageant la même
-- référence prestataire non nulle : les résoudre à la main avant de déployer.
CREATE UNIQUE INDEX "uq_payouts_provider_reference"
  ON "payouts" ("provider_reference");
