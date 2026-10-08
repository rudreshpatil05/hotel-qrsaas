import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db.js';

export class QrCode extends Model<InferAttributes<QrCode>, InferCreationAttributes<QrCode>> {
  declare id: CreationOptional<string>;
  declare hotelId: string;
  declare publicId: string;
  declare tokenHash: string;
  declare tokenCiphertext: string;
  declare label: string | null;
  declare type: QrType;
  declare roomId: string | null;
  declare targetLabel: string | null;
  declare scanCount: CreationOptional<number>;
  declare lastScannedAt: Date | null;
  declare active: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export const QR_TYPES = ['ROOM', 'TABLE', 'COMMON_AREA', 'SERVICE', 'WIFI'] as const;
export type QrType = typeof QR_TYPES[number];

QrCode.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  hotelId: { type: DataTypes.UUID, allowNull: false },
  publicId: { type: DataTypes.STRING(32), allowNull: false, unique: true },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  tokenCiphertext: { type: DataTypes.TEXT, allowNull: false },
  label: { type: DataTypes.STRING(120), allowNull: true },
  type: { type: DataTypes.ENUM(...QR_TYPES), allowNull: false, defaultValue: 'ROOM' },
  roomId: { type: DataTypes.UUID, allowNull: true },
  targetLabel: { type: DataTypes.STRING(120), allowNull: true },
  scanCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lastScannedAt: { type: DataTypes.DATE, allowNull: true },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE
}, { sequelize, tableName: 'qr_codes', indexes: [{ fields: ['hotelId'] }, { unique: true, fields: ['tokenHash'] }] });
