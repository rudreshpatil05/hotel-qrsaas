import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db.js';

export class Invoice extends Model<InferAttributes<Invoice>, InferCreationAttributes<Invoice>> {
  declare id: CreationOptional<string>;
  declare hotelId: string;
  declare orderId: string;
  declare invoiceNumber: string;
  declare currency: string;
  declare subtotalCents: number;
  declare gstCents: number;
  declare discountCents: number;
  declare adjustmentCents: number;
  declare totalCents: number;
  declare paidCents: number;
  declare status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';
  declare gstDetails: object | null;
  declare lineItems: object;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Invoice.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  hotelId: { type: DataTypes.UUID, allowNull: false },
  orderId: { type: DataTypes.UUID, allowNull: false },
  invoiceNumber: { type: DataTypes.STRING(32), allowNull: false, unique: true },
  currency: { type: DataTypes.STRING(3), allowNull: false },
  subtotalCents: { type: DataTypes.INTEGER, allowNull: false },
  gstCents: { type: DataTypes.INTEGER, allowNull: false },
  discountCents: { type: DataTypes.INTEGER, allowNull: false },
  adjustmentCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  totalCents: { type: DataTypes.INTEGER, allowNull: false },
  paidCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  status: { type: DataTypes.ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED'), allowNull: false, defaultValue: 'UNPAID' },
  gstDetails: { type: DataTypes.JSONB, allowNull: true },
  lineItems: { type: DataTypes.JSONB, allowNull: false },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE
}, { sequelize, tableName: 'invoices', indexes: [{ unique: true, fields: ['hotelId', 'orderId'] }, { fields: ['hotelId', 'invoiceNumber'] }] });
