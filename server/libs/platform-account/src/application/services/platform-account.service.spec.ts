import { randomUUID } from 'crypto';
import {
  PlatformAccountService,
  resolveCreatorOpenUrl,
} from './platform-account.service';
import { PlatformAccount } from '../../domain/entities/platform-account.entity';
import { getPlatformCatalogItem } from '../../domain/platform-catalog';
import { decryptCredentialPayload } from '../../infrastructure/credential-crypto';

const cookies = [{ name: 'session', value: 'new-session' }];

function setup(platformUserId: string | null = 'original-user') {
  const account = Object.assign(new PlatformAccount(), {
    id: randomUUID(),
    platform: 'douyin',
    displayName: '工作账号',
    platformNickname: '旧昵称',
    platformUserId,
    credentialCipher: 'old-credentials',
    status: 'expired',
    lastAuthedAt: null,
    avatarUrl: 'old-avatar',
  });
  const repository = {
    findById: jest.fn(async () => account),
    findByPlatformUser: jest.fn<Promise<PlatformAccount | null>, unknown[]>(async () => null),
    save: jest.fn(async (value: PlatformAccount) => value),
    create: jest.fn((data) => Object.assign(new PlatformAccount(), data)),
  };
  const service = new PlatformAccountService(repository as never);
  return { account, repository, service };
}

