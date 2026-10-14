export { PlatformAccountModule } from './platform-account.module';
export { PlatformAccountTypeOrmModule } from './infrastructure/typeorm/platform-account-typeorm.module';
export { PlatformAccountEntitySchema } from './infrastructure/typeorm/platform-account.entity-schema';
export { PlatformAccountService } from './application/services/platform-account.service';
export { PlatformAccount } from './domain/entities/platform-account.entity';
export {
  PLATFORM_ACCOUNT_REPOSITORY,
  type IPlatformAccountRepository,
} from './domain/repositories/platform-account.repository';
export {
  PLATFORM_CATALOG,
  type PlatformId,
  type PlatformCatalogItem,
} from './domain/platform-catalog';
export {
  BindPlatformAccountDto,
  ReauthPlatformAccountDto,
  CookieDto,
} from './application/dtos';
