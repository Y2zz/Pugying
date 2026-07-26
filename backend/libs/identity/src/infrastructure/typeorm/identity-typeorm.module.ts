import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ROLE_REPOSITORY } from '@pugying/identity/domain/repositories/role.repository';
import { USER_ROLE_REPOSITORY } from '@pugying/identity/domain/repositories/user-role.repository';
import { USER_REPOSITORY } from '@pugying/identity/domain/repositories/user.repository';
import { RoleEntitySchema } from './role.entity-schema';
import { TypeOrmRoleRepository } from './role.repository';
import { TypeOrmUserRoleRepository } from './user-role.repository';
import { TypeOrmUserRepository } from './user.repository';
import { UserEntitySchema } from './user.entity-schema';
import { UserRoleEntitySchema } from './user-role.entity-schema';

/**
 * TypeORM persistence for Identity — co-developed with the business module
 * (ABP-style *.EntityFrameworkCore companion). Import in the host AppModule.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntitySchema,
      RoleEntitySchema,
      UserRoleEntitySchema,
    ]),
  ],
  providers: [
    {
      provide: USER_REPOSITORY,
      useClass: TypeOrmUserRepository,
    },
    {
      provide: ROLE_REPOSITORY,
      useClass: TypeOrmRoleRepository,
    },
    {
      provide: USER_ROLE_REPOSITORY,
      useClass: TypeOrmUserRoleRepository,
    },
  ],
  exports: [
    USER_REPOSITORY,
    ROLE_REPOSITORY,
    USER_ROLE_REPOSITORY,
    TypeOrmModule,
  ],
})
export class IdentityTypeOrmModule {}
