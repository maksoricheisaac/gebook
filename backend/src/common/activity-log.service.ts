import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ActivityLogEntry {
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  /** Motif saisi par l'auteur de l'action, lorsqu'il en existe un (remboursement). */
  description?: string;
}

/**
 * Journal des actions sensibles (audit S-07). Utilisé par les contrôleurs
 * d'administration : chaque création, modification ou suppression du catalogue
 * doit pouvoir être retracée jusqu'à l'administrateur qui l'a faite.
 *
 * `record()` doit pouvoir être appelée depuis n'importe quel contexte
 * (authentifié, admin, système) sans connaître de tenant actif — c'est la
 * seule table où l'écriture RLS est inconditionnelle (Phase 4,
 * `20260823020000_add_rls_policies` : `activity_logs_insert ... WITH CHECK (true)`).
 * INSERT brut plutôt que `prisma.activityLog.create()` : PostgreSQL exige que
 * la policy SELECT soit aussi satisfaite pour le `RETURNING` implicite d'un
 * `.create()`, ce qui aurait recréé exactement la dépendance à un contexte
 * qu'on cherche à éviter ici. Un INSERT sans RETURNING ne déclenche pas cette
 * vérification.
 */
@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: ActivityLogEntry): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO activity_logs (id, user_id, action, entity_type, entity_id, description, created_at)
      VALUES (
        ${randomUUID()}::uuid,
        ${entry.userId}::uuid,
        ${entry.action},
        ${entry.entityType ?? null},
        ${entry.entityId ?? null}::uuid,
        ${entry.description ?? null},
        now()
      )
    `;
  }
}
