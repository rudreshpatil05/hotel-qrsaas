import { config } from './config.js';

export type NotificationType = 'ORDER_RECEIVED' | 'ORDER_CONFIRMED' | 'ORDER_PREPARING' | 'ORDER_READY' | 'ORDER_DELIVERED' | 'SERVICE_REQUEST_RECEIVED' | 'SERVICE_COMPLETED' | 'PAYMENT_CONFIRMATION' | 'CHECKOUT' | 'FEEDBACK_REQUEST';
export type NotificationMessage = { type: NotificationType; hotelId: string; phone: string; variables: Record<string, string | number> };

export interface NotificationProvider {
  send(message: NotificationMessage): Promise<{ providerMessageId?: string }>;
}

export class InteraktProvider implements NotificationProvider {
  async send(message: NotificationMessage): Promise<{ providerMessageId?: string }> {
    if (!config.INTERAKT_API_KEY || !config.INTERAKT_BASE_URL) throw new Error('Interakt is not configured');
    const response = await fetch(`${config.INTERAKT_BASE_URL}/v1/public/message/`, {
      method: 'POST',
      headers: { authorization: `Basic ${config.INTERAKT_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ countryCode: '+91', phoneNumber: message.phone, type: 'Template', template: { name: message.type.toLowerCase(), languageCode: 'en', bodyValues: Object.values(message.variables).map(String) } })
    });
    if (!response.ok) throw Object.assign(new Error(`Interakt request failed: ${response.status}`), { status: 502 });
    const result = await response.json() as { id?: string; messageId?: string };
    return { providerMessageId: result.id ?? result.messageId };
  }
}

export class NoopNotificationProvider implements NotificationProvider {
  async send(_message: NotificationMessage): Promise<{ providerMessageId?: string }> { return {}; }
}

export const notificationProvider: NotificationProvider = config.INTERAKT_API_KEY ? new InteraktProvider() : new NoopNotificationProvider();
export async function sendNotification(message: NotificationMessage): Promise<void> {
  try { await notificationProvider.send(message); } catch (error) { console.error('Notification delivery failed', error); }
}
