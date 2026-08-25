-- Contraintes `CHECK` reprises de `database/schema.sql`.
--
-- Prisma ne sait pas les exprimer dans `schema.prisma` : elles sont donc écrites à la
-- main ici. Sans elles, la base perd ses garanties d'intégrité financière — un montant
-- négatif ou une quantité nulle deviendrait insérable (audit §11 et risque R-02).
-- Ne jamais supprimer ces contraintes sans décision métier explicite.

-- Montants d'une commande : aucun total ne peut être négatif.
ALTER TABLE "orders"
  ADD CONSTRAINT "chk_orders_amounts"
  CHECK ("subtotal" >= 0 AND "delivery_fee" >= 0 AND "discount_amount" >= 0 AND "total_amount" >= 0);

-- Lignes de commande : prix positif et quantité strictement positive.
ALTER TABLE "order_items"
  ADD CONSTRAINT "chk_order_items_price"
  CHECK ("unit_price" >= 0 AND "quantity" > 0 AND "line_total" >= 0);

-- Paiements : les montants réellement payés et les frais restent facultatifs tant que
-- le prestataire n'a pas répondu, mais ne peuvent jamais être négatifs.
ALTER TABLE "payments"
  ADD CONSTRAINT "chk_payments_amounts"
  CHECK (
    "expected_amount" >= 0
    AND ("paid_amount" IS NULL OR "paid_amount" >= 0)
    AND ("provider_fee" IS NULL OR "provider_fee" >= 0)
  );

-- Répartition d'une vente : tous les montants figés sont positifs ou nuls.
ALTER TABLE "sale_distributions"
  ADD CONSTRAINT "chk_sale_distribution_amounts"
  CHECK (
    "gross_amount" >= 0
    AND "provider_fee" >= 0
    AND "net_after_provider_fee" >= 0
    AND "gebook_commission_amount" >= 0
    AND "author_net_amount" >= 0
  );

-- Règles de commission : le plafond de 100 ne s'applique qu'aux pourcentages,
-- une commission fixe pouvant valoir n'importe quel montant.
ALTER TABLE "commission_rules"
  ADD CONSTRAINT "chk_commission_rules_value"
  CHECK ("commission_value" >= 0 AND ("commission_type" = 'fixed' OR "commission_value" <= 100));

-- Formats : prix positif et stock jamais négatif (`NULL` signifie « non géré »).
ALTER TABLE "work_formats"
  ADD CONSTRAINT "chk_work_formats_price"
  CHECK ("price" >= 0);

ALTER TABLE "work_formats"
  ADD CONSTRAINT "chk_work_formats_stock"
  CHECK ("stock_quantity" IS NULL OR "stock_quantity" >= 0);

-- Remplace le type MySQL `YEAR`, qui n'a pas d'équivalent PostgreSQL et bornait
-- lui-même la valeur à l'intervalle 1901-2155.
ALTER TABLE "works"
  ADD CONSTRAINT "chk_works_publication_year"
  CHECK ("publication_year" IS NULL OR ("publication_year" BETWEEN 1901 AND 2155));
