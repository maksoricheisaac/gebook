-- GeBook V2 — Row Level Security PostgreSQL (Phase 4, new_stack/AUDIT_V2_MULTI_TENANT.md).
--
-- Principe : l'isolation multi-tenant n'est jamais confiée uniquement au code
-- applicatif (clauses `where` Prisma, guards NestJS). Elle est appliquée ici,
-- au niveau PostgreSQL, via des policies RLS. C'est le filet de sécurité qui
-- protège même si un service oublie un filtre — pas le seul mécanisme, mais
-- l'autorité finale.
--
-- Point critique : le rôle applicatif `gebook_user` est PROPRIÉTAIRE de ces
-- tables (il a exécuté les migrations). Un propriétaire de table contourne
-- silencieusement RLS par défaut, quelles que soient les policies définies.
-- `FORCE ROW LEVEL SECURITY` est donc obligatoire sur chaque table protégée :
-- sans elle, tout ce qui suit serait inerte pour le trafic applicatif réel.
--
-- Mécanisme : le contexte (tenant actif, utilisateur, statut platform admin)
-- est transmis via trois variables de session PostgreSQL, positionnées par
-- `PrismaService.withRlsContext()` / `applyRlsContext()` avec
-- `set_config(nom, valeur, is_local => true)` — donc portées par la
-- transaction en cours, jamais par la connexion (qui est réutilisée par le
-- pool entre requêtes ; une portée `SET` non locale fuiterait le contexte
-- d'une requête vers la suivante sur la même connexion).
--
--   app.current_tenant_id    - uuid du tenant actif (NULL si aucun)
--   app.current_user_id      - uuid de l'utilisateur authentifié (NULL si public)
--   app.is_platform_admin    - 'true'/'false', vrai pour un platform_admin
--                               ET pour les traitements système de confiance
--                               (ex. webhook de paiement, vérifié par signature
--                               HMAC en amont, sans utilisateur authentifié)

-- ---------------------------------------------------------------------------
-- 1. Fonctions utilitaires
-- ---------------------------------------------------------------------------

CREATE FUNCTION app_current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$$;

CREATE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;

CREATE FUNCTION app_is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.is_platform_admin', true), ''), 'false')::boolean
$$;

-- `p_roles` omis (NULL) = n'importe quel rôle, du moment que le membre est
-- actif. Paramètre à valeur par défaut plutôt que VARIADIC : un appel à zéro
-- argument variadique sur un tableau d'énumération personnalisée ne se
-- résout pas dans PostgreSQL (`function app_is_tenant_member(uuid) does not
-- exist`, testé empiriquement) — un défaut explicite lève toute ambiguïté.
CREATE FUNCTION app_is_tenant_member(p_tenant_id uuid, p_roles tenant_member_role[] DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = app_current_user_id()
      AND status = 'active'
      AND (p_roles IS NULL OR role = ANY(p_roles))
  )
$$;

-- ---------------------------------------------------------------------------
-- 2. tenants
-- ---------------------------------------------------------------------------

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

-- Un tenant actif est découvrable publiquement (page publique du tenant,
-- brief §12). Un membre voit toujours le sien, même suspendu/archivé.
CREATE POLICY tenants_select ON tenants FOR SELECT USING (
  status = 'active'
  OR app_is_tenant_member(id)
  OR app_is_platform_admin()
);

-- Création en libre-service (onboarding, Phase 6) : quiconque se déclare
-- créateur de son propre tenant. `created_by` doit correspondre à l'appelant.
CREATE POLICY tenants_insert ON tenants FOR INSERT WITH CHECK (
  created_by = app_current_user_id()
  OR app_is_platform_admin()
);

CREATE POLICY tenants_update ON tenants FOR UPDATE USING (
  app_is_tenant_member(id, ARRAY['owner', 'admin']::tenant_member_role[])
  OR app_is_platform_admin()
) WITH CHECK (
  app_is_tenant_member(id, ARRAY['owner', 'admin']::tenant_member_role[])
  OR app_is_platform_admin()
);

-- Un tenant ne se supprime jamais depuis un rôle tenant : il s'archive
-- (UPDATE status). Seule la plateforme peut le supprimer réellement.
CREATE POLICY tenants_delete ON tenants FOR DELETE USING (
  app_is_platform_admin()
);

-- ---------------------------------------------------------------------------
-- 3. tenant_members
-- ---------------------------------------------------------------------------

ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_members_select ON tenant_members FOR SELECT USING (
  user_id = app_current_user_id()
  OR app_is_tenant_member(tenant_id)
  OR app_is_platform_admin()
);

CREATE POLICY tenant_members_insert ON tenant_members FOR INSERT WITH CHECK (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin']::tenant_member_role[])
  OR app_is_platform_admin()
);

CREATE POLICY tenant_members_update ON tenant_members FOR UPDATE USING (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin']::tenant_member_role[])
  OR app_is_platform_admin()
) WITH CHECK (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin']::tenant_member_role[])
  OR app_is_platform_admin()
);

-- Un membre peut toujours se retirer lui-même (quitter un tenant).
CREATE POLICY tenant_members_delete ON tenant_members FOR DELETE USING (
  user_id = app_current_user_id()
  OR app_is_tenant_member(tenant_id, ARRAY['owner', 'admin']::tenant_member_role[])
  OR app_is_platform_admin()
);

-- ---------------------------------------------------------------------------
-- 4. tenant_settings
-- ---------------------------------------------------------------------------

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_settings_select ON tenant_settings FOR SELECT USING (
  app_is_tenant_member(tenant_id) OR app_is_platform_admin()
);
CREATE POLICY tenant_settings_insert ON tenant_settings FOR INSERT WITH CHECK (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin']::tenant_member_role[]) OR app_is_platform_admin()
);
CREATE POLICY tenant_settings_update ON tenant_settings FOR UPDATE USING (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin']::tenant_member_role[]) OR app_is_platform_admin()
) WITH CHECK (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin']::tenant_member_role[]) OR app_is_platform_admin()
);
CREATE POLICY tenant_settings_delete ON tenant_settings FOR DELETE USING (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin']::tenant_member_role[]) OR app_is_platform_admin()
);

-- ---------------------------------------------------------------------------
-- 5. authors
-- ---------------------------------------------------------------------------

ALTER TABLE authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE authors FORCE ROW LEVEL SECURITY;

-- `status = 'active'` reproduit exactement le filtre déjà appliqué par
-- `AuthorsService` (catalogue public) — RLS ne fait ici que garantir en base
-- ce que l'application fait déjà, pas changer le comportement public.
CREATE POLICY authors_select ON authors FOR SELECT USING (
  status = 'active'
  OR app_is_tenant_member(tenant_id)
  OR app_is_platform_admin()
);

CREATE POLICY authors_insert ON authors FOR INSERT WITH CHECK (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
  OR app_is_platform_admin()
);

-- Un membre de rôle `author` peut modifier son propre profil, pas celui d'un
-- autre auteur du même tenant (brief §7 : "AUTHOR : ses œuvres autorisées").
CREATE POLICY authors_update ON authors FOR UPDATE USING (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
  OR (app_is_tenant_member(tenant_id, ARRAY['author']::tenant_member_role[]) AND user_id = app_current_user_id())
  OR app_is_platform_admin()
) WITH CHECK (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
  OR (app_is_tenant_member(tenant_id, ARRAY['author']::tenant_member_role[]) AND user_id = app_current_user_id())
  OR app_is_platform_admin()
);

CREATE POLICY authors_delete ON authors FOR DELETE USING (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin']::tenant_member_role[])
  OR app_is_platform_admin()
);

-- ---------------------------------------------------------------------------
-- 6. works
-- ---------------------------------------------------------------------------

ALTER TABLE works ENABLE ROW LEVEL SECURITY;
ALTER TABLE works FORCE ROW LEVEL SECURITY;

-- Reproduit `publiclyVisible` de `works.service.ts` (statut publié + auteur
-- actif) en ajoutant `visibility = 'public'`, désormais câblée côté
-- application dans la même migration (voir le code applicatif de Phase 4).
CREATE POLICY works_select ON works FOR SELECT USING (
  (status = 'published' AND visibility = 'public')
  OR app_is_tenant_member(tenant_id)
  OR app_is_platform_admin()
);

CREATE POLICY works_insert ON works FOR INSERT WITH CHECK (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
  OR (
    app_is_tenant_member(tenant_id, ARRAY['author']::tenant_member_role[])
    AND EXISTS (
      SELECT 1 FROM authors a
      WHERE a.id = works.author_id AND a.user_id = app_current_user_id()
    )
  )
  OR app_is_platform_admin()
);

CREATE POLICY works_update ON works FOR UPDATE USING (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
  OR (
    app_is_tenant_member(tenant_id, ARRAY['author']::tenant_member_role[])
    AND EXISTS (
      SELECT 1 FROM authors a
      WHERE a.id = works.author_id AND a.user_id = app_current_user_id()
    )
  )
  OR app_is_platform_admin()
) WITH CHECK (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
  OR (
    app_is_tenant_member(tenant_id, ARRAY['author']::tenant_member_role[])
    AND EXISTS (
      SELECT 1 FROM authors a
      WHERE a.id = works.author_id AND a.user_id = app_current_user_id()
    )
  )
  OR app_is_platform_admin()
);

CREATE POLICY works_delete ON works FOR DELETE USING (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin']::tenant_member_role[])
  OR app_is_platform_admin()
);

-- ---------------------------------------------------------------------------
-- 7. work_formats (pas de tenant_id propre : dérivé de works.tenant_id)
-- ---------------------------------------------------------------------------

ALTER TABLE work_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_formats FORCE ROW LEVEL SECURITY;

CREATE POLICY work_formats_select ON work_formats FOR SELECT USING (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_formats.work_id
      AND (
        (w.status = 'published' AND w.visibility = 'public')
        OR app_is_tenant_member(w.tenant_id)
      )
  )
);

