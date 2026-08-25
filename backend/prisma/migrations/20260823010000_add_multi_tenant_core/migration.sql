-- GeBook V2 — introduction du multi-tenant (new_stack/AUDIT_V2_MULTI_TENANT.md).
--
-- Écrite à la main plutôt que générée telle quelle par `prisma migrate dev` :
-- le diff brut ajoute `tenant_id` comme colonne NOT NULL directement, ce qui
-- échoue sur les tables non vides. Cette migration ajoute les colonnes en
-- nullable, backfille les données existantes vers un tenant historique
-- "Mampouya Éditions", puis seulement ensuite impose NOT NULL — dans une
-- seule transaction, comme le reste des migrations Prisma de ce projet.
--
-- Tenant historique : id fixe e000ff30-9153-4226-9010-0ba3f640d23c, pour que
-- toute donnée créée avant le V2 soit rattachée de façon reproductible, y
-- compris en cas de re-jeu de cette migration sur un dump antérieur.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "work_visibility" AS ENUM ('private', 'tenant_only', 'public');
CREATE TYPE "tenant_type" AS ENUM ('independent_author', 'publishing_house', 'collective', 'cultural_organization');
CREATE TYPE "tenant_status" AS ENUM ('active', 'suspended', 'archived');
CREATE TYPE "tenant_member_role" AS ENUM ('owner', 'admin', 'editor', 'author', 'marketing', 'finance', 'viewer');
CREATE TYPE "tenant_member_status" AS ENUM ('active', 'invited', 'suspended');

-- Workflow de publication (brief §8). Postgres >= 12 autorise l'usage d'une
-- valeur ajoutée par ALTER TYPE dans une transaction ultérieure, mais pas dans
-- la même transaction que celle qui l'ajoute : cette migration n'utilise
-- aucune de ces quatre valeurs dans son propre backfill, donc pas de souci ici.
ALTER TYPE "work_status" ADD VALUE 'submitted';
ALTER TYPE "work_status" ADD VALUE 'under_review';
ALTER TYPE "work_status" ADD VALUE 'approved';
ALTER TYPE "work_status" ADD VALUE 'rejected';

-- ---------------------------------------------------------------------------
-- 2. Nouvelles tables — indépendantes, aucune donnée existante à migrer
-- ---------------------------------------------------------------------------

CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "type" "tenant_type" NOT NULL,
    "description" TEXT,
    "logo_path" VARCHAR(255),
    "cover_path" VARCHAR(255),
    "website" VARCHAR(255),
    "social_links" JSONB,
    "status" "tenant_status" NOT NULL DEFAULT 'active',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_members" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "tenant_member_role" NOT NULL,
    "status" "tenant_member_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_settings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "setting_key" VARCHAR(150) NOT NULL,
    "setting_value" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_tenants_slug" ON "tenants"("slug");
CREATE INDEX "idx_tenants_status" ON "tenants"("status");

ALTER TABLE "tenant_members" ADD CONSTRAINT "fk_tenant_members_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_members" ADD CONSTRAINT "fk_tenant_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "uq_tenant_members" ON "tenant_members"("tenant_id", "user_id");
CREATE INDEX "idx_tenant_members_user" ON "tenant_members"("user_id");

ALTER TABLE "tenant_settings" ADD CONSTRAINT "fk_tenant_settings_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "uq_tenant_settings" ON "tenant_settings"("tenant_id", "setting_key");

