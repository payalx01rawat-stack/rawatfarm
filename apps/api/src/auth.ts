import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '@farmmitra/config';
import { PrismaClient } from '@farmmitra/database';

export const ROLE_NAMES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CHILD_ADMIN', 'PACKING_STAFF', 'DELIVERY_STAFF', 'SHOP_OWNER', 'VENDOR', 'VENDOR_STAFF', 'VENDOR_ADMIN', 'DELIVERY_PARTNER', 'CUSTOMER'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const VENDOR_ROLE_NAMES = new Set(['VENDOR', 'VENDOR_STAFF', 'VENDOR_ADMIN']);
export const DELIVERY_ROLE_NAMES = new Set(['DELIVERY_PARTNER', 'DELIVERY_STAFF']);

export const isVendorRole = (roles: string[]): boolean => roles.some((role) => VENDOR_ROLE_NAMES.has(role));
export const isDeliveryRole = (roles: string[]): boolean => roles.some((role) => DELIVERY_ROLE_NAMES.has(role));

export type AuthContext = {
  userId: string;
  roles: string[];
  permissions: string[];
};

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, passwordHash: string): Promise<boolean> => bcrypt.compare(password, passwordHash);

export const signAccessToken = (context: AuthContext): string => jwt.sign(
  { sub: context.userId, roles: context.roles, permissions: context.permissions },
  config.JWT_SECRET,
  { expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
);

export const authenticate = async (request: RequestLike, database: PrismaClient): Promise<AuthContext> => {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Authentication required');

  let decoded: jwt.JwtPayload;
  try {
    decoded = jwt.verify(header.slice(7), config.JWT_SECRET) as jwt.JwtPayload;
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
  if (typeof decoded.sub !== 'string') throw new HttpError(401, 'Invalid token subject');

  const user = await database.user.findUnique({
    where: { id: decoded.sub },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      childAdminPermissions: { include: { permission: true } },
    },
  });
  if (!user || user.status !== 'ACTIVE') throw new HttpError(401, 'User is inactive or unavailable');

  const roles = user.roles.map(({ role }) => role.name);
  return {
    userId: user.id,
    roles,
    permissions: roles.length === 1 && roles[0] === 'CHILD_ADMIN'
      ? (user.childAdminPermissions ?? []).map(({ permission }) => permission.name)
      : user.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.name)),
  };
};

export const requirePermission = (context: AuthContext, permission: string): void => {
  if (!context.permissions.includes(permission) && !context.roles.includes('SUPER_ADMIN')) {
    throw new HttpError(403, 'Insufficient permission');
  }
};

export type RequestLike = { headers: { authorization?: string } };

export class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}
