-- Corrige un angle mort de la migration précédente (20260823010000) : les
-- œuvres déjà `published` avant l'introduction du multi-tenant ont reçu le
-- défaut sûr `visibility = 'private'`. Sans cette correction, le catalogue
-- public perdrait silencieusement les œuvres déjà publiées avant le V2 dès
-- qu'une requête filtrera par `visibility = 'public'` (régression fonctionnelle
-- interdite par le plan de migration, brief §26).
--
-- Seules les œuvres déjà `published` sont concernées : `draft` reste `private`,
-- conformément au défaut de la colonne.

UPDATE "works"
SET "visibility" = 'public'
WHERE "status" = 'published';