describe('媒体账号授权与名称保护', () => {
  it('refreshes credentials and platform nickname without overwriting the local name', async () => {
    const { account, repository, service } = setup();
    const result = await service.reauth(account.id, {
      cookies,
      profile: { platformUserId: 'original-user', nickname: '新昵称', avatarUrl: 'new-avatar' },
    });
    expect(result).toMatchObject({
      displayName: '工作账号',
      platformNickname: '新昵称',
      status: 'active',
      avatarUrl: 'new-avatar',
      platformUserId: 'original-user',
    });
    expect(result).not.toHaveProperty('credentialCipher');
    expect(JSON.parse(decryptCredentialPayload(account.credentialCipher))).toMatchObject({ cookies });
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it.each([
    { profile: { platformUserId: 'other-user', nickname: '另一个账号' } },
    { profile: { nickname: '无身份信息' } },
    { platformUserId: 'original-user', profile: { platformUserId: 'other-user' } },
    { platformUserId: '', profile: {} },
  ])('rejects unverified or different identities before changing any account state: %j', async (identity) => {
    const { account, repository, service } = setup();
    const before = { ...account };
    await expect(service.reauth(account.id, { cookies, ...identity })).rejects.toThrow();
    expect(account).toEqual(before);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('prevents a legacy account without an ID from taking an already bound identity', async () => {
    const { account, repository, service } = setup(null);
    repository.findByPlatformUser.mockResolvedValue(Object.assign(new PlatformAccount(), { id: randomUUID(), platformUserId: 'existing-user' }));
    await expect(service.reauth(account.id, { cookies, profile: { platformUserId: 'existing-user' } })).rejects.toThrow('该账号已添加');
    expect(account.credentialCipher).toBe('old-credentials');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('records a verified identity for a legacy account while retaining its local name', async () => {
    const { account, service } = setup(null);
    const result = await service.reauth(account.id, { cookies, profile: { platformUserId: 'verified-user', nickname: '平台昵称' } });
    expect(result).toMatchObject({ platformUserId: 'verified-user', displayName: '工作账号', platformNickname: '平台昵称' });
  });

  it('preserves a custom name when the same account is added again', async () => {
    const { account, repository, service } = setup();
    repository.findByPlatformUser.mockResolvedValue(account);
    const result = await service.bind({ platform: 'douyin', cookies, profile: { platformUserId: 'original-user', nickname: '新昵称' } });
    expect(result).toMatchObject({ id: account.id, displayName: '工作账号', platformNickname: '新昵称' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('initializes the local name and platform nickname for a newly added account', async () => {
    const { service } = setup();
    const result = await service.bind({ platform: 'douyin', cookies, profile: { platformUserId: 'new-user', nickname: '平台昵称' } });
    expect(result).toMatchObject({ displayName: '平台昵称', platformNickname: '平台昵称' });
  });

  it('keeps the nickname when only the local display name is edited', async () => {
    const { account, service } = setup();
    const result = await service.rename(account.id, '  我的备注  ');
    expect(result).toMatchObject({ displayName: '我的备注', platformNickname: '旧昵称' });
  });
});

describe('resolveCreatorOpenUrl', () => {
  const channels = getPlatformCatalogItem('channels');

  it('uses channels homeUrl instead of login.html', () => {
    expect(resolveCreatorOpenUrl('channels', channels, null)).toBe(
      'https://channels.weixin.qq.com/platform',
    );
    expect(
      resolveCreatorOpenUrl(
        'channels',
        channels,
        'https://channels.weixin.qq.com/login.html',
      ),
    ).toBe('https://channels.weixin.qq.com/platform');
  });

  it('prefers a saved non-login channels finalUrl', () => {
    expect(
      resolveCreatorOpenUrl(
        'channels',
        channels,
        'https://channels.weixin.qq.com/platform/post/list',
      ),
    ).toBe('https://channels.weixin.qq.com/platform/post/list');
  });
});

describe('视频号身份纠偏', () => {
  it('upgrades a bogus channels user id when the session profile is a real finderUsername', async () => {
    const account = Object.assign(new PlatformAccount(), {
      id: randomUUID(),
      platform: 'channels',
      displayName: 'eccommerce',
      platformNickname: 'eccommerce',
      platformUserId: 'eccommerce',
      credentialCipher: 'old-credentials',
      status: 'active',
      lastAuthedAt: null,
      avatarUrl: null,
    });
    const repository = {
      findById: jest.fn(async () => account),
      findByPlatformUser: jest.fn(async () => null),
      save: jest.fn(async (value: PlatformAccount) => value),
      create: jest.fn(),
    };
    const service = new PlatformAccountService(repository as never);
    const finder =
      'v2_060000231003b20faec8c7e6881bcbd4c706ed32b077cdde6d007a8e8000a308d0ca67b26db6@finder';
    const result = await service.reauth(account.id, {
      cookies,
      profile: {
        platformUserId: finder,
        nickname: 'Y2zz',
        avatarUrl: 'https://wx.qlogo.cn/finderhead/x',
        alternateUserIds: ['spheq0OhhRpbaFb'],
      },
    });
    expect(result).toMatchObject({
      platformUserId: finder,
      displayName: 'Y2zz',
      platformNickname: 'Y2zz',
      avatarUrl: 'https://wx.qlogo.cn/finderhead/x',
      status: 'active',
    });
  });

  it('accepts channels reauth when the stored id matches alternateUserIds', async () => {
    const finder =
      'v2_060000231003b20faec8c7e6881bcbd4c706ed32b077cdde6d007a8e8000a308d0ca67b26db6@finder';
    const account = Object.assign(new PlatformAccount(), {
      id: randomUUID(),
      platform: 'channels',
      displayName: '备注名',
      platformNickname: '旧昵称',
      platformUserId: 'spheq0OhhRpbaFb',
      credentialCipher: 'old-credentials',
      status: 'expired',
      lastAuthedAt: null,
      avatarUrl: null,
    });
    const repository = {
      findById: jest.fn(async () => account),
      findByPlatformUser: jest.fn(async () => null),
      save: jest.fn(async (value: PlatformAccount) => value),
      create: jest.fn(),
    };
    const service = new PlatformAccountService(repository as never);
    const result = await service.reauth(account.id, {
      cookies,
      profile: {
        platformUserId: finder,
        nickname: 'Y2zz',
        alternateUserIds: ['spheq0OhhRpbaFb'],
      },
    });
    // 用户自定义显示名保留
    expect(result).toMatchObject({
      platformUserId: finder,
      displayName: '备注名',
      platformNickname: 'Y2zz',
    });
  });
});
