import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Shared-account schema: soft-delete columns, roles, membership; drop account.tenantId/permissions.
 * Dev-stage: rebuilds tables (data discarded).
 */
export class SharedAccountsAndSoftDelete1784562000000
  implements MigrationInterface
{
  name = 'SharedAccountsAndSoftDelete1784562000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`PRAGMA foreign_keys=OFF`);

    await queryRunner.query(`DROP TABLE IF EXISTS "user_role"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "account"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant"`);

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
      CREATE TABLE "account" (
        "id" varchar PRIMARY KEY NOT NULL,
        "email" varchar NOT NULL,
        "username" varchar NOT NULL,
        "passwordHash" varchar NOT NULL,
        "active" boolean NOT NULL DEFAULT (1),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "deletedAt" datetime,
        CONSTRAINT "UQ_account_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "role" (
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
      CREATE TABLE "user_role" (
        "id" varchar PRIMARY KEY NOT NULL,
        "userId" varchar NOT NULL,
        "roleId" varchar NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "deletedAt" datetime,
        CONSTRAINT "UQ_user_role_user_role" UNIQUE ("userId", "roleId")
      )
    `);

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

    await queryRunner.query(`PRAGMA foreign_keys=ON`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`PRAGMA foreign_keys=OFF`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_role"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "account"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant"`);

    await queryRunner.query(`
      CREATE TABLE "tenant" (
        "id" varchar PRIMARY KEY NOT NULL,
        "displayName" varchar NOT NULL,
        "name" varchar NOT NULL,
        "active" boolean NOT NULL DEFAULT (1),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_tenant_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "account" (
        "id" varchar PRIMARY KEY NOT NULL,
        "email" varchar NOT NULL,
        "username" varchar NOT NULL,
        "passwordHash" varchar NOT NULL,
        "active" boolean NOT NULL DEFAULT (1),
        "tenantId" varchar NOT NULL,
        "permissions" text NOT NULL DEFAULT ('[]'),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_account_email" UNIQUE ("email"),
        CONSTRAINT "FK_account_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenant" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`PRAGMA foreign_keys=ON`);
  }
}
