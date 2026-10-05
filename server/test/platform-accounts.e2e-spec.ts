import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { PlatformAccount } from '../libs/platform-account/src/domain/entities/platform-account.entity';
import { PlatformAccountEntitySchema } from '../libs/platform-account/src/infrastructure/typeorm/platform-account.entity-schema';
import { TypeOrmPlatformAccountRepository } from '../libs/platform-account/src/infrastructure/typeorm/platform-account.repository';
import { PlatformAccountService } from '../libs/platform-account/src/application/services/platform-account.service';
import { PlatformAccountNickname1784574000000 } from '../src/database/migrations/1784574000000-platform-account-nickname';
import { encryptCredentialPayload } from '../libs/platform-account/src/infrastructure/credential-crypto';

it('upgrades an existing SQLite database, preserves account data, and persists protected authorization', async () => {
  process.env.PLATFORM_CREDENTIAL_SECRET = 'pugying-test-device-secret';
  const directory = join(__dirname, '../src/database/migrations');
  const database = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [PlatformAccountEntitySchema],
    migrations: readdirSync(directory)
      .filter((file) => file.endsWith('.ts') && !file.includes('platform-account-nickname'))
      .map((file) => join(directory, file)),
    migrationsRun: true,
  });
  await database.initialize();
  const runner = database.createQueryRunner();
  try {
    const id = '383ac574-6d81-4b27-a20d-621db45937b0';
    const oldCookies = [{ name: 'session', value: 'original-session' }];
    await database.query('INSERT INTO platform_account (id, platform, displayName, platformUserId, credentialCipher, status) VALUES (?, ?, ?, ?, ?, ?)', [
      id,
      'douyin',
      '原有自定义名称',
      'original-user',
      encryptCredentialPayload(JSON.stringify({ cookies: oldCookies })),
      'expired',
    ]);
    const migration = new PlatformAccountNickname1784574000000();
    await migration.up(runner);
    const repository = new TypeOrmPlatformAccountRepository(database.getRepository(PlatformAccount), database);
    const service = new PlatformAccountService(repository);
    expect(await repository.findById(id)).toMatchObject({ displayName: '原有自定义名称', platformNickname: null });
    const updatedCookies = [{ name: 'session', value: 'updated-session' }];
    await service.reauth(id, { cookies: updatedCookies, profile: { platformUserId: 'original-user', nickname: '平台新昵称' } });
    expect(await repository.findById(id)).toMatchObject({ displayName: '原有自定义名称', platformNickname: '平台新昵称', status: 'active' });
    await expect(service.reauth(id, { cookies: oldCookies, profile: { platformUserId: 'other-user' } })).rejects.toThrow('登录账号与原账号不同');
    expect((await service.getCredentials(id)).cookies).toEqual(updatedCookies);
    expect(await service.findAll()).toEqual([expect.objectContaining({ id, displayName: '原有自定义名称', platformNickname: '平台新昵称' })]);
    await migration.down(runner);
    const rows = await database.query<Array<{ displayName: string; platformUserId: string }>>(
      'SELECT displayName, platformUserId FROM platform_account WHERE id = ?',
      [id],
    );
    expect(rows).toEqual([{ displayName: '原有自定义名称', platformUserId: 'original-user' }]);
  } finally {
    await runner.release();
    await database.destroy();
  }
});
