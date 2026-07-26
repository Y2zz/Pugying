import { randomUUID } from 'crypto';
import request from 'supertest';
import {
  createE2eApp,
  loginAsAdmin,
  loginAsEditor,
  type AuthSession,
  type E2eTestApp,
} from './e2e-test-app';

describe('Team management (e2e)', () => {
  let ctx: E2eTestApp;
  let admin: AuthSession;
  let editor: AuthSession;
  let e2eTeamId: string;

  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createE2eApp();
    admin = await loginAsAdmin(ctx.app);
    editor = await loginAsEditor(ctx.app);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lists the seeded teams (200)', async () => {
    const list = await request(server())
      .get('/team-management')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(200);

    const names = (list.body as Array<{ name: string }>).map((t) => t.name);
    expect(names).toContain('default');
    expect(names).toContain('demo');
  });

  it('editor without TeamManagement.Teams.View gets 403', async () => {
    await request(server())
      .get('/team-management')
      .set('Authorization', `Bearer ${editor.accessToken}`)
      .set('X-Team-Id', editor.teamId)
      .expect(403);
  });

  it('listing teams without a token gets 401', async () => {
    await request(server()).get('/team-management').expect(401);
  });

  it('creates a team (201)', async () => {
    const created = await request(server())
      .post('/team-management')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ displayName: 'E2E 测试团队', name: 'e2e-team' })
      .expect(201);

    expect(created.body.name).toBe('e2e-team');
    expect(created.body.active).toBe(true);
    e2eTeamId = created.body.id as string;
  });

  it('rejects a create payload missing name (400)', async () => {
    await request(server())
      .post('/team-management')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ displayName: '缺标识' })
      .expect(400);
  });

  it('rejects unknown extra properties (400)', async () => {
    await request(server())
      .post('/team-management')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ displayName: '多余字段', name: 'extra-team', owner: 'admin' })
      .expect(400);
  });

  it('creating a team does not make the creator a member', async () => {
    const myTeams = await request(server())
      .get('/account/my-teams')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(200);

    const names = (myTeams.body as Array<{ name: string }>).map((t) => t.name);
    expect(names).not.toContain('e2e-team');
    expect(names.sort()).toEqual(['default', 'demo']);
  });

  it('gets a single team (200)', async () => {
    const team = await request(server())
      .get(`/team-management/${e2eTeamId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(200);

    expect(team.body.displayName).toBe('E2E 测试团队');
  });

  it('unknown team id yields 404, malformed id yields 400', async () => {
    await request(server())
      .get(`/team-management/${randomUUID()}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(404);

    await request(server())
      .get('/team-management/not-a-uuid')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(400);
  });

  it('updates the display name (200)', async () => {
    const updated = await request(server())
      .put(`/team-management/${e2eTeamId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ displayName: 'E2E 团队（改名）' })
      .expect(200);

    expect(updated.body.displayName).toBe('E2E 团队（改名）');
  });

  it('updating a missing team yields 404', async () => {
    await request(server())
      .put(`/team-management/${randomUUID()}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ displayName: '不存在' })
      .expect(404);
  });

  it('deactivates the team and X-Team-Id for it is rejected as inactive (403)', async () => {
    const updated = await request(server())
      .put(`/team-management/${e2eTeamId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ active: false })
      .expect(200);
    expect(updated.body.active).toBe(false);

    const res = await request(server())
      .get('/identity/me')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', e2eTeamId)
      .expect(403);
    expect(JSON.stringify(res.body.message)).toContain('inactive');
  });

  it('after reactivation the middleware passes and only the JWT mismatch remains (403)', async () => {
    await request(server())
      .put(`/team-management/${e2eTeamId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .send({ active: true })
      .expect(200);

    const res = await request(server())
      .get('/identity/me')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', e2eTeamId)
      .expect(403);
    expect(JSON.stringify(res.body.message)).toContain('does not match token team');
  });

  it('deletes the team (soft) and its X-Team-Id is no longer resolvable (400)', async () => {
    await request(server())
      .delete(`/team-management/${e2eTeamId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(200);

    await request(server())
      .get(`/team-management/${e2eTeamId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', admin.teamId)
      .expect(404);

    const res = await request(server())
      .get('/identity/me')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Team-Id', e2eTeamId)
      .expect(400);
    expect(JSON.stringify(res.body.message)).toContain('not found');
  });
});
