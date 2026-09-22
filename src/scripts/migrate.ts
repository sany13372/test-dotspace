import path from 'node:path';
import { QueryInterface } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';
import { sequelize } from '../config/database';

export function createMigrator(): Umzug<QueryInterface> {
  const migrationGlob = path
    .join(__dirname, '..', 'migrations', '*.{js,ts}')
    .replace(/\\/g, '/');

  return new Umzug({
    migrations: { glob: migrationGlob },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({
      sequelize,
      tableName: 'sequelize_meta',
    }),
    logger: console,
  });
}

export async function migrateDatabase(): Promise<void> {
  await createMigrator().up();
}

if (require.main === module) {
  migrateDatabase()
    .then(() => sequelize.close())
    .catch(async (error) => {
      console.error('Migration failed', error);
      await sequelize.close();
      process.exit(1);
    });
}
