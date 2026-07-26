import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PLATFORM_ACCOUNT_REPOSITORY } from '@pugying/platform-account/domain/repositories/platform-account.repository';
import { PlatformAccountEntitySchema } from './platform-account.entity-schema';
import { TypeOrmPlatformAccountRepository } from './platform-account.repository';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PlatformAccountEntitySchema])],
  providers: [
    TypeOrmPlatformAccountRepository,
    {
      provide: PLATFORM_ACCOUNT_REPOSITORY,
      useExisting: TypeOrmPlatformAccountRepository,
    },
  ],
  exports: [PLATFORM_ACCOUNT_REPOSITORY, TypeOrmModule],
})
export class PlatformAccountTypeOrmModule {}
