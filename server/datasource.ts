import { DataSource } from 'typeorm';
import { PlatformAccountEntitySchema } from '@pugying/platform-account';
import {
  ContentEntitySchema,
  ContentTargetEntitySchema,
} from '@pugying/content';
import { loadLocalEnvFiles } from './src/load-local-env';

loadLocalEnvFiles();

export default new DataSource({
  type: 'better-sqlite3',
  database: process.env.PUGYING_DATABASE_PATH?.trim() || 'pugying.db',
  entities: [
    PlatformAccountEntitySchema,
    ContentEntitySchema,
    ContentTargetEntitySchema,
  ],
  migrations: ['src/database/migrations/*.ts'],
});
