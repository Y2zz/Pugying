import { EntitySchema } from 'typeorm';
import { PlatformAccount } from '@pugying/platform-account/domain/entities/platform-account.entity';

export const PlatformAccountEntitySchema = new EntitySchema<PlatformAccount>({
  name: 'PlatformAccount',
  tableName: 'platform_account',
  target: PlatformAccount,
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    teamId: {
      type: 'uuid',
    },
    platform: {
      type: String,
    },
    displayName: {
      type: String,
    },
    platformUserId: {
      type: String,
      nullable: true,
    },
    avatarUrl: {
      type: String,
      nullable: true,
    },
    credentialCipher: {
      type: 'text',
    },
    status: {
      type: String,
      default: 'active',
    },
    lastAuthedAt: {
      type: Date,
      nullable: true,
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
  indices: [
    {
      name: 'IDX_platform_account_team_platform',
      columns: ['teamId', 'platform'],
    },
  ],
});
