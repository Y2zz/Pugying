import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PLATFORM_CATALOG, getPlatformCatalogItem, isPlatformId, type PlatformCatalogItem } from '@pugying/platform-account/domain/platform-catalog';
import { PlatformAccount } from '@pugying/platform-account/domain/entities/platform-account.entity';
import { PLATFORM_ACCOUNT_REPOSITORY, type IPlatformAccountRepository } from '@pugying/platform-account/domain/repositories/platform-account.repository';
import { BindPlatformAccountDto, ReauthPlatformAccountDto } from '@pugying/platform-account/application/dtos';
import { decryptCredentialPayload, encryptCredentialPayload } from '@pugying/platform-account/infrastructure/credential-crypto';

export type PlatformAccountPublic = Omit<PlatformAccount, 'credentialCipher'>;

/** 视频号助手 finderUsername 形态：v2_…@finder */
export function isChannelsFinderUsername(value: string): boolean {
  const text = value.trim();
  return text.startsWith('v2_') && text.includes('@finder');
}

/**
 * 创作者中心打开地址：已保存的非登录页优先，否则 homeUrl，再退回 loginUrl。
 * 视频号 login.html 即使 Cookie 有效也会停在扫码页。
 */
export function resolveCreatorOpenUrl(
  platform: string,
  catalog: PlatformCatalogItem | undefined,
  finalUrl: string | null | undefined,
): string {
  const fallback = catalog?.homeUrl?.trim() || catalog?.loginUrl?.trim() || '';
  const candidate = finalUrl?.trim() ?? '';
  if (!candidate.startsWith('https://')) {
    return fallback;
  }
  if (platform === 'channels') {
    if (
      candidate.includes('channels.weixin.qq.com') &&
      !candidate.includes('login')
    ) {
      return candidate;
    }
    return fallback;
  }
  try {
    const host = new URL(candidate).hostname;
    const loginHost = catalog?.loginUrl
      ? new URL(catalog.loginUrl).hostname
      : '';
    if (loginHost && (host === loginHost || host.endsWith(`.${loginHost.replace(/^www\./, '')}`))) {
      if (!candidate.includes('login') && !candidate.includes('passport')) {
        return candidate;
      }
    }
  } catch {
    // ignore malformed finalUrl
  }
  return fallback;
}

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
    const platformUserId = this.resolvePlatformUserId(dto);
    const platformNickname = dto.profile?.nickname?.trim() || null;
    const displayName = dto.displayName?.trim() || dto.profile?.nickname?.trim() || platformUserId || `${catalog.displayName}账号`;
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
      account = await this.repository.findByPlatformUser(dto.platform, platformUserId);
    }

    if (account) {
      // Re-adding an existing account refreshes authorization, not its local name.
      if (dto.displayName?.trim()) {
        account.displayName = dto.displayName.trim();
      }
      account.platformNickname = platformNickname ?? account.platformNickname;
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
        platformNickname,
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

  async reauth(id: string, dto: ReauthPlatformAccountDto): Promise<PlatformAccountPublic> {
    const account = await this.repository.findById(id);
    if (!account) {
      throw new NotFoundException(`Platform account #${id} not found`);
    }
    if (!dto.cookies?.length) {
      throw new BadRequestException('cookies are required');
    }

    const platformUserId = this.resolvePlatformUserId(dto);
    if (!platformUserId) {
      throw new BadRequestException('未能确认登录账号，请重新授权');
    }
    if (
      account.platformUserId &&
      account.platformUserId !== platformUserId &&
      !this.isSamePlatformIdentity(account, platformUserId, dto)
    ) {
      throw new BadRequestException('登录账号与原账号不同，请使用原账号重新授权');
    }
    if (!account.platformUserId) {
      const existing = await this.repository.findByPlatformUser(account.platform, platformUserId);
      if (existing && existing.id !== account.id) {
        throw new BadRequestException('该账号已添加，请在对应账号上重新授权');
      }
    }

    const previousUserId = account.platformUserId;
    const previousNickname = account.platformNickname;
    const nickname = dto.profile?.nickname?.trim() || null;

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
    } else if (
      nickname &&
      (account.displayName === previousUserId ||
        (previousNickname && account.displayName === previousNickname))
    ) {
      // 本地名仍是误抓的平台 ID / 旧昵称占位时，换成本次真实昵称
      account.displayName = nickname;
    }
    account.platformUserId = platformUserId;
    if (nickname) {
      account.platformNickname = nickname;
    }
    if (dto.profile?.avatarUrl?.trim()) {
      account.avatarUrl = dto.profile.avatarUrl.trim();
    }

    const saved = await this.repository.save(account);
    return this.toPublic(saved);
  }

  /**
   * 判断「库里旧 ID」与「本次资料 ID」是否同一账号。
   * - alternateUserIds 命中（如旧存 uniqId、新为 finderUsername）
   * - 视频号：旧 ID 不像 finderUsername，但本次会话已拉到合法 finderUsername（纠偏误抓）
   */
  private isSamePlatformIdentity(
    account: PlatformAccount,
    platformUserId: string,
    dto: ReauthPlatformAccountDto,
  ): boolean {
    const stored = account.platformUserId?.trim();
    if (!stored) {
      return false;
    }
    const alts = (dto.profile?.alternateUserIds ?? [])
      .map((item) => item.trim())
      .filter(Boolean);
    if (alts.includes(stored)) {
      return true;
    }
    if (
      account.platform === 'channels' &&
      isChannelsFinderUsername(platformUserId) &&
      !isChannelsFinderUsername(stored)
    ) {
      return true;
    }
    return false;
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

  private resolvePlatformUserId(dto: BindPlatformAccountDto | ReauthPlatformAccountDto): string | null {
    const explicitId = dto.platformUserId?.trim();
    const profileId = dto.profile?.platformUserId?.trim();
    if (explicitId && profileId && explicitId !== profileId) {
      throw new BadRequestException('未能确认登录账号，请重新授权');
    }
    return profileId || explicitId || null;
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
      payload = JSON.parse(decryptCredentialPayload(account.credentialCipher)) as { cookies?: StoredCookie[]; finalUrl?: string | null };
    } catch (error) {
      // 缺密钥与密文损坏/密钥轮换都会进这里；前者提示配置，后者要求重新授权
      const detail = error instanceof Error ? error.message : String(error);
      if (detail.includes('PLATFORM_CREDENTIAL_SECRET')) {
        throw new BadRequestException('PLATFORM_CREDENTIAL_SECRET is not configured; cannot decrypt stored credentials');
      }
      throw new BadRequestException('Stored credentials are unreadable, please reauthorize');
    }
    if (!payload.cookies?.length) {
      throw new BadRequestException('No stored cookies, please reauthorize the account');
    }

    const catalog = getPlatformCatalogItem(account.platform);
    // 优先上次停留的后台页；否则用 homeUrl（视频号不可用 login.html，否则必现扫码页）
    const openUrl = resolveCreatorOpenUrl(
      account.platform,
      catalog,
      payload.finalUrl,
    );
    return {
      accountId: account.id,
      platform: account.platform,
      displayName: account.displayName,
      openUrl,
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
