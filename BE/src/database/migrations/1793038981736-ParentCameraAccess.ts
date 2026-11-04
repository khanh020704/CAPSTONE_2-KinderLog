import { MigrationInterface, QueryRunner } from 'typeorm';

/** Per-parent switch for the classroom camera (on by default, so existing parents keep their access). */
export class ParentCameraAccess1793038981736 implements MigrationInterface {
  name = 'ParentCameraAccess1793038981736';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "camera_access" bit NOT NULL CONSTRAINT "DF_528bec5490448d1e8adae959005" DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "DF_528bec5490448d1e8adae959005"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "camera_access"`);
  }
}
