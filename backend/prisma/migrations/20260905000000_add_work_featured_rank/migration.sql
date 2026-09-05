-- Priorité d'affichage entre œuvres mises en avant ("à la une"), pilotée
-- exclusivement par le SuperAdmin (voir le commentaire sur `Work.featuredRank`
-- dans schema.prisma). NULL = non mise en avant, ou mise en avant sans
-- priorité explicite (affichée après les œuvres classées).
ALTER TABLE "works" ADD COLUMN "featured_rank" INTEGER;

DROP INDEX "idx_works_featured";
CREATE INDEX "idx_works_featured" ON "works"("featured", "featured_rank");
