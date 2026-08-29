-- Phase 8 (équipe et invitations) : `TeamService.invite()` crée désormais la
-- ligne en `invited`, pas `active` (workflow OWNER → invite → INVITED →
-- acceptation → ACTIVE). Mais `tenant_members_update` (20260823020000)
-- n'autorise que owner/admin **déjà actifs** à modifier une ligne — exactement
-- le même trou chicken-and-egg déjà rencontré pour la toute première
-- insertion d'un tenant (`20260825000000_tenant_members_owner_bootstrap`) :
-- la personne invitée n'est par définition pas encore active dans ce tenant,
-- donc ne peut jamais accepter sa propre invitation.
--
-- Ajoute une branche de self-accept, dans le même esprit que le bootstrap
-- owner : une personne peut faire passer SA PROPRE ligne de `invited` à
-- `active`, rien d'autre — jamais celle de quelqu'un d'autre, jamais un
-- autre statut de départ ou d'arrivée. Les invitations suivantes (rôle,
-- suppression) repassent par la règle owner/admin déjà existante.

DROP POLICY tenant_members_update ON tenant_members;

CREATE POLICY tenant_members_update ON tenant_members FOR UPDATE USING (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin']::tenant_member_role[])
  OR app_is_platform_admin()
  OR (
    tenant_members.user_id = app_current_user_id()
    AND tenant_members.status = 'invited'
  )
) WITH CHECK (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin']::tenant_member_role[])
  OR app_is_platform_admin()
  OR (
    tenant_members.user_id = app_current_user_id()
    AND tenant_members.status = 'active'
  )
);
