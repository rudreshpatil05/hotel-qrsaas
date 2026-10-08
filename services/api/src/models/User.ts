import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import bcrypt from 'bcryptjs';
import { sequelize } from '../db.js';

export type UserRole = 'owner' | 'admin' | 'staff' | 'hotel_admin' | 'super_admin';
export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare hotelId: string;
  declare email: string;
  declare passwordHash: string;
  declare role: UserRole;
  declare active: CreationOptional<boolean>;
  declare department: string | null;
  declare permissions: object | null;
  declare lastLoginAt: Date | null;
  declare deactivatedAt: Date | null;
  declare passwordChangedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  async verifyPassword(password: string): Promise<boolean> { return bcrypt.compare(password, this.passwordHash); }
}

User.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  hotelId: { type: DataTypes.UUID, allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true, validate: { isEmail: true } },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false },
  role: { type: DataTypes.ENUM('owner', 'admin', 'staff', 'hotel_admin', 'super_admin'), allowNull: false, defaultValue: 'staff' },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  department: { type: DataTypes.STRING(80), allowNull: true },
  permissions: { type: DataTypes.JSONB, allowNull: true },
  lastLoginAt: { type: DataTypes.DATE, allowNull: true },
  deactivatedAt: { type: DataTypes.DATE, allowNull: true },
  passwordChangedAt: { type: DataTypes.DATE, allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE
}, { sequelize, tableName: 'users', indexes: [{ unique: true, fields: ['hotelId', 'email'] }] });

User.beforeCreate(async (user) => { if (!user.passwordHash.startsWith('$2')) user.passwordHash = await bcrypt.hash(user.passwordHash, 12); });
User.beforeUpdate(async (user) => { if (user.changed('passwordHash') && !user.passwordHash.startsWith('$2')) user.passwordHash = await bcrypt.hash(user.passwordHash, 12); });
