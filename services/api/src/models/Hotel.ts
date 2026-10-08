import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db.js';

export class Hotel extends Model<InferAttributes<Hotel>, InferCreationAttributes<Hotel>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare slug: string;
  declare address: object | null;
  declare contactDetails: object | null;
  declare logoUrl: string | null;
  declare primaryColor: CreationOptional<string>;
  declare secondaryColor: CreationOptional<string>;
  declare branding: object | null;
  declare gstNumber: string | null;
  declare timezone: CreationOptional<string>;
  declare currency: CreationOptional<string>;
  declare language: CreationOptional<string>;
  declare settings: object | null;
  declare configuration: object | null;
  declare status: CreationOptional<'ACTIVE' | 'SUSPENDED' | 'ONBOARDING'>;
  declare subscriptionPlan: string | null;
  declare subscriptionStatus: CreationOptional<'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED'>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Hotel.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(160), allowNull: false },
  slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  address: { type: DataTypes.JSONB, allowNull: true },
  contactDetails: { type: DataTypes.JSONB, allowNull: true },
  logoUrl: { type: DataTypes.STRING(2048), allowNull: true },
  primaryColor: { type: DataTypes.STRING(7), allowNull: false, defaultValue: '#252b21' },
  secondaryColor: { type: DataTypes.STRING(7), allowNull: false, defaultValue: '#d8f24d' },
  branding: { type: DataTypes.JSONB, allowNull: true },
  gstNumber: { type: DataTypes.STRING(30), allowNull: true },
  timezone: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'UTC' },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'USD' },
  language: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'en' },
  settings: { type: DataTypes.JSONB, allowNull: true },
  configuration: { type: DataTypes.JSONB, allowNull: true },
  status: { type: DataTypes.ENUM('ACTIVE', 'SUSPENDED', 'ONBOARDING'), allowNull: false, defaultValue: 'ONBOARDING' },
  subscriptionPlan: { type: DataTypes.STRING(80), allowNull: true },
  subscriptionStatus: { type: DataTypes.ENUM('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED'), allowNull: false, defaultValue: 'TRIAL' },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE
}, { sequelize, tableName: 'hotels' });
