import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalEnvFiles } from './load-local-env';

describe('loadLocalEnvFiles', () => {
  const originalCwd = process.cwd();
  let parent: string;
  let serverDir: string;

  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), 'pugying-env-parent-'));
    serverDir = mkdtempSync(join(parent, 'server-'));
    process.chdir(serverDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(parent, { recursive: true, force: true });
    delete process.env.PLATFORM_CREDENTIAL_SECRET;
    delete process.env.PUGYING_DATABASE_PATH;
  });

  it('loads repo-root .env.local when cwd is server/', () => {
    delete process.env.PLATFORM_CREDENTIAL_SECRET;
    writeFileSync(
      join(parent, '.env.local'),
      'PLATFORM_CREDENTIAL_SECRET=from-root-local\n',
    );

    loadLocalEnvFiles();

    expect(process.env.PLATFORM_CREDENTIAL_SECRET).toBe('from-root-local');
  });

  it('does not override existing process env', () => {
    process.env.PLATFORM_CREDENTIAL_SECRET = 'already-set';
    writeFileSync(
      join(parent, '.env.local'),
      'PLATFORM_CREDENTIAL_SECRET=from-file\n',
    );

    loadLocalEnvFiles();

    expect(process.env.PLATFORM_CREDENTIAL_SECRET).toBe('already-set');
  });

  it('lets .env.local override .env from the same search path', () => {
    delete process.env.PUGYING_DATABASE_PATH;
    writeFileSync(join(parent, '.env'), 'PUGYING_DATABASE_PATH=/from-env\n');
    writeFileSync(
      join(parent, '.env.local'),
      'PUGYING_DATABASE_PATH=/from-local\n',
    );

    loadLocalEnvFiles();

    expect(process.env.PUGYING_DATABASE_PATH).toBe('/from-local');
  });
});
