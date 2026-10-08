import express, { ErrorRequestHandler } from 'express';
import type { IncomingMessage } from 'node:http';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { Hotel, User, QrCode, MenuCategory, MenuItem, Order, OrderItem, StatusHistory, Room, AuditLog, GuestEvent, ServiceRequest, Payment, Invoice, HotelContent, LocalGuideItem, Review, PmsResourceMapping } from './models/index.js';
import { SERVICE_REQUEST_CATEGORIES, SERVICE_REQUEST_STATUSES, ServiceRequestStatus } from './models/ServiceRequest.js';
import { QR_TYPES } from './models/QrCode.js';
import { ORDER_STATUSES, OrderStatus } from './models/Order.js';
import { sequelize } from './db.js';
import crypto from 'node:crypto';
import type { Server as SocketServer } from 'socket.io';
import { emitKitchenEvent, emitServiceEvent } from './socket.js';
import { createQrToken, decryptQrToken, encryptQrToken, hashQrToken, issueGuestSession, issueTokens, tokenIssuedBefore, verifyRefresh } from './auth.js';
import { requireAuth, requireGuestSession, requireRole, requireTenant } from './middleware.js';
import { z } from 'zod';
import QRCode from 'qrcode';
import { createRazorpayOrder, createRazorpayRefund, isDuplicateWebhook, refundableAmount, verifyRazorpaySignature, verifyRazorpayWebhook } from './payments.js';
import { invoiceNumber, invoiceStatus, renderInvoicePdf } from './billing.js';
import { CONTENT_TYPES } from './models/HotelContent.js';
import { GUIDE_TYPES } from './models/LocalGuideItem.js';
import { REVIEW_TARGETS } from './models/Review.js';
import { Op, fn, col, literal } from 'sequelize';
import { getWifiIntegration, WifiProviderName } from './wifi.js';
import { sendNotification } from './notifications.js';
import { createUploadUrl } from './storage.js';
import { pmsIntegration } from './pms.js';
import { getCached, invalidateCache, setCached } from './cache.js';
import { captureException, logger, logInfo } from './logger.js';

export const app = express();
let kitchenIo: SocketServer | undefined;
export function setKitchenSocket(io: SocketServer): void { kitchenIo = io; }
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json({ limit: '100kb', verify: (req, _res, body) => { (req as IncomingMessage & { rawBody?: Buffer }).rawBody = Buffer.from(body); } }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use((req, res, next) => {
  const correlationId = req.header('x-correlation-id')?.slice(0, 80) || crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  const started = Date.now();
  res.on('finish', () => { void logInfo('request.complete', { correlationId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - started }); });
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'guestqr-api' }));
app.post('/api/v1/auth/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').toLowerCase().trim();
    const password = String(req.body?.password ?? '');
    const user = await User.findOne({ where: { email, active: true } });
    if (!user || !(await user.verifyPassword(password))) return res.status(401).json({ error: { message: 'Invalid credentials' } });
    await user.update({ lastLoginAt: new Date() });
    return res.json(issueTokens(user));
  } catch (error) { return next(error); }
});
app.post('/api/v1/auth/refresh', async (req, res, next) => {
  try {
    const claims = verifyRefresh(String(req.body?.refreshToken ?? ''));
    if (claims.type !== 'refresh') return res.status(401).json({ error: { message: 'Invalid refresh token' } });
    const user = await User.findByPk(claims.sub);
    if (!user || !user.active || user.deactivatedAt || tokenIssuedBefore(user.passwordChangedAt?.getTime(), claims.iat)) {
      return res.status(401).json({ error: { message: 'Refresh token revoked' } });
    }
    return res.json(issueTokens(user));
  } catch (error) { return next(Object.assign(error as Error, { status: 401 })); }
});

const hotelInput = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,80}$/)
}).strict();
const onboardingInput = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,80}$/),
  address: z.record(z.string().trim().max(200)).nullable().optional(),
  contactDetails: z.record(z.string().trim().max(200)).nullable().optional(),
  logoUrl: z.string().url().max(2048).nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#252b21'),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#d8f24d'),
  branding: z.record(z.unknown()).nullable().optional(),
  gstNumber: z.string().trim().max(30).nullable().optional(),
  timezone: z.string().trim().min(1).max(64).default('UTC'),
  currency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  language: z.string().regex(/^[a-z]{2,10}$/).default('en'),
  settings: z.record(z.unknown()).nullable().optional(),
  configuration: z.record(z.unknown()).nullable().optional()
}).strict();
const userInput = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  role: z.enum(['staff', 'admin', 'hotel_admin', 'owner', 'super_admin'])
}).strict();
const hotelAdmin = requireRole('owner', 'admin', 'hotel_admin', 'super_admin');
const staffAdmin = requireRole('owner', 'admin', 'hotel_admin', 'super_admin');
const profileInput = z.object({
  name: z.string().trim().min(1).max(160), slug: z.string().trim().regex(/^[a-z0-9-]{2,80}$/),
  address: z.record(z.string().trim().max(200)).nullable().optional(),
  contactDetails: z.record(z.string().trim().max(200)).nullable().optional(),
  logoUrl: z.string().url().max(2048).nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  branding: z.record(z.unknown()).nullable().optional(), gstNumber: z.string().trim().max(30).nullable().optional(),
  timezone: z.string().trim().min(1).max(64), currency: z.string().regex(/^[A-Z]{3}$/),
  language: z.string().regex(/^[a-z]{2,10}$/), settings: z.record(z.unknown()).nullable().optional(),
  configuration: z.record(z.unknown()).nullable().optional()
}).strict();
const roomInput = z.object({ roomNumber: z.string().trim().min(1).max(32), name: z.string().trim().max(100).nullable().optional(), floor: z.string().trim().max(32).nullable().optional() }).strict();
const staffInput = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()), password: z.string().min(12).max(128),
  role: z.enum(['staff', 'admin', 'hotel_admin', 'owner']), department: z.string().trim().max(80).nullable().optional()
}).strict();
const staffUpdate = z.object({ role: z.enum(['staff', 'admin', 'hotel_admin', 'owner']).optional(), department: z.string().trim().max(80).nullable().optional(), active: z.boolean().optional(), permissions: z.record(z.boolean()).nullable().optional() }).strict();
const resetPasswordInput = z.object({ password: z.string().min(12).max(128) }).strict();
export function calculateOrderTotals(items: Array<{ priceCents: number; gstRateBps: number; quantity: number }>, discountCents = 0) {
  const subtotalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const gstCents = items.reduce((sum, item) => sum + Math.round(item.priceCents * item.quantity * item.gstRateBps / 10000), 0);
  const safeDiscountCents = Math.max(0, Math.min(discountCents, subtotalCents + gstCents));
  return { subtotalCents, gstCents, discountCents: safeDiscountCents, totalCents: subtotalCents + gstCents - safeDiscountCents };
}
async function audit(hotelId: string, actorUserId: string | null, action: string, resourceType: string, resourceId?: string, metadata?: object) {
  await AuditLog.create({ hotelId, actorUserId, action, resourceType, resourceId: resourceId ?? null, metadata: metadata ?? null });
}
const qrInput = z.object({
  label: z.string().trim().min(1).max(120).nullable().optional(),
  type: z.enum(QR_TYPES).default('ROOM'),
  roomId: z.string().uuid().nullable().optional(),
  targetLabel: z.string().trim().max(120).nullable().optional()
}).strict();
const qrResponse = (qr: QrCode) => ({ publicId: qr.publicId, label: qr.label, type: qr.type, targetLabel: qr.targetLabel, active: qr.active, scanCount: qr.scanCount, lastScannedAt: qr.lastScannedAt, createdAt: qr.createdAt });
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const menuCategoryInput = z.object({ name: z.string().trim().min(1).max(120), sortOrder: z.number().int().min(0).max(10000).optional(), active: z.boolean().optional() }).strict();
const menuItemInput = z.object({
  categoryId: z.string().uuid(), name: z.string().trim().min(1).max(160), description: z.string().max(500).nullable().optional(),
  priceCents: z.number().int().min(0).max(100000000), gstRateBps: z.number().int().min(0).max(2800).default(0),
  preparationMinutes: z.number().int().min(0).max(1440).default(20), imageUrl: z.string().url().max(2048).nullable().optional(),
  vegetarian: z.boolean().default(true), customizationSchema: z.record(z.unknown()).nullable().optional(), active: z.boolean().optional()
}).strict();
const orderItemInput = z.object({ menuItemId: z.string().uuid(), quantity: z.number().int().min(1).max(50), customizations: z.record(z.unknown()).optional(), specialInstructions: z.string().max(500).optional() }).strict();
const orderInput = z.object({
  items: z.array(orderItemInput).min(1).max(50), guestName: z.string().trim().min(1).max(120),
  guestPhone: z.string().trim().min(7).max(32), deliveryLocation: z.string().trim().min(1).max(200),
  paymentMethod: z.enum(['PAY_AT_HOTEL', 'ONLINE']).default('PAY_AT_HOTEL'), guestNote: z.string().max(500).optional()
}).strict();
export const VALID_ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ['CONFIRMED', 'FAILED', 'CANCELLED'], CONFIRMED: ['ACCEPTED', 'CANCELLED', 'FAILED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'], PREPARING: ['READY', 'CANCELLED'], READY: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED'], DELIVERED: ['REFUNDED'], CANCELLED: [], FAILED: [], REFUNDED: []
};
export function canKitchenTransition(role: string, from: OrderStatus, to: OrderStatus): boolean {
  if (!VALID_ORDER_TRANSITIONS[from].includes(to)) return false;
  if (['owner', 'admin', 'hotel_admin', 'super_admin'].includes(role)) return true;
  return role === 'staff' && (
    (from === 'ACCEPTED' && to === 'PREPARING') ||
    (from === 'PREPARING' && to === 'READY') ||
    (from === 'READY' && ['OUT_FOR_DELIVERY', 'DELIVERED'].includes(to))
  );
}

