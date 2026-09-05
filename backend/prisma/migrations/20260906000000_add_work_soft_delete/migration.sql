-- Suppression douce des œuvres (voir le commentaire sur `Work.deletedAt`
-- dans schema.prisma) : une œuvre déjà commandée ne peut pas être vraiment
-- supprimée (order_items.work_id est en ON DELETE RESTRICT) sans perdre
-- l'historique de vente.
ALTER TABLE "works" ADD COLUMN "deleted_at" TIMESTAMPTZ;

CREATE INDEX "idx_works_deleted_at" ON "works"("deleted_at");
