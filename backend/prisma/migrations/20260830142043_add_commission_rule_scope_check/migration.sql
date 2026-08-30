-- Une règle de commission cible au plus un axe de portée à la fois : auteur
-- précis, tenant précis, ou type de tenant. Deux colonnes renseignées en même
-- temps rendrait la priorité (auteur > tenant > type de tenant > globale,
-- `selectRule()` dans `commission.ts`) ambiguë sur la ligne elle-même — mieux
-- vaut le refuser en base que le découvrir a posteriori sur une vraie vente
-- (même esprit que `20260812231600_check_constraints`).
ALTER TABLE "commission_rules"
  ADD CONSTRAINT "chk_commission_rules_scope"
  CHECK (
    (("author_id" IS NOT NULL)::int
      + ("tenant_id" IS NOT NULL)::int
      + ("tenant_type" IS NOT NULL)::int) <= 1
  );

-- Une demande de reversement porte toujours un montant strictement positif :
-- un `Payout` à zéro ou négatif n'a pas de sens métier.
ALTER TABLE "payouts"
  ADD CONSTRAINT "chk_payouts_amount"
  CHECK ("amount" > 0);
