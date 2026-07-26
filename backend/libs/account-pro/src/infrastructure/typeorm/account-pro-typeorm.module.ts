import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TEAM_MEMBERSHIP_LOOKUP } from '@pugying/identity/domain/repositories/team-membership.lookup';
import { TEAM_USER_REPOSITORY } from '@pugying/account-pro/domain/repositories/team-user.repository';
import { TeamMembershipLookupService } from '@pugying/account-pro/application/services/team-membership-lookup.service';
import { TeamUserEntitySchema } from './team-user.entity-schema';
import { TypeOrmTeamUserRepository } from './team-user.repository';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([TeamUserEntitySchema])],
  providers: [
    TypeOrmTeamUserRepository,
    {
      provide: TEAM_USER_REPOSITORY,
      useExisting: TypeOrmTeamUserRepository,
    },
    TeamMembershipLookupService,
    {
      provide: TEAM_MEMBERSHIP_LOOKUP,
      useExisting: TeamMembershipLookupService,
    },
  ],
  exports: [TEAM_USER_REPOSITORY, TEAM_MEMBERSHIP_LOOKUP, TypeOrmModule],
})
export class AccountProTypeOrmModule {}
