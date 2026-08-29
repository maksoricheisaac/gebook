-- Phase 5 (vitrine publique du tenant) : une œuvre `tenant_only` doit rester
-- consultable par lien direct — sa propre fiche, ou la vitrine de son
-- tenant — même par un visiteur anonyme. Jusqu'ici, la policy `works_select`
-- ne laissait passer un visiteur anonyme que pour `visibility = 'public'`
-- (20260823020000_add_rls_policies), ce qui rendait `tenant_only`
-- invisible même depuis la vitrine censée l'exposer.
--
-- Seule `private` doit rester réellement inatteignable pour un visiteur
-- anonyme. L'agrégat multi-tenant public (`WorksService#publiclyVisible`,
-- backend/src/modules/catalog/works.service.ts) continue, lui, de filtrer
-- côté application sur `visibility = 'public'` strictement : cet
-- assouplissement de la policy RLS ne change rien à ce qui apparaît dans le
-- catalogue agrégé, seulement à ce qu'un lien direct ou la vitrine d'un
-- tenant (`?tenant=`) peuvent révéler.

DROP POLICY works_select ON works;

CREATE POLICY works_select ON works FOR SELECT USING (
  (status = 'published' AND visibility <> 'private')
  OR app_is_tenant_member(tenant_id)
  OR app_is_platform_admin()
);

-- Même correctif pour ses traductions (`buildWorkDetailSelection` les
-- sélectionne toujours avec l'œuvre) : sans lui, la fiche d'une œuvre
-- `tenant_only` redeviendrait accessible mais sans titre ni description.
DROP POLICY work_translations_select ON work_translations;

CREATE POLICY work_translations_select ON work_translations FOR SELECT USING (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_translations.work_id
      AND (
        (w.status = 'published' AND w.visibility <> 'private')
        OR app_is_tenant_member(w.tenant_id)
      )
  )
);

-- Même correctif pour ses formats (prix, mode de livraison) : sans lui, la
-- fiche d'une œuvre `tenant_only` redeviendrait accessible mais sans aucun
-- format ni prix, empêchant tout achat depuis sa propre page.
DROP POLICY work_formats_select ON work_formats;

CREATE POLICY work_formats_select ON work_formats FOR SELECT USING (
  app_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_formats.work_id
      AND (
        (w.status = 'published' AND w.visibility <> 'private')
        OR app_is_tenant_member(w.tenant_id)
      )
  )
);
