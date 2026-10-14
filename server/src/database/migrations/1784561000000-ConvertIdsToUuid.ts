import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 将相关表主键改为 UUID。
 * 开发期破坏性变更，旧整型 ID 数据不保留。
 */
export class ConvertIdsToUuid1784561000000 implements MigrationInterface {
  name = 'ConvertIdsToUuid1784561000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`PRAGMA foreign_keys=OFF`);
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`PRAGMA foreign_keys=OFF`);
    await queryRunner.query(`DROP TABLE IF EXISTS "account"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant"`);

    await queryRunner.query(`
      CREATE TABLE "tenant" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "displayName" varchar NOT NULL,
        "name" varchar NOT NULL,
        "active" boolean NOT NULL DEFAULT (1),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_56211336b5ff35fd944f2259173" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "account" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "email" varchar NOT NULL,
        "username" varchar NOT NULL,
        "passwordHash" varchar NOT NULL,
        "active" boolean NOT NULL DEFAULT (1),
        "tenantId" integer NOT NULL,
        "permissions" text NOT NULL DEFAULT ('[]'),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_4c8f96ccf523e9a3faefd5bdd4c" UNIQUE ("email"),
        CONSTRAINT "FK_6d5184542539a16abc28d80084e" FOREIGN KEY ("tenantId") REFERENCES "tenant" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`PRAGMA foreign_keys=ON`);
  }
}
