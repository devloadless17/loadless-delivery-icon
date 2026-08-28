import { Injectable, Logger } from '@nestjs/common';
import type { ActorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

export interface AuditEntry {
  actor: AuthUser | { userId: string; actorType: ActorType };
  action: string; // e.g. "VENDOR_CREATED", "SETTINGS_UPDATED"
  entityType: string;
  entityId: string;
  /** Small, non-sensitive facts only — never passwords, hashes, or tokens. */
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget: an audit failure must never fail the business action. */
  log(entry: AuditEntry): void {
    const actorType: ActorType =
      'actorType' in entry.actor ? entry.actor.actorType : (entry.actor.role as ActorType);
    void this.prisma.auditLog
      .create({
        data: {
          actorUserId: entry.actor.userId,
          actorType,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          metadata: entry.metadata as never,
        },
      })
      .catch((err: Error) =>
        this.logger.error(`Audit write failed for ${entry.action}: ${err.message}`),
      );
  }
}
