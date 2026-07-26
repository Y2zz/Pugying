import { randomUUID } from 'crypto';
import request from 'supertest';
import {
  createE2eApp,
  loginAsAdmin,
  loginAsEditor,
  type AuthSession,
  type E2eTestApp,
} from './e2e-test-app';

describe('Contents (e2e)', () => {
  let ctx: E2eTestApp;
  let admin: AuthSession;
  let adminDemo: AuthSession;
  let editor: AuthSession;
  let platformAccountId: string;
  let articleId: string;
  let videoId: string;

  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createE2eApp();
    admin = await loginAsAdmin(ctx.app);
    adminDemo = await loginAsAdmin(ctx.app, 'demo');
    editor = await loginAsEditor(ctx.app);

    const bound = await request(server())
      .post('/platform-accounts')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({
        platform: 'douyin',
        displayName: '分发账号',
        cookies: [{ name: 'sessionid', value: 'content-e2e-cookie' }],
      })
      .expect(201);
    platformAccountId = bound.body.id as string;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('creates an article draft with sensible defaults (201)', async () => {
    const res = await request(server())
      .post('/contents')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ type: 'article', title: '第一篇图文' })
      .expect(201);

    expect(res.body.type).toBe('article');
    expect(res.body.status).toBe('draft');
    expect(res.body.visibility).toBe('public');
    expect(res.body.allowDownload).toBe(true);
    expect(res.body.publishedAt).toBeNull();
    expect(res.body.teamId).toBe(admin.teamId);
    expect(res.body.targets).toEqual([]);
    articleId = res.body.id as string;
  });

  it('creates a published video with a target and per-account overrides (201)', async () => {
    const res = await request(server())
      .post('/contents')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({
        type: 'video',
        title: '第一条视频',
        body: '视频简介',
        mediaUrls: ['https://cdn.example.com/v1.mp4'],
        tags: ['e2e', '测试'],
        status: 'published',
        targets: [
          {
            platformAccountId,
            overrides: { title: '抖音专属标题' },
          },
        ],
      })
      .expect(201);

    expect(res.body.status).toBe('published');
    expect(res.body.publishedAt).toBeTruthy();
    expect(res.body.targets).toHaveLength(1);
    expect(res.body.targets[0].platformAccountId).toBe(platformAccountId);
    expect(res.body.targets[0].platform).toBe('douyin');
    expect(res.body.targets[0].overrides.title).toBe('抖音专属标题');
    videoId = res.body.id as string;
  });

  it('rejects an unsupported content type (400)', async () => {
    await request(server())
      .post('/contents')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ type: 'audio', title: '播客' })
      .expect(400);
  });

  it('rejects a payload without a title (400)', async () => {
    await request(server())
      .post('/contents')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ type: 'article' })
      .expect(400);
  });

  it('rejects unknown extra properties (400)', async () => {
    await request(server())
      .post('/contents')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ type: 'article', title: '多余字段', autoPublish: true })
      .expect(400);
  });

  it('rejects a target that references an unknown platform account (400)', async () => {
    await request(server())
      .post('/contents')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({
        type: 'article',
        title: '坏目标',
        targets: [{ platformAccountId: randomUUID() }],
      })
      .expect(400);
  });

  it('rejects creation without X-Team-Id (400)', async () => {
    await request(server())
      .post('/contents')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ type: 'article', title: '没团队' })
      .expect(400);
  });

  it('lists team contents, optionally filtered by type', async () => {
    const all = await request(server())
      .get('/contents')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(200);
    expect((all.body as Array<unknown>).length).toBe(2);

    const articles = await request(server())
      .get('/contents')
      .query({ type: 'article' })
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(200);
    expect((articles.body as Array<{ type: string }>).every((c) => c.type === 'article')).toBe(true);
    expect((articles.body as Array<unknown>).length).toBe(1);

    await request(server())
      .get('/contents')
      .query({ type: 'podcast' })
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(400);
  });

  it('returns content details including targets', async () => {
    const res = await request(server())
      .get(`/contents/${videoId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(200);

    expect(res.body.title).toBe('第一条视频');
    expect(res.body.targets).toHaveLength(1);
  });

  it('unknown content id yields 404', async () => {
    await request(server())
      .get(`/contents/${randomUUID()}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(404);
  });

  it('publish / unpublish toggles publishedAt', async () => {
    const published = await request(server())
      .patch(`/contents/${articleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ status: 'published' })
      .expect(200);
    expect(published.body.publishedAt).toBeTruthy();

    const drafted = await request(server())
      .patch(`/contents/${articleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ status: 'draft', title: '第一篇图文（改）' })
      .expect(200);
    expect(drafted.body.status).toBe('draft');
    expect(drafted.body.publishedAt).toBeNull();
    expect(drafted.body.title).toBe('第一篇图文（改）');
  });

  it('updating targets replaces them entirely', async () => {
    const cleared = await request(server())
      .patch(`/contents/${videoId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ targets: [] })
      .expect(200);
    expect(cleared.body.targets).toEqual([]);

    const restored = await request(server())
      .patch(`/contents/${videoId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ targets: [{ platformAccountId }] })
      .expect(200);
    expect(restored.body.targets).toHaveLength(1);
  });

  it('rejects an over-long title (400)', async () => {
    await request(server())
      .patch(`/contents/${articleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ title: '长'.repeat(201) })
      .expect(400);
  });

  it('contents are isolated between teams', async () => {
    const demoList = await request(server())
      .get('/contents')
      .set('Authorization', `Bearer ${adminDemo.accessToken}`)
      .set('X-Team-Id', adminDemo.teamId)
      .expect(200);
    expect(demoList.body).toEqual([]);

    await request(server())
      .get(`/contents/${articleId}`)
      .set('Authorization', `Bearer ${adminDemo.accessToken}`)
      .set('X-Team-Id', adminDemo.teamId)
      .expect(404);

    // A demo-team content cannot target a default-team platform account.
    await request(server())
      .post('/contents')
      .set('Authorization', `Bearer ${adminDemo.accessToken}`)
      .set('X-Team-Id', adminDemo.teamId)
      .send({
        type: 'article',
        title: '跨团队目标',
        targets: [{ platformAccountId }],
      })
      .expect(400);
  });

  it('editor without Content permissions gets 403, anonymous gets 401', async () => {
    await request(server())
      .get('/contents')
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .set('X-Team-Id', editor.teamId)
      .expect(403);

    await request(server()).get('/contents').expect(401);
  });

  it('soft-deletes content and hides it from reads', async () => {
    await request(server())
      .delete(`/contents/${articleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(200);

    await request(server())
      .get(`/contents/${articleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(404);

    const list = await request(server())
      .get('/contents')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(200);
    const ids = (list.body as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toEqual([videoId]);

    await request(server())
      .patch(`/contents/${articleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ title: '已删除还想改' })
      .expect(404);
  });
});
