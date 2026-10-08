import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db.js';

export type RoomStatus = 'ACTIVE' | 'DISABLED';
export class Room extends Model<InferAttributes<Room>, InferCreationAttributes<Room>> {
  declare id: CreationOptional<string>;
  declare hotelId: string;
  declare roomNumber: string;
  declare name: string | null;
  declare floor: string | null;
  declare status: CreationOptional<RoomStatus>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
Room.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  hotelId: { type: DataTypes.UUID, allowNull: false },
  roomNumber: { type: DataTypes.STRING(32), allowNull: false },
  name: { type: DataTypes.STRING(100), allowNull: true },
  floor: { type: DataTypes.STRING(32), allowNull: true },
  status: { type: DataTypes.ENUM('ACTIVE', 'DISABLED'), allowNull: false, defaultValue: 'ACTIVE' },
  createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE
}, { sequelize, tableName: 'rooms', indexes: [{ unique: true, fields: ['hotelId', 'roomNumber'] }, { fields: ['hotelId', 'status'] }] });
