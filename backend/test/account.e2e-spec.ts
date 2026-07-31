import { randomUUID } from 'crypto';
import request from 'supertest';
import { createE2eApp, loginAsAdmin, SEED_ADMIN, SEED_EDITOR, type AuthSession, type E2eTestApp } from './e2e-test-app';

describe('Account login / team membership flows (e2e)', () => {
  let ctx: E2eTestApp;
  let admin: AuthSession;
  let defaultTeamId: string;
  let demoTeamId: string;

  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createE2eApp();
    admin = await loginAsAdmin(ctx.app);
    defaultTeamId = admin.teams.find((t) => t.name === 'default')!.id;
    demoTeamId = admin.teams.find((t) => t.name === 'demo')!.id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('login validation & failures', () => {
    it('wrong password yields 401', async () => {
      await request(server()).post('/account/login').send({ email: SEED_ADMIN.email, password: 'WrongPass123!' }).expect(401);
    });

    it('unknown email yields 401', async () => {
      await request(server()).post('/account/login').send({ email: 'ghost@pugying.local', password: 'Whatever123!' }).expect(401);
    });

    it('malformed email yields 400', async () => {
      await request(server()).post('/account/login').send({ email: 'not-an-email', password: 'Whatever123!' }).expect(400);
    });

    it('too-short password yields 400', async () => {
      await request(server()).post('/account/login').send({ email: SEED_ADMIN.email, password: '123' }).expect(400);
    });

    it('extra properties are rejected (400)', async () => {
      await request(server()).post('/account/login').send({ email: SEED_ADMIN.email, password: SEED_ADMIN.password, rememberMe: true }).expect(400);
    });
  });

  describe('team selection tickets', () => {
    it('single-team editor logs in directly with demo-scoped permissions', async () => {
      const res = await request(server()).post('/account/login').send({ email: SEED_EDITOR.email, password: SEED_EDITOR.password }).expect(201);

      expect(res.body.requiresTeamSelection).toBeUndefined();
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.teamId).toBe(demoTeamId);
      expect(res.body.user.permissions).toContain('Identity.Users.View');
      expect(res.body.user.permissions).toContain('Account.Users.Leave');
      expect(res.body.user.permissions).not.toContain('Account.Users.Invite');
    });

    it('select-team with an invalid ticket yields 401', async () => {
      await request(server()).post('/account/login/select-team').send({ loginTicket: 'definitely-not-a-ticket', teamId: defaultTeamId }).expect(401);
    });

    it('select-team for a team the user does not belong to yields 403', async () => {
      const step1 = await request(server()).post('/account/login').send({ email: SEED_ADMIN.email, password: SEED_ADMIN.password }).expect(201);

      await request(server()).post('/account/login/select-team').send({ loginTicket: step1.body.loginTicket, teamId: randomUUID() }).expect(403);
    });

    it('a login ticket is single-use', async () => {
      const step1 = await request(server()).post('/account/login').send({ email: SEED_ADMIN.email, password: SEED_ADMIN.password }).expect(201);

      await request(server()).post('/account/login/select-team').send({ loginTicket: step1.body.loginTicket, teamId: defaultTeamId }).expect(201);

      await request(server()).post('/account/login/select-team').send({ loginTicket: step1.body.loginTicket, teamId: demoTeamId }).expect(401);
    });
  });

  describe('switch-team & my-teams', () => {
    it('editor cannot switch to a team they are not a member of (403)', async () => {
      const editorLogin = await request(server()).post('/account/login').send({ email: SEED_EDITOR.email, password: SEED_EDITOR.password }).expect(201);

      await request(server())
        .post('/account/switch-team')
        .set('Authorization', `Bearer ${editorLogin.body.accessToken}`)
        .set('X-Team-Id', demoTeamId)
        .send({ teamId: defaultTeamId })
        .expect(403);
    });

    it('switch-team without a token yields 401', async () => {
      await request(server()).post('/account/switch-team').send({ teamId: demoTeamId }).expect(401);
    });

    it('my-teams lists both seeded memberships for admin', async () => {
      const res = await request(server())
        .get('/account/my-teams')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .expect(200);

      const names = (res.body as Array<{ name: string }>).map((t) => t.name).sort();
      expect(names).toEqual(['default', 'demo']);
    });
  });

  describe('invite / leave flows', () => {
    it('inviting an unknown email yields 404', async () => {
      await request(server())
        .post('/account/invite')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ email: 'ghost@pugying.local', teamId: defaultTeamId })
        .expect(404);
    });

    it('inviting into a team that differs from X-Team-Id yields 403', async () => {
      await request(server())
        .post('/account/invite')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ email: SEED_EDITOR.email, teamId: demoTeamId })
        .expect(403);
    });

    it('editor without Account.Users.Invite cannot invite (403)', async () => {
      const editorLogin = await request(server()).post('/account/login').send({ email: SEED_EDITOR.email, password: SEED_EDITOR.password }).expect(201);

      await request(server())
        .post('/account/invite')
        .set('Authorization', `Bearer ${editorLogin.body.accessToken}`)
        .set('X-Team-Id', demoTeamId)
        .send({ email: SEED_ADMIN.email, teamId: demoTeamId })
        .expect(403);
    });

    it('admin invites editor into default with extraPermissions (201)', async () => {
      const res = await request(server())
        .post('/account/invite')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({
          email: SEED_EDITOR.email,
          teamId: defaultTeamId,
          extraPermissions: ['Account.Users.Leave'],
        })
        .expect(201);

      expect(res.body.teamId).toBe(defaultTeamId);
    });

    it('inviting an existing member again yields 409', async () => {
      await request(server())
        .post('/account/invite')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ email: SEED_EDITOR.email, teamId: defaultTeamId })
        .expect(409);
    });

    it('editor now gets the team picker and the extraPermissions land in the JWT', async () => {
      const step1 = await request(server()).post('/account/login').send({ email: SEED_EDITOR.email, password: SEED_EDITOR.password }).expect(201);

      expect(step1.body.requiresTeamSelection).toBe(true);
      expect((step1.body.teams as Array<unknown>).length).toBe(2);

      const selected = await request(server())
        .post('/account/login/select-team')
        .send({ loginTicket: step1.body.loginTicket, teamId: defaultTeamId })
        .expect(201);

      expect(selected.body.user.teamId).toBe(defaultTeamId);
      // extraPermissions from the membership row are unioned into the JWT...
      expect(selected.body.user.permissions).toContain('Account.Users.Leave');
      // ...while demo-team role permissions do not leak into the default team.
      expect(selected.body.user.permissions).not.toContain('Identity.Users.View');
    });

    it('editor leaves default again and is back to direct single-team login', async () => {
      const step1 = await request(server()).post('/account/login').send({ email: SEED_EDITOR.email, password: SEED_EDITOR.password }).expect(201);
      const selected = await request(server())
        .post('/account/login/select-team')
        .send({ loginTicket: step1.body.loginTicket, teamId: defaultTeamId })
        .expect(201);

      await request(server())
        .post('/account/leave')
        .set('Authorization', `Bearer ${selected.body.accessToken}`)
        .set('X-Team-Id', defaultTeamId)
        .send({ teamId: defaultTeamId })
        .expect(204);

      const relogin = await request(server()).post('/account/login').send({ email: SEED_EDITOR.email, password: SEED_EDITOR.password }).expect(201);
      expect(relogin.body.requiresTeamSelection).toBeUndefined();
      expect(relogin.body.user.teamId).toBe(demoTeamId);
    });

    it('leaving the last team is rejected (400)', async () => {
      const editorLogin = await request(server()).post('/account/login').send({ email: SEED_EDITOR.email, password: SEED_EDITOR.password }).expect(201);

      await request(server())
        .post('/account/leave')
        .set('Authorization', `Bearer ${editorLogin.body.accessToken}`)
        .set('X-Team-Id', demoTeamId)
        .send({ teamId: demoTeamId })
        .expect(400);
    });

    it('leaving a team without membership yields 404', async () => {
      await request(server())
        .post('/account/leave')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ teamId: randomUUID() })
        .expect(404);
    });
  });

  describe('kick flows', () => {
    let editorUserId: string;
    let adminUserId: string;

    beforeAll(async () => {
      const adminLogin = await request(server()).post('/account/login').send({ email: SEED_ADMIN.email, password: SEED_ADMIN.password }).expect(201);
      const adminSelected = await request(server())
        .post('/account/login/select-team')
        .send({ loginTicket: adminLogin.body.loginTicket, teamId: defaultTeamId })
        .expect(201);
      adminUserId = adminSelected.body.user.id as string;

      const editorLogin = await request(server())
        .post('/account/login')
        .send({ email: SEED_EDITOR.email, password: SEED_EDITOR.password })
        .expect(201);
      editorUserId = editorLogin.body.user.id as string;

      await request(server())
        .post('/account/invite')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ email: SEED_EDITOR.email, teamId: defaultTeamId })
        .expect(201);
    });

    it('editor without Account.Users.Kick cannot kick (403)', async () => {
      const editorLogin = await request(server())
        .post('/account/login')
        .send({ email: SEED_EDITOR.email, password: SEED_EDITOR.password })
        .expect(201);
      const selected = await request(server())
        .post('/account/login/select-team')
        .send({ loginTicket: editorLogin.body.loginTicket, teamId: defaultTeamId })
        .expect(201);

      await request(server())
        .post('/account/kick')
        .set('Authorization', `Bearer ${selected.body.accessToken}`)
        .set('X-Team-Id', defaultTeamId)
        .send({ userId: adminUserId, teamId: defaultTeamId })
        .expect(403);
    });

    it('kicking yourself is rejected (400)', async () => {
      await request(server())
        .post('/account/kick')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ userId: adminUserId, teamId: defaultTeamId })
        .expect(400);
    });

    it('kicking into a team that differs from X-Team-Id yields 403', async () => {
      await request(server())
        .post('/account/kick')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ userId: editorUserId, teamId: demoTeamId })
        .expect(403);
    });

    it('admin kicks editor out of default and editor returns to single-team login', async () => {
      await request(server())
        .post('/account/kick')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ userId: editorUserId, teamId: defaultTeamId })
        .expect(204);

      const relogin = await request(server())
        .post('/account/login')
        .send({ email: SEED_EDITOR.email, password: SEED_EDITOR.password })
        .expect(201);
      expect(relogin.body.requiresTeamSelection).toBeUndefined();
      expect(relogin.body.user.teamId).toBe(demoTeamId);
    });

    it('kicking a non-member yields 404', async () => {
      await request(server())
        .post('/account/kick')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ userId: editorUserId, teamId: defaultTeamId })
        .expect(404);
    });
  });

  describe('self-register', () => {
    const registrant = {
      email: 'newbie@pugying.local',
      username: 'newbie',
      password: 'Newbie123!',
    };

    it('registers a new user without a token (201)', async () => {
      const res = await request(server()).post('/account/register').send(registrant).expect(201);

      expect(res.body.email).toBe(registrant.email);
      expect(res.body.username).toBe(registrant.username);
      expect(res.body.id).toBeDefined();
      expect(res.body.accessToken).toBeUndefined();
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('registered user cannot login until invited (403)', async () => {
      const res = await request(server())
        .post('/account/login')
        .send({ email: registrant.email, password: registrant.password })
        .expect(403);

      expect(res.body.message).toMatch(/any team/i);
    });

    it('duplicate email yields 409', async () => {
      await request(server())
        .post('/account/register')
        .send({ ...registrant, username: 'newbie-2' })
        .expect(409);
    });

    it('short password yields 400', async () => {
      await request(server())
        .post('/account/register')
        .send({ email: 'shortpw@pugying.local', username: 'shortpw', password: '123' })
        .expect(400);
    });

    it('admin can invite the registrant and they can then login', async () => {
      await request(server())
        .post('/account/invite')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ email: registrant.email, teamId: defaultTeamId })
        .expect(201);

      const loginRes = await request(server())
        .post('/account/login')
        .send({ email: registrant.email, password: registrant.password })
        .expect(201);

      expect(loginRes.body.accessToken).toBeDefined();
      expect(loginRes.body.user.teamId).toBe(defaultTeamId);
    });
  });
});
