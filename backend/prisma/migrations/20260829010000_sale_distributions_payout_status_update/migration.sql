-- Phase 7 (revenus et payouts) : sale_distributions n'avait aucune policy
-- UPDATE ("une répartition figée n'est jamais modifiée", règle n°13) — une
-- garantie pensée pour les MONTANTS, jamais revisités depuis la création
-- de cette table. Le statut de versement (`payout_status`) est différent :
-- c'est un champ de cycle de vie, pas un montant, et le schéma le prévoit
-- déjà avec cinq valeurs (pending/available/partially_paid/paid/cancelled)
-- sans qu'aucun mécanisme n'ait jamais pu le faire progresser.
--
-- Cette policy reste volontairement restreinte au platform_admin — jamais
-- à un rôle de tenant, même owner/admin/finance — tant qu'aucun vrai
-- mécanisme de reversement n'existe. Rien au niveau RLS ne peut garantir
-- qu'une écriture ne touche QUE `payout_status` (pas les montants figés) :
-- cette discipline reste portée par le code applicatif
-- (`PaymentsService.refund()`, `CommissionsService.freezeForOrder()`), qui
-- ne modifie jamais que ce champ.

CREATE POLICY sale_distributions_update ON sale_distributions FOR UPDATE
USING (app_is_platform_admin())
WITH CHECK (app_is_platform_admin());

-- Recale les répartitions déjà figées avant cette phase sur la même règle
-- que celles créées désormais (`CommissionsService.freezeForOrder`) :
-- disponible, sauf si la commande a depuis été remboursée.
SELECT set_config('app.current_tenant_id', '', true);
SELECT set_config('app.current_user_id', '', true);
SELECT set_config('app.is_platform_admin', 'true', true);

UPDATE sale_distributions sd
SET payout_status = 'cancelled'
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE sd.order_item_id = oi.id
  AND o.status = 'refunded'
  AND sd.payout_status = 'pending';

UPDATE sale_distributions
SET payout_status = 'available'
WHERE payout_status = 'pending';
