import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CurrentTeam } from '@pugying/core';
import { PlatformAccount } from '@pugying/platform-account/domain/entities/platform-account.entity';
import { PLATFORM_CATALOG } from '@pugying/platform-account/domain/platform-catalog';
import { decryptCredentialPayload, encryptCredentialPayload } from '@pugying/platform-account/infrastructure/credential-crypto';
import { PlatformAccountService } from './platform-account.service';

const TEAM_A = 'team-a';
const COOKIES = [{ name: 'sessionid', value: 'abc123' }];

class FakeCurrentTeam {
  id: string | null = null;

  get isAvailable(): boolean {
    return this.id !== null;
  }
}

function createAccount(overrides: Partial<PlatformAccount> = {}): PlatformAccount {
  return Object.assign(new PlatformAccount(), {
    id: 'account-1',
    teamId: TEAM_A,
    platform: 'douyin',
    displayName: '我的抖音号',
    platformUserId: 'douyin-123',
    avatarUrl: null,
    credentialCipher: encryptCredentialPayload(JSON.stringify({ cookies: COOKIES, finalUrl: 'https://creator.douyin.com/home' })),
    status: 'active',
    lastAuthedAt: null,
    ...overrides,
  });
}

describe('PlatformAccountService', () => {
  let repository: any;
  let currentTeam: FakeCurrentTeam;
  let service: PlatformAccountService;

  beforeEach(() => {
    repository = {
      create: jest.fn((data: Partial<PlatformAccount>) => Object.assign(new PlatformAccount(), data)),
      findAllForCurrentTeam: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      findByPlatformUser: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (account: PlatformAccount) => account),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    currentTeam = new FakeCurrentTeam();
    currentTeam.id = TEAM_A;
    service = new PlatformAccountService(repository, currentTeam as unknown as CurrentTeam);
  });

  describe('listPlatforms', () => {
    it('returns the platform catalog', () => {
      expect(service.listPlatforms()).toBe(PLATFORM_CATALOG);
    });
  });

  describe('findAll', () => {
    it('strips credentialCipher from every row', async () => {
      repository.findAllForCurrentTeam.mockResolvedValue([createAccount()]);

      const rows = await service.findAll();

      expect(rows).toHaveLength(1);
      expect(rows[0]).not.toHaveProperty('credentialCipher');
      expect(rows[0].displayName).toBe('我的抖音号');
      expect(repository.findAllForCurrentTeam).toHaveBeenCalledWith(undefined);
    });

    it('forwards platform filter to the repository', async () => {
      await service.findAll('douyin');

      expect(repository.findAllForCurrentTeam).toHaveBeenCalledWith('douyin');
    });

    it('rejects unsupported platform filters', async () => {
      await expect(service.findAll('weibo')).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.findAllForCurrentTeam).not.toHaveBeenCalled();
    });
  });

  describe('bind', () => {
    it('rejects binding outside of a team context', async () => {
      currentTeam.id = null;

      await expect(service.bind({ platform: 'douyin', cookies: COOKIES })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unsupported platforms', async () => {
      await expect(service.bind({ platform: 'weibo', cookies: COOKIES })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a bind without cookies', async () => {
      await expect(service.bind({ platform: 'douyin', cookies: [] })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates an account scoped to the current team with encrypted cookies', async () => {
      const result = await service.bind({
        platform: 'douyin',
        cookies: COOKIES,
        finalUrl: 'https://creator.douyin.com/home',
        profile: { nickname: '创作者小明', platformUserId: 'dy-42' },
      });

      expect(result).not.toHaveProperty('credentialCipher');
      expect(result.teamId).toBe(TEAM_A);
      expect(result.platform).toBe('douyin');
      expect(result.displayName).toBe('创作者小明');
      expect(result.platformUserId).toBe('dy-42');
      expect(result.status).toBe('active');
      expect(result.lastAuthedAt).toBeInstanceOf(Date);

      const saved = repository.save.mock.calls[0][0] as PlatformAccount;
      const payload = JSON.parse(decryptCredentialPayload(saved.credentialCipher));
      expect(payload.cookies).toEqual(COOKIES);
      expect(payload.finalUrl).toBe('https://creator.douyin.com/home');
    });

    it('falls back to the platform display name when nothing else is known', async () => {
      const result = await service.bind({
        platform: 'douyin',
        cookies: COOKIES,
      });

      expect(result.displayName).toBe('抖音账号');
      expect(result.platformUserId).toBeNull();
    });

    it('prefers an explicit displayName over the scraped nickname', async () => {
      const result = await service.bind({
        platform: 'douyin',
        displayName: '运营主号',
        cookies: COOKIES,
        profile: { nickname: '创作者小明' },
      });

      expect(result.displayName).toBe('运营主号');
    });

    it('updates the existing account when the platform user is already bound', async () => {
      const existing = createAccount({
        displayName: '旧名字',
        status: 'expired',
        avatarUrl: 'https://cdn.example.com/old.png',
        platformUserId: 'dy-42',
      });
      repository.findByPlatformUser.mockResolvedValue(existing);

      const result = await service.bind({
        platform: 'douyin',
        platformUserId: 'dy-42',
        cookies: COOKIES,
      });

      expect(repository.findByPlatformUser).toHaveBeenCalledWith(TEAM_A, 'douyin', 'dy-42');
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledWith(existing);
      expect(result.status).toBe('active');
      // No scraped avatar in this bind: the stored one must survive.
      expect(result.avatarUrl).toBe('https://cdn.example.com/old.png');
      expect(result.displayName).toBe('dy-42');
    });
  });

  describe('reauth', () => {
    it('throws NotFoundException for unknown accounts', async () => {
      await expect(service.reauth('missing', { cookies: COOKIES })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a reauth without cookies', async () => {
      repository.findById.mockResolvedValue(createAccount());

      await expect(service.reauth('account-1', { cookies: [] })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('re-encrypts cookies and picks up the platform-side rename', async () => {
      const account = createAccount({ status: 'expired' });
      repository.findById.mockResolvedValue(account);

      const result = await service.reauth('account-1', {
        cookies: [{ name: 'sessionid', value: 'fresh' }],
        profile: {
          nickname: '新昵称',
          avatarUrl: 'https://cdn.example.com/new.png',
        },
      });

      expect(result.status).toBe('active');
      expect(result.displayName).toBe('新昵称');
      expect(result.avatarUrl).toBe('https://cdn.example.com/new.png');
      expect(result.lastAuthedAt).toBeInstanceOf(Date);

      const payload = JSON.parse(decryptCredentialPayload(account.credentialCipher));
      expect(payload.cookies).toEqual([{ name: 'sessionid', value: 'fresh' }]);
    });

    it('lets an explicit displayName win over the scraped nickname', async () => {
      repository.findById.mockResolvedValue(createAccount());

      const result = await service.reauth('account-1', {
        cookies: COOKIES,
        displayName: '手动名称',
        profile: { nickname: '抓取昵称' },
      });

      expect(result.displayName).toBe('手动名称');
    });
  });

  describe('rename', () => {
    it('throws NotFoundException for unknown accounts', async () => {
      await expect(service.rename('missing', '新名字')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a blank displayName', async () => {
      repository.findById.mockResolvedValue(createAccount());

      await expect(service.rename('account-1', '   ')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('trims and saves the new name', async () => {
      repository.findById.mockResolvedValue(createAccount());

      const result = await service.rename('account-1', '  新名字  ');

      expect(result.displayName).toBe('新名字');
      expect(repository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCredentials', () => {
    it('throws NotFoundException for unknown accounts', async () => {
      await expect(service.getCredentials('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects revoked accounts', async () => {
      repository.findById.mockResolvedValue(createAccount({ status: 'revoked' }));

      await expect(service.getCredentials('account-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unreadable stored credentials', async () => {
      repository.findById.mockResolvedValue(createAccount({ credentialCipher: 'corrupted-cipher' }));

      await expect(service.getCredentials('account-1')).rejects.toThrow('Stored credentials are unreadable, please reauthorize');
    });

    it('rejects payloads without cookies', async () => {
      repository.findById.mockResolvedValue(
        createAccount({
          credentialCipher: encryptCredentialPayload(JSON.stringify({ cookies: [], finalUrl: null })),
        }),
      );

      await expect(service.getCredentials('account-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns decrypted cookies with the creator-center url', async () => {
      repository.findById.mockResolvedValue(createAccount());

      const credentials = await service.getCredentials('account-1');

      expect(credentials).toEqual({
        accountId: 'account-1',
        platform: 'douyin',
        displayName: '我的抖音号',
        openUrl: 'https://creator.douyin.com/',
        cookies: COOKIES,
        finalUrl: 'https://creator.douyin.com/home',
      });
    });
  });

  describe('remove', () => {
    it('throws NotFoundException for unknown accounts', async () => {
      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('revokes the account before removing it', async () => {
      const account = createAccount();
      repository.findById.mockResolvedValue(account);

      await service.remove('account-1');

      expect(account.status).toBe('revoked');
      expect(repository.save).toHaveBeenCalledWith(account);
      expect(repository.remove).toHaveBeenCalledWith(account);
    });
  });
});
