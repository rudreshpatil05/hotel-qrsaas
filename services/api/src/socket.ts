import { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from './config.js';
import { verifyAccess } from './auth.js';

const kitchenRoles = new Set(['owner', 'admin', 'hotel_admin', 'super_admin', 'staff']);
export type KitchenEvent = {
  orderNumber: string;
  status?: string;
  hotelId: string;
  roomOrTable?: string;
  items?: Array<{ name: string; quantity: number; customizations?: object | null; specialInstructions?: string | null }>;
  priority?: 'NORMAL' | 'HIGH';
};

export function canConnectToKitchen(role: string): boolean {
  return kitchenRoles.has(role);
}

export function createKitchenSocket(server: HttpServer): Server {
  const io = new Server(server, { cors: { origin: config.CORS_ORIGIN } });
  io.use((socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token ?? socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '');
      const claims = verifyAccess(token);
      if (claims.type !== 'access' || !canConnectToKitchen(claims.role)) return next(new Error('Kitchen authorization required'));
      socket.data.auth = claims;
      next();
    } catch { next(new Error('Invalid staff token')); }
  });
  io.on('connection', (socket) => {
    const claims = socket.data.auth as { hotelId: string };
    socket.join(`kitchen:${claims.hotelId}`);
    socket.join(`services:${claims.hotelId}`);
  });
  return io;
}

export function emitKitchenEvent(io: Server | undefined, event: 'order-created' | 'order-status-updated', payload: KitchenEvent): void {
  if (!io) return;
  io.to(`kitchen:${payload.hotelId}`).emit(event, {
    orderNumber: payload.orderNumber,
    ...(payload.status ? { status: payload.status } : {}),
    ...(payload.roomOrTable ? { roomOrTable: payload.roomOrTable } : {}),
    ...(payload.items ? { items: payload.items } : {}),
    ...(payload.priority ? { priority: payload.priority } : {})
  });
}

export function emitServiceEvent(io: Server | undefined, event: 'service-request-created' | 'service-request-updated', payload: { hotelId: string; requestId: string; status: string; category: string; roomOrTable: string }): void {
  if (!io) return;
  io.to(`services:${payload.hotelId}`).emit(event, { requestId: payload.requestId, status: payload.status, category: payload.category, roomOrTable: payload.roomOrTable });
}
