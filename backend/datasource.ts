import { DataSource } from 'typeorm';
import {
  RoleEntitySchema,
  UserEntitySchema,
  UserRoleEntitySchema,
} from '@pugying/identity';
import { TeamEntitySchema } from '@pugying/team-management';
import { TeamUserEntitySchema } from '@pugying/account-pro';
import { PlatformAccountEntitySchema } from '@pugying/platform-account';
import {
  ContentEntitySchema,
  ContentTargetEntitySchema,
} from '@pugying/content';

export default new DataSource({
  type: 'better-sqlite3',
  database: 'pugying.db',
  entities: [
    TeamEntitySchema,
    UserEntitySchema,
    RoleEntitySchema,
    UserRoleEntitySchema,
    TeamUserEntitySchema,
    PlatformAccountEntitySchema,
    ContentEntitySchema,
    ContentTargetEntitySchema,
  ],
  migrations: ['src/database/migrations/*.ts'],
});
