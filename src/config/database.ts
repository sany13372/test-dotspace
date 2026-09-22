import 'dotenv/config';
import { Sequelize } from 'sequelize';

const defaultDatabase = process.env.NODE_ENV === 'test' ? 'events_test' : 'events_dev';
const databaseUrl =
  process.env.DATABASE_URL ??
  `postgres://events:events@localhost:5432/${defaultDatabase}`;

export const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  logging: process.env.SQL_LOG === 'true' ? console.log : false,
  pool: {
    max: Number(process.env.DB_POOL_MAX ?? 10),
    min: 0,
    idle: 10_000,
    acquire: 20_000,
  },
});
