import { randomUUID } from 'crypto';
import { existsSync, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import {
  createE2eApp,
  E2E_JWT_SECRET,
  loginAsAdmin,
  type AuthSession,
  type E2eTestApp,
} from './e2e-test-app';

describe('Content publish runtime (e2e)', () => {
  let ctx: E2eTestApp;
  let admin: AuthSession;
  let platformAccountId: string;
  let videoAssetUrl: string;
  let coverAssetUrl: string;
  let coverLandscapeAssetUrl: string;
  let contentId: string;
  let targetId: string;
  const mediaRoot = join(tmpdir(), `pugying-e2e-media-${randomUUID()}`);

  const server = () => ctx.app.getHttpServer();
  const auth = () => ({
    Authorization: `Bearer ${admin.accessToken}`,
    'X-Team-Id': admin.teamId,
  });

  beforeAll(async () => {
    process.env.MEDIA_STORAGE_DIR = mediaRoot;
    process.env.MEDIA_PUBLIC_BASE_URL = 'http://127.0.0.1:3999';
    process.env.MEDIA_SIGNING_SECRET = E2E_JWT_SECRET;
    ctx = await createE2eApp();
    admin = await loginAsAdmin(ctx.app);

    const bound = await request(server())
      .post('/platform-accounts')
      .set(auth())
      .send({
        platform: 'douyin',
        displayName: '发布 E2E 抖音号',
        cookies: [
          { name: 'sessionid', value: 'publish-e2e-session', domain: '.douyin.com' },
        ],
      })
      .expect(201);
    platformAccountId = bound.body.id as string;

    videoAssetUrl = await uploadTinyAsset('video', 'clip.mp4', 'video/mp4');
    coverAssetUrl = await uploadTinyAsset('cover', 'cover.jpg', 'image/jpeg');
    coverLandscapeAssetUrl = await uploadTinyAsset(
      'cover_landscape',
      'cover-l.jpg',
      'image/jpeg',
    );
  });

  afterAll(async () => {
    await ctx.close();
    if (existsSync(mediaRoot)) {
      await fs.rm(mediaRoot, { recursive: true, force: true });
    }
  });

  async function uploadTinyAsset(
    kind: 'video' | 'cover' | 'cover_landscape',
    name: string,
    mime: string,
  ): Promise<string> {
    const bytes = Buffer.from(
      kind === 'video' ? 'fake-mp4-bytes-for-e2e' : 'fake-jpeg-bytes',
    );
    const init = await request(server())
      .post('/media/uploads')
      .set(auth())
      .send({
        kind,
        originalName: name,
        mimeType: mime,
        sizeBytes: bytes.length,
      })
      .expect(201);

    const uploadId = init.body.uploadId as string;
    await request(server())
      .put(`/media/uploads/${uploadId}/chunks/0`)
      .set(auth())
      .attach('chunk', bytes, { filename: 'chunk-0', contentType: mime })
      .expect(200);

    const done = await request(server())
      .post(`/media/uploads/${uploadId}/complete`)
      .set(auth())
      .expect(201);

    expect(done.body.url).toMatch(/^\/media\/assets\//);
    return done.body.url as string;
  }

  it('creates a video draft ready for real publish', async () => {
    const res = await request(server())
      .post('/contents')
      .set(auth())
      .send({
        type: 'video',
        title: 'E2E 发布视频',
        coverUrl: coverAssetUrl,
        coverLandscapeUrl: coverLandscapeAssetUrl,
        mediaUrls: [videoAssetUrl],
        targets: [{ platformAccountId }],
        status: 'draft',
      })
      .expect(201);

    contentId = res.body.id as string;
    expect(res.body.targets).toHaveLength(1);
    expect(res.body.targets[0].publishStatus).toBe('idle');
    targetId = res.body.targets[0].id as string;
  });

  it('publish queues targets and returns signed URL + cookies dispatch', async () => {
    const res = await request(server())
      .post(`/contents/${contentId}/publish`)
      .set(auth())
      .expect(201);

    expect(res.body.content.status).toBe('published');
    expect(res.body.dispatches).toHaveLength(1);
    const dispatch = res.body.dispatches[0];
    expect(dispatch.targetId).toBe(targetId);
    expect(dispatch.platform).toBe('douyin');
    expect(dispatch.accountId).toBe(platformAccountId);
    expect(dispatch.title).toBe('E2E 发布视频');
    expect(dispatch.cookies[0].name).toBe('sessionid');
    expect(dispatch.mediaUrl).toContain('/media/assets/');
    expect(dispatch.mediaUrl).toContain('sig=');
    expect(dispatch.coverUrl).toContain('sig=');

    const detail = await request(server())
      .get(`/contents/${contentId}`)
      .set(auth())
      .expect(200);
    expect(detail.body.targets[0].publishStatus).toBe('queued');
  });

  it('rejects duplicate publish while queued (idempotent)', async () => {
    await request(server())
      .post(`/contents/${contentId}/publish`)
      .set(auth())
      .expect(409);
  });

  it('signed download verifies HMAC without JWT', async () => {
    const assetId = videoAssetUrl.split('/').pop()!;
    const signed = await request(server())
      .post(`/media/assets/${assetId}/signed-url`)
      .set(auth())
      .expect(201);

    const url = new URL(signed.body.url as string);
    // Host comes from MEDIA_PUBLIC_BASE_URL; path is what we hit on this server.
    const pathWithQuery = `${url.pathname}${url.search}`;
    const dl = await request(server()).get(pathWithQuery).expect(200);
    expect(Buffer.isBuffer(dl.body) || typeof dl.body === 'string').toBe(true);

    const badSig = pathWithQuery.replace(/sig=[^&]+/, 'sig=deadbeef');
    await request(server()).get(badSig).expect(401);
  });

  it('start → complete success path', async () => {
    const started = await request(server())
      .post(`/contents/${contentId}/targets/${targetId}/start`)
      .set(auth())
      .expect(201);
    expect(started.body.target.publishStatus).toBe('running');
    expect(started.body.dispatch.cookies.length).toBeGreaterThan(0);

    const done = await request(server())
      .post(`/contents/${contentId}/targets/${targetId}/complete`)
      .set(auth())
      .send({
        ok: true,
        platformPostId: 'e2e-post-1',
        platformUrl: 'https://www.douyin.com/video/e2e-post-1',
      })
      .expect(201);
    expect(done.body.publishStatus).toBe('succeeded');
    expect(done.body.platformPostId).toBe('e2e-post-1');
  });

  it('retry after AUTH_EXPIRED marks account expired', async () => {
    // Reset target via retry is only for failed/cancelled — force fail first
    // by creating a second content for the failure path.
    const created = await request(server())
      .post('/contents')
      .set(auth())
      .send({
        type: 'video',
        title: 'E2E 授权失效',
        coverUrl: coverAssetUrl,
        coverLandscapeUrl: coverLandscapeAssetUrl,
        mediaUrls: [videoAssetUrl],
        targets: [{ platformAccountId }],
      })
      .expect(201);
    const cid = created.body.id as string;
    const tid = created.body.targets[0].id as string;

    await request(server()).post(`/contents/${cid}/publish`).set(auth()).expect(201);
    await request(server())
      .post(`/contents/${cid}/targets/${tid}/start`)
      .set(auth())
      .expect(201);
    await request(server())
      .post(`/contents/${cid}/targets/${tid}/complete`)
      .set(auth())
      .send({
        ok: false,
        errorCode: 'AUTH_EXPIRED',
        errorMessage: '登录失效',
      })
      .expect(201);

    const accounts = await request(server())
      .get('/platform-accounts')
      .set(auth())
      .expect(200);
    const account = (accounts.body as Array<{ id: string; status: string }>).find(
      (a) => a.id === platformAccountId,
    );
    expect(account?.status).toBe('expired');

    // Re-activate via reauth so later tests / cleanup stay sane
    await request(server())
      .post(`/platform-accounts/${platformAccountId}/reauth`)
      .set(auth())
      .send({
        cookies: [
          { name: 'sessionid', value: 'publish-e2e-reauthed', domain: '.douyin.com' },
        ],
      })
      .expect(201);
  });

  it('lists media library assets by video/image and soft-deletes', async () => {
    const all = await request(server())
      .get('/media/assets')
      .set(auth())
      .expect(200);
    expect(Array.isArray(all.body)).toBe(true);
    expect(all.body.length).toBeGreaterThanOrEqual(2);

    const videos = await request(server())
      .get('/media/assets?type=video')
      .set(auth())
      .expect(200);
    expect(
      (videos.body as Array<{ category: string }>).every(
        (row) => row.category === 'video',
      ),
    ).toBe(true);

    const images = await request(server())
      .get('/media/assets?type=image')
      .set(auth())
      .expect(200);
    expect(
      (images.body as Array<{ category: string }>).every(
        (row) => row.category === 'image',
      ),
    ).toBe(true);

    const doomed = await uploadTinyAsset('cover', 'to-delete.jpg', 'image/jpeg');
    const doomedId = doomed.split('/').pop()!;
    await request(server())
      .delete(`/media/assets/${doomedId}`)
      .set(auth())
      .expect(200);

    const after = await request(server())
      .get('/media/assets?type=image')
      .set(auth())
      .expect(200);
    expect(
      (after.body as Array<{ id: string }>).some((row) => row.id === doomedId),
    ).toBe(false);
  });

  it('cancel a queued target', async () => {
    const created = await request(server())
      .post('/contents')
      .set(auth())
      .send({
        type: 'video',
        title: 'E2E 取消',
        coverUrl: coverAssetUrl,
        coverLandscapeUrl: coverLandscapeAssetUrl,
        mediaUrls: [videoAssetUrl],
        targets: [{ platformAccountId }],
      })
      .expect(201);
    const cid = created.body.id as string;
    const tid = created.body.targets[0].id as string;

    await request(server()).post(`/contents/${cid}/publish`).set(auth()).expect(201);
    const cancelled = await request(server())
      .post(`/contents/${cid}/targets/${tid}/cancel`)
      .set(auth())
      .expect(201);
    expect(cancelled.body.publishStatus).toBe('cancelled');
  });
});
