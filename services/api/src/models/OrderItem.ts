import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db.js';
export class OrderItem extends Model<InferAttributes<OrderItem>, InferCreationAttributes<OrderItem>> {
  declare id: CreationOptional<string>; declare orderId: string; declare menuItemId: string;
  declare nameSnapshot: string; declare unitPriceCents: number; declare gstRateBps: number; declare quantity: number; declare customizations: object | null; declare specialInstructions: string | null;
}
OrderItem.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  orderId: { type: DataTypes.UUID, allowNull: false }, menuItemId: { type: DataTypes.UUID, allowNull: false },
  nameSnapshot: { type: DataTypes.STRING(160), allowNull: false }, unitPriceCents: { type: DataTypes.INTEGER, allowNull: false },
  gstRateBps: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  quantity: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 50 } },
  customizations: { type: DataTypes.JSONB, allowNull: true },
  specialInstructions: { type: DataTypes.STRING(500), allowNull: true }
}, { sequelize, tableName: 'order_items', indexes: [{ fields: ['orderId'] }] });