// All hotel routes derive the tenant from the token; no client-supplied hotel ID is trusted.
app.put('/api/v1/hotels/me', requireAuth, hotelAdmin, async (req, res, next) => {
  try {
    const input = hotelInput.parse(req.body);
    const [hotel] = await Hotel.findOrCreate({ where: { id: req.auth!.hotelId }, defaults: { id: req.auth!.hotelId, ...input } });
    await hotel.update(input);
    return res.json({ hotel: { id: hotel.id, name: hotel.name, slug: hotel.slug } });
  } catch (error) { return next(error); }
});

app.post('/api/v1/hotels/me/onboarding', requireAuth, hotelAdmin, async (req, res, next) => {
  try {
    const input = onboardingInput.parse(req.body);
    const [hotel] = await Hotel.findOrCreate({ where: { id: req.auth!.hotelId }, defaults: { id: req.auth!.hotelId, ...input } });
    await hotel.update(input);
    await audit(req.auth!.hotelId, req.auth!.sub, 'HOTEL_ONBOARDED', 'hotel', hotel.id);
    return res.status(200).json({ hotel });
  } catch (error) { return next(error); }
});

app.get('/api/v1/hotels/me', requireAuth, hotelAdmin, async (req, res, next) => {
  try {
    const hotel = await Hotel.findByPk(req.auth!.hotelId);
    if (!hotel) return res.status(404).json({ error: { message: 'Hotel not found', status: 404 } });
    return res.json({ hotel });
  } catch (error) { return next(error); }
});

app.put('/api/v1/hotels/me/profile', requireAuth, hotelAdmin, async (req, res, next) => {
  try {
    const input = profileInput.parse(req.body);
    const [hotel] = await Hotel.findOrCreate({ where: { id: req.auth!.hotelId }, defaults: { id: req.auth!.hotelId, ...input } });
    await hotel.update(input);
    await audit(req.auth!.hotelId, req.auth!.sub, 'HOTEL_PROFILE_UPDATED', 'hotel', hotel.id);
    return res.json({ hotel });
  } catch (error) { return next(error); }
});

app.get('/api/v1/hotels/:hotelId/rooms', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { return res.json({ rooms: await Room.findAll({ where: { hotelId: String(req.params.hotelId) }, order: [['roomNumber', 'ASC']] }) }); }
  catch (error) { return next(error); }
});
app.post('/api/v1/hotels/:hotelId/rooms', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const input = roomInput.parse(req.body);
    const room = await Room.create({ hotelId: req.tenantId!, roomNumber: input.roomNumber, name: input.name ?? null, floor: input.floor ?? null });
    await audit(req.auth!.hotelId, req.auth!.sub, 'ROOM_CREATED', 'room', room.id);
    return res.status(201).json({ room });
  } catch (error) { return next(error); }
});
app.patch('/api/v1/hotels/:hotelId/rooms/:roomId', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const input = roomInput.partial().extend({ status: z.enum(['ACTIVE', 'DISABLED']).optional() }).strict().parse(req.body);
    const room = await Room.findOne({ where: { id: String(req.params.roomId), hotelId: String(req.params.hotelId) } });
    if (!room) return res.status(404).json({ error: { message: 'Room not found', status: 404 } });
    await room.update(input);
    await audit(req.auth!.hotelId, req.auth!.sub, 'ROOM_UPDATED', 'room', room.id);
    return res.json({ room });
  } catch (error) { return next(error); }
});
app.delete('/api/v1/hotels/:hotelId/rooms/:roomId', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const room = await Room.findOne({ where: { id: String(req.params.roomId), hotelId: String(req.params.hotelId) } });
    if (!room) return res.status(404).json({ error: { message: 'Room not found', status: 404 } });
    await room.update({ status: 'DISABLED' });
    await audit(req.auth!.hotelId, req.auth!.sub, 'ROOM_DISABLED', 'room', room.id);
    return res.json({ room });
  } catch (error) { return next(error); }
});

app.get('/api/v1/hotels/:hotelId/staff', requireAuth, requireTenant, staffAdmin, async (req, res, next) => {
  try {
    const staff = await User.findAll({ where: { hotelId: req.tenantId! }, attributes: ['id', 'email', 'role', 'active', 'department', 'permissions', 'lastLoginAt', 'deactivatedAt', 'passwordChangedAt', 'createdAt'] });
    return res.json({ staff });
  } catch (error) { return next(error); }
});
app.post('/api/v1/hotels/:hotelId/staff', requireAuth, requireTenant, staffAdmin, async (req, res, next) => {
  try {
    const input = staffInput.parse(req.body);
    if (req.auth!.role !== 'super_admin' && input.role === 'owner') return res.status(403).json({ error: { message: 'Insufficient role', status: 403 } });
    const user = await User.create({ hotelId: req.tenantId!, email: input.email, passwordHash: input.password, role: input.role, department: input.department ?? null, passwordChangedAt: new Date() });
    await audit(req.auth!.hotelId, req.auth!.sub, 'STAFF_CREATED', 'user', user.id, { role: user.role });
    return res.status(201).json({ staff: { id: user.id, email: user.email, role: user.role, active: user.active, department: user.department, permissions: user.permissions } });
  } catch (error) { return next(error); }
});
app.patch('/api/v1/hotels/:hotelId/staff/:userId', requireAuth, requireTenant, staffAdmin, async (req, res, next) => {
  try {
    const input = staffUpdate.parse(req.body);
    if (input.role === 'owner' && req.auth!.role !== 'super_admin') return res.status(403).json({ error: { message: 'Insufficient role', status: 403 } });
    const user = await User.findOne({ where: { id: String(req.params.userId), hotelId: String(req.params.hotelId) } });
    if (!user) return res.status(404).json({ error: { message: 'Staff member not found', status: 404 } });
    await user.update({ ...input, deactivatedAt: input.active === false ? new Date() : input.active === true ? null : user.deactivatedAt });
    await audit(req.auth!.hotelId, req.auth!.sub, input.active === false ? 'STAFF_DEACTIVATED' : input.active === true ? 'STAFF_ACTIVATED' : 'STAFF_UPDATED', 'user', user.id);
    return res.json({ staff: { id: user.id, email: user.email, role: user.role, active: user.active, department: user.department, permissions: user.permissions } });
  } catch (error) { return next(error); }
});
app.post('/api/v1/hotels/:hotelId/staff/:userId/reset-password', requireAuth, requireTenant, staffAdmin, async (req, res, next) => {
  try {
    const input = resetPasswordInput.parse(req.body);
    const user = await User.findOne({ where: { id: String(req.params.userId), hotelId: String(req.params.hotelId) } });
    if (!user) return res.status(404).json({ error: { message: 'Staff member not found', status: 404 } });
    await user.update({ passwordHash: input.password, passwordChangedAt: new Date() });
    await audit(req.auth!.hotelId, req.auth!.sub, 'STAFF_CREDENTIAL_RESET', 'user', user.id);
    return res.status(204).send();
  } catch (error) { return next(error); }
});
app.get('/api/v1/hotels/:hotelId/audit-logs', requireAuth, requireTenant, requireRole('owner', 'admin', 'hotel_admin', 'super_admin'), async (req, res, next) => {
  try { return res.json({ auditLogs: await AuditLog.findAll({ where: { hotelId: String(req.params.hotelId) }, order: [['createdAt', 'DESC']], limit: 100 }) }); }
  catch (error) { return next(error); }
});

app.get('/api/v1/hotels/:hotelId/users', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const users = await User.findAll({
      where: { hotelId: req.params.hotelId },
      attributes: ['id', 'hotelId', 'email', 'role', 'active', 'createdAt']
    });
    return res.json({ users });
  } catch (error) { return next(error); }
});

app.post('/api/v1/hotels/:hotelId/users', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const input = userInput.parse(req.body);
    const hotelId = String(req.params.hotelId);
    if (req.auth!.role !== 'super_admin' && ['owner', 'super_admin'].includes(input.role)) {
      return res.status(403).json({ error: { message: 'Insufficient role to assign this role', status: 403 } });
    }
    const user = await User.create({ hotelId, email: input.email, passwordHash: input.password, role: input.role });
    return res.status(201).json({ user: { id: user.id, hotelId: user.hotelId, email: user.email, role: user.role, active: user.active } });
  } catch (error) { return next(error); }
});

// Example tenant-scoped resource: a tenant ID mismatch is denied before any database query.
app.get('/api/v1/hotels/:hotelId/tenant-example', requireAuth, requireTenant, (req, res) =>
  res.json({ tenantId: req.auth!.hotelId, message: 'Tenant-scoped access granted' }));

