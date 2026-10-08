import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db.js';

export const REVIEW_TARGETS = ['ORDER', 'SERVICE'] as const;
export class Review extends Model<InferAttributes<Review>, InferCreationAttributes<Review>> {
  declare id: CreationOptional<string>; declare hotelId: string; declare qrPublicId: string; declare sessionId: string;
  declare targetType: typeof REVIEW_TARGETS[number]; declare targetId: string | null; declare rating: number; declare comment: string | null; declare response: string | null; declare respondedAt: Date | null; declare createdAt: CreationOptional<Date>; declare updatedAt: CreationOptional<Date>;
}
Review.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true }, hotelId: { type: DataTypes.UUID, allowNull: false }, qrPublicId: { type: DataTypes.STRING(32), allowNull: false }, sessionId: { type: DataTypes.STRING(80), allowNull: false },
  targetType: { type: DataTypes.ENUM(...REVIEW_TARGETS), allowNull: false }, targetId: { type: DataTypes.UUID, allowNull: true }, rating: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } }, comment: { type: DataTypes.STRING(2000), allowNull: true }, response: { type: DataTypes.STRING(2000), allowNull: true }, respondedAt: { type: DataTypes.DATE, allowNull: true }, createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE
}, { sequelize, tableName: 'reviews', indexes: [{ fields: ['hotelId', 'createdAt'] }, { fields: ['hotelId', 'targetType'] }] });
