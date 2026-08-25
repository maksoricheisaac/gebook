-- Ajoute un instantané du numéro de commande sur `order_items` — voir le
-- commentaire du champ `orderNumber` dans schema.prisma pour le raisonnement
-- complet (contourne une récursion RLS entre `orders` et `order_items`, dans
-- le même esprit que les autres instantanés déjà présents sur cette table).
--
-- Deux pièges RLS rencontrés en écrivant cette migration, tous deux corrigés
-- ci-dessous :
--   1. `order_items` n'a volontairement aucune policy UPDATE (instantané figé,
--      règle n° 6) : le backfill serait silencieusement bloqué (0 ligne, pas
--      d'erreur avant le `SET NOT NULL` suivant). Solution : désactiver RLS sur
--      la table le temps du backfill ponctuel (droit du propriétaire), la
--      réactiver ensuite avec FORCE.
--   2. Le backfill lit aussi `orders` via sa clause FROM — désactiver RLS sur
--      `order_items` seule ne suffit donc pas : `orders` reste protégée et le
--      JOIN ne voit toujours aucune ligne sans contexte. Solution : positionner
--      un contexte platform_admin (`set_config`) avant le backfill, comme le
--      fait `PrismaService.applyRlsContext()` côté application.

SELECT set_config('app.current_tenant_id', '', true);
SELECT set_config('app.current_user_id', '', true);
SELECT set_config('app.is_platform_admin', 'true', true);

ALTER TABLE "order_items" DISABLE ROW LEVEL SECURITY;

ALTER TABLE "order_items" ADD COLUMN "order_number" VARCHAR(50);

UPDATE "order_items" oi
SET "order_number" = o."order_number"
FROM "orders" o
WHERE o."id" = oi."order_id"
  AND oi."order_number" IS NULL;

ALTER TABLE "order_items" ALTER COLUMN "order_number" SET NOT NULL;

ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" FORCE ROW LEVEL SECURITY;
