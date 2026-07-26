import { EntitySchema } from 'typeorm';
import { TeamUser } from '@pugying/account-pro/domain/entities/team-user.entity';

export const TeamUserEntitySchema = new EntitySchema<TeamUser>({
  name: 'TeamUser',
  tableName: 'team_user',
  target: TeamUser,
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    userId: {
      type: 'uuid',
    },
    teamId: {
      type: 'uuid',
    },
    extraPermissions: {
      type: 'simple-json',
      default: [],
    },
    leftAt: {
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
  uniques: [
    {
      name: 'UQ_team_user_user_team',
      columns: ['userId', 'teamId'],
    },
  ],
});
