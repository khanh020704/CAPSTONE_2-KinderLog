import { MigrationInterface, QueryRunner } from 'typeorm';

/** Parent–child links can be set INACTIVE (kept, but the parent no longer sees the child); existing links stay ACTIVE. */
export class ParentChildLinkStatus1793039679779 implements MigrationInterface {
  name = 'ParentChildLinkStatus1793039679779';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "parent_student_map" ADD "status" nvarchar(255) CONSTRAINT CHK_e7753a44bfc5f77d9952aebb7e_ENUM CHECK(status IN ('ACTIVE','INACTIVE','LOCKED')) NOT NULL CONSTRAINT "DF_004621a919ed2c579cf75e69b7a" DEFAULT 'ACTIVE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "parent_student_map" DROP CONSTRAINT "DF_004621a919ed2c579cf75e69b7a"`,
    );
    await queryRunner.query(`ALTER TABLE "parent_student_map" DROP COLUMN "status"`);
  }
}
