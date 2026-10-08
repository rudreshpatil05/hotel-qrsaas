import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db.js';
export const ORDER_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'FAILED', 'REFUNDED'] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];
export class Order extends Model<InferAttributes<Order>, InferCreationAttributes<Order>> {
  declare id: CreationOptional<string>; declare orderNumber: string; declare hotelId: string; declare qrPublicId: string;
  declare sessionId: string | null;
  declare status: OrderStatus; declare subtotalCents: number; declare totalCents: number; declare guestNote: string | null;
  declare gstCents: number; declare discountCents: number; declare guestName: string;
  declare guestPhone: string; declare deliveryLocation: string; declare paymentMethod: 'PAY_AT_HOTEL' | 'ONLINE';
  declare createdAt: CreationOptional<Date>; declare updatedAt: CreationOptional<Date>;
}
Order.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  orderNumber: { type: DataTypes.STRING(24), allowNull: false, unique: true },
  hotelId: { type: DataTypes.UUID, allowNull: false }, qrPublicId: { type: DataTypes.STRING(32), allowNull: false },
  status: { type: DataTypes.ENUM(...ORDER_STATUSES), allowNull: false, defaultValue: 'PENDING_PAYMENT' },
  subtotalCents: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0 } },
  gstCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
  discountCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
  totalCents: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0 } },
  guestName: { type: DataTypes.STRING(120), allowNull: false },
  guestPhone: { type: DataTypes.STRING(32), allowNull: false },
  deliveryLocation: { type: DataTypes.STRING(200), allowNull: false },
  paymentMethod: { type: DataTypes.ENUM('PAY_AT_HOTEL', 'ONLINE'), allowNull: false, defaultValue: 'PAY_AT_HOTEL' },
  guestNote: { type: DataTypes.STRING(500), allowNull: true }, sessionId: { type: DataTypes.STRING(80), allowNull: true },
  createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE
}, { sequelize, tableName: 'orders', indexes: [{ fields: ['hotelId', 'status'] }, { fields: ['hotelId', 'sessionId'] }, { unique: true, fields: ['orderNumber'] }] });
