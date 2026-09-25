import type { PrismaClient } from '@farmmitra/database';

export const audit = async (
  database: PrismaClient,
  userId: string | undefined,
  action: string,
  entityType: string,
  entityId: string | undefined,
  metadata?: object,
): Promise<void> => {
  await database.auditLog.create({
    data: { userId, action, entityType, entityId, metadata },
  });
};
