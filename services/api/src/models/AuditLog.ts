import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db.js';

export class AuditLog extends Model<InferAttributes<AuditLog>, InferCreationAttributes<AuditLog>> {
  declare id: CreationOptional<string>;
  declare hotelId: string;
  declare actorUserId: string | null;
  declare action: string;
  declare resourceType: string;
  declare resourceId: string | null;
  declare metadata: object | null;
  declare createdAt: CreationOptional<Date>;
}
AuditLog.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  hotelId: { type: DataTypes.UUID, allowNull: false },
  actorUserId: { type: DataTypes.UUID, allowNull: true },
  action: { type: DataTypes.STRING(80), allowNull: false },
  resourceType: { type: DataTypes.STRING(40), allowNull: false },
  resourceId: { type: DataTypes.UUID, allowNull: true },
  metadata: { type: DataTypes.JSONB, allowNull: true },
  createdAt: DataTypes.DATE
}, { sequelize, tableName: 'audit_logs', updatedAt: false, indexes: [{ fields: ['hotelId', 'createdAt'] }, { fields: ['hotelId', 'action'] }] });
