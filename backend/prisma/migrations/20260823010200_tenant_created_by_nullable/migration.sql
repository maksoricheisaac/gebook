-- Corrige un oubli de la migration 20260823010000 : `tenants.created_by` n'avait
-- ni contrainte de clé étrangère vers `users`, ni tolérance au cas où aucun
-- utilisateur n'existe encore. Or `prisma/seed.ts` ne crée jamais de compte
-- utilisateur (convention documentée dans `database/README.md`), et une base
-- fraîchement installée (CI, nouvel environnement) applique les migrations
-- avant tout seed : aucun `user_id` valide n'est disponible pour le tenant de
-- démonstration/historique dans ce cas. `created_by` devient donc nullable.

ALTER TABLE "tenants" ALTER COLUMN "created_by" DROP NOT NULL;

ALTER TABLE "tenants"
  ADD CONSTRAINT "fk_tenants_created_by"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_tenants_created_by" ON "tenants"("created_by");
