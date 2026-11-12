import { MigrationInterface, QueryRunner } from 'typeorm';

/** Announcements can be scheduled: notified_at records when the audience was told (NULL = not released yet). */
export class AnnouncementSchedule1793044153544 implements MigrationInterface {
  name = 'AnnouncementSchedule1793044153544';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "school_announcements" ADD "notified_at" datetime2`);
    // Announcements already published were notified when they were published: never notify them again.
    await queryRunner.query(
      `UPDATE "school_announcements" SET "notified_at" = "published_at" WHERE "published_at" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "school_announcements" DROP COLUMN "notified_at"`);
  }
}
