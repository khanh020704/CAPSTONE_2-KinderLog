import { MigrationInterface, QueryRunner } from 'typeorm';

/** Excused / unexcused absence (User Story 2.11). Absences already recorded become unexcused. */
export class AbsenceType1793786661832 implements MigrationInterface {
  name = 'AbsenceType1793786661832';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "daily_journals" ADD "absence_type" nvarchar(255) CONSTRAINT CHK_a58aeafa8758c8bf84ea1273bf_ENUM CHECK(absence_type IN ('EXCUSED','UNEXCUSED'))`,
    );
    await queryRunner.query(
      `UPDATE "daily_journals" SET "absence_type" = 'UNEXCUSED' WHERE "attendance" = 'ABSENT'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "daily_journals" DROP COLUMN "absence_type"`);
  }
}
