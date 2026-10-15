import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1791992367679 implements MigrationInterface {
  name = 'InitialSchema1791992367679';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // uuid_generate_v4() for primary keys; unaccent() for accent-insensitive Vietnamese name search
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "unaccent"`);
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('SYSTEM_ADMIN', 'PRINCIPAL', 'TEACHER', 'PARENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'LOCKED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid, "full_name" character varying(120) NOT NULL, "phone" character varying(20) NOT NULL, "email" character varying(120), "password_hash" character varying(100) NOT NULL, "role" "public"."users_role_enum" NOT NULL, "status" "public"."users_status_enum" NOT NULL DEFAULT 'ACTIVE', "address" character varying(255), "last_login_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_25e1cf8f41bae2f3d11f3c2a02" ON "users" ("school_id") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a000cca60bcf04454e72769949" ON "users" ("phone") `);
    await queryRunner.query(`CREATE TYPE "public"."students_gender_enum" AS ENUM('MALE', 'FEMALE')`);
    await queryRunner.query(
      `CREATE TYPE "public"."students_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'LOCKED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "students" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "class_id" uuid NOT NULL, "full_name" character varying(120) NOT NULL, "date_of_birth" date NOT NULL, "gender" "public"."students_gender_enum" NOT NULL, "allergies" text, "medical_note" text, "avatar_url" character varying(500), "status" "public"."students_status_enum" NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "PK_7d7f07271ad4ce999880713f05e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_de6ad4ae6936dce474e2823984" ON "students" ("class_id") `);
    await queryRunner.query(
      `CREATE TYPE "public"."parent_student_map_relationship_enum" AS ENUM('MOTHER', 'FATHER', 'GRANDMOTHER', 'GRANDFATHER', 'GUARDIAN')`,
    );
    await queryRunner.query(
      `CREATE TABLE "parent_student_map" ("parent_id" uuid NOT NULL, "student_id" uuid NOT NULL, "relationship" "public"."parent_student_map_relationship_enum" NOT NULL, "is_primary" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_101281f10aea1a0c8976fbe5549" PRIMARY KEY ("parent_id", "student_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_43781daa08077ffc035057f7b6" ON "parent_student_map" ("student_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."schools_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'LOCKED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "schools" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(150) NOT NULL, "address" character varying(255), "phone" character varying(20), "email" character varying(120), "status" "public"."schools_status_enum" NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "PK_95b932e47ac129dd8e23a0db548" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "journal_photos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "journal_id" uuid NOT NULL, "url" character varying(500) NOT NULL, "caption" character varying(255), "uploaded_by_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_049cf4bf4a05a8005272709c6e9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_750621e15b0d756921082635b1" ON "journal_photos" ("journal_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."daily_journals_attendance_enum" AS ENUM('PRESENT', 'ABSENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."daily_journals_meal_level_enum" AS ENUM('ALL', 'MOST', 'HALF', 'LITTLE', 'NONE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."daily_journals_sleep_quality_enum" AS ENUM('GOOD', 'FAIR', 'POOR', 'NONE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."daily_journals_health_status_enum" AS ENUM('NORMAL', 'MONITOR', 'SICK')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."daily_journals_mood_enum" AS ENUM('HAPPY', 'CALM', 'TIRED', 'SAD')`,
    );
    await queryRunner.query(`CREATE TYPE "public"."daily_journals_status_enum" AS ENUM('DRAFT', 'APPROVED')`);
    await queryRunner.query(
      `CREATE TYPE "public"."daily_journals_source_enum" AS ENUM('MANUAL', 'BULK', 'VOICE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "daily_journals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "student_id" uuid NOT NULL, "class_id" uuid NOT NULL, "journal_date" date NOT NULL, "attendance" "public"."daily_journals_attendance_enum" NOT NULL DEFAULT 'PRESENT', "absence_reason" character varying(255), "meal_level" "public"."daily_journals_meal_level_enum", "meal_note" text, "sleep_minutes" smallint, "sleep_quality" "public"."daily_journals_sleep_quality_enum", "learning_note" text, "health_status" "public"."daily_journals_health_status_enum", "temperature" numeric(3,1), "health_note" text, "mood" "public"."daily_journals_mood_enum", "teacher_note" text, "status" "public"."daily_journals_status_enum" NOT NULL DEFAULT 'DRAFT', "source" "public"."daily_journals_source_enum" NOT NULL DEFAULT 'MANUAL', "is_exception" boolean NOT NULL DEFAULT false, "created_by_id" uuid, "approved_by_id" uuid, "approved_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_journal_student_date" UNIQUE ("student_id", "journal_date"), CONSTRAINT "PK_6e360ae4a93f183f00bc6ef694c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_journal_class_date" ON "daily_journals" ("class_id", "journal_date") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."classes_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'LOCKED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "classes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "name" character varying(80) NOT NULL, "academic_year" character varying(9) NOT NULL, "age_group" character varying(40), "homeroom_teacher_id" uuid, "status" "public"."classes_status_enum" NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "uq_class_name_per_year" UNIQUE ("school_id", "academic_year", "name"), CONSTRAINT "PK_e207aa15404e9b2ce35910f9f7f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_398f3990f5da4a1efda173f576" ON "classes" ("school_id") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_5f17c07d8e2590c3c148b17336" ON "classes" ("homeroom_teacher_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "camera_streams" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "class_id" uuid NOT NULL, "name" character varying(80) NOT NULL, "stream_url" character varying(500) NOT NULL, "allowed_start_time" TIME NOT NULL, "allowed_end_time" TIME NOT NULL, "allowed_weekdays" smallint NOT NULL DEFAULT '62', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_1988cc3fd7ef59c06ce335b5a16" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b7bcd4eed33476c677e1a9a815" ON "camera_streams" ("class_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_25e1cf8f41bae2f3d11f3c2a028" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "students" ADD CONSTRAINT "FK_de6ad4ae6936dce474e2823984e" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "parent_student_map" ADD CONSTRAINT "FK_5851e034a4ac67d7b7ddfa8f569" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "parent_student_map" ADD CONSTRAINT "FK_43781daa08077ffc035057f7b6d" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_photos" ADD CONSTRAINT "FK_750621e15b0d756921082635b12" FOREIGN KEY ("journal_id") REFERENCES "daily_journals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_photos" ADD CONSTRAINT "FK_dc427c4caed1749ac7b0be4272d" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_journals" ADD CONSTRAINT "FK_c37ad3c4546ae8174343afad18d" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_journals" ADD CONSTRAINT "FK_6375eb40ae775862e211c3566f9" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_journals" ADD CONSTRAINT "FK_d3d402fff9c5b47f08c36b77b36" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_journals" ADD CONSTRAINT "FK_a975e3cbedeeef9886c87e9f650" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "classes" ADD CONSTRAINT "FK_398f3990f5da4a1efda173f576f" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "classes" ADD CONSTRAINT "FK_5f17c07d8e2590c3c148b173363" FOREIGN KEY ("homeroom_teacher_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "camera_streams" ADD CONSTRAINT "FK_b7bcd4eed33476c677e1a9a8151" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "camera_streams" DROP CONSTRAINT "FK_b7bcd4eed33476c677e1a9a8151"`);
    await queryRunner.query(`ALTER TABLE "classes" DROP CONSTRAINT "FK_5f17c07d8e2590c3c148b173363"`);
    await queryRunner.query(`ALTER TABLE "classes" DROP CONSTRAINT "FK_398f3990f5da4a1efda173f576f"`);
    await queryRunner.query(`ALTER TABLE "daily_journals" DROP CONSTRAINT "FK_a975e3cbedeeef9886c87e9f650"`);
    await queryRunner.query(`ALTER TABLE "daily_journals" DROP CONSTRAINT "FK_d3d402fff9c5b47f08c36b77b36"`);
    await queryRunner.query(`ALTER TABLE "daily_journals" DROP CONSTRAINT "FK_6375eb40ae775862e211c3566f9"`);
    await queryRunner.query(`ALTER TABLE "daily_journals" DROP CONSTRAINT "FK_c37ad3c4546ae8174343afad18d"`);
    await queryRunner.query(`ALTER TABLE "journal_photos" DROP CONSTRAINT "FK_dc427c4caed1749ac7b0be4272d"`);
    await queryRunner.query(`ALTER TABLE "journal_photos" DROP CONSTRAINT "FK_750621e15b0d756921082635b12"`);
    await queryRunner.query(
      `ALTER TABLE "parent_student_map" DROP CONSTRAINT "FK_43781daa08077ffc035057f7b6d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "parent_student_map" DROP CONSTRAINT "FK_5851e034a4ac67d7b7ddfa8f569"`,
    );
    await queryRunner.query(`ALTER TABLE "students" DROP CONSTRAINT "FK_de6ad4ae6936dce474e2823984e"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_25e1cf8f41bae2f3d11f3c2a028"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b7bcd4eed33476c677e1a9a815"`);
    await queryRunner.query(`DROP TABLE "camera_streams"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5f17c07d8e2590c3c148b17336"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_398f3990f5da4a1efda173f576"`);
    await queryRunner.query(`DROP TABLE "classes"`);
    await queryRunner.query(`DROP TYPE "public"."classes_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."ix_journal_class_date"`);
    await queryRunner.query(`DROP TABLE "daily_journals"`);
    await queryRunner.query(`DROP TYPE "public"."daily_journals_source_enum"`);
    await queryRunner.query(`DROP TYPE "public"."daily_journals_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."daily_journals_mood_enum"`);
    await queryRunner.query(`DROP TYPE "public"."daily_journals_health_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."daily_journals_sleep_quality_enum"`);
    await queryRunner.query(`DROP TYPE "public"."daily_journals_meal_level_enum"`);
    await queryRunner.query(`DROP TYPE "public"."daily_journals_attendance_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_750621e15b0d756921082635b1"`);
    await queryRunner.query(`DROP TABLE "journal_photos"`);
    await queryRunner.query(`DROP TABLE "schools"`);
    await queryRunner.query(`DROP TYPE "public"."schools_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_43781daa08077ffc035057f7b6"`);
    await queryRunner.query(`DROP TABLE "parent_student_map"`);
    await queryRunner.query(`DROP TYPE "public"."parent_student_map_relationship_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_de6ad4ae6936dce474e2823984"`);
    await queryRunner.query(`DROP TABLE "students"`);
    await queryRunner.query(`DROP TYPE "public"."students_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."students_gender_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a000cca60bcf04454e72769949"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_25e1cf8f41bae2f3d11f3c2a02"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
