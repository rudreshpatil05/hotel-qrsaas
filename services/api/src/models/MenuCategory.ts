import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db.js';

export class MenuCategory extends Model<InferAttributes<MenuCategory>, InferCreationAttributes<MenuCategory>> {
  declare id: CreationOptional<string>;
  declare hotelId: string;
  declare name: string;
  declare sortOrder: CreationOptional<number>;
  declare active: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
MenuCategory.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  hotelId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING(120), allowNull: false },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE
}, { sequelize, tableName: 'menu_categories', indexes: [{ fields: ['hotelId', 'active'] }] });
