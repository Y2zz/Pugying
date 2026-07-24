import { EntitySchema } from 'typeorm';
import { User } from '../../domain/entities/user.entity';

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
    },
    passwordHash: {
      type: String,
    },
    active: {
      type: Boolean,
      default: true,
    },
    tenantId: {
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
  },
});
