import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * System Settings stored on the server (one JSON row, key "global") and the System Admin's attribute fields
 * (User Stories 2.4 and 2.2).
 */
export class SettingsAndAttributeFields1793781849733 implements MigrationInterface {
  name = 'SettingsAndAttributeFields1793781849733';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "system_settings" ("key" nvarchar(50) NOT NULL, "value" nvarchar(MAX) NOT NULL, "updated_at" datetime2 NOT NULL CONSTRAINT "DF_18da22473f27bb63e7255b0188d" DEFAULT getdate(), CONSTRAINT "PK_b1b5bc664526d375c94ce9ad43d" PRIMARY KEY ("key"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "attribute_fields" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_f6a6f132f9aa91c32e64ba0fa5d" DEFAULT NEWSEQUENTIALID(), "created_at" datetime2 NOT NULL CONSTRAINT "DF_e47722a5526722fdc395195e82f" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_d693e27686d56fc7fe0f2b629a7" DEFAULT getdate(), "name" nvarchar(60) NOT NULL, "type" nvarchar(255) CONSTRAINT CHK_65a0f55f919fdd261a8ea38a00_ENUM CHECK(type IN ('TEXT','NUMBER','DATE','BOOLEAN')) NOT NULL, "target" nvarchar(255) CONSTRAINT CHK_94a49c9b9c3376add5bf01208a_ENUM CHECK(target IN ('STUDENT','PARENT','TEACHER','CLASS')) NOT NULL, "required" bit NOT NULL CONSTRAINT "DF_e505bd06af326acceb75f06dea2" DEFAULT 0, "description" nvarchar(255), "status" nvarchar(255) CONSTRAINT CHK_e19ab170fb99a6d50856e709c7_ENUM CHECK(status IN ('ACTIVE','LOCKED')) NOT NULL CONSTRAINT "DF_2de93b22ceb307408842cf5a2a2" DEFAULT 'ACTIVE', CONSTRAINT "PK_f6a6f132f9aa91c32e64ba0fa5d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f70869b5c11be52128d9c0a3c1" ON "attribute_fields" ("target", "name") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_f70869b5c11be52128d9c0a3c1" ON "attribute_fields"`);
    await queryRunner.query(`DROP TABLE "attribute_fields"`);
    await queryRunner.query(`DROP TABLE "system_settings"`);
  }
}
