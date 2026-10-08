import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from './config.js';
import { UserRole } from './models/User.js';

export type TokenClaims = { sub: string; hotelId: string; role: UserRole; type: 'access' | 'refresh'; iat?: number; exp?: number };
export type GuestSessionClaims = { sub: string; hotelId: string; qrId: string; type: 'guest'; iat?: number; exp?: number };
function sign(claims: TokenClaims, secret: string, expiresIn: string): string {
  return jwt.sign(claims, secret, { expiresIn } as SignOptions);
}
export function issueTokens(user: { id: string; hotelId: string; role: UserRole }) {
  const base = { sub: user.id, hotelId: user.hotelId, role: user.role };
  return {
    accessToken: sign({ ...base, type: 'access' }, config.JWT_ACCESS_SECRET, config.JWT_ACCESS_TTL),
    refreshToken: sign({ ...base, type: 'refresh' }, config.JWT_REFRESH_SECRET, config.JWT_REFRESH_TTL)
  };
}
export function verifyAccess(token: string): TokenClaims { return jwt.verify(token, config.JWT_ACCESS_SECRET) as TokenClaims; }
export function verifyRefresh(token: string): TokenClaims { return jwt.verify(token, config.JWT_REFRESH_SECRET) as TokenClaims; }
export function tokenIssuedBefore(timestamp: number | null | undefined, issuedAtSeconds: number | undefined): boolean {
  return Boolean(timestamp && issuedAtSeconds && issuedAtSeconds * 1000 <= timestamp);
}
export function issueGuestSession(hotelId: string, qrId: string): string {
  return jwt.sign({ sub: `guest:${crypto.randomUUID()}`, hotelId, qrId, type: 'guest' },
    config.JWT_GUEST_SECRET, { expiresIn: config.JWT_GUEST_TTL } as SignOptions);
}
export function verifyGuestSession(token: string): GuestSessionClaims {
  const claims = jwt.verify(token, config.JWT_GUEST_SECRET) as GuestSessionClaims;
  if (claims.type !== 'guest' || !claims.hotelId || !claims.qrId) throw new Error('Invalid guest session');
  return claims;
}
export function createQrToken(): { publicId: string; token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { publicId: crypto.randomBytes(12).toString('base64url'), token, tokenHash: crypto.createHash('sha256').update(token).digest('hex') };
}
export function hashQrToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
const qrKey = () => crypto.createHash('sha256').update(config.JWT_GUEST_SECRET).digest();
export function encryptQrToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', qrKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}
export function decryptQrToken(value: string): string {
  const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', qrKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