app.post('/api/v1/hotels/:hotelId/qrs', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const input = qrInput.parse(req.body);
    if (input.roomId) {
      const room = await Room.findOne({ where: { id: input.roomId, hotelId: req.tenantId!, status: 'ACTIVE' } });
      if (!room) return res.status(400).json({ error: { message: 'Room not found in this hotel', status: 400 } });
    }
    const generated = createQrToken();
    const qr = await QrCode.create({ hotelId: req.tenantId!, publicId: generated.publicId, tokenHash: generated.tokenHash, tokenCiphertext: encryptQrToken(generated.token), label: input.label ?? null, type: input.type, roomId: input.roomId ?? null, targetLabel: input.targetLabel ?? null });
    await audit(req.tenantId!, req.auth!.sub, 'QR_CREATED', 'qr', qr.id, { type: qr.type });
    return res.status(201).json({ qr: { ...qrResponse(qr), identifier: `${generated.publicId}.${generated.token}` } });
  } catch (error) { return next(error); }
});

app.get('/api/v1/hotels/:hotelId/menu/categories', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { return res.json({ categories: await MenuCategory.findAll({ where: { hotelId: req.tenantId! }, order: [['sortOrder', 'ASC'], ['name', 'ASC']] }) }); }
  catch (error) { return next(error); }
});
app.post('/api/v1/hotels/:hotelId/menu/categories', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const input = menuCategoryInput.parse(req.body);
    const category = await MenuCategory.create({ hotelId: req.tenantId!, name: input.name, sortOrder: input.sortOrder ?? 0, active: input.active ?? true });
    await audit(req.tenantId!, req.auth!.sub, 'MENU_CATEGORY_CREATED', 'menu_category', category.id);
    return res.status(201).json({ category });
  } catch (error) { return next(error); }
});
app.patch('/api/v1/hotels/:hotelId/menu/categories/:categoryId', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const category = await MenuCategory.findOne({ where: { id: String(req.params.categoryId), hotelId: req.tenantId! } });
    if (!category) return res.status(404).json({ error: { message: 'Category not found', status: 404 } });
    await category.update(menuCategoryInput.partial().parse(req.body));
    return res.json({ category });
  } catch (error) { return next(error); }
});
app.delete('/api/v1/hotels/:hotelId/menu/categories/:categoryId', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const category = await MenuCategory.findOne({ where: { id: String(req.params.categoryId), hotelId: req.tenantId! } });
    if (!category) return res.status(404).json({ error: { message: 'Category not found', status: 404 } });
    await category.update({ active: false });
    await MenuItem.update({ active: false }, { where: { categoryId: category.id, hotelId: req.tenantId! } });
    return res.status(204).send();
  } catch (error) { return next(error); }
});
app.get('/api/v1/hotels/:hotelId/menu/items', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { return res.json({ items: await MenuItem.findAll({ where: { hotelId: req.tenantId! }, order: [['name', 'ASC']] }) }); }
  catch (error) { return next(error); }
});
app.post('/api/v1/hotels/:hotelId/menu/items', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const input = menuItemInput.parse(req.body);
    const category = await MenuCategory.findOne({ where: { id: input.categoryId, hotelId: req.tenantId!, active: true } });
    if (!category) return res.status(400).json({ error: { message: 'Category not found in this hotel', status: 400 } });
    const item = await MenuItem.create({ ...input, hotelId: req.tenantId!, description: input.description ?? null, imageUrl: input.imageUrl ?? null, customizationSchema: input.customizationSchema ?? null, active: input.active ?? true });
    await audit(req.tenantId!, req.auth!.sub, 'MENU_ITEM_CREATED', 'menu_item', item.id);
    await invalidateCache(`menu:${req.tenantId!}`); return res.status(201).json({ item });
  } catch (error) { return next(error); }
});
app.patch('/api/v1/hotels/:hotelId/menu/items/:itemId', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const input = menuItemInput.partial().parse(req.body);
    const item = await MenuItem.findOne({ where: { id: String(req.params.itemId), hotelId: req.tenantId! } });
    if (!item) return res.status(404).json({ error: { message: 'Menu item not found', status: 404 } });
    if (input.categoryId) {
      const category = await MenuCategory.findOne({ where: { id: input.categoryId, hotelId: req.tenantId!, active: true } });
      if (!category) return res.status(400).json({ error: { message: 'Category not found in this hotel', status: 400 } });
    }
    await item.update(input);
    return res.json({ item });
  } catch (error) { return next(error); }
});
app.delete('/api/v1/hotels/:hotelId/menu/items/:itemId', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const item = await MenuItem.findOne({ where: { id: String(req.params.itemId), hotelId: req.tenantId! } });
    if (!item) return res.status(404).json({ error: { message: 'Menu item not found', status: 404 } });
    await item.update({ active: false });
    return res.status(204).send();
  } catch (error) { return next(error); }
});

app.get('/api/v1/hotels/:hotelId/qrs', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const qrs = await QrCode.findAll({ where: { hotelId: req.tenantId! }, attributes: ['publicId', 'label', 'type', 'targetLabel', 'active', 'scanCount', 'lastScannedAt', 'createdAt'] });
    return res.json({ qrs });
  } catch (error) { return next(error); }
});

app.post('/api/v1/hotels/:hotelId/qrs/:publicId/disable', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const qr = await QrCode.findOne({ where: { hotelId: String(req.params.hotelId), publicId: String(req.params.publicId) } });
    if (!qr) return res.status(404).json({ error: { message: 'QR code not found', status: 404 } });
    await qr.update({ active: false });
    await audit(req.tenantId!, req.auth!.sub, 'QR_DISABLED', 'qr', qr.id);
    return res.json({ qr: qrResponse(qr) });
  } catch (error) { return next(error); }
});

app.post('/api/v1/hotels/:hotelId/qrs/:publicId/regenerate', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const qr = await QrCode.findOne({ where: { hotelId: String(req.params.hotelId), publicId: String(req.params.publicId) } });
    if (!qr) return res.status(404).json({ error: { message: 'QR code not found', status: 404 } });
    const generated = createQrToken();
    await qr.update({ publicId: generated.publicId, tokenHash: generated.tokenHash, tokenCiphertext: encryptQrToken(generated.token), active: true });
    await audit(req.tenantId!, req.auth!.sub, 'QR_REGENERATED', 'qr', qr.id);
    return res.json({ qr: { ...qrResponse(qr), identifier: `${generated.publicId}.${generated.token}` } });
  } catch (error) { return next(error); }
});

app.get('/api/v1/hotels/:hotelId/qrs/:publicId/download', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const qr = await QrCode.findOne({ where: { hotelId: req.tenantId!, publicId: String(req.params.publicId), active: true } });
    if (!qr) return res.status(404).json({ error: { message: 'QR code not found', status: 404 } });
    const identifier = `${qr.publicId}.${decryptQrToken(qr.tokenCiphertext)}`;
    const dataUrl = await QRCode.toDataURL(`${config.PUBLIC_GUEST_URL}/qr/${identifier}`, { errorCorrectionLevel: 'M', margin: 2, width: 1200 });
    const printSize = qr.type === 'ROOM' ? 'A5' : 'A4';
    const printLabel = escapeHtml(qr.label ?? 'Scan for GuestQR');
    const printDocument = `<!doctype html><html><head><meta charset="utf-8"><title>GuestQR ${printLabel}</title><style>@page{size:${printSize} portrait;margin:12mm}body{align-items:center;display:flex;flex-direction:column;font-family:Arial,sans-serif;justify-content:center;min-height:90vh;text-align:center}img{height:65mm;width:65mm}h1{font-size:24px;margin:12mm 0 3mm}p{font-size:13px;color:#555}</style></head><body><h1>${printLabel}</h1><img src="${dataUrl}" alt="GuestQR code"><p>Scan to explore hotel services</p></body></html>`;
    return res.json({ imageDataUrl: dataUrl, printSize, printDocument });
  } catch (error) { return next(error); }
});

app.get('/api/v1/hotels/:hotelId/qrs/analytics', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const analytics = await GuestEvent.findAll({ where: { hotelId: req.tenantId!, eventType: 'QR_SCAN' }, attributes: ['qrId', 'eventType', 'createdAt'], order: [['createdAt', 'DESC']], limit: 1000 });
    const qrs = await QrCode.findAll({ where: { hotelId: req.tenantId! }, attributes: ['id', 'publicId', 'label', 'type'] });
    const publicQrById = new Map(qrs.map((qr) => [qr.id, { publicId: qr.publicId, label: qr.label, type: qr.type }]));
    return res.json({ analytics: analytics.map((event) => ({ qr: publicQrById.get(event.qrId) ?? null, eventType: event.eventType, createdAt: event.createdAt })) });
  } catch (error) { return next(error); }
});