CREATE POLICY work_formats_insert ON work_formats FOR INSERT WITH CHECK (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_formats.work_id
      AND (
        app_is_tenant_member(w.tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
        OR (
          app_is_tenant_member(w.tenant_id, ARRAY['author']::tenant_member_role[])
          AND EXISTS (SELECT 1 FROM authors a WHERE a.id = w.author_id AND a.user_id = app_current_user_id())
        )
      )
  )
);

CREATE POLICY work_formats_update ON work_formats FOR UPDATE USING (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_formats.work_id
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
    WHERE w.id = work_formats.work_id
      AND (
        app_is_tenant_member(w.tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
        OR (
          app_is_tenant_member(w.tenant_id, ARRAY['author']::tenant_member_role[])
          AND EXISTS (SELECT 1 FROM authors a WHERE a.id = w.author_id AND a.user_id = app_current_user_id())
        )
      )
  )
);

CREATE POLICY work_formats_delete ON work_formats FOR DELETE USING (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_formats.work_id
      AND app_is_tenant_member(w.tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
  )
);

-- ---------------------------------------------------------------------------
-- 8. work_files (dérivé de work_formats -> works)
-- ---------------------------------------------------------------------------

ALTER TABLE work_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_files FORCE ROW LEVEL SECURITY;

-- Trois façons légitimes de voir un fichier : gestion par un membre du tenant,
-- extrait gratuit d'une œuvre publique (sample), ou fichier complet déjà
-- acheté par le lecteur courant (droit d'accès matérialisé dans
-- reader_library — jamais déduit de `orders`, règle métier n° 17, reprise
-- ici au niveau RLS). Un fichier "full" n'est JAMAIS public, même si l'œuvre
-- l'est : seul un extrait (`sample`) l'est.
CREATE POLICY work_files_select ON work_files FOR SELECT USING (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM work_formats wf JOIN works w ON w.id = wf.work_id
    WHERE wf.id = work_files.work_format_id
      AND app_is_tenant_member(w.tenant_id)
  )
  OR (
    file_type = 'sample'
    AND EXISTS (
      SELECT 1 FROM work_formats wf JOIN works w ON w.id = wf.work_id
      WHERE wf.id = work_files.work_format_id
        AND w.status = 'published' AND w.visibility = 'public'
    )
  )
  OR (
    file_type = 'full'
    AND EXISTS (
      SELECT 1 FROM reader_library rl
      WHERE rl.work_format_id = work_files.work_format_id
        AND rl.user_id = app_current_user_id()
        AND rl.access_status = 'active'
    )
  )
);

