-- CreateEnum
CREATE TYPE "content_locale" AS ENUM ('fr', 'en');

-- CreateTable
CREATE TABLE "work_translations" (
    "id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "locale" "content_locale" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "subtitle" VARCHAR(255),
    "short_description" VARCHAR(500),
    "description" TEXT,
    "table_of_contents" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_translations" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "locale" "content_locale" NOT NULL,
    "biography" TEXT,
    "short_biography" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "author_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_translations" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "locale" "content_locale" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "category_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_work_translations_work_locale" ON "work_translations"("work_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "uq_author_translations_author_locale" ON "author_translations"("author_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "uq_category_translations_category_locale" ON "category_translations"("category_id", "locale");

-- AddForeignKey
ALTER TABLE "work_translations" ADD CONSTRAINT "fk_work_translations_work" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_translations" ADD CONSTRAINT "fk_author_translations_author" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_translations" ADD CONSTRAINT "fk_category_translations_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Repli FR->EN (Phase 1, plan multi-tenant "bilinguisme") : le français
-- existant devient la ligne `fr`. Contrairement au backfill de
-- `order_items.order_number` (migration 20260823020600), aucun contournement
-- RLS n'est nécessaire ici : ces tables n'ont pas encore de policy à ce stade
-- de la migration (ENABLE/FORCE vient après), donc l'insertion est un INSERT
-- ordinaire.
-- ---------------------------------------------------------------------------

INSERT INTO work_translations (id, work_id, locale, title, subtitle, short_description, description, table_of_contents, created_at, updated_at)
SELECT gen_random_uuid(), id, 'fr', title, subtitle, short_description, description, table_of_contents, created_at, updated_at
FROM works;

INSERT INTO author_translations (id, author_id, locale, biography, short_biography, created_at, updated_at)
SELECT gen_random_uuid(), id, 'fr', biography, short_biography, created_at, updated_at
FROM authors;

INSERT INTO category_translations (id, category_id, locale, name, description, created_at, updated_at)
SELECT gen_random_uuid(), id, 'fr', name, description, created_at, updated_at
FROM categories;

-- ---------------------------------------------------------------------------
-- RLS — work_translations / author_translations : même pattern que
-- work_formats (jointure EXISTS vers works/authors, pas de tenant_id propre).
-- category_translations : aucune RLS, par parité avec categories.
-- ---------------------------------------------------------------------------

ALTER TABLE work_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_translations FORCE ROW LEVEL SECURITY;

CREATE POLICY work_translations_select ON work_translations FOR SELECT USING (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_translations.work_id
      AND (
        (w.status = 'published' AND w.visibility = 'public')
        OR app_is_tenant_member(w.tenant_id)
      )
  )
);

CREATE POLICY work_translations_insert ON work_translations FOR INSERT WITH CHECK (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_translations.work_id
      AND (
        app_is_tenant_member(w.tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
        OR (
          app_is_tenant_member(w.tenant_id, ARRAY['author']::tenant_member_role[])
          AND EXISTS (SELECT 1 FROM authors a WHERE a.id = w.author_id AND a.user_id = app_current_user_id())
        )
      )
  )
);

CREATE POLICY work_translations_update ON work_translations FOR UPDATE USING (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_translations.work_id
      AND (
        app_is_tenant_member(w.tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
        OR (
          app_is_tenant_member(w.tenant_id, ARRAY['author']::tenant_member_role[])
          AND EXISTS (SELECT 1 FROM authors a WHERE a.id = w.author_id AND a.user_id = app_current_user_id())
        )
      )
  )
) WITH CHECK (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_translations.work_id
      AND (
        app_is_tenant_member(w.tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
        OR (
          app_is_tenant_member(w.tenant_id, ARRAY['author']::tenant_member_role[])
          AND EXISTS (SELECT 1 FROM authors a WHERE a.id = w.author_id AND a.user_id = app_current_user_id())
        )
      )
  )
);

CREATE POLICY work_translations_delete ON work_translations FOR DELETE USING (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_translations.work_id
      AND app_is_tenant_member(w.tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
  )
);

ALTER TABLE author_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE author_translations FORCE ROW LEVEL SECURITY;

CREATE POLICY author_translations_select ON author_translations FOR SELECT USING (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM authors a
    WHERE a.id = author_translations.author_id
      AND (a.status = 'active' OR app_is_tenant_member(a.tenant_id))
  )
);

CREATE POLICY author_translations_insert ON author_translations FOR INSERT WITH CHECK (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM authors a
    WHERE a.id = author_translations.author_id
      AND app_is_tenant_member(a.tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
  )
);

-- Un membre de rôle `author` peut traduire sa propre fiche, comme il peut la
-- modifier (authors_update, migration 20260823020000) — pas celle d'un autre
-- auteur du même tenant.
CREATE POLICY author_translations_update ON author_translations FOR UPDATE USING (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM authors a
    WHERE a.id = author_translations.author_id
      AND (
        app_is_tenant_member(a.tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
        OR (app_is_tenant_member(a.tenant_id, ARRAY['author']::tenant_member_role[]) AND a.user_id = app_current_user_id())
      )
  )
) WITH CHECK (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM authors a
    WHERE a.id = author_translations.author_id
      AND (
        app_is_tenant_member(a.tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
        OR (app_is_tenant_member(a.tenant_id, ARRAY['author']::tenant_member_role[]) AND a.user_id = app_current_user_id())
      )
  )
);

CREATE POLICY author_translations_delete ON author_translations FOR DELETE USING (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM authors a
    WHERE a.id = author_translations.author_id
      AND app_is_tenant_member(a.tenant_id, ARRAY['owner', 'admin']::tenant_member_role[])
  )
);

-- category_translations : pas de RLS, categories n'en a pas non plus
-- (catalogue de référence global de la plateforme, protégé par @Roles('admin')
-- au niveau du contrôleur seulement).