-- ---------------------------------------------------------------------------
-- 3. Colonnes nullables sur les tables existantes (backfillées à l'étape 5)
-- ---------------------------------------------------------------------------

ALTER TABLE "authors" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "works" ADD COLUMN "tenant_id" UUID,
  ADD COLUMN "visibility" "work_visibility" NOT NULL DEFAULT 'private';
ALTER TABLE "order_items" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "activity_logs" ADD COLUMN "tenant_id" UUID;

-- Un auteur pouvait être unique globalement par `user_id` ; il l'est désormais
-- par tenant (un même utilisateur peut être auteur dans plusieurs tenants).
DROP INDEX "uq_authors_user";

-- ---------------------------------------------------------------------------
-- 4. Tenant historique et rattachement des membres
-- ---------------------------------------------------------------------------

INSERT INTO "tenants" ("id", "slug", "name", "type", "description", "status", "created_by", "created_at", "updated_at")
SELECT
  'e000ff30-9153-4226-9010-0ba3f640d23c'::uuid,
  'mampouya-editions',
  'Mampouya Éditions',
  'publishing_house',
  'Tenant historique créé lors de la migration vers GeBook V2 (multi-tenant) : regroupe l''ensemble du catalogue publié avant l''introduction des tenants.',
  'active',
  COALESCE(
    (SELECT ur."user_id" FROM "user_roles" ur JOIN "roles" r ON r."id" = ur."role_id" WHERE r."name" = 'admin' ORDER BY ur."created_at" ASC LIMIT 1),
    (SELECT id FROM "users" ORDER BY "created_at" ASC LIMIT 1)
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "users");
-- `WHERE EXISTS`: sur une base fraîchement initialisée sans aucun utilisateur
-- (déploiement neuf), il n'y a rien à historiser — le tenant "Mampouya
-- Éditions" n'est créé que s'il y a effectivement une base existante à migrer.

-- Chaque utilisateur ayant le rôle global `admin` devient aussi propriétaire
-- (`owner`) du tenant historique, pour continuer à administrer le catalogue
-- existant sans rupture (plan de migration §9). Le rôle plateforme `admin`
-- lui-même n'est pas retiré ici : sa portée (plateforme vs tenant) est
-- clarifiée au niveau applicatif dans une phase ultérieure (guards NestJS).
INSERT INTO "tenant_members" ("id", "tenant_id", "user_id", "role", "status", "created_at")
SELECT
  gen_random_uuid(),
  'e000ff30-9153-4226-9010-0ba3f640d23c'::uuid,
  ur."user_id",
  'owner',
  'active',
  CURRENT_TIMESTAMP
FROM "user_roles" ur
JOIN "roles" r ON r."id" = ur."role_id"
WHERE r."name" = 'admin'
  AND EXISTS (SELECT 1 FROM "tenants" WHERE "id" = 'e000ff30-9153-4226-9010-0ba3f640d23c'::uuid);

-- ---------------------------------------------------------------------------
-- 5. Backfill des données existantes vers le tenant historique
-- ---------------------------------------------------------------------------

UPDATE "authors" SET "tenant_id" = 'e000ff30-9153-4226-9010-0ba3f640d23c'::uuid WHERE "tenant_id" IS NULL;
UPDATE "works" SET "tenant_id" = 'e000ff30-9153-4226-9010-0ba3f640d23c'::uuid WHERE "tenant_id" IS NULL;
UPDATE "order_items" SET "tenant_id" = 'e000ff30-9153-4226-9010-0ba3f640d23c'::uuid WHERE "tenant_id" IS NULL;
-- `activity_logs.tenant_id` reste NULL pour l'historique antérieur au V2 :
-- il est nullable par conception (§7 du rapport), pas d'obligation de backfill.

-- ---------------------------------------------------------------------------
-- 6. Contraintes finales — NOT NULL, unicité, index, clés étrangères
-- ---------------------------------------------------------------------------

ALTER TABLE "authors" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "works" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "order_items" ALTER COLUMN "tenant_id" SET NOT NULL;

CREATE INDEX "idx_authors_tenant" ON "authors"("tenant_id");
CREATE UNIQUE INDEX "uq_authors_tenant_user" ON "authors"("tenant_id", "user_id");
CREATE INDEX "idx_works_tenant" ON "works"("tenant_id");
CREATE INDEX "idx_works_visibility" ON "works"("visibility");
CREATE INDEX "idx_order_items_tenant" ON "order_items"("tenant_id");
CREATE INDEX "idx_activity_logs_tenant" ON "activity_logs"("tenant_id");

ALTER TABLE "authors" ADD CONSTRAINT "fk_authors_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "works" ADD CONSTRAINT "fk_works_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_logs" ADD CONSTRAINT "fk_activity_logs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
