import { EntitySchema } from 'typeorm';
import { Role } from '@pugying/identity/domain/entities/role.entity';

export const RoleEntitySchema = new EntitySchema<Role>({
  name: 'Role',
  tableName: 'role',
  target: Role,
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    name: {
      type: String,
    },
    teamId: {
      type: 'uuid',
    },
    permissions: {
      type: 'simple-json',
      default: [],
    },
    createdAt: {
      type: Date,
      createDate: true,
    },
    updatedAt: {
      type: Date,
      updateDate: true,
    },
    deletedAt: {
      type: Date,
      deleteDate: true,
      nullable: true,
    },
  },
  uniques: [
    {
      name: 'UQ_role_team_name',
      columns: ['teamId', 'name'],
    },
  ],
});