CREATE POLICY work_files_insert ON work_files FOR INSERT WITH CHECK (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM work_formats wf JOIN works w ON w.id = wf.work_id
    WHERE wf.id = work_files.work_format_id
      AND (
        app_is_tenant_member(w.tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
        OR (
          app_is_tenant_member(w.tenant_id, ARRAY['author']::tenant_member_role[])
          AND EXISTS (SELECT 1 FROM authors a WHERE a.id = w.author_id AND a.user_id = app_current_user_id())
        )
      )
  )
);

CREATE POLICY work_files_update ON work_files FOR UPDATE USING (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM work_formats wf JOIN works w ON w.id = wf.work_id
    WHERE wf.id = work_files.work_format_id
      AND app_is_tenant_member(w.tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
  )
) WITH CHECK (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM work_formats wf JOIN works w ON w.id = wf.work_id
    WHERE wf.id = work_files.work_format_id
      AND app_is_tenant_member(w.tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
  )
);

CREATE POLICY work_files_delete ON work_files FOR DELETE USING (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM work_formats wf JOIN works w ON w.id = wf.work_id
    WHERE wf.id = work_files.work_format_id
      AND app_is_tenant_member(w.tenant_id, ARRAY['owner', 'admin', 'editor']::tenant_member_role[])
  )
);

