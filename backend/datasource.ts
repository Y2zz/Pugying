import { DataSource } from 'typeorm';

export default new DataSource({
  type: 'better-sqlite3',
  database: 'pugying.db',
  entities: ['src/**/*.entity.ts', 'libs/**/entities/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
});
