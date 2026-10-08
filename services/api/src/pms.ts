import { config } from './config.js';

export type PmsGuest = { externalId: string; name: string; phone?: string; email?: string };
export type PmsRoom = { externalId: string; roomNumber: string; status: string };

export interface PmsIntegration {
  getGuest(externalId: string): Promise<PmsGuest>;
  getRoom(externalId: string): Promise<PmsRoom>;
  checkIn(guestId: string, roomId: string): Promise<void>;
  checkOut(guestId: string, roomId: string): Promise<void>;
  postRoomCharge(guestId: string, roomId: string, amountCents: number, reference: string): Promise<void>;
  syncBilling(guestId: string, invoice: object): Promise<void>;
}

export class UnconfiguredPmsIntegration implements PmsIntegration {
  private unavailable(): never { throw Object.assign(new Error('PMS integration is not configured'), { status: 503 }); }
  getGuest(_id: string): Promise<PmsGuest> { return Promise.reject(this.unavailable()); }
  getRoom(_id: string): Promise<PmsRoom> { return Promise.reject(this.unavailable()); }
  checkIn(_guestId: string, _roomId: string): Promise<void> { return Promise.reject(this.unavailable()); }
  checkOut(_guestId: string, _roomId: string): Promise<void> { return Promise.reject(this.unavailable()); }
  postRoomCharge(_guestId: string, _roomId: string, _amountCents: number, _reference: string): Promise<void> { return Promise.reject(this.unavailable()); }
  syncBilling(_guestId: string, _invoice: object): Promise<void> { return Promise.reject(this.unavailable()); }
}

export class HttpPmsIntegration extends UnconfiguredPmsIntegration {
  constructor(private readonly baseUrl: string, private readonly apiKey: string) { super(); }
  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json', ...(init.headers ?? {}) }
    });
    if (!response.ok) throw Object.assign(new Error(`PMS request failed: ${response.status}`), { status: 502 });
    return response.json();
  }
  async getGuest(id: string): Promise<PmsGuest> { return await this.request(`/guests/${encodeURIComponent(id)}`) as PmsGuest; }
  async getRoom(id: string): Promise<PmsRoom> { return await this.request(`/rooms/${encodeURIComponent(id)}`) as PmsRoom; }
  async checkIn(guestId: string, roomId: string): Promise<void> { await this.request('/check-ins', { method: 'POST', body: JSON.stringify({ guestId, roomId }) }); }
  async checkOut(guestId: string, roomId: string): Promise<void> { await this.request('/check-outs', { method: 'POST', body: JSON.stringify({ guestId, roomId }) }); }
  async postRoomCharge(guestId: string, roomId: string, amountCents: number, reference: string): Promise<void> { await this.request('/room-charges', { method: 'POST', body: JSON.stringify({ guestId, roomId, amountCents, reference }) }); }
  async syncBilling(guestId: string, invoice: object): Promise<void> { await this.request('/billing/sync', { method: 'POST', body: JSON.stringify({ guestId, invoice }) }); }
}

export const pmsIntegration: PmsIntegration = config.PMS_PROVIDER && config.PMS_BASE_URL && config.PMS_API_KEY
  ? new HttpPmsIntegration(config.PMS_BASE_URL, config.PMS_API_KEY)
  : new UnconfiguredPmsIntegration();
