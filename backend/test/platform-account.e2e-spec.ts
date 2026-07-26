import Database from 'better-sqlite3';
import request from 'supertest';
import { createE2eApp, loginAsAdmin, loginAsEditor, type AuthSession, type E2eTestApp } from './e2e-test-app';

const SECRET_COOKIE_VALUE = 'e2e-super-secret-cookie-9f2c41';
const ROTATED_COOKIE_VALUE = 'e2e-rotated-cookie-77aa02';

describe('Platform accounts (e2e)', () => {
  let ctx: E2eTestApp;
  let admin: AuthSession;
  let adminDemo: AuthSession;
  let editor: AuthSession;
  let douyinAccountId: string;

  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createE2eApp();
    admin = await loginAsAdmin(ctx.app);
    adminDemo = await loginAsAdmin(ctx.app, 'demo');
    editor = await loginAsEditor(ctx.app);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lists the bindable platform catalog', async () => {
    const res = await request(server())
      .get('/platform-accounts/platforms')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(200);

    const ids = (res.body as Array<{ id: string }>).map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['douyin', 'toutiao', 'channels', 'bilibili', 'xiaohongshu']));
    const douyin = (res.body as Array<{ id: string; loginUrl: string }>).find((p) => p.id === 'douyin');
    expect(douyin!.loginUrl).toContain('creator.douyin.com');
  });

  it('editor without PlatformAccount permissions gets 403', async () => {
    await request(server()).get('/platform-accounts').set('Authorization', `Bearer ${editor.accessToken}`).set('X-Team-Id', editor.teamId).expect(403);
  });

  it('requests without a token get 401', async () => {
    await request(server()).get('/platform-accounts').expect(401);
  });

  it('rejects an unsupported platform id (400)', async () => {
    await request(server())
      .post('/platform-accounts')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ platform: 'weibo', cookies: [{ name: 'sid', value: 'x' }] })
      .expect(400);
  });

  it('rejects a bind without cookies (400)', async () => {
    await request(server())
      .post('/platform-accounts')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ platform: 'douyin' })
      .expect(400);
  });

  it('rejects a bind with an empty cookie list (400)', async () => {
    await request(server())
      .post('/platform-accounts')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ platform: 'douyin', cookies: [] })
      .expect(400);
  });

  it('rejects unknown extra properties (400)', async () => {
    await request(server())
      .post('/platform-accounts')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({
        platform: 'douyin',
        cookies: [{ name: 'sid', value: 'x' }],
        hacker: true,
      })
      .expect(400);
  });

  it('rejects a bind without X-Team-Id (400)', async () => {
    await request(server())
      .post('/platform-accounts')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ platform: 'douyin', cookies: [{ name: 'sid', value: 'x' }] })
      .expect(400);
  });

  it('binds a douyin account and never echoes the credential material', async () => {
    const res = await request(server())
      .post('/platform-accounts')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({
        platform: 'douyin',
        displayName: '抖音主号',
        platformUserId: 'dy-1001',
        cookies: [{ name: 'sessionid', value: SECRET_COOKIE_VALUE, domain: '.douyin.com' }],
        finalUrl: 'https://creator.douyin.com/creator-micro/home',
      })
      .expect(201);

    expect(res.body.platform).toBe('douyin');
    expect(res.body.displayName).toBe('抖音主号');
    expect(res.body.status).toBe('active');
    expect(res.body.teamId).toBe(admin.teamId);
    expect(res.body.credentialCipher).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain(SECRET_COOKIE_VALUE);
    douyinAccountId = res.body.id as string;
  });

  it('the account list contains no credential plaintext or cipher field', async () => {
    const res = await request(server())
      .get('/platform-accounts')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(200);

    expect((res.body as Array<unknown>).length).toBe(1);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(SECRET_COOKIE_VALUE);
    expect(serialized).not.toContain('credentialCipher');
  });

  it('stores the cookie payload AES-GCM encrypted at rest', () => {
    const db = new Database(ctx.dbPath, { readonly: true });
    try {
      const row = db.prepare('SELECT * FROM platform_account WHERE id = ?').get(douyinAccountId) as Record<string, unknown>;

      expect(row).toBeDefined();
      expect(JSON.stringify(row)).not.toContain(SECRET_COOKIE_VALUE);
      // iv.tag.payload — the credential-crypto wire format
      expect(row.credentialCipher).toMatch(/^[A-Za-z0-9+/]+=*\.[A-Za-z0-9+/]+=*\.[A-Za-z0-9+/]+=*$/);
    } finally {
      db.close();
    }
  });

  it('decrypts credentials for the desktop agent (JWT_SECRET fallback key)', async () => {
    const res = await request(server())
      .post(`/platform-accounts/${douyinAccountId}/credentials`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(201);

    expect(res.body.platform).toBe('douyin');
    expect(res.body.openUrl).toBe('https://creator.douyin.com/');
    expect(res.body.cookies[0].name).toBe('sessionid');
    expect(res.body.cookies[0].value).toBe(SECRET_COOKIE_VALUE);
    expect(res.body.finalUrl).toBe('https://creator.douyin.com/creator-micro/home');
  });

  it('renames an account, and rejects an empty display name', async () => {
    const renamed = await request(server())
      .patch(`/platform-accounts/${douyinAccountId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ displayName: '抖音·重命名' })
      .expect(200);
    expect(renamed.body.displayName).toBe('抖音·重命名');

    await request(server())
      .patch(`/platform-accounts/${douyinAccountId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ displayName: '' })
      .expect(400);
  });

  it('reauth rotates the stored cookies', async () => {
    await request(server())
      .post(`/platform-accounts/${douyinAccountId}/reauth`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ cookies: [{ name: 'sessionid', value: ROTATED_COOKIE_VALUE }] })
      .expect(201);

    const creds = await request(server())
      .post(`/platform-accounts/${douyinAccountId}/credentials`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(201);
    expect(creds.body.cookies[0].value).toBe(ROTATED_COOKIE_VALUE);
  });

  it('falls back to the scraped profile nickname when no display name is given', async () => {
    const res = await request(server())
      .post('/platform-accounts')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({
        platform: 'bilibili',
        cookies: [{ name: 'SESSDATA', value: 'bili-cookie' }],
        profile: { nickname: 'B站小号', platformUserId: 'uid-777' },
      })
      .expect(201);

    expect(res.body.displayName).toBe('B站小号');
    expect(res.body.platformUserId).toBe('uid-777');
  });

  it('accounts are isolated per team', async () => {
    const demoList = await request(server())
      .get('/platform-accounts')
      .set('Authorization', `Bearer ${adminDemo.accessToken}`)
      .set('X-Team-Id', adminDemo.teamId)
      .expect(200);
    expect(demoList.body).toEqual([]);

    await request(server())
      .post(`/platform-accounts/${douyinAccountId}/credentials`)
      .set('Authorization', `Bearer ${adminDemo.accessToken}`)
      .set('X-Team-Id', adminDemo.teamId)
      .expect(404);
  });

  it('rejects a malformed account id (400)', async () => {
    await request(server())
      .patch('/platform-accounts/not-a-uuid')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ displayName: 'x' })
      .expect(400);
  });

  it('unbinds (soft-deletes) the account', async () => {
    await request(server())
      .delete(`/platform-accounts/${douyinAccountId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(200);

    const list = await request(server())
      .get('/platform-accounts')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(200);
    const ids = (list.body as Array<{ id: string }>).map((a) => a.id);
    expect(ids).not.toContain(douyinAccountId);

    await request(server())
      .post(`/platform-accounts/${douyinAccountId}/credentials`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(404);
  });
});
