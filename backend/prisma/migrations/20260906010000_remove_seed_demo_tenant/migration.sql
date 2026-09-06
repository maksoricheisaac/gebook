-- Retire le tenant de démonstration « Mampouya Éditions » (id fixe
-- e000ff30-9153-4226-9010-0ba3f640d23c), son catalogue d'exemple, et toutes
-- les données de test qui s'y sont accumulées (commandes, paiements, accès
-- bibliothèque) au fil des sessions de développement.
--
-- Deux sources ont introduit ce tenant :
--   1. `20260823010000_add_multi_tenant_core` le crée UNIQUEMENT si des
--      utilisateurs existent déjà au moment de la migration (`WHERE EXISTS
--      (SELECT 1 FROM "users")`) — sur un déploiement réellement neuf
--      (aucun utilisateur avant le tout premier démarrage), cette condition
--      est fausse et rien n'est créé.
--   2. `prisma/seed.ts` (fonction `seedTenant()`, retirée par ce même
--      chantier) le recréait ensuite inconditionnellement à chaque exécution
--      du seed — c'est cette seconde source qui le faisait réapparaître sur
--      un déploiement neuf où `RUN_SEED` reste à sa valeur par défaut.
--
-- Un tenant ne doit plus jamais provenir du seed : ce catalogue de
-- démonstration n'a aucune valeur en dehors du développement local et n'a
-- pas sa place dans une base de production.
--
-- `tenants`/`authors`/`works` sont sous `FORCE ROW LEVEL SECURITY`
-- (`20260823020000_add_rls_policies`), qui s'applique même au rôle
-- propriétaire de ces tables (`gebook_user`, `NOBYPASSRLS` par construction —
-- voir `docker/postgres/init/01-app-role.sh`). Sans le contexte ci-dessous,
-- les suppressions suivantes ne lèveraient aucune erreur mais ne
-- toucheraient silencieusement aucune ligne, les policies RLS ne
-- reconnaissant aucun tenant/utilisateur courant. `is_local => false` :
-- `prisma migrate deploy` n'entoure pas forcément ce script d'une seule
-- transaction explicite d'un bout à l'autre, contrairement à
-- `PrismaService.withRlsContext()` côté application — poser le réglage au
-- niveau de la session entière lève l'ambiguïté.
SELECT set_config('app.is_platform_admin', 'true', false);

-- Ordre imposé par les contraintes `ON DELETE RESTRICT` du schéma : un accès
-- bibliothèque (`reader_library.order_item_id`) et une répartition de vente
-- (`sale_distributions.order_item_id`) bloquent la suppression de la
-- commande qui les a produits tant qu'ils existent ; une commande
-- (`payments.order_id`) bloque de la même façon la suppression de son
-- paiement associé. `downloads` (cascade depuis `reader_library`) et
-- `order_items`/`work_formats`/`work_files`/les tables `*_translations`
-- (cascade depuis `orders`/`works`/`authors`) n'ont pas besoin d'une
-- suppression explicite.
DELETE FROM "reader_library"
WHERE "order_item_id" IN (
  SELECT "id" FROM "order_items"
  WHERE "tenant_id" = 'e000ff30-9153-4226-9010-0ba3f640d23c'::uuid
)
OR "work_id" IN (
  SELECT "id" FROM "works"
  WHERE "tenant_id" = 'e000ff30-9153-4226-9010-0ba3f640d23c'::uuid
);

DELETE FROM "sale_distributions"
WHERE "order_item_id" IN (
  SELECT "id" FROM "order_items"
  WHERE "tenant_id" = 'e000ff30-9153-4226-9010-0ba3f640d23c'::uuid
)
OR "author_id" IN (
  SELECT "id" FROM "authors"
  WHERE "tenant_id" = 'e000ff30-9153-4226-9010-0ba3f640d23c'::uuid
);

DELETE FROM "payments"
WHERE "order_id" IN (
  SELECT DISTINCT "order_id" FROM "order_items"
  WHERE "tenant_id" = 'e000ff30-9153-4226-9010-0ba3f640d23c'::uuid
);

-- Chaque commande touchée n'a jamais porté que des lignes de ce tenant de
-- démonstration (vérifié avant d'écrire cette migration) : la supprimer ne
-- fait disparaître aucune ligne d'un autre tenant réel.
DELETE FROM "orders"
WHERE "id" IN (
  SELECT DISTINCT "order_id" FROM "order_items"
  WHERE "tenant_id" = 'e000ff30-9153-4226-9010-0ba3f640d23c'::uuid
);

-- Si un environnement a par ailleurs rattaché des commandes à ce tenant
-- historique par un autre chemin que ceux couverts ci-dessus — improbable,
-- mais possible sur une base ancienne migrée depuis la V1 —, cette
-- suppression échouera avec une violation de contrainte plutôt que de
-- perdre silencieusement des données de vente réelles : c'est le
-- comportement voulu, pas un bug de cette migration.
DELETE FROM "works"
WHERE "tenant_id" = 'e000ff30-9153-4226-9010-0ba3f640d23c'::uuid;

DELETE FROM "authors"
WHERE "tenant_id" = 'e000ff30-9153-4226-9010-0ba3f640d23c'::uuid;

-- `tenant_members`/`tenant_settings`/`tenant_terms_acceptance`/
-- `commission_rules` sont en `ON DELETE CASCADE` depuis `tenants` : nul
-- besoin de les vider une par une avant de supprimer la ligne ci-dessous.
DELETE FROM "tenants"
WHERE "id" = 'e000ff30-9153-4226-9010-0ba3f640d23c'::uuid;
