import { NextFunction, Request, Response } from 'express';
import { verifyAccess, verifyGuestSession, TokenClaims, GuestSessionClaims } from './auth.js';

declare global { namespace Express { interface Request { auth?: TokenClaims; guest?: GuestSessionClaims; tenantId?: string; rawBody?: Buffer; correlationId?: string } } }
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) return next(Object.assign(new Error('Authentication required'), { status: 401 }));
    const claims = verifyAccess(header.slice(7));
    if (claims.type !== 'access') return next(Object.assign(new Error('Invalid access token'), { status: 401 }));
    req.auth = claims; next();
  } catch { next(Object.assign(new Error('Invalid access token'), { status: 401 })); }
}
export const requireRole = (...roles: Array<TokenClaims['role']>) => (req: Request, _res: Response, next: NextFunction) =>
  req.auth && roles.includes(req.auth.role) ? next() : next(Object.assign(new Error('Forbidden'), { status: 403 }));

export const requireTenant = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.auth) return next(Object.assign(new Error('Authentication required'), { status: 401 }));
  const requestedTenant = typeof req.params.hotelId === 'string' ? req.params.hotelId : undefined;
  if (req.auth.role !== 'super_admin' && requestedTenant && requestedTenant !== req.auth.hotelId) {
    return next(Object.assign(new Error('Forbidden'), { status: 403 }));
  }
  req.tenantId = requestedTenant || req.auth.hotelId;
  return next();
};

export function requireGuestSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) return next(Object.assign(new Error('Guest session required'), { status: 401 }));
    req.guest = verifyGuestSession(header.slice(7));
    return next();
  } catch {
    return next(Object.assign(new Error('Invalid or expired guest session'), { status: 401 }));
  }
}
