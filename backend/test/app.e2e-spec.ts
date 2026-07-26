import request from 'supertest';
import { createE2eApp, loginAsAdmin, SEED_ADMIN, type E2eTestApp } from './e2e-test-app';

describe('Account shared login (e2e)', () => {
  let ctx: E2eTestApp;

  beforeAll(async () => {
    ctx = await createE2eApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('/ (GET) public hello', () => {
    return request(ctx.app.getHttpServer()).get('/').expect(200);
  });

  it('POST /account/login requires team selection for admin', async () => {
    const response = await request(ctx.app.getHttpServer()).post('/account/login').send({ email: SEED_ADMIN.email, password: SEED_ADMIN.password }).expect(201);

    expect(response.body.requiresTeamSelection).toBe(true);
    expect(response.body.loginTicket).toBeDefined();
    expect(Array.isArray(response.body.teams)).toBe(true);
    expect(response.body.teams.length).toBeGreaterThanOrEqual(2);
  });

  it('select-team issues token and /identity/me works', async () => {
    const { accessToken, teamId } = await loginAsAdmin(ctx.app);

    const me = await request(ctx.app.getHttpServer()).get('/identity/me').set('Authorization', `Bearer ${accessToken}`).set('X-Team-Id', teamId).expect(200);

    expect(me.body.email).toBe(SEED_ADMIN.email);
  });

  it('rejects mismatched X-Team-Id vs JWT', async () => {
    const { accessToken } = await loginAsAdmin(ctx.app);

    await request(ctx.app.getHttpServer())
      .get('/identity/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Team-Id', '00000000-0000-4000-8000-000000000099')
      .expect((res) => {
        expect([400, 403]).toContain(res.status);
      });
  });

  it('POST /account/refresh-claims re-issues token', async () => {
    const { accessToken, teamId } = await loginAsAdmin(ctx.app);

    const refreshed = await request(ctx.app.getHttpServer())
      .post('/account/refresh-claims')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Team-Id', teamId)
      .expect(201);

    expect(refreshed.body.accessToken).toBeDefined();
    expect(refreshed.body.user.teamId).toBe(teamId);
    expect(Array.isArray(refreshed.body.user.permissions)).toBe(true);
  });

  it('switch-team between seeded teams', async () => {
    const step1 = await request(ctx.app.getHttpServer()).post('/account/login').send({ email: SEED_ADMIN.email, password: SEED_ADMIN.password }).expect(201);

    const teams = step1.body.teams as Array<{ id: string; name: string }>;
    const first = await request(ctx.app.getHttpServer())
      .post('/account/login/select-team')
      .send({
        loginTicket: step1.body.loginTicket,
        teamId: teams[0].id,
      })
      .expect(201);

    const switched = await request(ctx.app.getHttpServer())
      .post('/account/switch-team')
      .set('Authorization', `Bearer ${first.body.accessToken}`)
      .set('X-Team-Id', teams[0].id)
      .send({ teamId: teams[1].id })
      .expect(201);

    expect(switched.body.user.teamId).toBe(teams[1].id);
  });
});