app.get('/api/v1/public/qr/:identifier', async (req, res, next) => {
  try {
    const [publicId, secret] = String(req.params.identifier).split('.');
    if (!publicId || !secret) return res.status(404).json({ error: { message: 'QR code not found', status: 404 } });
    const qr = await QrCode.findOne({ where: { publicId, tokenHash: hashQrToken(secret), active: true } });
    if (!qr) return res.status(404).json({ error: { message: 'QR code not found', status: 404 } });
    const sessionToken = issueGuestSession(qr.hotelId, qr.publicId);
    const sessionId = (() => { try { return JSON.parse(Buffer.from(sessionToken.split('.')[1], 'base64url').toString()).sub; } catch { return null; } })();
    await qr.increment('scanCount');
    await qr.update({ lastScannedAt: new Date() });
    await GuestEvent.bulkCreate([
      { hotelId: qr.hotelId, qrId: qr.id, sessionId, eventType: 'QR_SCAN', metadata: { userAgent: req.get('user-agent')?.slice(0, 300) ?? null } },
      { hotelId: qr.hotelId, qrId: qr.id, sessionId, eventType: 'SESSION_CREATED', metadata: { userAgent: req.get('user-agent')?.slice(0, 300) ?? null } }
    ]);
    return res.json({ guestSessionToken: sessionToken, expiresIn: config.JWT_GUEST_TTL });
  } catch (error) { return next(error); }
});

app.get('/api/v1/guest/context', requireGuestSession, async (req, res, next) => {
  try {
    const qr = await QrCode.findOne({ where: { hotelId: req.guest!.hotelId, publicId: req.guest!.qrId, active: true }, attributes: ['id', 'publicId', 'hotelId', 'label', 'type', 'targetLabel', 'roomId'] });
    if (!qr) return res.status(401).json({ error: { message: 'Guest session is no longer valid', status: 401 } });
    const hotel = await Hotel.findByPk(req.guest!.hotelId, { attributes: ['name', 'branding', 'logoUrl', 'primaryColor', 'secondaryColor', 'timezone', 'currency', 'language', 'settings'] });
    if (!hotel) return res.status(401).json({ error: { message: 'Hotel is no longer available', status: 401 } });
    const room = qr.roomId ? await Room.findOne({ where: { id: qr.roomId, hotelId: req.guest!.hotelId, status: 'ACTIVE' }, attributes: ['roomNumber', 'name'] }) : null;
    return res.json({ hotel: { name: hotel.name, branding: hotel.branding, logoUrl: hotel.logoUrl, primaryColor: hotel.primaryColor, secondaryColor: hotel.secondaryColor, timezone: hotel.timezone, currency: hotel.currency, language: hotel.language, settings: hotel.settings }, qr: { label: qr.label, type: qr.type, targetLabel: qr.targetLabel }, location: room ? { roomNumber: room.roomNumber, name: room.name } : null });
  } catch (error) { return next(error); }
});

app.get('/api/v1/guest/menu', requireGuestSession, async (req, res, next) => {
  try {
    const cacheKey = `menu:${req.guest!.hotelId}`;
    const cached = await getCached<{ categories: unknown[]; items: unknown[] }>(cacheKey);
    if (cached) return res.json(cached);
    const categories = await MenuCategory.findAll({ where: { hotelId: req.guest!.hotelId, active: true }, order: [['sortOrder', 'ASC']] });
    const items = await MenuItem.findAll({ where: { hotelId: req.guest!.hotelId, active: true }, attributes: ['id', 'categoryId', 'name', 'description', 'priceCents', 'gstRateBps', 'preparationMinutes', 'imageUrl', 'vegetarian', 'customizationSchema'], order: [['name', 'ASC']] });
    const result = { categories, items }; await setCached(cacheKey, result, 60); return res.json(result);
  } catch (error) { return next(error); }
});

app.post('/api/v1/guest/events', requireGuestSession, async (req, res, next) => {
  try {
    const input = z.object({
      eventType: z.enum(['PAGE_VIEW', 'MENU_VIEW', 'PRODUCT_VIEW', 'ADD_TO_CART', 'CHECKOUT_STARTED', 'FEEDBACK_SUBMITTED']),
      metadata: z.record(z.unknown()).optional()
    }).strict().parse(req.body);
    const qr = await QrCode.findOne({ where: { hotelId: req.guest!.hotelId, publicId: req.guest!.qrId, active: true }, attributes: ['id'] });
    if (!qr) return res.status(401).json({ error: { message: 'Guest session is no longer valid', status: 401 } });
    await GuestEvent.create({ hotelId: req.guest!.hotelId, qrId: qr.id, sessionId: req.guest!.sub, eventType: input.eventType, metadata: input.metadata ?? null });
    return res.status(202).json({ accepted: true });
  } catch (error) { return next(error); }
});

const reviewInput = z.object({ targetType: z.enum(REVIEW_TARGETS), targetId: z.string().uuid().nullable().optional(), rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000).nullable().optional() }).strict();
app.post('/api/v1/guest/reviews', requireGuestSession, async (req, res, next) => {
  try {
    const input = reviewInput.parse(req.body);
    if (input.targetType === 'ORDER' && input.targetId && !await Order.findOne({ where: { id: input.targetId, hotelId: req.guest!.hotelId, qrPublicId: req.guest!.qrId } })) return res.status(404).json({ error: { message: 'Order not found', status: 404 } });
    if (input.targetType === 'SERVICE' && input.targetId && !await ServiceRequest.findOne({ where: { id: input.targetId, hotelId: req.guest!.hotelId, qrPublicId: req.guest!.qrId, status: 'COMPLETED' } })) return res.status(404).json({ error: { message: 'Completed service request not found', status: 404 } });
    const review = await Review.create({ ...input, hotelId: req.guest!.hotelId, qrPublicId: req.guest!.qrId, sessionId: req.guest!.sub, targetId: input.targetId ?? null, comment: input.comment ?? null, response: null, respondedAt: null });
    return res.status(201).json({ review });
  } catch (error) { return next(error); }
});

app.get('/api/v1/hotels/:hotelId/reviews', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const where: Record<string, unknown> = { hotelId: req.tenantId! };
    if (req.query.rating) where.rating = Number(req.query.rating);
    if (req.query.targetType) where.targetType = String(req.query.targetType);
    return res.json({ reviews: await Review.findAll({ where, order: [['createdAt', 'DESC']], limit: 500 }) });
  } catch (error) { return next(error); }
});
app.patch('/api/v1/hotels/:hotelId/reviews/:reviewId/respond', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const input = z.object({ response: z.string().trim().min(1).max(2000) }).strict().parse(req.body);
    const review = await Review.findOne({ where: { id: String(req.params.reviewId), hotelId: req.tenantId! } });
    if (!review) return res.status(404).json({ error: { message: 'Review not found', status: 404 } });
    await review.update({ response: input.response, respondedAt: new Date() });
    return res.json({ review });
  } catch (error) { return next(error); }
});

function reportRange(query: Record<string, unknown>): { start: Date; end: Date } {
  const end = query.end ? new Date(String(query.end)) : new Date();
  const start = query.start ? new Date(String(query.start)) : new Date(end.getTime() - 7 * 86400000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) throw Object.assign(new Error('Invalid report date range'), { status: 400 });
  return { start, end };
}
function csv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((header) => quote(row[header])).join(','))].join('\n');
}

app.get('/api/v1/hotels/:hotelId/analytics', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const { start, end } = reportRange(req.query as Record<string, unknown>);
    const where = { hotelId: req.tenantId!, createdAt: { [Op.gte]: start, [Op.lt]: end } };
    const events = await GuestEvent.findAll({ where, attributes: ['eventType', 'sessionId', 'createdAt', 'metadata'] });
    const orders = await Order.findAll({ where, attributes: ['id', 'totalCents', 'status', 'createdAt'] });
    const services = await ServiceRequest.findAll({ where, attributes: ['status', 'createdAt', 'acceptedAt', 'completedAt'] });
    const reviews = await Review.findAll({ where, attributes: ['rating'] });
    const payments = await Payment.findAll({ where, attributes: ['status'] });
    const count = (type: string) => events.filter((event) => event.eventType === type).length;
    const delivered = orders.filter((order) => order.status === 'DELIVERED');
    const completedServices = services.filter((service) => service.completedAt);
    const popularItems = await OrderItem.findAll({ include: [{ model: Order, where }], attributes: ['nameSnapshot', [fn('SUM', col('quantity')), 'quantity']], group: ['nameSnapshot'], order: [[literal('quantity'), 'DESC']], limit: 10, raw: true });
    return res.json({ range: { start, end }, metrics: { qrScans: count('QR_SCAN'), uniqueGuests: new Set(events.map((event) => event.sessionId).filter(Boolean)).size, menuViews: count('MENU_VIEW'), productViews: count('PRODUCT_VIEW'), addToCart: count('ADD_TO_CART'), checkoutStarts: count('CHECKOUT_STARTED'), orderConversion: count('CHECKOUT_STARTED') ? delivered.length / count('CHECKOUT_STARTED') : 0, averageOrderValueCents: delivered.length ? Math.round(delivered.reduce((sum, order) => sum + order.totalCents, 0) / delivered.length) : 0, serviceRequestVolume: services.length, averageResolutionMinutes: completedServices.length ? Math.round(completedServices.reduce((sum, service) => sum + ((service.completedAt!.getTime() - service.createdAt!.getTime()) / 60000), 0) / completedServices.length) : 0, averageRating: reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0, paymentSuccessRate: payments.length ? payments.filter((payment) => payment.status === 'CAPTURED').length / payments.length : 0 }, popularItems });
  } catch (error) { return next(error); }
});

