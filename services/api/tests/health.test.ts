import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-123';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-123';
process.env.JWT_GUEST_SECRET = 'test-guest-secret-that-is-long-enough-123';
process.env.DATABASE_URL = 'postgres://localhost:5432/guestqr';
process.env.NODE_ENV = 'test';
process.env.RAZORPAY_KEY_SECRET = 'razorpay-test-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'razorpay-webhook-test-secret';

const { app, VALID_ORDER_TRANSITIONS, canKitchenTransition, calculateOrderTotals, SERVICE_REQUEST_TRANSITIONS } = await import('../src/app.js');
const { issueTokens, issueGuestSession, verifyGuestSession, verifyAccess, createQrToken, decryptQrToken, encryptQrToken, tokenIssuedBefore } = await import('../src/auth.js');
const jwt = (await import('jsonwebtoken')).default;
const { canConnectToKitchen, emitKitchenEvent } = await import('../src/socket.js');
const { getWifiIntegration } = await import('../src/wifi.js');
const { NoopNotificationProvider } = await import('../src/notifications.js');
const { UnconfiguredPmsIntegration } = await import('../src/pms.js');
const { ALLOWED_UPLOADS } = await import('../src/storage.js');
const { verifyRazorpaySignature, verifyRazorpayWebhook, isDuplicateWebhook, refundableAmount } = await import('../src/payments.js');
const { invoiceStatus, invoiceNumber, renderInvoicePdf } = await import('../src/billing.js');

function auth(token: string): { authorization: string } {
  return { authorization: 'Bearer ' + token };
}

async function withServer<T>(run: (base: string) => Promise<T>): Promise<T> {
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
    return await run('http://127.0.0.1:' + address.port);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('health endpoint reports service status without a database connection', async () => {
  await withServer(async (base) => {
    const response = await fetch(base + '/health');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', service: 'guestqr-api' });
  });
});

test('hotel A cannot access hotel B tenant routes', async () => {
  await withServer(async (base) => {
    const token = issueTokens({ id: 'user-1', hotelId: 'hotel-a', role: 'hotel_admin' }).accessToken;
    for (const path of ['tenant-example', 'rooms', 'staff', 'qrs', 'orders', 'audit-logs']) {
      const denied = await fetch(base + '/api/v1/hotels/hotel-b/' + path, { headers: auth(token) });
      assert.equal(denied.status, 403, 'hotel A must not access hotel B ' + path);
    }
    const allowed = await fetch(base + '/api/v1/hotels/hotel-a/tenant-example', { headers: auth(token) });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { tenantId: 'hotel-a', message: 'Tenant-scoped access granted' });
  });

});

test('hotel admins cannot access platform-wide endpoints', async () => {
  await withServer(async (base) => {
    const token = issueTokens({ id: 'user-1', hotelId: 'hotel-a', role: 'hotel_admin' }).accessToken;
    assert.equal((await fetch(base + '/api/v1/platform/hotels', { headers: auth(token) })).status, 403);
    assert.equal((await fetch(base + '/api/v1/platform/analytics', { headers: auth(token) })).status, 403);
  });
});

test('staff cannot use hotel administration endpoints', async () => {
  await withServer(async (base) => {
    const token = issueTokens({ id: 'user-2', hotelId: 'hotel-a', role: 'staff' }).accessToken;
    const response = await fetch(base + '/api/v1/hotels/hotel-a/users', { headers: auth(token) });
    assert.equal(response.status, 403);
  });
});

test('guest sessions are distinct, scoped, and reject tampering or expiry', () => {
  const token = issueGuestSession('hotel-a', 'qr-public');
  const claims = verifyGuestSession(token);
  assert.equal(claims.type, 'guest');
  assert.equal(claims.hotelId, 'hotel-a');
  assert.equal(claims.qrId, 'qr-public');
  assert.throws(() => verifyAccess(token));
  assert.throws(() => verifyGuestSession(token + 'tampered'));
  const expired = jwt.sign({ sub: 'guest:x', hotelId: 'hotel-a', qrId: 'qr-public', type: 'guest' }, process.env.JWT_GUEST_SECRET!, { expiresIn: -1 });
  assert.throws(() => verifyGuestSession(expired));
});

test('refresh invalidation helper rejects tokens issued before a password change', () => {
  const changedAt = Date.now();
  assert.equal(tokenIssuedBefore(changedAt, Math.floor((changedAt - 1000) / 1000)), true);
  assert.equal(tokenIssuedBefore(changedAt, Math.floor((changedAt + 1000) / 1000)), false);
  assert.equal(tokenIssuedBefore(null, 1), false);
});

test('QR token resolves into a hotel-scoped guest session without exposing database IDs', () => {
  const qr = createQrToken();
  assert.equal(decryptQrToken(encryptQrToken(qr.token)), qr.token);
  const session = issueGuestSession('hotel-a', qr.publicId);
  const claims = verifyGuestSession(session);
  assert.deepEqual({ hotelId: claims.hotelId, qrId: claims.qrId, type: claims.type }, { hotelId: 'hotel-a', qrId: qr.publicId, type: 'guest' });
  assert.equal('id' in claims, false);
});

test('order transition policy rejects invalid terminal and skips payment', () => {
  assert.ok(VALID_ORDER_TRANSITIONS.PENDING_PAYMENT.includes('CONFIRMED'));
  assert.ok(!VALID_ORDER_TRANSITIONS.PENDING_PAYMENT.includes('PREPARING'));
  assert.deepEqual(VALID_ORDER_TRANSITIONS.DELIVERED, ['REFUNDED']);
  assert.deepEqual(VALID_ORDER_TRANSITIONS.CANCELLED, []);
});

