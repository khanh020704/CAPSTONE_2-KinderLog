import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The class journal of the Daily Journal flow: six sections, a private note per child (class_journal_notes), photos,
 * recordings and the points of a voice draft to confirm, and the DRAFT / REVIEW → APPROVED → PUBLISHED workflow with
 * the version parents see. Existing rows (a class-wide note) become drafts with that note as their "note" section.
 */
export class ClassJournalContent1793099964331 implements MigrationInterface {
  name = 'ClassJournalContent1793099964331';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "class_journal_notes" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_afb8434d22556130c9e22c324c2" DEFAULT NEWSEQUENTIALID(), "journal_id" uniqueidentifier NOT NULL, "student_id" uniqueidentifier NOT NULL, "content" nvarchar(MAX) NOT NULL, CONSTRAINT "uq_class_journal_note_student" UNIQUE ("journal_id", "student_id"), CONSTRAINT "PK_afb8434d22556130c9e22c324c2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_302b812df906d5586a23fd24b2" ON "class_journal_notes" ("student_id") `,
    );
    await queryRunner.query(`ALTER TABLE "class_journals" ADD "meal" nvarchar(MAX)`);
    await queryRunner.query(`ALTER TABLE "class_journals" ADD "learning" nvarchar(MAX)`);
    await queryRunner.query(`ALTER TABLE "class_journals" ADD "sleep" nvarchar(MAX)`);
    await queryRunner.query(`ALTER TABLE "class_journals" ADD "health" nvarchar(MAX)`);
    await queryRunner.query(`ALTER TABLE "class_journals" ADD "emotion" nvarchar(MAX)`);
    await queryRunner.query(
      `ALTER TABLE "class_journals" ADD "photos" nvarchar(MAX) NOT NULL CONSTRAINT "DF_b51b2d7be0791476d1f249442f7" DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "class_journals" ADD "source" nvarchar(255) CONSTRAINT CHK_f40248605865bfba108605cae3_ENUM CHECK(source IN ('MANUAL','BULK','VOICE')) NOT NULL CONSTRAINT "DF_dcb938dacb27def48ccf3eae7c3" DEFAULT 'MANUAL'`,
    );
    await queryRunner.query(`ALTER TABLE "class_journals" ADD "transcript" nvarchar(MAX)`);
    await queryRunner.query(
      `ALTER TABLE "class_journals" ADD "audio_urls" nvarchar(MAX) NOT NULL CONSTRAINT "DF_c322dfda5a5e9368482fb1b1c7f" DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "class_journals" ADD "issues" nvarchar(MAX) NOT NULL CONSTRAINT "DF_c16e247109c22e00e2c103c5633" DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "class_journals" ADD "status" nvarchar(255) CONSTRAINT CHK_c59dabc676575f56ade20d80be_ENUM CHECK(status IN ('DRAFT','REVIEW','APPROVED','PUBLISHED')) NOT NULL CONSTRAINT "DF_5468588cc950de98677912cbb08" DEFAULT 'DRAFT'`,
    );
    await queryRunner.query(`ALTER TABLE "class_journals" ADD "approved_at" datetime2`);
    await queryRunner.query(`ALTER TABLE "class_journals" ADD "published_at" datetime2`);
    await queryRunner.query(
      `ALTER TABLE "class_journals" ADD "revision" int NOT NULL CONSTRAINT "DF_f4ee6fb1f9eb628343968df3db5" DEFAULT 0`,
    );
    await queryRunner.query(`ALTER TABLE "class_journals" ADD "published_version" nvarchar(MAX)`);
    await queryRunner.query(`ALTER TABLE "class_journals" ADD "created_by_id" uniqueidentifier`);
    await queryRunner.query(
      `ALTER TABLE "class_journals" ADD CONSTRAINT "FK_bac6aabdda6b389227432c11af4" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "class_journal_notes" ADD CONSTRAINT "FK_b68d04dbdf55e63520e6582aca8" FOREIGN KEY ("journal_id") REFERENCES "class_journals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "class_journal_notes" ADD CONSTRAINT "FK_302b812df906d5586a23fd24b22" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "class_journal_notes" DROP CONSTRAINT "FK_302b812df906d5586a23fd24b22"`,
    );
    await queryRunner.query(
      `ALTER TABLE "class_journal_notes" DROP CONSTRAINT "FK_b68d04dbdf55e63520e6582aca8"`,
    );
    await queryRunner.query(`ALTER TABLE "class_journals" DROP CONSTRAINT "FK_bac6aabdda6b389227432c11af4"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP COLUMN "created_by_id"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP COLUMN "published_version"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP CONSTRAINT "DF_f4ee6fb1f9eb628343968df3db5"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP COLUMN "revision"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP COLUMN "published_at"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP COLUMN "approved_at"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP CONSTRAINT "DF_5468588cc950de98677912cbb08"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP COLUMN "status"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP CONSTRAINT "DF_c16e247109c22e00e2c103c5633"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP COLUMN "issues"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP CONSTRAINT "DF_c322dfda5a5e9368482fb1b1c7f"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP COLUMN "audio_urls"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP COLUMN "transcript"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP CONSTRAINT "DF_dcb938dacb27def48ccf3eae7c3"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP COLUMN "source"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP CONSTRAINT "DF_b51b2d7be0791476d1f249442f7"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP COLUMN "photos"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP COLUMN "emotion"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP COLUMN "health"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP COLUMN "sleep"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP COLUMN "learning"`);
    await queryRunner.query(`ALTER TABLE "class_journals" DROP COLUMN "meal"`);
    await queryRunner.query(`DROP INDEX "IDX_302b812df906d5586a23fd24b2" ON "class_journal_notes"`);
    await queryRunner.query(`DROP TABLE "class_journal_notes"`);
  }
}
