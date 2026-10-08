import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db.js';
export class MenuItem extends Model<InferAttributes<MenuItem>, InferCreationAttributes<MenuItem>> {
  declare id: CreationOptional<string>; declare hotelId: string; declare categoryId: string;
  declare name: string; declare description: string | null; declare priceCents: number;
  declare gstRateBps: CreationOptional<number>; declare preparationMinutes: CreationOptional<number>;
  declare imageUrl: string | null; declare vegetarian: CreationOptional<boolean>;
  declare customizationSchema: object | null; declare active: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>; declare updatedAt: CreationOptional<Date>;
}
MenuItem.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  hotelId: { type: DataTypes.UUID, allowNull: false }, categoryId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING(160), allowNull: false }, description: { type: DataTypes.TEXT, allowNull: true },
  priceCents: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0 } },
  gstRateBps: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0, max: 2800 } },
  preparationMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 20, validate: { min: 0, max: 1440 } },
  imageUrl: { type: DataTypes.STRING(2048), allowNull: true },
  vegetarian: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  customizationSchema: { type: DataTypes.JSONB, allowNull: true }, active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE
}, { sequelize, tableName: 'menu_items', indexes: [{ fields: ['hotelId', 'active'] }, { fields: ['categoryId'] }] });
