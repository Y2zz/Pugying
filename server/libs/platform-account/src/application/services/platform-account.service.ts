import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PLATFORM_CATALOG,
  getPlatformCatalogItem,
  isPlatformId,
  type PlatformCatalogItem,
} from '@pugying/platform-account/domain/platform-catalog';
import { PlatformAccount } from '@pugying/platform-account/domain/entities/platform-account.entity';
import {
  PLATFORM_ACCOUNT_REPOSITORY,
  type IPlatformAccountRepository,
} from '@pugying/platform-account/domain/repositories/platform-account.repository';
import {
  BindPlatformAccountDto,
  ReauthPlatformAccountDto,
} from '@pugying/platform-account/application/dtos';
import {
  decryptCredentialPayload,
  encryptCredentialPayload,
} from '@pugying/platform-account/infrastructure/credential-crypto';

export type PlatformAccountPublic = Omit<PlatformAccount, 'credentialCipher'>;

export interface StoredCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expirationDate?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

/** Decrypted credentials handed to the desktop Agent to open a creator-center window. */
export interface PlatformAccountCredentials {
  accountId: string;
  platform: string;
  displayName: string;
  /** Creator-center entry URL for this platform */
  openUrl: string;
  cookies: StoredCookie[];
  finalUrl: string | null;
}

@Injectable()
export class PlatformAccountService {
  constructor(
    @Inject(PLATFORM_ACCOUNT_REPOSITORY)
    private readonly repository: IPlatformAccountRepository,
  ) {}

  listPlatforms(): PlatformCatalogItem[] {
    return PLATFORM_CATALOG;
  }

  async findAll(platform?: string): Promise<PlatformAccountPublic[]> {
    if (platform !== undefined && !isPlatformId(platform)) {
      throw new BadRequestException(`Unsupported platform: ${platform}`);
    }
    const rows = await this.repository.findAll(platform);
    return rows.map((row) => this.toPublic(row));
  }

  async bind(dto: BindPlatformAccountDto): Promise<PlatformAccountPublic> {
    if (!isPlatformId(dto.platform)) {
      throw new BadRequestException(`Unsupported platform: ${dto.platform}`);
    }
    if (!dto.cookies?.length) {
      throw new BadRequestException('cookies are required');
    }

    const catalog = getPlatformCatalogItem(dto.platform)!;
    // The Agent's scraped profile is the most accurate source; an explicit
    // displayName from the caller still wins, and the platform name is the
    // last-resort placeholder the user can rename later.
    const platformUserId =
      dto.platformUserId?.trim() ||
      dto.profile?.platformUserId?.trim() ||
      null;
    const displayName =
      dto.displayName?.trim() ||
      dto.profile?.nickname?.trim() ||
      platformUserId ||
      `${catalog.displayName}账号`;
    const avatarUrl = dto.profile?.avatarUrl?.trim() || null;

    const cipher = encryptCredentialPayload(
      JSON.stringify({
        cookies: dto.cookies,
        finalUrl: dto.finalUrl ?? null,
        profile: dto.profile ?? null,
        boundAt: new Date().toISOString(),
      }),
    );

    let account: PlatformAccount | null = null;
    if (platformUserId) {
      account = await this.repository.findByPlatformUser(
        dto.platform,
        platformUserId,
      );
    }

    if (account) {
      account.displayName = displayName;
      account.credentialCipher = cipher;
      account.status = 'active';
      account.lastAuthedAt = new Date();
      account.platformUserId = platformUserId;
      // Keep the stored avatar when this bind couldn't scrape one.
      account.avatarUrl = avatarUrl ?? account.avatarUrl;
    } else {
      account = this.repository.create({
        platform: dto.platform,
        displayName,
        platformUserId,
        avatarUrl,
        credentialCipher: cipher,
        status: 'active',
        lastAuthedAt: new Date(),
      });
    }

    const saved = await this.repository.save(account);
    return this.toPublic(saved);
  }

  async reauth(
    id: string,
    dto: ReauthPlatformAccountDto,
  ): Promise<PlatformAccountPublic> {
    const account = await this.repository.findById(id);
    if (!account) {
      throw new NotFoundException(`Platform account #${id} not found`);
    }
    if (!dto.cookies?.length) {
      throw new BadRequestException('cookies are required');
    }

    account.credentialCipher = encryptCredentialPayload(
      JSON.stringify({
        cookies: dto.cookies,
        finalUrl: dto.finalUrl ?? null,
        profile: dto.profile ?? null,
        boundAt: new Date().toISOString(),
      }),
    );
    account.status = 'active';
    account.lastAuthedAt = new Date();
    if (dto.displayName?.trim()) {
      account.displayName = dto.displayName.trim();
    } else if (dto.profile?.nickname?.trim()) {
      // Picks up renames made on the platform side.
      account.displayName = dto.profile.nickname.trim();
    }
    if (dto.platformUserId !== undefined) {
      account.platformUserId = dto.platformUserId?.trim() || null;
    } else if (dto.profile?.platformUserId?.trim()) {
      account.platformUserId = dto.profile.platformUserId.trim();
    }
    if (dto.profile?.avatarUrl?.trim()) {
      account.avatarUrl = dto.profile.avatarUrl.trim();
    }

    const saved = await this.repository.save(account);
    return this.toPublic(saved);
  }

  async rename(id: string, displayName: string): Promise<PlatformAccountPublic> {
    const account = await this.repository.findById(id);
    if (!account) {
      throw new NotFoundException(`Platform account #${id} not found`);
    }
    const next = displayName.trim();
    if (!next) {
      throw new BadRequestException('displayName is required');
    }
    account.displayName = next;
    const saved = await this.repository.save(account);
    return this.toPublic(saved);
  }

  async getCredentials(id: string): Promise<PlatformAccountCredentials> {
    const account = await this.repository.findById(id);
    if (!account) {
      throw new NotFoundException(`Platform account #${id} not found`);
    }
    if (account.status === 'revoked') {
      throw new BadRequestException('Account has been revoked');
    }

    let payload: { cookies?: StoredCookie[]; finalUrl?: string | null };
    try {
      payload = JSON.parse(
        decryptCredentialPayload(account.credentialCipher),
      ) as { cookies?: StoredCookie[]; finalUrl?: string | null };
    } catch {
      throw new BadRequestException(
        'Stored credentials are unreadable, please reauthorize',
      );
    }
    if (!payload.cookies?.length) {
      throw new BadRequestException(
        'No stored cookies, please reauthorize the account',
      );
    }

    const catalog = getPlatformCatalogItem(account.platform);
    return {
      accountId: account.id,
      platform: account.platform,
      displayName: account.displayName,
      openUrl: catalog?.loginUrl ?? '',
      cookies: payload.cookies,
      finalUrl: payload.finalUrl ?? null,
    };
  }

  async remove(id: string): Promise<void> {
    const account = await this.repository.findById(id);
    if (!account) {
      throw new NotFoundException(`Platform account #${id} not found`);
    }
    account.status = 'revoked';
    await this.repository.save(account);
    await this.repository.remove(account);
  }

  private toPublic(account: PlatformAccount): PlatformAccountPublic {
    const { credentialCipher, ...rest } = account;
    void credentialCipher;
    return rest;
  }
}
