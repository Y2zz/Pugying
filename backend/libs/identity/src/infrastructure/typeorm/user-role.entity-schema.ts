import { EntitySchema } from 'typeorm';
import { UserRole } from '@pugying/identity/domain/entities/user-role.entity';

export const UserRoleEntitySchema = new EntitySchema<UserRole>({
  name: 'UserRole',
  tableName: 'user_role',
  target: UserRole,
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    userId: {
      type: 'uuid',
    },
    roleId: {
      type: 'uuid',
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
      name: 'UQ_user_role_user_role',
      columns: ['userId', 'roleId'],
    },
  ],
});
