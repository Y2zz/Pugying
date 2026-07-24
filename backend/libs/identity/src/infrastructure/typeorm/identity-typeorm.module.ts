import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { USER_REPOSITORY } from '@pugying/identity/domain/repositories/user.repository';
import { UserEntitySchema } from './user.entity-schema';
import { TypeOrmUserRepository } from './user.repository';

/**
 * TypeORM persistence for Identity — co-developed with the business module
 * (ABP-style *.EntityFrameworkCore companion). Import in the host AppModule.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([UserEntitySchema])],
  providers: [
    {
      provide: USER_REPOSITORY,
      useClass: TypeOrmUserRepository,
    },
  ],
  exports: [USER_REPOSITORY, TypeOrmModule],
})
export class IdentityTypeOrmModule {}
