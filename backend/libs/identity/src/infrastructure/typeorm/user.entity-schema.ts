import { EntitySchema } from 'typeorm';
import { User } from '@pugying/identity/domain/entities/user.entity';

export const UserEntitySchema = new EntitySchema<User>({
  name: 'User',
  tableName: 'account',
  target: User,
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    email: {
      type: String,
      unique: true,
    },
    username: {
      type: String,
      unique: true,
    },
    passwordHash: {
      type: String,
    },
    active: {
      type: Boolean,
      default: true,
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
});
