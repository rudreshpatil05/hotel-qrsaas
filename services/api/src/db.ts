import { Sequelize } from 'sequelize';
import { config } from './config.js';
import { logger } from './logger.js';

export const sequelize = new Sequelize(config.DATABASE_URL, {
  dialect: 'postgres',
  benchmark: true,
  logging: (sql, timing) => { if (typeof timing === 'number' && timing >= 500) logger.warn({ message: 'slow.database.query', durationMs: timing, query: sql.slice(0, 500) }); },
  pool: { max: 20, min: 2, acquire: 10000, idle: 10000 },
  dialectOptions: config.DB_SSL ? { ssl: { require: true, rejectUnauthorized: false } } : {}
});

export async function initializeDatabase(): Promise<void> {
  await sequelize.authenticate();
  if (config.DB_SYNC) await sequelize.sync({ alter: false });
}