test('server order totals calculate GST and cap discounts without trusting client totals', () => {
  assert.deepEqual(calculateOrderTotals([
    { priceCents: 10000, gstRateBps: 1800, quantity: 2 },
    { priceCents: 5000, gstRateBps: 500, quantity: 1 }
  ], 1000), { subtotalCents: 25000, gstCents: 3850, discountCents: 1000, totalCents: 27850 });
  assert.equal(calculateOrderTotals([{ priceCents: 100, gstRateBps: 0, quantity: 1 }], 9999).totalCents, 0);
});

test('service requests enforce the controlled lifecycle', () => {
  assert.deepEqual(SERVICE_REQUEST_TRANSITIONS.PENDING, ['ACCEPTED', 'REJECTED', 'CANCELLED']);
  assert.deepEqual(SERVICE_REQUEST_TRANSITIONS.IN_PROGRESS, ['COMPLETED', 'CANCELLED']);
  assert.deepEqual(SERVICE_REQUEST_TRANSITIONS.COMPLETED, []);
});

test('guest menu requires a guest session', async () => {
  await withServer(async (base) => {
    const response = await fetch(base + '/api/v1/guest/menu');
    assert.equal(response.status, 401);
  });
});

test('kitchen roles and transitions are restricted', () => {
  assert.equal(canConnectToKitchen('staff'), true);
  assert.equal(canConnectToKitchen('guest'), false);
  assert.equal(canKitchenTransition('staff', 'ACCEPTED', 'PREPARING'), true);
  assert.equal(canKitchenTransition('staff', 'PENDING_PAYMENT', 'CONFIRMED'), false);
  assert.equal(canKitchenTransition('hotel_admin', 'PENDING_PAYMENT', 'CONFIRMED'), true);
});

test('kitchen event payload is minimal and hotel room routing is explicit', () => {
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => emitted.push({ room, event, payload }) }) } as never;
  emitKitchenEvent(io, 'order-created', { hotelId: 'hotel-a', orderNumber: 'GQ-1' });
  assert.deepEqual(emitted, [{ room: 'kitchen:hotel-a', event: 'order-created', payload: { orderNumber: 'GQ-1' } }]);
});

test('payment success verifies Razorpay signature and rejects tampering', () => {
  const orderId = 'order_test'; const paymentId = 'pay_test';
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest('hex');
  assert.equal(verifyRazorpaySignature(orderId, paymentId, signature), true);
  assert.equal(verifyRazorpaySignature(orderId, paymentId, signature.slice(0, -1) + '0'), false);
  const body = Buffer.from('{"event":"payment.captured"}');
  const webhookSignature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(body).digest('hex');
  assert.equal(verifyRazorpayWebhook(body, webhookSignature), true);
  assert.equal(verifyRazorpayWebhook(body, webhookSignature.slice(0, -1) + '0'), false);
});

test('payment failure, duplicate webhook, and refunds are idempotent and bounded', () => {
  assert.equal(isDuplicateWebhook(null, null, 'event-1', 'pay-1'), false);
  assert.equal(isDuplicateWebhook('event-1', 'pay-1', 'event-1', 'pay-1'), true);
  assert.equal(refundableAmount(10000, 2500, 5000), 5000);
  assert.throws(() => refundableAmount(10000, 10000));
  assert.equal(invoiceStatus(10000, 0), 'UNPAID');
  assert.equal(invoiceStatus(10000, 5000), 'PARTIALLY_PAID');
  assert.equal(invoiceStatus(10000, 10000), 'PAID');
  assert.equal(invoiceStatus(10000, 10000, true), 'REFUNDED');
});

test('invoice generation produces stable invoice numbers and a PDF document', () => {
  assert.equal(invoiceNumber('GQ-ABC123'), 'INV-GQ-ABC123');
  const pdf = renderInvoicePdf({ invoiceNumber: 'INV-GQ-ABC123', currency: 'INR', totalCents: 12500, paidCents: 5000, status: 'PARTIALLY_PAID' });
  assert.equal(pdf.subarray(0, 8).toString(), '%PDF-1.4');
});

test('notification and WiFi integrations are provider abstractions with tenant-scoped sessions', async () => {
  const provider = new NoopNotificationProvider();
  assert.deepEqual(await provider.send({ type: 'CHECKOUT', hotelId: 'hotel-a', phone: '9999999999', variables: {} }), {});
  const wifi = getWifiIntegration('hotel-a');
  const session = await wifi.createSession({ externalSessionId: 'session-a', hotelId: 'hotel-a', guestId: 'guest-a', ssid: 'guest', expiresAt: new Date(Date.now() + 60_000) });
  assert.equal(session.hotelId, 'hotel-a');
  assert.equal((await wifi.activeSessions('hotel-a')).length, 1);
  assert.equal((await wifi.activeSessions('hotel-b')).length, 0);
  await wifi.disconnect('hotel-a', 'session-a');
  assert.equal((await wifi.activeSessions('hotel-a')).length, 0);
});

test('PMS is unavailable without credentials and uploads enforce allowlisted types', async () => {
  assert.throws(() => new UnconfiguredPmsIntegration().getGuest('guest-1'), /PMS integration is not configured/);
  assert.deepEqual(ALLOWED_UPLOADS.image.mime, ['image/jpeg', 'image/png', 'image/webp']);
  assert.ok(ALLOWED_UPLOADS.document.maxBytes > 0);
});

test('blank optional integration environment values are treated as unset', async () => {
  const source = await import('../src/config.js');
  assert.equal(source.config.RAZORPAY_KEY_ID, undefined);
  assert.equal(source.config.REDIS_URL, undefined);
});
