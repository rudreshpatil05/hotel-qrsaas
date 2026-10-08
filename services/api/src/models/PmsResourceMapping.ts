import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db.js';

export type PmsResourceType = 'GUEST' | 'ROOM';

export class PmsResourceMapping extends Model<InferAttributes<PmsResourceMapping>, InferCreationAttributes<PmsResourceMapping>> {
  declare id: CreationOptional<string>;
  declare hotelId: string;
  declare resourceType: PmsResourceType;
  declare externalId: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

PmsResourceMapping.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  hotelId: { type: DataTypes.UUID, allowNull: false },
  resourceType: { type: DataTypes.ENUM('GUEST', 'ROOM'), allowNull: false },
  externalId: { type: DataTypes.STRING(160), allowNull: false },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE
}, {
  sequelize,
  tableName: 'pms_resource_mappings',
  indexes: [
    { unique: true, fields: ['hotelId', 'resourceType', 'externalId'] },
    { fields: ['hotelId', 'resourceType'] }
  ]
});
