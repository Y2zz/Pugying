import { PlatformAccount } from '@pugying/platform-account/domain/entities/platform-account.entity';
import type { PlatformId } from '@pugying/platform-account/domain/platform-catalog';

export interface IPlatformAccountRepository {
  create(data: Partial<PlatformAccount>): PlatformAccount;
  findAll(platform?: PlatformId): Promise<PlatformAccount[]>;
  findById(id: string): Promise<PlatformAccount | null>;
  findByPlatformUser(
    platform: PlatformId,
    platformUserId: string,
  ): Promise<PlatformAccount | null>;
  save(account: PlatformAccount): Promise<PlatformAccount>;
  remove(account: PlatformAccount): Promise<void>;
}

export const PLATFORM_ACCOUNT_REPOSITORY = 'IPlatformAccountRepository';
