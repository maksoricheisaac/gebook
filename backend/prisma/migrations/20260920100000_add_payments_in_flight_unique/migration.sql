-- Un seul paiement « en cours » (initialized ou pending) par commande et par
-- prestataire. La lecture applicative « existe-t-il déjà une tentative ? » ne
-- suffit pas face à deux requêtes simultanées (double clic, deux onglets) : cet
-- index est la seule garantie atomique contre un double débit.
--
-- Index partiel : Prisma ne sait pas l'exprimer dans schema.prisma, il vit donc
-- uniquement ici. Les tentatives terminées (successful, failed, cancelled,
-- refunded) n'y figurent pas : une commande garde son historique de tentatives.
--
-- ⚠ Échoue s'il existe déjà, en base, deux paiements en cours pour un même
-- couple commande/prestataire : les résoudre à la main avant de déployer.
CREATE UNIQUE INDEX "uq_payments_in_flight"
  ON "payments" ("order_id", "payment_provider_id")
  WHERE "status" IN ('initialized', 'pending');
