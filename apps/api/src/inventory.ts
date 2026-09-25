import { Prisma } from '@farmmitra/database';

export type ReservationAction = 'release' | 'consume';

export const parseDecimalQuantity = (value: unknown, fieldName = 'quantity'): Prisma.Decimal => {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${fieldName} is required`);
  }

  const raw = typeof value === 'string' ? value.trim() : value;
  const decimal = new Prisma.Decimal(raw as string | number | Prisma.Decimal);

  if (!decimal.isFinite()) {
    throw new Error(`${fieldName} must be a valid decimal value`);
  }

  if (decimal.isNegative()) {
    throw new Error(`${fieldName} cannot be negative`);
  }

  return decimal;
};

export const calculateAvailableQuantity = (onHand: Prisma.Decimal | string | number, reserved: Prisma.Decimal | string | number): Prisma.Decimal => {
  return new Prisma.Decimal(onHand).minus(new Prisma.Decimal(reserved));
};

export const isReservationActionAllowed = (status: string, action: ReservationAction): boolean => {
  if (action === 'release') return status === 'ACTIVE';
  if (action === 'consume') return status === 'ACTIVE';
  return false;
};

export const stockStatus = (quantity: Prisma.Decimal | string | number, threshold: Prisma.Decimal | string | number, trackInventory = true): 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'NOT_TRACKED' => {
  if (!trackInventory) return 'NOT_TRACKED';
  const stock = new Prisma.Decimal(quantity);
  return stock.lte(0) ? 'OUT_OF_STOCK' : stock.lte(new Prisma.Decimal(threshold)) ? 'LOW_STOCK' : 'IN_STOCK';
};
