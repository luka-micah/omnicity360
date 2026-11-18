// Audit logging for authentication and privileged actions.
import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyRequest } from 'fastify';

type AuditDb = Pick<PrismaClient, 'auditLog'> | Prisma.TransactionClient;

export interface AuditEvent {
  actorId?: string | null;
  actorType: string;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  severity?: 'info' | 'warning' | 'critical';
}

export async function writeAuditLog(
  db: AuditDb,
  request: FastifyRequest | null,
  event: AuditEvent
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: event.actorId ?? null,
      actorType: event.actorType,
      actorEmail: event.actorEmail ?? null,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      ...(event.oldValues !== undefined ? { oldValues: event.oldValues } : {}),
      ...(event.newValues !== undefined ? { newValues: event.newValues } : {}),
      ...(event.metadata !== undefined ? { metadata: event.metadata } : {}),
      ipAddress: request?.ip?.slice(0, 45) ?? null,
      userAgent:
        typeof request?.headers['user-agent'] === 'string'
          ? request.headers['user-agent'].slice(0, 500)
          : null,
      severity: event.severity ?? 'info',
    },
  });
}
