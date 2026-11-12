import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Daily journal workflow DRAFT → PENDING → APPROVED → PUBLISHED, and class-wide notes (one per class and day).
 */
export class JournalWorkflow1792840597084 implements MigrationInterface {
  name = 'JournalWorkflow1792840597084';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "class_journals" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_2cbd4d76ad427ced041db9d05be" DEFAULT NEWSEQUENTIALID(), "created_at" datetime2 NOT NULL CONSTRAINT "DF_0f28ec3ad3562145fb576cc39af" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_3e3bb0686410056d480767c114d" DEFAULT getdate(), "class_id" uniqueidentifier NOT NULL, "journal_date" date NOT NULL, "note" nvarchar(MAX), "updated_by_id" uniqueidentifier, CONSTRAINT "uq_class_journal_class_date" UNIQUE ("class_id", "journal_date"), CONSTRAINT "PK_2cbd4d76ad427ced041db9d05be" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`ALTER TABLE "daily_journals" ADD "submitted_at" datetime2`);
    await queryRunner.query(`ALTER TABLE "daily_journals" ADD "published_by_id" uniqueidentifier`);
    await queryRunner.query(`ALTER TABLE "daily_journals" ADD "published_at" datetime2`);
    await queryRunner.query(
      `ALTER TABLE "daily_journals" DROP CONSTRAINT "CHK_fedd91ab6955f674587c44d10d_ENUM"`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_journals" ADD CONSTRAINT "CHK_21f5f71d5dd41192074c830de8_ENUM" CHECK (status IN ('DRAFT','PENDING','APPROVED','PUBLISHED'))`,
    );
    // Entries parents could already see (APPROVED in the old two-step flow) stay visible: they become PUBLISHED.
    await queryRunner.query(
      `UPDATE "daily_journals" SET "status" = 'PUBLISHED', "published_at" = "approved_at", "published_by_id" = "approved_by_id" WHERE "status" = 'APPROVED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_journals" ADD CONSTRAINT "FK_da153b6e79b35571309c5460856" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "class_journals" ADD CONSTRAINT "FK_261270150c12ad005470feeac0b" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "class_journals" ADD CONSTRAINT "FK_d5c0f67b223101ea280fa8a38b2" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "class_journals" DROP CONSTRAINT "FK_d5c0f67b223101ea280fa8a38b2"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP CONSTRAINT "FK_261270150c12ad005470feeac0b"`);
    await queryRunner.query(`ALTER TABLE "daily_journals" DROP CONSTRAINT "FK_da153b6e79b35571309c5460856"`);
    // Back to two statuses: whatever parents could see is APPROVED again, the rest is DRAFT.
    await queryRunner.query(`UPDATE "daily_journals" SET "status" = 'APPROVED' WHERE "status" = 'PUBLISHED'`);
    await queryRunner.query(
      `UPDATE "daily_journals" SET "status" = 'DRAFT', "approved_at" = NULL, "approved_by_id" = NULL WHERE "status" IN ('PENDING','APPROVED') AND "published_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_journals" ADD CONSTRAINT "CHK_fedd91ab6955f674587c44d10d_ENUM" CHECK (status IN ('DRAFT','APPROVED'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_journals" DROP CONSTRAINT "CHK_21f5f71d5dd41192074c830de8_ENUM"`,
    );
    await queryRunner.query(`ALTER TABLE "daily_journals" DROP COLUMN "published_at"`);
    await queryRunner.query(`ALTER TABLE "daily_journals" DROP COLUMN "published_by_id"`);
    await queryRunner.query(`ALTER TABLE "daily_journals" DROP COLUMN "submitted_at"`);
    await queryRunner.query(`DROP TABLE "class_journals"`);
  }
}
