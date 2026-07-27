import request from 'supertest';
import { createE2eApp, login, loginAsAdmin, loginAsEditor, SEED_ADMIN, SEED_EDITOR, type AuthSession, type E2eTestApp } from './e2e-test-app';

const QA_USER = {
  email: 'qa.user@pugying.local',
  username: 'qa-user',
  password: 'QaUser123!',
} as const;

describe('Identity users & roles (e2e)', () => {
  let ctx: E2eTestApp;
  let admin: AuthSession;
  let editor: AuthSession;
  let demoTeamId: string;
  let qaUserId: string;
  let qaRoleId: string;

  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createE2eApp();
    admin = await loginAsAdmin(ctx.app);
    editor = await loginAsEditor(ctx.app);
    demoTeamId = editor.teamId;
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('auth on /identity/me', () => {
    it('returns the authenticated user with team and permissions', async () => {
      const me = await request(server()).get('/identity/me').set('Authorization', `Bearer ${admin.accessToken}`).set('X-Team-Id', admin.teamId).expect(200);

      expect(me.body.email).toBe(SEED_ADMIN.email);
      expect(me.body.teamId).toBe(admin.teamId);
      expect(Array.isArray(me.body.permissions)).toBe(true);
      expect(me.body.permissions).toContain('Identity.Users.Create');
    });

    it('rejects requests without a token (401)', async () => {
      await request(server()).get('/identity/me').expect(401);
    });

    it('rejects a garbage token (401)', async () => {
      await request(server()).get('/identity/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
    });
  });

  describe('user CRUD', () => {
    it('rejects an invalid email (400)', async () => {
      await request(server())
        .post('/identity/users')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ email: 'not-an-email', username: 'x-user', password: 'Passw0rd!' })
        .expect(400);
    });

    it('rejects unknown extra properties (forbidNonWhitelisted, 400)', async () => {
      const res = await request(server())
        .post('/identity/users')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ ...QA_USER, role: 'superadmin' })
        .expect(400);

      expect(JSON.stringify(res.body.message)).toContain('should not exist');
    });

    it('rejects a too-short password (400)', async () => {
      await request(server())
        .post('/identity/users')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ email: 'short@pugying.local', username: 'short-pass', password: '123' })
        .expect(400);
    });

    it('editor without Identity.Users.Create gets 403', async () => {
      await request(server())
        .post('/identity/users')
        .set('Authorization', `Bearer ${editor.accessToken}`)
        .set('X-Team-Id', editor.teamId)
        .send(QA_USER)
        .expect(403);
    });

    it('creating a user without a token gets 401', async () => {
      await request(server()).post('/identity/users').send(QA_USER).expect(401);
    });

    it('admin creates a user (201) and the response hides passwordHash', async () => {
      const created = await request(server())
        .post('/identity/users')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send(QA_USER)
        .expect(201);

      expect(created.body.email).toBe(QA_USER.email);
      expect(created.body.username).toBe(QA_USER.username);
      expect(created.body.passwordHash).toBeUndefined();
      qaUserId = created.body.id as string;
    });

    it('team-scoped user list does not include the not-yet-invited user', async () => {
      const list = await request(server())
        .get('/identity/users')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .expect(200);

      const emails = (list.body as Array<{ email: string }>).map((u) => u.email);
      expect(emails).toContain(SEED_ADMIN.email);
      expect(emails).not.toContain(QA_USER.email);
    });

    it('user list without X-Team-Id returns the global identity list', async () => {
      const list = await request(server()).get('/identity/users').set('Authorization', `Bearer ${admin.accessToken}`).expect(200);

      const emails = (list.body as Array<{ email: string }>).map((u) => u.email);
      expect(emails).toContain(QA_USER.email);
    });

    it('fetching a non-member user in team scope yields 404', async () => {
      await request(server()).get(`/identity/users/${qaUserId}`).set('Authorization', `Bearer ${admin.accessToken}`).set('X-Team-Id', admin.teamId).expect(404);
    });

    it('after inviting the user into the team, they appear in team scope', async () => {
      await request(server())
        .post('/account/invite')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ email: QA_USER.email, teamId: admin.teamId })
        .expect(201);

      const list = await request(server())
        .get('/identity/users')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .expect(200);

      const emails = (list.body as Array<{ email: string }>).map((u) => u.email);
      expect(emails).toContain(QA_USER.email);

      await request(server()).get(`/identity/users/${qaUserId}`).set('Authorization', `Bearer ${admin.accessToken}`).set('X-Team-Id', admin.teamId).expect(200);
    });

    it('GET /identity/users/team/:teamId is overridden by the X-Team-Id scope (actual behavior)', async () => {
      // Note: TypeOrmTeamFilter overwrites the :teamId route param with the
      // current X-Team-Id, so asking for demo members while scoped to default
      // still returns the default team members. Pinned as-is; see report.
      const list = await request(server())
        .get(`/identity/users/team/${demoTeamId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .expect(200);

      const emails = (list.body as Array<{ email: string }>).map((u) => u.email);
      expect(emails).toContain(SEED_ADMIN.email);
      expect(emails).not.toContain(SEED_EDITOR.email);
    });

    it('rejects a non-UUID user id (400)', async () => {
      await request(server()).get('/identity/users/not-a-uuid').set('Authorization', `Bearer ${admin.accessToken}`).set('X-Team-Id', admin.teamId).expect(400);
    });

    it('updates the username (200)', async () => {
      const updated = await request(server())
        .put(`/identity/users/${qaUserId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ username: 'qa-user-renamed' })
        .expect(200);

      expect(updated.body.username).toBe('qa-user-renamed');
    });

    it('rejects renaming to an already-taken username (409)', async () => {
      await request(server())
        .put(`/identity/users/${qaUserId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ username: 'editor' })
        .expect(409);
    });

    it('editor with Identity.Users.View can list users of their team', async () => {
      const list = await request(server())
        .get('/identity/users')
        .set('Authorization', `Bearer ${editor.accessToken}`)
        .set('X-Team-Id', editor.teamId)
        .expect(200);

      const emails = (list.body as Array<{ email: string }>).map((u) => u.email);
      expect(emails).toContain(SEED_EDITOR.email);
      expect(emails).toContain(SEED_ADMIN.email);
    });
  });

  describe('role CRUD & assignment', () => {
    it('rejects creating a role for a team other than X-Team-Id (400)', async () => {
      await request(server())
        .post('/identity/roles')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ name: 'stray-role', teamId: demoTeamId, permissions: [] })
        .expect(400);
    });

    it('admin creates a role scoped to the current team (201)', async () => {
      const created = await request(server())
        .post('/identity/roles')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({
          name: 'qa-role',
          teamId: admin.teamId,
          permissions: ['Identity.Users.View'],
        })
        .expect(201);

      expect(created.body.teamId).toBe(admin.teamId);
      expect(created.body.permissions).toEqual(['Identity.Users.View']);
      qaRoleId = created.body.id as string;
    });

    it('rejects a duplicate role name within the team (409)', async () => {
      await request(server())
        .post('/identity/roles')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ name: 'qa-role', teamId: admin.teamId })
        .expect(409);
    });

    it('lists roles of the current team', async () => {
      const list = await request(server())
        .get('/identity/roles')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .expect(200);

      const names = (list.body as Array<{ name: string }>).map((r) => r.name);
      expect(names).toContain('admin');
      expect(names).toContain('qa-role');
    });

    it('gets and updates a single role', async () => {
      await request(server()).get(`/identity/roles/${qaRoleId}`).set('Authorization', `Bearer ${admin.accessToken}`).set('X-Team-Id', admin.teamId).expect(200);

      const updated = await request(server())
        .put(`/identity/roles/${qaRoleId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ permissions: ['Identity.Users.View', 'Identity.Roles.View'] })
        .expect(200);

      expect(updated.body.permissions).toContain('Identity.Roles.View');
    });

    it('editor without Identity.Roles.Create gets 403', async () => {
      await request(server())
        .post('/identity/roles')
        .set('Authorization', `Bearer ${editor.accessToken}`)
        .set('X-Team-Id', editor.teamId)
        .send({ name: 'editor-made', teamId: editor.teamId })
        .expect(403);
    });

    it('lists the permission catalog for role editors', async () => {
      const catalog = await request(server())
        .get('/identity/permissions')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .expect(200);

      expect(Array.isArray(catalog.body)).toBe(true);
      expect(catalog.body).toContain('Identity.Users.View');
      expect(catalog.body).toContain('Identity.Roles.View');
      expect(catalog.body).toContain('TeamManagement.Teams.View');
    });

    it('editor with Identity.Roles.View can list permissions', async () => {
      const catalog = await request(server())
        .get('/identity/permissions')
        .set('Authorization', `Bearer ${editor.accessToken}`)
        .set('X-Team-Id', editor.teamId)
        .expect(200);

      expect(catalog.body).toContain('Identity.Roles.View');
    });

    it('rejects unauthenticated permission catalog requests (401)', async () => {
      await request(server()).get('/identity/permissions').expect(401);
    });

    it('assigns the role and the user logs in with its permissions', async () => {
      await request(server())
        .post(`/identity/users/${qaUserId}/roles`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ roleId: qaRoleId })
        .expect(201);

      const userRoles = await request(server())
        .get(`/identity/users/${qaUserId}/roles`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .expect(200);

      const roleIds = (userRoles.body as Array<{ id: string }>).map((role) => role.id);
      expect(roleIds).toContain(qaRoleId);

      const qaSession = await login(ctx.app, {
        email: QA_USER.email,
        password: QA_USER.password,
      });
      expect(qaSession.teamId).toBe(admin.teamId);
      expect(qaSession.permissions).toContain('Identity.Users.View');

      await request(server()).get('/identity/users').set('Authorization', `Bearer ${qaSession.accessToken}`).set('X-Team-Id', qaSession.teamId).expect(200);

      await request(server())
        .post('/identity/users')
        .set('Authorization', `Bearer ${qaSession.accessToken}`)
        .set('X-Team-Id', qaSession.teamId)
        .send({
          email: 'nope@pugying.local',
          username: 'nope',
          password: 'Nope1234!',
        })
        .expect(403);
    });

    it('refuses assigning a role that belongs to another team (404, hidden by team filter)', async () => {
      const adminDemo = await loginAsAdmin(ctx.app, 'demo');
      const demoRoles = await request(server())
        .get('/identity/roles')
        .set('Authorization', `Bearer ${adminDemo.accessToken}`)
        .set('X-Team-Id', adminDemo.teamId)
        .expect(200);

      const demoAdminRole = (demoRoles.body as Array<{ id: string; name: string }>).find((role) => role.name === 'admin');
      expect(demoAdminRole).toBeDefined();

      // The team filter hides cross-team roles from findById, so the service's
      // dedicated 403 branch is unreachable over HTTP — it surfaces as 404.
      await request(server())
        .post(`/identity/users/${qaUserId}/roles`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .send({ roleId: demoAdminRole!.id })
        .expect(404);
    });

    it('unassigns the role and refresh-claims drops its permissions', async () => {
      await request(server())
        .delete(`/identity/users/${qaUserId}/roles/${qaRoleId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .expect(200);

      const qaSession = await login(ctx.app, {
        email: QA_USER.email,
        password: QA_USER.password,
      });
      const refreshed = await request(server())
        .post('/account/refresh-claims')
        .set('Authorization', `Bearer ${qaSession.accessToken}`)
        .set('X-Team-Id', qaSession.teamId)
        .expect(201);

      expect(refreshed.body.user.permissions).not.toContain('Identity.Users.View');
    });

    it('unassigning a role that is not assigned yields 404', async () => {
      await request(server())
        .delete(`/identity/users/${qaUserId}/roles/${qaRoleId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .expect(404);
    });

    it('deletes the role (200) and it disappears', async () => {
      await request(server())
        .delete(`/identity/roles/${qaRoleId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .expect(200);

      await request(server()).get(`/identity/roles/${qaRoleId}`).set('Authorization', `Bearer ${admin.accessToken}`).set('X-Team-Id', admin.teamId).expect(404);
    });

    it('soft-deletes the user and their login stops working', async () => {
      await request(server())
        .delete(`/identity/users/${qaUserId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Team-Id', admin.teamId)
        .expect(200);

      await request(server()).post('/account/login').send({ email: QA_USER.email, password: QA_USER.password }).expect(401);
    });
  });
});
