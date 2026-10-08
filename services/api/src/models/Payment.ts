import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db.js';

export const PAYMENT_STATUSES = ['CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
export type PaymentStatus = typeof PAYMENT_STATUSES[number];

export class Payment extends Model<InferAttributes<Payment>, InferCreationAttributes<Payment>> {
  declare id: CreationOptional<string>;
  declare hotelId: string;
  declare orderId: string;
  declare invoiceId: string | null;
  declare amountCents: number;
  declare currency: string;
  declare status: PaymentStatus;
  declare gatewayOrderId: string | null;
  declare gatewayPaymentId: string | null;
  declare paymentMethod: string | null;
  declare idempotencyKey: string;
  declare webhookEventId: string | null;
  declare refundedAmountCents: number;
  declare refundIdempotencyKey: string | null;
  declare failureReason: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Payment.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  hotelId: { type: DataTypes.UUID, allowNull: false },
  orderId: { type: DataTypes.UUID, allowNull: false },
  invoiceId: { type: DataTypes.UUID, allowNull: true },
  amountCents: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0 } },
  currency: { type: DataTypes.STRING(3), allowNull: false },
  status: { type: DataTypes.ENUM(...PAYMENT_STATUSES), allowNull: false, defaultValue: 'CREATED' },
  gatewayOrderId: { type: DataTypes.STRING(80), allowNull: true },
  gatewayPaymentId: { type: DataTypes.STRING(80), allowNull: true },
  paymentMethod: { type: DataTypes.STRING(40), allowNull: true },
  idempotencyKey: { type: DataTypes.STRING(120), allowNull: false },
  webhookEventId: { type: DataTypes.STRING(160), allowNull: true },
  refundedAmountCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  refundIdempotencyKey: { type: DataTypes.STRING(120), allowNull: true },
  failureReason: { type: DataTypes.STRING(500), allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE
}, { sequelize, tableName: 'payments', indexes: [
  { unique: true, fields: ['hotelId', 'idempotencyKey'] },
  { unique: true, fields: ['gatewayOrderId'] },
  { unique: true, fields: ['gatewayPaymentId'] },
  { fields: ['hotelId', 'orderId'] }
] });
