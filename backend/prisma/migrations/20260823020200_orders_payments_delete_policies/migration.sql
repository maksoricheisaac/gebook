-- `orders`/`payments` n'avaient volontairement aucune policy DELETE dans
-- 20260823020000 ("une commande/un paiement ne se supprime jamais" au sens où
-- aucune route applicative ne le permet). Mais `User.orders` porte
-- `onDelete: Restrict` : impossible de supprimer un utilisateur de test tant
-- que ses commandes existent, ce qui bloque le nettoyage des suites e2e (qui
-- créent et détruisent des comptes de test à chaque exécution).
--
-- Autoriser la suppression au seul platform_admin ne change rien à la sécurité
-- applicative — aucun tenant, aucun lecteur ne peut jamais supprimer une
-- commande ou un paiement, quel que soit son rôle — et couvre à la fois le
-- nettoyage des tests et un besoin légitime d'exploitation (purge/RGPD par un
-- administrateur GeBook).

CREATE POLICY orders_delete ON orders FOR DELETE USING (app_is_platform_admin());
CREATE POLICY payments_delete ON payments FOR DELETE USING (app_is_platform_admin());