-- ---------------------------------------------------------------------------
-- 9. orders / order_items
--
-- `orders` n'a pas de tenant_id (une commande peut mélanger des lignes de
-- plusieurs tenants, brief §17 — décision confirmée en Phase 2). L'isolation
-- tenant se fait donc sur `order_items` ; `orders` hérite d'une visibilité
-- dérivée : l'acheteur voit toujours sa commande, un tenant voit une commande
-- s'il y possède au moins une ligne.
-- ---------------------------------------------------------------------------

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;

CREATE POLICY order_items_select ON order_items FOR SELECT USING (
  app_is_tenant_member(tenant_id)
  OR app_is_platform_admin()
  OR EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.user_id = app_current_user_id())
);

-- L'acheteur crée les lignes de SA commande, quel que soit le tenant vendeur
-- de chaque œuvre — c'est précisément ce que permet le panier multi-tenant.
CREATE POLICY order_items_insert ON order_items FOR INSERT WITH CHECK (
  app_is_platform_admin()
  OR EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.user_id = app_current_user_id())
);

-- Aucune policy UPDATE/DELETE : une ligne de commande est un instantané figé
-- (règle n° 6). RLS refuse par défaut toute commande sans policy correspondante.

-- ---------------------------------------------------------------------------
-- 10. orders
-- ---------------------------------------------------------------------------

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

CREATE POLICY orders_select ON orders FOR SELECT USING (
  user_id = app_current_user_id()
  OR app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM order_items oi
    WHERE oi.order_id = orders.id AND app_is_tenant_member(oi.tenant_id)
  )
);

CREATE POLICY orders_insert ON orders FOR INSERT WITH CHECK (
  user_id = app_current_user_id() OR app_is_platform_admin()
);

-- Seule l'administration plateforme modifie le statut d'une commande
-- aujourd'hui (`AdminOrdersController`, `@Roles('admin')`) — aucune gestion
-- de commande au niveau tenant n'existe encore (prévu Phase 12).
CREATE POLICY orders_update ON orders FOR UPDATE USING (
  app_is_platform_admin()
) WITH CHECK (
  app_is_platform_admin()
);

-- Pas de policy DELETE : une commande ne se supprime jamais.

-- ---------------------------------------------------------------------------
-- 11. payments / payment_events
--
-- Non tenant-scopées : un paiement couvre potentiellement plusieurs tenants
-- au sein d'une même commande (panier multi-tenant), donc un `tenant_id` sur
-- `payments` n'aurait pas de sens univoque. La vue tenant-scoped correcte
-- pour la part financière d'un tenant est `sale_distributions` (§12), pas
-- `payments`. Ici, l'isolation est utilisateur (l'acheteur) + plateforme.
-- ---------------------------------------------------------------------------

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;

