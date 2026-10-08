export type WifiProviderName = 'CAPTIVE_PORTAL' | 'GENERIC_CONTROLLER';
export type WifiSession = { externalSessionId: string; hotelId: string; guestId: string; ssid: string; startedAt: Date; expiresAt: Date; metadata?: Record<string, unknown> };

export interface WifiIntegration {
  verifyRoom(hotelId: string, roomOrTable: string, guestReference: string): Promise<boolean>;
  verifyGuest(hotelId: string, guestReference: string): Promise<boolean>;
  createSession(input: Omit<WifiSession, 'startedAt'>): Promise<WifiSession>;
  activeSessions(hotelId: string): Promise<WifiSession[]>;
  sessionHistory(hotelId: string, guestId?: string): Promise<WifiSession[]>;
  usage(hotelId: string, externalSessionId: string): Promise<{ bytesIn: number; bytesOut: number }>;
  disconnect(hotelId: string, externalSessionId: string): Promise<void>;
}

export class ConfiguredWifiIntegration implements WifiIntegration {
  private sessions = new Map<string, WifiSession>();
  constructor(private readonly provider: WifiProviderName) {}
  async verifyRoom(_hotelId: string, roomOrTable: string, _guestReference: string): Promise<boolean> { return Boolean(roomOrTable.trim()); }
  async verifyGuest(_hotelId: string, guestReference: string): Promise<boolean> { return Boolean(guestReference.trim()); }
  async createSession(input: Omit<WifiSession, 'startedAt'>): Promise<WifiSession> {
    const session = { ...input, startedAt: new Date() };
    this.sessions.set(`${input.hotelId}:${input.externalSessionId}`, session);
    return session;
  }
  async activeSessions(hotelId: string): Promise<WifiSession[]> { return [...this.sessions.values()].filter((session) => session.hotelId === hotelId && session.expiresAt > new Date()); }
  async sessionHistory(hotelId: string, guestId?: string): Promise<WifiSession[]> { return [...this.sessions.values()].filter((session) => session.hotelId === hotelId && (!guestId || session.guestId === guestId)); }
  async usage(hotelId: string, externalSessionId: string): Promise<{ bytesIn: number; bytesOut: number }> {
    if (!this.sessions.has(`${hotelId}:${externalSessionId}`)) throw Object.assign(new Error('WiFi session not found'), { status: 404 });
    return { bytesIn: 0, bytesOut: 0 };
  }
  async disconnect(hotelId: string, externalSessionId: string): Promise<void> { this.sessions.delete(`${hotelId}:${externalSessionId}`); }
  get providerName(): WifiProviderName { return this.provider; }
}

const integrations = new Map<string, ConfiguredWifiIntegration>();
export function getWifiIntegration(hotelId: string, provider: WifiProviderName = 'CAPTIVE_PORTAL'): ConfiguredWifiIntegration {
  const key = `${hotelId}:${provider}`;
  if (!integrations.has(key)) integrations.set(key, new ConfiguredWifiIntegration(provider));
  return integrations.get(key)!;
}
