-- `sale_distributions` n'avait volontairement aucune policy UPDATE/DELETE
-- (20260823020000 : "une répartition figée n'est jamais modifiée ni
-- supprimée", règle métier n° 13). Mais `SaleDistribution.orderItem` porte
-- `onDelete: Restrict` : supprimer une commande de test (qui cascade sur ses
-- `order_items`) échoue tant que ses répartitions existent encore, ce qui
-- bloque le nettoyage des suites e2e — même symptôme que pour
-- `orders`/`payments` (20260823020200).
--
-- Comme pour ces deux tables, seul platform_admin obtient ce droit : aucun
-- tenant, aucun auteur ne peut jamais supprimer une répartition, quel que
-- soit son rôle — la garantie métier reste intacte pour tout le monde sauf
-- l'opération de plus haut niveau (purge/RGPD, nettoyage de test).

CREATE POLICY sale_distributions_delete ON sale_distributions FOR DELETE USING (app_is_platform_admin());