CREATE POLICY payments_select ON payments FOR SELECT USING (
  app_is_platform_admin()
  OR EXISTS (SELECT 1 FROM orders o WHERE o.id = payments.order_id AND o.user_id = app_current_user_id())
);
CREATE POLICY payments_insert ON payments FOR INSERT WITH CHECK (
  app_is_platform_admin()
  OR EXISTS (SELECT 1 FROM orders o WHERE o.id = payments.order_id AND o.user_id = app_current_user_id())
);
CREATE POLICY payments_update ON payments FOR UPDATE USING (
  app_is_platform_admin()
  OR EXISTS (SELECT 1 FROM orders o WHERE o.id = payments.order_id AND o.user_id = app_current_user_id())
) WITH CHECK (
  app_is_platform_admin()
  OR EXISTS (SELECT 1 FROM orders o WHERE o.id = payments.order_id AND o.user_id = app_current_user_id())
);
-- Pas de policy DELETE : un paiement ne se supprime jamais.

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events FORCE ROW LEVEL SECURITY;

-- Table interne (payload brut de webhook) : jamais exposée à un lecteur ou à
-- un membre de tenant, seulement à l'administration plateforme et au
-- traitement système du webhook lui-même (qui s'exécute avec le contexte
-- platform_admin — voir PaymentsService.handleWebhook).
CREATE POLICY payment_events_select ON payment_events FOR SELECT USING (app_is_platform_admin());
CREATE POLICY payment_events_insert ON payment_events FOR INSERT WITH CHECK (app_is_platform_admin());
CREATE POLICY payment_events_update ON payment_events FOR UPDATE USING (app_is_platform_admin()) WITH CHECK (app_is_platform_admin());

-- ---------------------------------------------------------------------------
-- 12. sale_distributions (dérivé de order_items.tenant_id)
-- ---------------------------------------------------------------------------

ALTER TABLE sale_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_distributions FORCE ROW LEVEL SECURITY;

-- Trois façons de voir une répartition : administration plateforme, rôle
-- financier du tenant vendeur (owner/admin/finance — brief §7), ou l'auteur
-- concerné consultant ses propres revenus (`/authors/me/revenue`).
CREATE POLICY sale_distributions_select ON sale_distributions FOR SELECT USING (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM order_items oi
    WHERE oi.id = sale_distributions.order_item_id
      AND app_is_tenant_member(oi.tenant_id, ARRAY['owner', 'admin', 'finance']::tenant_member_role[])
  )
  OR EXISTS (
    SELECT 1 FROM authors a
    WHERE a.id = sale_distributions.author_id AND a.user_id = app_current_user_id()
  )
);

-- Écrite uniquement par le figeage des commissions au moment du paiement
-- (traitement système, contexte platform_admin) — jamais par un tenant.
CREATE POLICY sale_distributions_insert ON sale_distributions FOR INSERT WITH CHECK (
  app_is_platform_admin()
);
-- Pas de policy UPDATE/DELETE : une répartition figée n'est jamais modifiée
-- (règle n° 13) ni supprimée.

-- ---------------------------------------------------------------------------
-- 13. activity_logs
--
-- Écriture volontairement inconditionnelle : c'est une piste d'audit posée
-- par du code de service interne partout dans l'application (`ActivityLogService`),
-- jamais par une entrée utilisateur directe. La restreindre à un contexte
-- précis casserait la journalisation dans des dizaines d'endroits sans gain
-- de sécurité réel (le risque n'est pas qui écrit, mais qui LIT).
-- Lecture restreinte : direction du tenant ou administration plateforme.
-- Aucune policy UPDATE/DELETE : piste d'audit infalsifiable une fois écrite.
-- ---------------------------------------------------------------------------

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY activity_logs_select ON activity_logs FOR SELECT USING (
  app_is_platform_admin()
  OR (tenant_id IS NOT NULL AND app_is_tenant_member(tenant_id, ARRAY['owner', 'admin']::tenant_member_role[]))
);
CREATE POLICY activity_logs_insert ON activity_logs FOR INSERT WITH CHECK (true);
