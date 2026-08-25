-- Corrige une hypothèse fausse de 20260823020000 : `orders_update` restreignait
-- la modification d'une commande au seul platform_admin, en supposant que
-- seul `AdminOrdersController` (`updateStatus`) modifie `orders.status`.
--
-- En réalité, `PaymentsService` modifie aussi `orders.status` dans trois cas
-- légitimes qui ne sont PAS des actions d'administration :
--   - `initialize()`   : l'acheteur passe sa commande à `awaiting_payment` ;
--   - `applyOutcome()` : le traitement système du webhook la passe à
--                        `paid`/`failed`/`cancelled` ;
--   - `refund()`       : action admin réelle, déjà couverte.
--
-- `initialize()` s'exécute avec le contexte RLS de l'acheteur réel (pas
-- platform_admin) : la policy doit donc aussi accepter `user_id =
-- app_current_user_id()`, exactement comme `orders_select`/`orders_insert`.

DROP POLICY orders_update ON orders;

CREATE POLICY orders_update ON orders FOR UPDATE USING (
  app_is_platform_admin()
  OR user_id = app_current_user_id()
) WITH CHECK (
  app_is_platform_admin()
  OR user_id = app_current_user_id()
);
