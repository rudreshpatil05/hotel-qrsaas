import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db.js';
import { ORDER_STATUSES, OrderStatus } from './Order.js';
export class OrderStatusHistory extends Model<InferAttributes<OrderStatusHistory>, InferCreationAttributes<OrderStatusHistory>> {
  declare id: CreationOptional<string>; declare orderId: string; declare fromStatus: OrderStatus | null; declare toStatus: OrderStatus; declare actorUserId: string | null; declare note: string | null; declare createdAt: CreationOptional<Date>;
}
OrderStatusHistory.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true }, orderId: { type: DataTypes.UUID, allowNull: false },
  fromStatus: { type: DataTypes.ENUM(...ORDER_STATUSES), allowNull: true }, toStatus: { type: DataTypes.ENUM(...ORDER_STATUSES), allowNull: false },
  actorUserId: { type: DataTypes.UUID, allowNull: true }, note: { type: DataTypes.STRING(300), allowNull: true }, createdAt: DataTypes.DATE
}, { sequelize, tableName: 'order_status_history', updatedAt: false, indexes: [{ fields: ['orderId', 'createdAt'] }] });
