import { EntitySchema } from 'typeorm';
import { Team } from '@pugying/team-management/domain/entities/team.entity';

export const TeamEntitySchema = new EntitySchema<Team>({
  name: 'Team',
  tableName: 'team',
  target: Team,
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    displayName: {
      type: String,
    },
    name: {
      type: String,
      unique: true,
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
