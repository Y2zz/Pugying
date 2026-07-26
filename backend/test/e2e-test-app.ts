import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { CoreModule, PermissionGuard, TeamConsistencyGuard } from '@pugying/core';
import { TeamManagementModule, TeamManagementTypeOrmModule } from '@pugying/team-management';
import { IdentityModule, IdentityTypeOrmModule, JwtAuthGuard } from '@pugying/identity';
import { AccountProModule, AccountProTypeOrmModule } from '@pugying/account-pro';
import { PlatformAccountModule, PlatformAccountTypeOrmModule } from '@pugying/platform-account';
import { ContentModule, ContentTypeOrmModule } from '@pugying/content';
import { PugyingTypeOrmSqliteModule } from '@pugying/typeorm';
import { randomUUID } from 'crypto';
import { existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';

/** Deterministic secret so every spec signs / verifies JWT the same way. */
export const E2E_JWT_SECRET = 'pugying-e2e-test-secret';

export const SEED_ADMIN = {
  email: 'admin@pugying.local',
  password: 'Admin123!',
} as const;

export const SEED_EDITOR = {
  email: 'editor@pugying.local',
  password: 'Editor123!',
} as const;

/** ts-jest runs from test/, so migrations resolve from ../src (mirrors src/app.module.ts). */
const migrationsDir = join(__dirname, '..', 'src', 'database', 'migrations');

const SEED_WAIT_MAX_ATTEMPTS = 50;
const SEED_WAIT_DELAY_MS = 200;

export interface TeamOptionLike {
  id: string;
  name: string;
  displayName: string;
}

export interface AuthSession {
  accessToken: string;
  teamId: string;
  permissions: string[];
  /** Team options offered at login (empty when login went straight through). */
  teams: TeamOptionLike[];
}

export interface E2eTestApp {
  app: INestApplication<App>;
  dbPath: string;
  /** Closes the Nest app and removes the temporary sqlite files. Call from afterAll. */
  close: () => Promise<void>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function removeDbArtifacts(dbPath: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const file = `${dbPath}${suffix}`;
    if (existsSync(file)) {
      unlinkSync(file);
    }
  }
}

/**
 * Seeding runs in async onApplicationBootstrap hooks; poll the real login
 * endpoint until both seed accounts (and both admin memberships) are usable.
 */
async function waitForSeed(app: INestApplication<App>): Promise<void> {
  let lastState = 'no response yet';

  for (let attempt = 1; attempt <= SEED_WAIT_MAX_ATTEMPTS; attempt += 1) {
    const admin = await request(app.getHttpServer()).post('/account/login').send({ email: SEED_ADMIN.email, password: SEED_ADMIN.password });
    const editor = await request(app.getHttpServer()).post('/account/login').send({ email: SEED_EDITOR.email, password: SEED_EDITOR.password });

    const adminReady = admin.status === 201 && admin.body.requiresTeamSelection === true;
    const editorReady = editor.status === 201;
    if (adminReady && editorReady) {
      return;
    }

    lastState = `admin=${admin.status} editor=${editor.status}`;
    await delay(SEED_WAIT_DELAY_MS);
  }

  throw new Error(`Seed accounts not ready after ${SEED_WAIT_MAX_ATTEMPTS} attempts (${lastState})`);
}

/**
 * Boots the full application assembly from src/app.module.ts, but against a
 * throwaway sqlite database in the OS temp dir so the developer database
 * (backend/pugying.db) is never opened, read, or written by e2e runs.
 */
export async function createE2eApp(): Promise<E2eTestApp> {
  process.env.JWT_SECRET = E2E_JWT_SECRET;
  // Pin credential encryption to the JWT_SECRET fallback path.
  delete process.env.PLATFORM_CREDENTIAL_SECRET;

  const dbPath = join(tmpdir(), `pugying-e2e-${randomUUID()}.db`);

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      CoreModule,
      PugyingTypeOrmSqliteModule.forRoot({
        database: dbPath,
        migrations: [join(migrationsDir, '*.ts'), join(migrationsDir, '*.js')],
        migrationsRun: true,
      }),
      TeamManagementTypeOrmModule,
      IdentityTypeOrmModule,
      AccountProTypeOrmModule,
      PlatformAccountTypeOrmModule,
      ContentTypeOrmModule,
      TeamManagementModule,
      IdentityModule.forRoot({
        jwtSecret: E2E_JWT_SECRET,
        jwtExpiresIn: '7d',
        seed: true,
      }),
      AccountProModule,
      PlatformAccountModule,
      ContentModule,
    ],
    controllers: [AppController],
    providers: [
      AppService,
      {
        provide: APP_GUARD,
        useClass: JwtAuthGuard,
      },
      {
        provide: APP_GUARD,
        useClass: PermissionGuard,
      },
      {
        provide: APP_GUARD,
        useClass: TeamConsistencyGuard,
      },
    ],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
  await waitForSeed(app);

  return {
    app,
    dbPath,
    close: async (): Promise<void> => {
      await app.close();
      removeDbArtifacts(dbPath);
    },
  };
}

export async function login(app: INestApplication<App>, credentials: { email: string; password: string }, teamName?: string): Promise<AuthSession> {
  const step1 = await request(app.getHttpServer()).post('/account/login').send({ email: credentials.email, password: credentials.password }).expect(201);

  if (!step1.body.requiresTeamSelection) {
    return {
      accessToken: step1.body.accessToken as string,
      teamId: step1.body.user.teamId as string,
      permissions: step1.body.user.permissions as string[],
      teams: [],
    };
  }

  const teams = step1.body.teams as TeamOptionLike[];
  const target = teamName ? teams.find((team) => team.name === teamName) : teams[0];
  if (!target) {
    throw new Error(`Team ${teamName ?? '<first>'} not available for ${credentials.email}`);
  }

  const selected = await request(app.getHttpServer())
    .post('/account/login/select-team')
    .send({ loginTicket: step1.body.loginTicket, teamId: target.id })
    .expect(201);

  return {
    accessToken: selected.body.accessToken as string,
    teamId: selected.body.user.teamId as string,
    permissions: selected.body.user.permissions as string[],
    teams,
  };
}

export function loginAsAdmin(app: INestApplication<App>, teamName = 'default'): Promise<AuthSession> {
  return login(app, SEED_ADMIN, teamName);
}

export function loginAsEditor(app: INestApplication<App>, teamName?: string): Promise<AuthSession> {
  return login(app, SEED_EDITOR, teamName);
}
