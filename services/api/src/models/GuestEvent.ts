import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db.js';

export const GUEST_EVENT_TYPES = ['QR_SCAN', 'SESSION_CREATED', 'PAGE_VIEW', 'MENU_VIEW', 'PRODUCT_VIEW', 'ADD_TO_CART', 'CHECKOUT_STARTED', 'FEEDBACK_SUBMITTED'] as const;
export type GuestEventType = typeof GUEST_EVENT_TYPES[number];

export class GuestEvent extends Model<InferAttributes<GuestEvent>, InferCreationAttributes<GuestEvent>> {
  declare id: CreationOptional<string>;
  declare hotelId: string;
  declare qrId: string;
  declare sessionId: string | null;
  declare eventType: GuestEventType;
  declare metadata: object | null;
  declare createdAt: CreationOptional<Date>;
}

GuestEvent.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  hotelId: { type: DataTypes.UUID, allowNull: false },
  qrId: { type: DataTypes.UUID, allowNull: false },
  sessionId: { type: DataTypes.STRING(80), allowNull: true },
  eventType: { type: DataTypes.ENUM(...GUEST_EVENT_TYPES), allowNull: false },
  metadata: { type: DataTypes.JSONB, allowNull: true },
  createdAt: DataTypes.DATE
}, { sequelize, tableName: 'guest_events', updatedAt: false, indexes: [{ fields: ['hotelId', 'createdAt'] }, { fields: ['qrId', 'eventType'] }] });
