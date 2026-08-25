-- `order_items_select` (20260823020000) ne couvrait que le tenant vendeur, la
-- plateforme et l'acheteur. Un auteur consultant ses propres ventes
-- (`GET /authors/me/sales`, `sale_distributions_select` l'autorise déjà via
-- `authors.user_id = app_current_user_id()`) ne pouvait pas voir la ligne de
-- commande sous-jacente (`orderItem` inclus dans la réponse) : la lecture
-- réussissait sur `sale_distributions` mais la relation imbriquée revenait
-- `null`, faisant planter la mise en forme de la réponse.
--
-- Ajoute la même règle "l'auteur voit ses propres ventes" au niveau
-- `order_items`, cohérente avec celle déjà posée sur `sale_distributions`.

DROP POLICY order_items_select ON order_items;

CREATE POLICY order_items_select ON order_items FOR SELECT USING (
  app_is_tenant_member(tenant_id)
  OR app_is_platform_admin()
  OR EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.user_id = app_current_user_id())
  OR EXISTS (SELECT 1 FROM authors a WHERE a.id = order_items.author_id AND a.user_id = app_current_user_id())
);
