"use client";

import { useActionState } from "react";

import { Button } from "@/src/components/ui/button";
import { FormError } from "@/src/components/ui/field";
import {
  acceptInvitationAction,
  type AcceptInvitationResult,
} from "@/src/lib/tenant-actions";
import { TENANT_TYPE_LABELS } from "@/src/lib/tenant-type";
import type { TenantMembership } from "@/src/lib/tenant-shared";

const ROLE_LABELS: Record<string, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  editor: "Éditeur",
  author: "Auteur",
  marketing: "Marketing",
  finance: "Finance",
  viewer: "Observateur",
};

const initialState: AcceptInvitationResult = {};

/**
 * Une invitation d'équipe en attente (Phase 8), affichée sur `/mon-espace`.
 *
 * `TeamService.invite()` crée désormais la ligne en `invited` plutôt qu'en
 * `active` : sans ce composant, la personne invitée n'aurait aucun moyen de
 * découvrir l'invitation ni de l'accepter.
 */
export function InvitationAcceptCard({ membership }: { membership: TenantMembership }) {
  const [state, formAction, pending] = useActionState(
    acceptInvitationAction,
    initialState,
  );

  return (
    <li className="border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
      <div className="min-w-0">
        <p className="text-secondary font-semibold">{membership.tenantName}</p>
        <p className="text-muted-foreground text-sm">
          {TENANT_TYPE_LABELS[membership.tenantType] ?? membership.tenantType} · Rôle
          proposé : {ROLE_LABELS[membership.role] ?? membership.role}
        </p>
        {state.error && <FormError message={state.error} />}
      </div>
      <form action={() => formAction(membership.tenantId)}>
        <Button type="submit" size="sm" isLoading={pending}>
          Accepter l&apos;invitation
        </Button>
      </form>
    </li>
  );
}