app.get('/api/v1/hotels/:hotelId/reports/:report/export', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const { start, end } = reportRange(req.query as Record<string, unknown>);
    const report = String(req.params.report);
    const rangeWhere = { hotelId: req.tenantId!, createdAt: { [Op.gte]: start, [Op.lt]: end } };
    const rows: Array<Record<string, unknown>> = report === 'reviews'
      ? (await Review.findAll({ where: rangeWhere, raw: true })).map((row) => row as unknown as Record<string, unknown>)
      : report === 'services' || report === 'staff-performance'
        ? (await ServiceRequest.findAll({ where: rangeWhere, attributes: ['category', 'status', 'staffUserId', 'createdAt', 'acceptedAt', 'completedAt'], raw: true })).map((row) => row as unknown as Record<string, unknown>)
        : report === 'payments'
          ? (await Payment.findAll({ where: rangeWhere, attributes: ['amountCents', 'currency', 'status', 'paymentMethod', 'createdAt'], raw: true })).map((row) => row as unknown as Record<string, unknown>)
          : report === 'menu-performance'
            ? (await OrderItem.findAll({ include: [{ model: Order, where: rangeWhere }], attributes: ['nameSnapshot', [fn('SUM', col('quantity')), 'quantity'], [fn('SUM', literal('"OrderItem"."unitPriceCents" * "OrderItem"."quantity"')), 'grossCents']], group: ['nameSnapshot'], raw: true })).map((row) => row as unknown as Record<string, unknown>)
            : (await Order.findAll({ where: rangeWhere, attributes: ['orderNumber', 'status', 'totalCents', 'createdAt'], raw: true })).map((row) => row as unknown as Record<string, unknown>);
    if (req.query.format === 'pdf') {
      const body = rows.map((row) => Object.values(row).join(' | ')).join('\n');
      return res.type('application/pdf').send(Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${body.length} >>\nstream\n${body}\nendstream\nendobj\n%%EOF`));
    }
    return res.type('text/csv').attachment(`${report}.csv`).send(csv(rows));
  } catch (error) { return next(error); }
});

const platformAdmin = requireRole('super_admin');
app.get('/api/v1/platform/hotels', requireAuth, platformAdmin, async (_req, res, next) => { try { return res.json({ hotels: await Hotel.findAll({ attributes: ['id', 'name', 'slug', 'status', 'subscriptionPlan', 'subscriptionStatus', 'createdAt'], order: [['createdAt', 'DESC']] }) }); } catch (error) { return next(error); } });
app.patch('/api/v1/platform/hotels/:hotelId', requireAuth, platformAdmin, async (req, res, next) => {
  try { const input = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'ONBOARDING']), subscriptionPlan: z.string().trim().max(80).nullable().optional(), subscriptionStatus: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED']).optional() }).strict().parse(req.body); const hotel = await Hotel.findByPk(String(req.params.hotelId)); if (!hotel) return res.status(404).json({ error: { message: 'Hotel not found', status: 404 } }); await hotel.update(input); return res.json({ hotel }); } catch (error) { return next(error); }
});
app.get('/api/v1/platform/analytics', requireAuth, platformAdmin, async (_req, res, next) => {
  try { return res.json({ hotels: await Hotel.count(), activeHotels: await Hotel.count({ where: { status: 'ACTIVE' } }), orders: await Order.count(), revenueCents: (await Order.sum('totalCents', { where: { status: { [Op.notIn]: ['CANCELLED', 'FAILED'] } } })) || 0, reviews: await Review.count() }); } catch (error) { return next(error); }
});

const serviceRequestInput = z.object({ category: z.enum(SERVICE_REQUEST_CATEGORIES), description: z.string().trim().min(1).max(1000), roomOrTable: z.string().trim().min(1).max(200), photoUrl: z.string().url().max(2048).nullable().optional(), phone: z.string().trim().min(7).max(32).optional() }).strict();
const serviceUpdateInput = z.object({ status: z.enum(SERVICE_REQUEST_STATUSES), rejectionReason: z.string().trim().max(500).nullable().optional(), staffNotes: z.string().trim().max(1000).nullable().optional(), proofUrl: z.string().url().max(2048).nullable().optional(), phone: z.string().trim().min(7).max(32).optional() }).strict();
export const SERVICE_REQUEST_TRANSITIONS: Record<ServiceRequestStatus, readonly ServiceRequestStatus[]> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'], ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'], COMPLETED: [], REJECTED: [], CANCELLED: []
};
function serviceStatusDates(status: ServiceRequestStatus): Record<string, Date> {
  const now = new Date();
  return status === 'ACCEPTED' ? { acceptedAt: now } : status === 'IN_PROGRESS' ? { startedAt: now } : status === 'COMPLETED' ? { completedAt: now } : {};
}

app.post('/api/v1/guest/service-requests', requireGuestSession, async (req, res, next) => {
  try {
    const input = serviceRequestInput.parse(req.body);
    const { phone: _phone, ...requestInput } = input;
    const request = await ServiceRequest.create({ ...requestInput, hotelId: req.guest!.hotelId, qrPublicId: req.guest!.qrId, photoUrl: input.photoUrl ?? null, status: 'PENDING' });
    emitServiceEvent(kitchenIo, 'service-request-created', { hotelId: request.hotelId, requestId: request.id, status: request.status, category: request.category, roomOrTable: request.roomOrTable });
    if (typeof req.body?.phone === 'string' && req.body.phone.trim()) void sendNotification({ type: 'SERVICE_REQUEST_RECEIVED', hotelId: request.hotelId, phone: req.body.phone.trim(), variables: { category: request.category } });
    return res.status(201).json({ request });
  } catch (error) { return next(error); }
});
app.get('/api/v1/guest/service-requests', requireGuestSession, async (req, res, next) => {
  try { return res.json({ requests: await ServiceRequest.findAll({ where: { hotelId: req.guest!.hotelId, qrPublicId: req.guest!.qrId }, order: [['createdAt', 'DESC']] }) }); }
  catch (error) { return next(error); }
});
app.post('/api/v1/guest/service-requests/:requestId/rating', requireGuestSession, async (req, res, next) => {
  try {
    const input = z.object({ rating: z.number().int().min(1).max(5) }).strict().parse(req.body);
    const request = await ServiceRequest.findOne({ where: { id: String(req.params.requestId), hotelId: req.guest!.hotelId, qrPublicId: req.guest!.qrId, status: 'COMPLETED' } });
    if (!request) return res.status(404).json({ error: { message: 'Completed service request not found', status: 404 } });
    await request.update({ rating: input.rating });
    return res.json({ request });
  } catch (error) { return next(error); }
});

app.get('/api/v1/hotels/:hotelId/service-requests', requireAuth, requireTenant, requireRole('owner', 'admin', 'hotel_admin', 'super_admin', 'staff'), async (req, res, next) => {
  try { return res.json({ requests: await ServiceRequest.findAll({ where: { hotelId: req.tenantId! }, order: [['createdAt', 'ASC']] }) }); }
  catch (error) { return next(error); }
});
app.patch('/api/v1/hotels/:hotelId/service-requests/:requestId', requireAuth, requireTenant, requireRole('owner', 'admin', 'hotel_admin', 'super_admin', 'staff'), async (req, res, next) => {
  try {
    const input = serviceUpdateInput.parse(req.body);
    const request = await ServiceRequest.findOne({ where: { id: String(req.params.requestId), hotelId: req.tenantId! } });
    if (!request) return res.status(404).json({ error: { message: 'Service request not found', status: 404 } });
    if (!SERVICE_REQUEST_TRANSITIONS[request.status].includes(input.status)) return res.status(409).json({ error: { message: 'Invalid service request transition', status: 409 } });
    if (input.status === 'REJECTED' && !input.rejectionReason) return res.status(400).json({ error: { message: 'Rejection reason is required', status: 400 } });
    const { phone: _phone, ...serviceUpdate } = input;
    await request.update({ ...serviceUpdate, staffUserId: req.auth!.sub, ...serviceStatusDates(input.status) });
    if (input.status === 'COMPLETED' && typeof req.body?.phone === 'string' && req.body.phone.trim()) void sendNotification({ type: 'SERVICE_COMPLETED', hotelId: request.hotelId, phone: req.body.phone.trim(), variables: { category: request.category } });
    emitServiceEvent(kitchenIo, 'service-request-updated', { hotelId: request.hotelId, requestId: request.id, status: request.status, category: request.category, roomOrTable: request.roomOrTable });
    return res.json({ request });
  } catch (error) { return next(error); }
});

app.post('/api/v1/guest/orders', requireGuestSession, async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const input = orderInput.parse(req.body);
    const ids = input.items.map((item) => item.menuItemId);
    const menuItems = await MenuItem.findAll({ where: { id: ids, hotelId: req.guest!.hotelId, active: true }, transaction });
    const byId = new Map(menuItems.map((item) => [item.id, item]));
    if (menuItems.length !== new Set(ids).size) { await transaction.rollback(); return res.status(400).json({ error: { message: 'Invalid menu items', status: 400 } }); }
    const totals = calculateOrderTotals(input.items.map((item) => ({ priceCents: byId.get(item.menuItemId)!.priceCents, gstRateBps: byId.get(item.menuItemId)!.gstRateBps, quantity: item.quantity })));
    const { subtotalCents, gstCents, discountCents, totalCents } = totals;
    const hotel = await Hotel.findByPk(req.guest!.hotelId, { attributes: ['currency', 'gstNumber'], transaction });
    if (!hotel) { await transaction.rollback(); return res.status(404).json({ error: { message: 'Hotel not found', status: 404 } }); }
    const order = await Order.create({ orderNumber: `GQ-${crypto.randomBytes(9).toString('hex').toUpperCase()}`, hotelId: req.guest!.hotelId, qrPublicId: req.guest!.qrId, sessionId: req.guest!.sub, status: 'PENDING_PAYMENT', subtotalCents, gstCents, discountCents, totalCents, guestName: input.guestName, guestPhone: input.guestPhone, deliveryLocation: input.deliveryLocation, paymentMethod: input.paymentMethod, guestNote: input.guestNote ?? null }, { transaction });
    await OrderItem.bulkCreate(input.items.map((item) => ({ orderId: order.id, menuItemId: item.menuItemId, nameSnapshot: byId.get(item.menuItemId)!.name, unitPriceCents: byId.get(item.menuItemId)!.priceCents, gstRateBps: byId.get(item.menuItemId)!.gstRateBps, quantity: item.quantity, customizations: item.customizations ?? null, specialInstructions: item.specialInstructions ?? null })), { transaction });
    const invoice = await Invoice.create({ hotelId: order.hotelId, orderId: order.id, invoiceNumber: invoiceNumber(order.orderNumber), currency: hotel.currency, subtotalCents, gstCents, discountCents, adjustmentCents: 0, totalCents, paidCents: 0, status: 'UNPAID', gstDetails: hotel.gstNumber ? { gstNumber: hotel.gstNumber, rateBasisPoints: input.items.map((item) => byId.get(item.menuItemId)!.gstRateBps) } : null, lineItems: input.items.map((item) => ({ name: byId.get(item.menuItemId)!.name, quantity: item.quantity, unitPriceCents: byId.get(item.menuItemId)!.priceCents, gstRateBps: byId.get(item.menuItemId)!.gstRateBps })) }, { transaction });
    await StatusHistory.create({ orderId: order.id, fromStatus: null, toStatus: 'PENDING_PAYMENT', actorUserId: null, note: 'Guest order created' }, { transaction });
    await transaction.commit();
    emitKitchenEvent(kitchenIo, 'order-created', {
      hotelId: order.hotelId,
      orderNumber: order.orderNumber,
      roomOrTable: input.deliveryLocation,
      priority: input.guestNote?.toLowerCase().includes('urgent') ? 'HIGH' : 'NORMAL',
      items: input.items.map((item) => ({
        name: byId.get(item.menuItemId)!.name,
        quantity: item.quantity,
        customizations: item.customizations ?? null,
        specialInstructions: item.specialInstructions ?? null
      }))
    });
    if (input.guestPhone) void sendNotification({ type: 'ORDER_RECEIVED', hotelId: order.hotelId, phone: input.guestPhone, variables: { orderNumber: order.orderNumber, total: totalCents / 100 } });
    return res.status(201).json({ order: { orderNumber: order.orderNumber, status: order.status, subtotalCents, gstCents, discountCents, totalCents, invoiceNumber: invoice.invoiceNumber } });
  } catch (error) { await transaction.rollback(); return next(error); }
});

const idempotencyInput = z.string().trim().min(16).max(120);
const paymentOrderInput = z.object({ orderNumber: z.string().trim().min(3).max(24), idempotencyKey: idempotencyInput }).strict();
const paymentVerifyInput = z.object({ razorpayOrderId: z.string().trim().min(1).max(80), razorpayPaymentId: z.string().trim().min(1).max(80), razorpaySignature: z.string().trim().min(1).max(256), idempotencyKey: idempotencyInput }).strict();

app.post('/api/v1/guest/payments/order', requireGuestSession, async (req, res, next) => {
  try {
    if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) return res.status(503).json({ error: { message: 'Online payments are not configured', status: 503 } });
    const input = paymentOrderInput.parse(req.body);
    const order = await Order.findOne({ where: { orderNumber: input.orderNumber, hotelId: req.guest!.hotelId, qrPublicId: req.guest!.qrId, paymentMethod: 'ONLINE' } });
    if (!order) return res.status(404).json({ error: { message: 'Online order not found', status: 404 } });
    const invoice = await Invoice.findOne({ where: { orderId: order.id, hotelId: req.guest!.hotelId } });
    if (!invoice) return res.status(404).json({ error: { message: 'Invoice not found', status: 404 } });
    const existing = await Payment.findOne({ where: { hotelId: order.hotelId, idempotencyKey: input.idempotencyKey } });
    if (existing) return res.json({ payment: existing });
    const gatewayOrder = await createRazorpayOrder(order.totalCents, invoice.currency, order.orderNumber);
    const payment = await Payment.create({ hotelId: order.hotelId, orderId: order.id, invoiceId: invoice.id, amountCents: order.totalCents, currency: invoice.currency, status: 'CREATED', gatewayOrderId: gatewayOrder.id, gatewayPaymentId: null, paymentMethod: null, idempotencyKey: input.idempotencyKey, webhookEventId: null, refundedAmountCents: 0, refundIdempotencyKey: null, failureReason: null });
    return res.status(201).json({ payment: { id: payment.id, gatewayOrderId: gatewayOrder.id, amountCents: payment.amountCents, currency: payment.currency, status: payment.status, keyId: config.RAZORPAY_KEY_ID } });
  } catch (error) { return next(error); }
});

async function markPaymentCaptured(payment: Payment, gatewayPaymentId: string, paymentMethod: string | null, transaction: import('sequelize').Transaction) {
  if (payment.status === 'CAPTURED') return;
  if (!['CREATED', 'AUTHORIZED'].includes(payment.status)) throw Object.assign(new Error('Payment cannot be captured from its current state'), { status: 409 });
  await payment.update({ status: 'CAPTURED', gatewayPaymentId, paymentMethod }, { transaction });
  const order = await Order.findByPk(payment.orderId, { transaction, lock: transaction.LOCK.UPDATE });
  const invoice = payment.invoiceId ? await Invoice.findByPk(payment.invoiceId, { transaction, lock: transaction.LOCK.UPDATE }) : null;
  if (!order || !invoice || order.status !== 'PENDING_PAYMENT' || payment.amountCents !== order.totalCents || invoice.paidCents + payment.amountCents > invoice.totalCents) throw Object.assign(new Error('Payment amount or order association is invalid'), { status: 409 });
  await order.update({ status: 'CONFIRMED' }, { transaction });
  await StatusHistory.create({ orderId: order.id, fromStatus: 'PENDING_PAYMENT', toStatus: 'CONFIRMED', actorUserId: null, note: 'Razorpay payment captured' }, { transaction });
  const paidCents = Math.min(invoice.totalCents, invoice.paidCents + payment.amountCents - payment.refundedAmountCents);
  await invoice.update({ paidCents, status: invoiceStatus(invoice.totalCents, paidCents) }, { transaction });
  if (order.guestPhone) void sendNotification({ type: 'PAYMENT_CONFIRMATION', hotelId: order.hotelId, phone: order.guestPhone, variables: { orderNumber: order.orderNumber, amount: payment.amountCents / 100 } });
}

app.post('/api/v1/guest/payments/verify', requireGuestSession, async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    if (!config.RAZORPAY_KEY_SECRET) { await transaction.rollback(); return res.status(503).json({ error: { message: 'Online payments are not configured', status: 503 } }); }
    const input = paymentVerifyInput.parse(req.body);
    const payment = await Payment.findOne({ where: { gatewayOrderId: input.razorpayOrderId, hotelId: req.guest!.hotelId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!payment) { await transaction.rollback(); return res.status(404).json({ error: { message: 'Payment not found', status: 404 } }); }
    const order = await Order.findOne({ where: { id: payment.orderId, hotelId: req.guest!.hotelId, qrPublicId: req.guest!.qrId }, transaction });
    if (!order || !verifyRazorpaySignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)) { await transaction.rollback(); return res.status(400).json({ error: { message: 'Invalid payment signature', status: 400 } }); }
    if (payment.status === 'CAPTURED') { await transaction.rollback(); return res.json({ payment: { status: payment.status }, order: { orderNumber: order.orderNumber, status: order.status } }); }
    await markPaymentCaptured(payment, input.razorpayPaymentId, null, transaction);
    await transaction.commit();
    return res.json({ payment: { status: 'CAPTURED' }, order: { orderNumber: order.orderNumber, status: 'CONFIRMED' } });
  } catch (error) { await transaction.rollback(); return next(error); }
});

app.post('/api/v1/payments/razorpay/webhook', async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    if (!config.RAZORPAY_WEBHOOK_SECRET || !req.rawBody || !verifyRazorpayWebhook(req.rawBody, req.header('x-razorpay-signature') ?? '')) { await transaction.rollback(); return res.status(400).json({ error: { message: 'Invalid webhook signature', status: 400 } }); }
    const payload = z.object({ event: z.string(), account_id: z.string().optional(), payload: z.record(z.unknown()) }).passthrough().parse(req.body);
    const entity = ((payload.payload as { payment?: { entity?: Record<string, unknown> } }).payment)?.entity;
    const gatewayOrderId = typeof entity?.order_id === 'string' ? entity.order_id : null;
    const gatewayPaymentId = typeof entity?.id === 'string' ? entity.id : null;
    const payment = gatewayOrderId ? await Payment.findOne({ where: { gatewayOrderId }, transaction, lock: transaction.LOCK.UPDATE }) : null;
    if (!payment) { await transaction.rollback(); return res.status(404).json({ error: { message: 'Payment not found', status: 404 } }); }
    const eventId = req.header('x-razorpay-event-id') ?? gatewayPaymentId;
    if (isDuplicateWebhook(payment.webhookEventId, payment.gatewayPaymentId, eventId, gatewayPaymentId)) { await transaction.commit(); return res.json({ received: true, duplicate: true }); }
    if (payload.event === 'payment.captured' && gatewayPaymentId) {
      await markPaymentCaptured(payment, gatewayPaymentId, typeof entity?.method === 'string' ? entity.method : null, transaction);
      await payment.update({ webhookEventId: eventId }, { transaction });
    } else if (payload.event === 'payment.failed') {
      await payment.update({ status: 'FAILED', gatewayPaymentId, failureReason: typeof entity?.error_description === 'string' ? entity.error_description : 'Payment failed', webhookEventId: eventId }, { transaction });
    }
    await transaction.commit();
    return res.json({ received: true });
  } catch (error) { await transaction.rollback(); return next(error); }
});

app.get('/api/v1/guest/billing', requireGuestSession, async (req, res, next) => {
  try {
    const invoices = await Invoice.findAll({ where: { hotelId: req.guest!.hotelId }, include: [{ model: Order, where: { qrPublicId: req.guest!.qrId, sessionId: req.guest!.sub }, attributes: ['orderNumber', 'deliveryLocation'] }], order: [['createdAt', 'DESC']] });
    const payments = await Payment.findAll({ where: { hotelId: req.guest!.hotelId }, include: [{ model: Order, where: { qrPublicId: req.guest!.qrId, sessionId: req.guest!.sub }, attributes: [] }], order: [['createdAt', 'DESC']] });
    return res.json({ invoices, payments, outstandingCents: invoices.reduce((sum, invoice) => sum + invoice.totalCents - invoice.paidCents, 0) });
  } catch (error) { return next(error); }
});

app.get('/api/v1/guest/invoices/:invoiceNumber/pdf', requireGuestSession, async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ where: { hotelId: req.guest!.hotelId, invoiceNumber: String(req.params.invoiceNumber) }, include: [{ model: Order, where: { qrPublicId: req.guest!.qrId, sessionId: req.guest!.sub }, attributes: [] }] });
    if (!invoice) return res.status(404).json({ error: { message: 'Invoice not found', status: 404 } });
    res.type('application/pdf').set('content-disposition', `inline; filename="${invoice.invoiceNumber}.pdf"`).send(renderInvoicePdf(invoice));
  } catch (error) { return next(error); }
});

app.post('/api/v1/hotels/:hotelId/payments/:paymentId/refund', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) { await transaction.rollback(); return res.status(503).json({ error: { message: 'Online payments are not configured', status: 503 } }); }
    const input = z.object({ amountCents: z.number().int().positive().optional(), idempotencyKey: idempotencyInput }).strict().parse(req.body);
    const payment = await Payment.findOne({ where: { id: String(req.params.paymentId), hotelId: req.tenantId! }, transaction, lock: transaction.LOCK.UPDATE });
    if (!payment || !payment.gatewayPaymentId) { await transaction.rollback(); return res.status(404).json({ error: { message: 'Captured payment not found', status: 404 } }); }
    if (payment.refundIdempotencyKey === input.idempotencyKey) { await transaction.commit(); return res.json({ payment: { id: payment.id, status: payment.status, refundedAmountCents: payment.refundedAmountCents } }); }
    let amount: number;
    try { amount = refundableAmount(payment.amountCents, payment.refundedAmountCents, input.amountCents); } catch { await transaction.rollback(); return res.status(400).json({ error: { message: 'Invalid refund amount', status: 400 } }); }
    await createRazorpayRefund(payment.gatewayPaymentId, amount);
    const refundedAmountCents = payment.refundedAmountCents + amount;
    await payment.update({ refundedAmountCents, refundIdempotencyKey: input.idempotencyKey, status: refundedAmountCents === payment.amountCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED' }, { transaction });
    if (payment.invoiceId) { const invoice = await Invoice.findByPk(payment.invoiceId, { transaction, lock: transaction.LOCK.UPDATE }); if (invoice) { const paidCents = Math.max(0, invoice.paidCents - amount); await invoice.update({ paidCents, status: invoiceStatus(invoice.totalCents, paidCents, refundedAmountCents === payment.amountCents) }, { transaction }); } }
    await transaction.commit();
    return res.json({ payment: { id: payment.id, status: payment.status, refundedAmountCents } });
  } catch (error) { await transaction.rollback(); return next(error); }
});

app.get('/api/v1/hotels/:hotelId/orders', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const orders = await Order.findAll({ where: { hotelId: String(req.params.hotelId) }, include: [OrderItem, StatusHistory], order: [['createdAt', 'DESC']] });
    return res.json({ orders });
  } catch (error) { return next(error); }
});

app.post('/api/v1/hotels/:hotelId/orders/:orderNumber/status', requireAuth, requireTenant, requireRole('owner', 'admin', 'hotel_admin', 'super_admin', 'staff'), async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const target = z.object({ status: z.enum(ORDER_STATUSES), note: z.string().max(300).optional() }).strict().parse(req.body);
    const order = await Order.findOne({ where: { hotelId: String(req.params.hotelId), orderNumber: String(req.params.orderNumber) }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order) { await transaction.rollback(); return res.status(404).json({ error: { message: 'Order not found', status: 404 } }); }
    if (!canKitchenTransition(req.auth!.role, order.status, target.status)) { await transaction.rollback(); return res.status(409).json({ error: { message: 'Invalid kitchen order status transition', status: 409 } }); }
    const old = order.status; await order.update({ status: target.status }, { transaction });
    await StatusHistory.create({ orderId: order.id, fromStatus: old, toStatus: target.status, actorUserId: req.auth!.sub, note: target.note ?? null }, { transaction });
    await transaction.commit();
    if (order.guestPhone) void sendNotification({ type: target.status === 'CONFIRMED' ? 'ORDER_CONFIRMED' : target.status === 'PREPARING' ? 'ORDER_PREPARING' : target.status === 'READY' ? 'ORDER_READY' : target.status === 'DELIVERED' ? 'ORDER_DELIVERED' : 'CHECKOUT', hotelId: order.hotelId, phone: order.guestPhone, variables: { orderNumber: order.orderNumber } });
    emitKitchenEvent(kitchenIo, 'order-status-updated', { hotelId: order.hotelId, orderNumber: order.orderNumber, status: order.status });
    return res.json({ order: { orderNumber: order.orderNumber, status: order.status } });
  } catch (error) { await transaction.rollback(); return next(error); }
});

const translationsInput = z.record(z.string().min(1).max(5000)).refine((value) => Boolean(value.en), 'English translation is required');
const contentInput = z.object({ type: z.enum(CONTENT_TYPES), slug: z.string().trim().regex(/^[a-z0-9-]{2,100}$/), translations: translationsInput, active: z.boolean().optional(), sortOrder: z.number().int().min(0).max(10000).optional() }).strict();
const guideInput = z.object({ type: z.enum(GUIDE_TYPES), slug: z.string().trim().regex(/^[a-z0-9-]{2,100}$/), translations: translationsInput, location: z.record(z.unknown()).nullable().optional(), active: z.boolean().optional(), sortOrder: z.number().int().min(0).max(10000).optional() }).strict();
const locale = (value: unknown): string => typeof value === 'string' && /^[a-z]{2,10}$/i.test(value) ? value.toLowerCase() : 'en';
function localized(translations: object, requested: string): object {
  const values = translations as Record<string, string>;
  return { text: values[requested] ?? values.en, availableLanguages: Object.keys(values) };
}

app.get('/api/v1/hotels/:hotelId/content', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { return res.json({ content: await HotelContent.findAll({ where: { hotelId: req.tenantId! }, order: [['sortOrder', 'ASC'], ['type', 'ASC']] }) }); } catch (error) { return next(error); }
});
app.post('/api/v1/hotels/:hotelId/content', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { const input = contentInput.parse(req.body); const content = await HotelContent.create({ ...input, hotelId: req.tenantId!, active: input.active ?? true, sortOrder: input.sortOrder ?? 0 }); await audit(req.tenantId!, req.auth!.sub, 'CONTENT_CREATED', 'hotel_content', content.id); return res.status(201).json({ content }); } catch (error) { return next(error); }
});
app.patch('/api/v1/hotels/:hotelId/content/:contentId', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { const input = contentInput.partial().parse(req.body); const content = await HotelContent.findOne({ where: { id: String(req.params.contentId), hotelId: req.tenantId! } }); if (!content) return res.status(404).json({ error: { message: 'Content not found', status: 404 } }); await content.update(input); return res.json({ content }); } catch (error) { return next(error); }
});
app.delete('/api/v1/hotels/:hotelId/content/:contentId', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { const deleted = await HotelContent.destroy({ where: { id: String(req.params.contentId), hotelId: req.tenantId! } }); return deleted ? res.status(204).send() : res.status(404).json({ error: { message: 'Content not found', status: 404 } }); } catch (error) { return next(error); }
});
app.get('/api/v1/guest/content', requireGuestSession, async (req, res, next) => {
  try { const language = locale(req.query.language); const content = await HotelContent.findAll({ where: { hotelId: req.guest!.hotelId, active: true }, order: [['sortOrder', 'ASC']] }); return res.json({ language, content: content.map((item) => ({ id: item.id, type: item.type, slug: item.slug, ...localized(item.translations, language) })) }); } catch (error) { return next(error); }
});

app.get('/api/v1/hotels/:hotelId/local-guide', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { return res.json({ items: await LocalGuideItem.findAll({ where: { hotelId: req.tenantId! }, order: [['sortOrder', 'ASC'], ['type', 'ASC']] }) }); } catch (error) { return next(error); }
});
app.post('/api/v1/hotels/:hotelId/local-guide', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { const input = guideInput.parse(req.body); const item = await LocalGuideItem.create({ ...input, hotelId: req.tenantId!, location: input.location ?? null, active: input.active ?? true, sortOrder: input.sortOrder ?? 0 }); return res.status(201).json({ item }); } catch (error) { return next(error); }
});
app.patch('/api/v1/hotels/:hotelId/local-guide/:itemId', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { const input = guideInput.partial().parse(req.body); const item = await LocalGuideItem.findOne({ where: { id: String(req.params.itemId), hotelId: req.tenantId! } }); if (!item) return res.status(404).json({ error: { message: 'Guide item not found', status: 404 } }); await item.update(input); return res.json({ item }); } catch (error) { return next(error); }
});
app.delete('/api/v1/hotels/:hotelId/local-guide/:itemId', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { const deleted = await LocalGuideItem.destroy({ where: { id: String(req.params.itemId), hotelId: req.tenantId! } }); return deleted ? res.status(204).send() : res.status(404).json({ error: { message: 'Guide item not found', status: 404 } }); } catch (error) { return next(error); }
});
app.get('/api/v1/guest/local-guide', requireGuestSession, async (req, res, next) => {
  try { const language = locale(req.query.language); const items = await LocalGuideItem.findAll({ where: { hotelId: req.guest!.hotelId, active: true }, order: [['sortOrder', 'ASC']] }); return res.json({ language, items: items.map((item) => ({ id: item.id, type: item.type, slug: item.slug, location: item.location, ...localized(item.translations, language) })) }); } catch (error) { return next(error); }
});

const wifiSettingsInput = z.object({ provider: z.enum(['CAPTIVE_PORTAL', 'GENERIC_CONTROLLER']), ssids: z.object({ guest: z.string().trim().min(1).max(64), staff: z.string().trim().min(1).max(64), premium: z.string().trim().min(1).max(64) }), bandwidth: z.object({ guestMbps: z.number().positive().max(10000), staffMbps: z.number().positive().max(10000), premiumMbps: z.number().positive().max(10000) }) }).strict();
app.put('/api/v1/hotels/:hotelId/wifi/settings', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { const input = wifiSettingsInput.parse(req.body); const hotel = await Hotel.findByPk(req.tenantId!); if (!hotel) return res.status(404).json({ error: { message: 'Hotel not found', status: 404 } }); await hotel.update({ configuration: { ...(hotel.configuration as object ?? {}), wifi: input } }); return res.json({ wifi: input }); } catch (error) { return next(error); }
});
app.get('/api/v1/hotels/:hotelId/wifi/sessions', requireAuth, requireTenant, requireRole('owner', 'admin', 'hotel_admin', 'super_admin', 'staff'), async (req, res, next) => {
  try { const provider = String((await Hotel.findByPk(req.tenantId!, { attributes: ['configuration'] }))?.configuration && ((await Hotel.findByPk(req.tenantId!, { attributes: ['configuration'] }))!.configuration as { wifi?: { provider?: WifiProviderName } }).wifi?.provider) as WifiProviderName || 'CAPTIVE_PORTAL'; return res.json({ sessions: await getWifiIntegration(req.tenantId!, provider).activeSessions(req.tenantId!) }); } catch (error) { return next(error); }
});
app.post('/api/v1/guest/wifi/session', requireGuestSession, async (req, res, next) => {
  try {
    const input = z.object({ roomOrTable: z.string().trim().min(1).max(200), guestReference: z.string().trim().min(1).max(120), ssid: z.enum(['guest', 'premium']).default('guest') }).strict().parse(req.body);
    const integration = getWifiIntegration(req.guest!.hotelId);
    if (!(await integration.verifyRoom(req.guest!.hotelId, input.roomOrTable, input.guestReference)) || !(await integration.verifyGuest(req.guest!.hotelId, input.guestReference))) return res.status(403).json({ error: { message: 'WiFi verification failed', status: 403 } });
    const session = await integration.createSession({ externalSessionId: crypto.randomUUID(), hotelId: req.guest!.hotelId, guestId: req.guest!.sub, ssid: input.ssid, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), metadata: { roomOrTable: input.roomOrTable } });
    return res.status(201).json({ session });
  } catch (error) { return next(error); }
});

const uploadInput = z.object({ category: z.enum(['image', 'document']), mimeType: z.string().trim().max(100), sizeBytes: z.number().int().positive().max(20 * 1024 * 1024) }).strict();
app.post('/api/v1/hotels/:hotelId/uploads/sign', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { const input = uploadInput.parse(req.body); return res.status(201).json(await createUploadUrl(req.tenantId!, input.category, input.mimeType, input.sizeBytes)); } catch (error) { return next(error); }
});

const pmsMappingInput = z.object({ resourceType: z.enum(['GUEST', 'ROOM']), externalId: z.string().trim().min(1).max(160) }).strict();
app.put('/api/v1/hotels/:hotelId/pms/mappings', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try {
    const input = pmsMappingInput.parse(req.body);
    const [mapping] = await PmsResourceMapping.findOrCreate({ where: { hotelId: req.tenantId!, resourceType: input.resourceType, externalId: input.externalId }, defaults: { hotelId: req.tenantId!, resourceType: input.resourceType, externalId: input.externalId } });
    return res.status(201).json({ mapping: { id: mapping.id, resourceType: mapping.resourceType, externalId: mapping.externalId } });
  } catch (error) { return next(error); }
});
async function requirePmsMapping(hotelId: string, resourceType: 'GUEST' | 'ROOM', externalId: string): Promise<void> {
  const mapping = await PmsResourceMapping.findOne({ where: { hotelId, resourceType, externalId }, attributes: ['id'] });
  if (!mapping) throw Object.assign(new Error('PMS resource is not mapped to this hotel'), { status: 404 });
}
app.get('/api/v1/hotels/:hotelId/pms/guest/:guestId', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { const id = String(req.params.guestId); await requirePmsMapping(req.tenantId!, 'GUEST', id); return res.json({ guest: await pmsIntegration.getGuest(id) }); } catch (error) { return next(error); }
});
app.get('/api/v1/hotels/:hotelId/pms/room/:roomId', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { const id = String(req.params.roomId); await requirePmsMapping(req.tenantId!, 'ROOM', id); return res.json({ room: await pmsIntegration.getRoom(id) }); } catch (error) { return next(error); }
});
app.post('/api/v1/hotels/:hotelId/pms/check-in', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { const input = z.object({ guestId: z.string().min(1), roomId: z.string().min(1) }).strict().parse(req.body); await requirePmsMapping(req.tenantId!, 'GUEST', input.guestId); await requirePmsMapping(req.tenantId!, 'ROOM', input.roomId); await pmsIntegration.checkIn(input.guestId, input.roomId); return res.status(202).json({ accepted: true }); } catch (error) { return next(error); }
});
app.post('/api/v1/hotels/:hotelId/pms/check-out', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { const input = z.object({ guestId: z.string().min(1), roomId: z.string().min(1) }).strict().parse(req.body); await requirePmsMapping(req.tenantId!, 'GUEST', input.guestId); await requirePmsMapping(req.tenantId!, 'ROOM', input.roomId); await pmsIntegration.checkOut(input.guestId, input.roomId); return res.status(202).json({ accepted: true }); } catch (error) { return next(error); }
});
app.post('/api/v1/hotels/:hotelId/pms/room-charge', requireAuth, requireTenant, hotelAdmin, async (req, res, next) => {
  try { const input = z.object({ guestId: z.string().min(1), roomId: z.string().min(1), amountCents: z.number().int().positive(), reference: z.string().min(1).max(120) }).strict().parse(req.body); await requirePmsMapping(req.tenantId!, 'GUEST', input.guestId); await requirePmsMapping(req.tenantId!, 'ROOM', input.roomId); await pmsIntegration.postRoomCharge(input.guestId, input.roomId, input.amountCents, input.reference); return res.status(202).json({ accepted: true }); } catch (error) { return next(error); }
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = error instanceof z.ZodError ? 400 : Number(error?.status) || 500;
  if (status >= 500) captureException(error);
  logger.warn({ message: 'request.error', status, error: status >= 500 ? 'internal' : error.message });
  res.status(status).json({ error: {
    message: status >= 500 ? 'Internal server error' : status === 400 ? 'Invalid request' : error.message,
    status
  } });
};
app.use(errorHandler);
