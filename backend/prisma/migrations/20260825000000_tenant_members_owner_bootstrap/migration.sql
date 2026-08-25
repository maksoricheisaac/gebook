-- `tenant_members_insert` (20260823020000) exige déjà d'être owner/admin du
-- tenant pour y insérer un membre — ce qui est logique pour INVITER quelqu'un,
-- mais rend impossible la toute première insertion : un tenant qui vient
-- d'être créé n'a encore aucun membre, donc personne n'est encore owner/admin
-- pour l'autoriser (`TenantsService.create()`, onboarding en libre-service,
-- brief §6-7). Ce trou n'avait jamais été traversé par un test de bout en
-- bout : `POST /tenants` renvoyait 500 dès la seconde requête de la
-- transaction (l'insertion de `tenants` réussissait, celle de
-- `tenant_members` échouait).
--
-- Ajoute une branche de bootstrap : le créateur du tenant (`tenants.created_by`)
-- peut insérer EXACTEMENT sa propre ligne, en tant que propriétaire. Il ne
-- peut pas s'insérer avec un autre rôle, ni insérer quelqu'un d'autre — les
-- invitations ultérieures repassent par la règle owner/admin existante
-- (`TeamService`, déjà couverte par ailleurs).

DROP POLICY tenant_members_insert ON tenant_members;

CREATE POLICY tenant_members_insert ON tenant_members FOR INSERT WITH CHECK (
  app_is_tenant_member(tenant_id, ARRAY['owner', 'admin']::tenant_member_role[])
  OR app_is_platform_admin()
  OR (
    tenant_members.role = 'owner'
    AND tenant_members.user_id = app_current_user_id()
    AND EXISTS (
      SELECT 1 FROM tenants t
      WHERE t.id = tenant_members.tenant_id AND t.created_by = app_current_user_id()
    )
  )
);
