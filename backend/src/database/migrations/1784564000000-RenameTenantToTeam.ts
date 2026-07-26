import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames tenant domain to team: tables, columns, constraints, and permission strings.
 * Historical migrations remain unchanged.
 */
export class RenameTenantToTeam1784564000000 implements MigrationInterface {
  name = 'RenameTenantToTeam1784564000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`PRAGMA foreign_keys=OFF`);

    await queryRunner.query(`
      CREATE TABLE "team" (
        "id" varchar PRIMARY KEY NOT NULL,
        "displayName" varchar NOT NULL,
        "name" varchar NOT NULL,
        "active" boolean NOT NULL DEFAULT (1),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "deletedAt" datetime,
        CONSTRAINT "UQ_team_name" UNIQUE ("name")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "team" ("id", "displayName", "name", "active", "createdAt", "updatedAt", "deletedAt")
      SELECT "id", "displayName", "name", "active", "createdAt", "updatedAt", "deletedAt" FROM "tenant"
    `);
    await queryRunner.query(`DROP TABLE "tenant"`);

    await queryRunner.query(`
      CREATE TABLE "role_new" (
        "id" varchar PRIMARY KEY NOT NULL,
        "name" varchar NOT NULL,
        "teamId" varchar NOT NULL,
        "permissions" text NOT NULL DEFAULT ('[]'),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "deletedAt" datetime,
        CONSTRAINT "UQ_role_team_name" UNIQUE ("teamId", "name")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "role_new" ("id", "name", "teamId", "permissions", "createdAt", "updatedAt", "deletedAt")
      SELECT
        "id",
        "name",
        "tenantId",
        REPLACE("permissions", 'TenantManagement.Tenants.', 'TeamManagement.Teams.'),
        "createdAt",
        "updatedAt",
        "deletedAt"
      FROM "role"
    `);
    await queryRunner.query(`DROP TABLE "role"`);
    await queryRunner.query(`ALTER TABLE "role_new" RENAME TO "role"`);

    await queryRunner.query(`
      CREATE TABLE "team_user" (
        "id" varchar PRIMARY KEY NOT NULL,
        "userId" varchar NOT NULL,
        "teamId" varchar NOT NULL,
        "extraPermissions" text NOT NULL DEFAULT ('[]'),
        "leftAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "deletedAt" datetime,
        CONSTRAINT "UQ_team_user_user_team" UNIQUE ("userId", "teamId")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "team_user" (
        "id", "userId", "teamId", "extraPermissions", "leftAt", "createdAt", "updatedAt", "deletedAt"
      )
      SELECT
        "id",
        "userId",
        "tenantId",
        REPLACE("extraPermissions", 'TenantManagement.Tenants.', 'TeamManagement.Teams.'),
        "leftAt",
        "createdAt",
        "updatedAt",
        "deletedAt"
      FROM "tenant_user"
    `);
    await queryRunner.query(`DROP TABLE "tenant_user"`);

    await queryRunner.query(`PRAGMA foreign_keys=ON`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`PRAGMA foreign_keys=OFF`);

    await queryRunner.query(`
      CREATE TABLE "tenant_user" (
        "id" varchar PRIMARY KEY NOT NULL,
        "userId" varchar NOT NULL,
        "tenantId" varchar NOT NULL,
        "extraPermissions" text NOT NULL DEFAULT ('[]'),
        "leftAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "deletedAt" datetime,
        CONSTRAINT "UQ_tenant_user_user_tenant" UNIQUE ("userId", "tenantId")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "tenant_user" (
        "id", "userId", "tenantId", "extraPermissions", "leftAt", "createdAt", "updatedAt", "deletedAt"
      )
      SELECT
        "id",
        "userId",
        "teamId",
        REPLACE("extraPermissions", 'TeamManagement.Teams.', 'TenantManagement.Tenants.'),
        "leftAt",
        "createdAt",
        "updatedAt",
        "deletedAt"
      FROM "team_user"
    `);
    await queryRunner.query(`DROP TABLE "team_user"`);

    await queryRunner.query(`
      CREATE TABLE "role_old" (
        "id" varchar PRIMARY KEY NOT NULL,
        "name" varchar NOT NULL,
        "tenantId" varchar NOT NULL,
        "permissions" text NOT NULL DEFAULT ('[]'),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "deletedAt" datetime,
        CONSTRAINT "UQ_role_tenant_name" UNIQUE ("tenantId", "name")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "role_old" ("id", "name", "tenantId", "permissions", "createdAt", "updatedAt", "deletedAt")
      SELECT
        "id",
        "name",
        "teamId",
        REPLACE("permissions", 'TeamManagement.Teams.', 'TenantManagement.Tenants.'),
        "createdAt",
        "updatedAt",
        "deletedAt"
      FROM "role"
    `);
    await queryRunner.query(`DROP TABLE "role"`);
    await queryRunner.query(`ALTER TABLE "role_old" RENAME TO "role"`);

    await queryRunner.query(`
      CREATE TABLE "tenant" (
        "id" varchar PRIMARY KEY NOT NULL,
        "displayName" varchar NOT NULL,
        "name" varchar NOT NULL,
        "active" boolean NOT NULL DEFAULT (1),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "deletedAt" datetime,
        CONSTRAINT "UQ_tenant_name" UNIQUE ("name")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "tenant" ("id", "displayName", "name", "active", "createdAt", "updatedAt", "deletedAt")
      SELECT "id", "displayName", "name", "active", "createdAt", "updatedAt", "deletedAt" FROM "team"
    `);
    await queryRunner.query(`DROP TABLE "team"`);

    await queryRunner.query(`PRAGMA foreign_keys=ON`);
  }
}
