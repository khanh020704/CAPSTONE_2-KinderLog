import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1792318915446 implements MigrationInterface {
  name = 'InitialSchema1792318915446';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_a3ffb1c0c8416b9fc6f907b7433" DEFAULT NEWSEQUENTIALID(), "created_at" datetime2 NOT NULL CONSTRAINT "DF_c9b5b525a96ddc2c5647d7f7fa5" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_6d596d799f9cb9dac6f7bf7c23c" DEFAULT getdate(), "school_id" uniqueidentifier, "full_name" nvarchar(120) NOT NULL, "phone" nvarchar(20) NOT NULL, "email" nvarchar(120), "password_hash" nvarchar(100) NOT NULL, "role" nvarchar(255) CONSTRAINT CHK_7eb3c47dba1294287a62217e22_ENUM CHECK(role IN ('SYSTEM_ADMIN','PRINCIPAL','TEACHER','PARENT')) NOT NULL, "status" nvarchar(255) CONSTRAINT CHK_4023c1f97f8e88de684c5025c3_ENUM CHECK(status IN ('ACTIVE','INACTIVE','LOCKED')) NOT NULL CONSTRAINT "DF_3676155292d72c67cd4e090514f" DEFAULT 'ACTIVE', "address" nvarchar(255), "last_login_at" datetime2, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_25e1cf8f41bae2f3d11f3c2a02" ON "users" ("school_id") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a000cca60bcf04454e72769949" ON "users" ("phone") `);
    await queryRunner.query(
      `CREATE TABLE "parent_student_map" ("parent_id" uniqueidentifier NOT NULL, "student_id" uniqueidentifier NOT NULL, "relationship" nvarchar(255) CONSTRAINT CHK_26bfab8d745cf8dbbb5eeee1ff_ENUM CHECK(relationship IN ('MOTHER','FATHER','GRANDMOTHER','GRANDFATHER','GUARDIAN')) NOT NULL, "is_primary" bit NOT NULL CONSTRAINT "DF_91c7651f2a5ba599cdca1d142c0" DEFAULT 0, "created_at" datetime2 NOT NULL CONSTRAINT "DF_d158fdcbfc0d8e9551a5acc3f8d" DEFAULT getdate(), CONSTRAINT "PK_101281f10aea1a0c8976fbe5549" PRIMARY KEY ("parent_id", "student_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_43781daa08077ffc035057f7b6" ON "parent_student_map" ("student_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "students" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_7d7f07271ad4ce999880713f05e" DEFAULT NEWSEQUENTIALID(), "created_at" datetime2 NOT NULL CONSTRAINT "DF_e5b62e6d1b34a877967a34ca0f9" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_539ab5182af6bc1bcadf4dc57b5" DEFAULT getdate(), "class_id" uniqueidentifier NOT NULL, "full_name" nvarchar(120) NOT NULL, "date_of_birth" date NOT NULL, "gender" nvarchar(255) CONSTRAINT CHK_e4bb8f5905c9a70c066afd4ea8_ENUM CHECK(gender IN ('MALE','FEMALE')) NOT NULL, "allergies" nvarchar(MAX), "medical_note" nvarchar(MAX), "avatar_url" nvarchar(500), "status" nvarchar(255) CONSTRAINT CHK_5db6a3dc2674dfd3b1e25db72d_ENUM CHECK(status IN ('ACTIVE','INACTIVE','LOCKED')) NOT NULL CONSTRAINT "DF_89d97b30d7d2b126c22e4fb28d4" DEFAULT 'ACTIVE', CONSTRAINT "PK_7d7f07271ad4ce999880713f05e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_de6ad4ae6936dce474e2823984" ON "students" ("class_id") `);
    await queryRunner.query(
      `CREATE TABLE "schools" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_95b932e47ac129dd8e23a0db548" DEFAULT NEWSEQUENTIALID(), "created_at" datetime2 NOT NULL CONSTRAINT "DF_43cc392ab496fc8a41b817b910f" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_860d5b564850c30fb80f8bd6604" DEFAULT getdate(), "name" nvarchar(150) NOT NULL, "address" nvarchar(255), "phone" nvarchar(20), "email" nvarchar(120), "status" nvarchar(255) CONSTRAINT CHK_a46da3f2e8f7d2505f6ac4d3b6_ENUM CHECK(status IN ('ACTIVE','INACTIVE','LOCKED')) NOT NULL CONSTRAINT "DF_932d32520c46c229c5277b54f1d" DEFAULT 'ACTIVE', CONSTRAINT "PK_95b932e47ac129dd8e23a0db548" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "journal_photos" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_049cf4bf4a05a8005272709c6e9" DEFAULT NEWSEQUENTIALID(), "journal_id" uniqueidentifier NOT NULL, "url" nvarchar(500) NOT NULL, "caption" nvarchar(255), "uploaded_by_id" uniqueidentifier, "created_at" datetime2 NOT NULL CONSTRAINT "DF_9ab4524430ee10d6c0352fbfb1e" DEFAULT getdate(), CONSTRAINT "PK_049cf4bf4a05a8005272709c6e9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_750621e15b0d756921082635b1" ON "journal_photos" ("journal_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "daily_journals" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_6e360ae4a93f183f00bc6ef694c" DEFAULT NEWSEQUENTIALID(), "created_at" datetime2 NOT NULL CONSTRAINT "DF_6cce81fd0b58710586fe5c8f3c3" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_d47cfe9d73923ee135861919d32" DEFAULT getdate(), "student_id" uniqueidentifier NOT NULL, "class_id" uniqueidentifier NOT NULL, "journal_date" date NOT NULL, "attendance" nvarchar(255) CONSTRAINT CHK_a4d9d7201ceddb85ccf7c64099_ENUM CHECK(attendance IN ('PRESENT','ABSENT')) NOT NULL CONSTRAINT "DF_54dc3d04311751788b6437a6baa" DEFAULT 'PRESENT', "absence_reason" nvarchar(255), "meal_level" nvarchar(255) CONSTRAINT CHK_101a433f3b4533ddb01cd2d36f_ENUM CHECK(meal_level IN ('ALL','MOST','HALF','LITTLE','NONE')), "meal_note" nvarchar(MAX), "sleep_minutes" smallint, "sleep_quality" nvarchar(255) CONSTRAINT CHK_f0ebab4b801f9b1425cb240dfc_ENUM CHECK(sleep_quality IN ('GOOD','FAIR','POOR','NONE')), "learning_note" nvarchar(MAX), "health_status" nvarchar(255) CONSTRAINT CHK_9434f215ba405bce4a76dac3ec_ENUM CHECK(health_status IN ('NORMAL','MONITOR','SICK')), "temperature" decimal(3,1), "health_note" nvarchar(MAX), "mood" nvarchar(255) CONSTRAINT CHK_52cfe665463d69d2d083e67263_ENUM CHECK(mood IN ('HAPPY','CALM','TIRED','SAD')), "teacher_note" nvarchar(MAX), "status" nvarchar(255) CONSTRAINT CHK_fedd91ab6955f674587c44d10d_ENUM CHECK(status IN ('DRAFT','APPROVED')) NOT NULL CONSTRAINT "DF_71f943ce2744b1327a81cfbff19" DEFAULT 'DRAFT', "source" nvarchar(255) CONSTRAINT CHK_101db55273f27b766f3cf6f7a3_ENUM CHECK(source IN ('MANUAL','BULK','VOICE')) NOT NULL CONSTRAINT "DF_10f614c6c37dca8f86288412499" DEFAULT 'MANUAL', "is_exception" bit NOT NULL CONSTRAINT "DF_e96cadbe539f402b12e0ed395cc" DEFAULT 0, "created_by_id" uniqueidentifier, "approved_by_id" uniqueidentifier, "approved_at" datetime2, CONSTRAINT "uq_journal_student_date" UNIQUE ("student_id", "journal_date"), CONSTRAINT "PK_6e360ae4a93f183f00bc6ef694c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_journal_class_date" ON "daily_journals" ("class_id", "journal_date") `,
    );
    await queryRunner.query(
      `CREATE TABLE "classes" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_e207aa15404e9b2ce35910f9f7f" DEFAULT NEWSEQUENTIALID(), "created_at" datetime2 NOT NULL CONSTRAINT "DF_b1f4e275f190e6af92d431ae6cd" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_33950bcba1c8ef05b90ea7d9c25" DEFAULT getdate(), "school_id" uniqueidentifier NOT NULL, "name" nvarchar(80) NOT NULL, "academic_year" nvarchar(9) NOT NULL, "age_group" nvarchar(40), "homeroom_teacher_id" uniqueidentifier, "status" nvarchar(255) CONSTRAINT CHK_33606992d78c4da63f489d35aa_ENUM CHECK(status IN ('ACTIVE','INACTIVE','LOCKED')) NOT NULL CONSTRAINT "DF_37ca4ff81ecfbdd19c40d6cd806" DEFAULT 'ACTIVE', CONSTRAINT "uq_class_name_per_year" UNIQUE ("school_id", "academic_year", "name"), CONSTRAINT "PK_e207aa15404e9b2ce35910f9f7f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_398f3990f5da4a1efda173f576" ON "classes" ("school_id") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_5f17c07d8e2590c3c148b17336" ON "classes" ("homeroom_teacher_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "camera_streams" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_1988cc3fd7ef59c06ce335b5a16" DEFAULT NEWSEQUENTIALID(), "created_at" datetime2 NOT NULL CONSTRAINT "DF_26d458dfb8d03a4d793741a41a6" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_30ed3a0bc96790b9c9081d8c955" DEFAULT getdate(), "class_id" uniqueidentifier NOT NULL, "name" nvarchar(80) NOT NULL, "stream_url" nvarchar(500) NOT NULL, "allowed_start_time" time NOT NULL, "allowed_end_time" time NOT NULL, "allowed_weekdays" smallint NOT NULL CONSTRAINT "DF_9964451ec569dc32a911f6cc20e" DEFAULT 62, "is_active" bit NOT NULL CONSTRAINT "DF_821d8aff1d0aa73d2a8591fc8f3" DEFAULT 1, CONSTRAINT "PK_1988cc3fd7ef59c06ce335b5a16" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b7bcd4eed33476c677e1a9a815" ON "camera_streams" ("class_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_25e1cf8f41bae2f3d11f3c2a028" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "parent_student_map" ADD CONSTRAINT "FK_5851e034a4ac67d7b7ddfa8f569" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "parent_student_map" ADD CONSTRAINT "FK_43781daa08077ffc035057f7b6d" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "students" ADD CONSTRAINT "FK_de6ad4ae6936dce474e2823984e" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_photos" ADD CONSTRAINT "FK_750621e15b0d756921082635b12" FOREIGN KEY ("journal_id") REFERENCES "daily_journals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_photos" ADD CONSTRAINT "FK_dc427c4caed1749ac7b0be4272d" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_journals" ADD CONSTRAINT "FK_c37ad3c4546ae8174343afad18d" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_journals" ADD CONSTRAINT "FK_6375eb40ae775862e211c3566f9" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_journals" ADD CONSTRAINT "FK_d3d402fff9c5b47f08c36b77b36" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_journals" ADD CONSTRAINT "FK_a975e3cbedeeef9886c87e9f650" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "classes" ADD CONSTRAINT "FK_398f3990f5da4a1efda173f576f" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "classes" ADD CONSTRAINT "FK_5f17c07d8e2590c3c148b173363" FOREIGN KEY ("homeroom_teacher_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
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
    await queryRunner.query(`ALTER TABLE "students" DROP CONSTRAINT "FK_de6ad4ae6936dce474e2823984e"`);
    await queryRunner.query(
      `ALTER TABLE "parent_student_map" DROP CONSTRAINT "FK_43781daa08077ffc035057f7b6d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "parent_student_map" DROP CONSTRAINT "FK_5851e034a4ac67d7b7ddfa8f569"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_25e1cf8f41bae2f3d11f3c2a028"`);
    await queryRunner.query(`DROP INDEX "IDX_b7bcd4eed33476c677e1a9a815" ON "camera_streams"`);
    await queryRunner.query(`DROP TABLE "camera_streams"`);
    await queryRunner.query(`DROP INDEX "IDX_5f17c07d8e2590c3c148b17336" ON "classes"`);
    await queryRunner.query(`DROP INDEX "IDX_398f3990f5da4a1efda173f576" ON "classes"`);
    await queryRunner.query(`DROP TABLE "classes"`);
    await queryRunner.query(`DROP INDEX "ix_journal_class_date" ON "daily_journals"`);
    await queryRunner.query(`DROP TABLE "daily_journals"`);
    await queryRunner.query(`DROP INDEX "IDX_750621e15b0d756921082635b1" ON "journal_photos"`);
    await queryRunner.query(`DROP TABLE "journal_photos"`);
    await queryRunner.query(`DROP TABLE "schools"`);
    await queryRunner.query(`DROP INDEX "IDX_de6ad4ae6936dce474e2823984" ON "students"`);
    await queryRunner.query(`DROP TABLE "students"`);
    await queryRunner.query(`DROP INDEX "IDX_43781daa08077ffc035057f7b6" ON "parent_student_map"`);
    await queryRunner.query(`DROP TABLE "parent_student_map"`);
    await queryRunner.query(`DROP INDEX "IDX_a000cca60bcf04454e72769949" ON "users"`);
    await queryRunner.query(`DROP INDEX "IDX_25e1cf8f41bae2f3d11f3c2a02" ON "users"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
