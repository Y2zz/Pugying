import { DataSource } from 'typeorm';
import { UserEntitySchema } from '@pugying/identity';
import { TenantEntitySchema } from '@pugying/tenant-management';

export default new DataSource({
  type: 'better-sqlite3',
  database: 'pugying.db',
  entities: [TenantEntitySchema, UserEntitySchema],
  migrations: ['src/database/migrations/*.ts'],
});
