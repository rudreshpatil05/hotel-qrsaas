import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db.js';

export const SERVICE_REQUEST_CATEGORIES = ['HOUSEKEEPING', 'MAINTENANCE', 'LAUNDRY', 'CONCIERGE', 'WAKE_UP_CALL', 'OTHER'] as const;
export const SERVICE_REQUEST_STATUSES = ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED'] as const;
export type ServiceRequestCategory = typeof SERVICE_REQUEST_CATEGORIES[number];
export type ServiceRequestStatus = typeof SERVICE_REQUEST_STATUSES[number];

export class ServiceRequest extends Model<InferAttributes<ServiceRequest>, InferCreationAttributes<ServiceRequest>> {
  declare id: CreationOptional<string>;
  declare hotelId: string;
  declare qrPublicId: string;
  declare roomOrTable: string;
  declare category: ServiceRequestCategory;
  declare description: string;
  declare photoUrl: string | null;
  declare status: ServiceRequestStatus;
  declare rejectionReason: string | null;
  declare staffUserId: string | null;
  declare staffNotes: string | null;
  declare proofUrl: string | null;
  declare rating: number | null;
  declare createdAt: CreationOptional<Date>;
  declare acceptedAt: Date | null;
  declare startedAt: Date | null;
  declare completedAt: Date | null;
  declare updatedAt: CreationOptional<Date>;
}

ServiceRequest.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  hotelId: { type: DataTypes.UUID, allowNull: false },
  qrPublicId: { type: DataTypes.STRING(32), allowNull: false },
  roomOrTable: { type: DataTypes.STRING(200), allowNull: false },
  category: { type: DataTypes.ENUM(...SERVICE_REQUEST_CATEGORIES), allowNull: false },
  description: { type: DataTypes.STRING(1000), allowNull: false },
  photoUrl: { type: DataTypes.STRING(2048), allowNull: true },
  status: { type: DataTypes.ENUM(...SERVICE_REQUEST_STATUSES), allowNull: false, defaultValue: 'PENDING' },
  rejectionReason: { type: DataTypes.STRING(500), allowNull: true },
  staffUserId: { type: DataTypes.UUID, allowNull: true },
  staffNotes: { type: DataTypes.STRING(1000), allowNull: true },
  proofUrl: { type: DataTypes.STRING(2048), allowNull: true },
  rating: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1, max: 5 } },
  createdAt: DataTypes.DATE, acceptedAt: DataTypes.DATE, startedAt: DataTypes.DATE, completedAt: DataTypes.DATE, updatedAt: DataTypes.DATE
}, { sequelize, tableName: 'service_requests', indexes: [{ fields: ['hotelId', 'status'] }, { fields: ['hotelId', 'createdAt'] }] });
