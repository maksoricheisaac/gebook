-- Corrige une récursion infinie découverte en testant la Phase 4 :
-- `orders_select` (20260823020000) interrogeait `order_items` pour savoir si
-- un membre de tenant possède une ligne dans la commande, et
-- `order_items_select` interroge `orders` en retour (pour la règle "l'acheteur
-- voit toujours ses lignes") — PostgreSQL détecte la boucle et refuse
-- d'évaluer la policy (« récursion infinie détectée dans la politique pour la
-- relation « orders » »).
--
-- Aucune fonctionnalité actuelle n'a besoin qu'un membre de tenant voie le
-- niveau `orders` (statut, numéro, coordonnées de livraison) : la gestion de
-- commande au niveau tenant est prévue Phase 12 (new_stack/AUDIT_V2_MULTI_TENANT.md),
-- pas encore construite. Cette policy retire donc cette branche pour lever la
-- récursion maintenant ; la réintroduire en Phase 12 exigera de casser le
-- cycle proprement (fonction `SECURITY DEFINER` isolée de RLS, ou vue
-- matérialisée) plutôt qu'une simple sous-requête croisée.

DROP POLICY orders_select ON orders;

CREATE POLICY orders_select ON orders FOR SELECT USING (
  user_id = app_current_user_id()
  OR app_is_platform_admin()
);
