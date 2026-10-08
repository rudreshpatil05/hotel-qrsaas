import crypto from 'node:crypto';
import { config } from './config.js';

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!config.RAZORPAY_KEY_SECRET || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', config.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function verifyRazorpayWebhook(rawBody: Buffer, signature: string): boolean {
  if (!config.RAZORPAY_WEBHOOK_SECRET || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function isDuplicateWebhook(storedEventId: string | null, storedPaymentId: string | null, eventId: string | null, paymentId: string | null): boolean {
  return Boolean((eventId && storedEventId === eventId) || (paymentId && storedPaymentId === paymentId));
}

export function refundableAmount(paymentAmountCents: number, refundedAmountCents: number, requestedAmountCents?: number): number {
  const remaining = paymentAmountCents - refundedAmountCents;
  const amount = requestedAmountCents ?? remaining;
  if (amount <= 0 || amount > remaining) throw new Error('Invalid refund amount');
  return amount;
}

async function razorpayRequest<T>(path: string, method: 'POST', body: object): Promise<T> {
  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) throw Object.assign(new Error('Razorpay is not configured'), { status: 503 });
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${config.RAZORPAY_KEY_ID}:${config.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw Object.assign(new Error(`Razorpay request failed: ${response.status}`), { status: 502 });
  return await response.json() as T;
}

export function createRazorpayOrder(amountCents: number, currency: string, receipt: string): Promise<{ id: string; amount: number; currency: string }> {
  return razorpayRequest('/orders', 'POST', { amount: amountCents, currency, receipt, payment_capture: 1 });
}

export function createRazorpayRefund(paymentId: string, amountCents?: number): Promise<{ id: string; amount: number; status: string }> {
  return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/refund`, 'POST', amountCents ? { amount: amountCents } : {});
}
