import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TEAM_STORE } from '@pugying/core';
import { TEAM_REPOSITORY } from '@pugying/team-management/domain/repositories/team-management.repository';
import { TeamEntitySchema } from './team.entity-schema';
import { TypeOrmTeamManagementRepository } from './team-management.repository';

/**
 * TypeORM persistence for TeamManagement — co-developed with the business module
 * (ABP-style *.EntityFrameworkCore companion). Import in the host AppModule.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([TeamEntitySchema])],
  providers: [
    TypeOrmTeamManagementRepository,
    {
      provide: TEAM_REPOSITORY,
      useExisting: TypeOrmTeamManagementRepository,
    },
    {
      provide: TEAM_STORE,
      useExisting: TypeOrmTeamManagementRepository,
    },
  ],
  exports: [TEAM_REPOSITORY, TEAM_STORE, TypeOrmModule],
})
export class TeamManagementTypeOrmModule {}
