import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1784559447328 implements MigrationInterface {
    name = 'InitSchema1784559447328'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "tenant" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "displayName" varchar NOT NULL, "name" varchar NOT NULL, "active" boolean NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_56211336b5ff35fd944f2259173" UNIQUE ("name"))`);
        await queryRunner.query(`CREATE TABLE "account" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "email" varchar NOT NULL, "username" varchar NOT NULL, "passwordHash" varchar NOT NULL, "active" boolean NOT NULL DEFAULT (1), "tenantId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_4c8f96ccf523e9a3faefd5bdd4c" UNIQUE ("email"))`);
        await queryRunner.query(`CREATE TABLE "temporary_account" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "email" varchar NOT NULL, "username" varchar NOT NULL, "passwordHash" varchar NOT NULL, "active" boolean NOT NULL DEFAULT (1), "tenantId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_4c8f96ccf523e9a3faefd5bdd4c" UNIQUE ("email"), CONSTRAINT "FK_6d5184542539a16abc28d80084e" FOREIGN KEY ("tenantId") REFERENCES "tenant" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_account"("id", "email", "username", "passwordHash", "active", "tenantId", "createdAt", "updatedAt") SELECT "id", "email", "username", "passwordHash", "active", "tenantId", "createdAt", "updatedAt" FROM "account"`);
        await queryRunner.query(`DROP TABLE "account"`);
        await queryRunner.query(`ALTER TABLE "temporary_account" RENAME TO "account"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "account" RENAME TO "temporary_account"`);
        await queryRunner.query(`CREATE TABLE "account" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "email" varchar NOT NULL, "username" varchar NOT NULL, "passwordHash" varchar NOT NULL, "active" boolean NOT NULL DEFAULT (1), "tenantId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_4c8f96ccf523e9a3faefd5bdd4c" UNIQUE ("email"))`);
        await queryRunner.query(`INSERT INTO "account"("id", "email", "username", "passwordHash", "active", "tenantId", "createdAt", "updatedAt") SELECT "id", "email", "username", "passwordHash", "active", "tenantId", "createdAt", "updatedAt" FROM "temporary_account"`);
        await queryRunner.query(`DROP TABLE "temporary_account"`);
        await queryRunner.query(`DROP TABLE "account"`);
        await queryRunner.query(`DROP TABLE "tenant"`);
    }

}
