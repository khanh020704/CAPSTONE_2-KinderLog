import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuxiliaryModules1792491558421 implements MigrationInterface {
  name = 'AuxiliaryModules1792491558421';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_6a72c3c0f683f6462415e653c3a" DEFAULT NEWSEQUENTIALID(), "created_at" datetime2 NOT NULL CONSTRAINT "DF_77ee7b06d6f802000c0846f3a56" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_bc1d74459bf51659c6f4e4c429a" DEFAULT getdate(), "user_id" uniqueidentifier NOT NULL, "type" nvarchar(255) CONSTRAINT CHK_c60a5bd7fe4b5e95bdba8da0f8_ENUM CHECK(type IN ('JOURNAL','MESSAGE','ANNOUNCEMENT','CAMERA','SYSTEM')) NOT NULL, "title" nvarchar(200) NOT NULL, "body" nvarchar(1000), "link" nvarchar(300), "ref_id" uniqueidentifier, "read_at" datetime2, CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_310667f935698fcd8cb319113a" ON "notifications" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5323ccd23482802bd9759e88ee" ON "notifications" ("user_id", "read_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "messages" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_18325f38ae6de43878487eff986" DEFAULT NEWSEQUENTIALID(), "created_at" datetime2 NOT NULL CONSTRAINT "DF_0777b63da90c27d6ed993dc60b2" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_feefa6146e737fd497914696e38" DEFAULT getdate(), "sender_id" uniqueidentifier NOT NULL, "receiver_id" uniqueidentifier NOT NULL, "content" nvarchar(2000) NOT NULL, "read_at" datetime2, CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4fca5cee699736de496ea422d4" ON "messages" ("receiver_id", "read_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3436f3151e5708701460ce6b5a" ON "messages" ("sender_id", "receiver_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "school_announcements" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_10b91a40b8c8e10d02bd3ac7f55" DEFAULT NEWSEQUENTIALID(), "created_at" datetime2 NOT NULL CONSTRAINT "DF_6fa7506d315939f0d589ac23f5f" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_9672ce5f1dfb2dca227d92599c8" DEFAULT getdate(), "school_id" uniqueidentifier NOT NULL, "created_by" uniqueidentifier, "title" nvarchar(200) NOT NULL, "content" nvarchar(MAX) NOT NULL, "category" nvarchar(255) CONSTRAINT CHK_5af82fa91d14825ace5d559e32_ENUM CHECK(category IN ('HOLIDAY','ACTIVITY','NOTICE','REMINDER')) NOT NULL CONSTRAINT "DF_b447ab67678cf80ab4926a7179a" DEFAULT 'NOTICE', "audience" nvarchar(255) CONSTRAINT CHK_585aa96e7dcd70a2b582d8bb6e_ENUM CHECK(audience IN ('ALL','TEACHERS','PARENTS')) NOT NULL CONSTRAINT "DF_e10cbe43390a3b5ba9f02eaf31d" DEFAULT 'ALL', "status" nvarchar(255) CONSTRAINT CHK_3d52943786e5039948da47a277_ENUM CHECK(status IN ('DRAFT','PUBLISHED')) NOT NULL CONSTRAINT "DF_a7d866ebc4d90c529f9e75126af" DEFAULT 'DRAFT', "published_at" datetime2, "expires_on" date, CONSTRAINT "PK_10b91a40b8c8e10d02bd3ac7f55" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fb2e1417c1a9adbb6abb664e5b" ON "school_announcements" ("school_id", "status", "published_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_1bb179d048bbc581caa3b013439" DEFAULT NEWSEQUENTIALID(), "created_at" datetime2 NOT NULL CONSTRAINT "DF_2cd10fda8276bb995288acfbfb1" DEFAULT getdate(), "user_id" uniqueidentifier, "school_id" uniqueidentifier, "user_name" nvarchar(120), "user_role" nvarchar(20), "action" nvarchar(40) NOT NULL, "module" nvarchar(60) NOT NULL, "description" nvarchar(500) NOT NULL, "status" nvarchar(255) CONSTRAINT CHK_7b1dbcaa52a451bce70c7403f1_ENUM CHECK(status IN ('SUCCESS','FAILED')) NOT NULL, "http_status" smallint, "ip_address" nvarchar(45), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_2cd10fda8276bb995288acfbfb" ON "audit_logs" ("created_at") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_2f68e345c05e8166ff9deea1ab" ON "audit_logs" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_263e3fb143562f115c7def1ef1" ON "audit_logs" ("school_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "academic_years" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_2021b90bfbfa6c9da7df34ca1cf" DEFAULT NEWSEQUENTIALID(), "created_at" datetime2 NOT NULL CONSTRAINT "DF_d96f691c13ba6d800b1958a0207" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_7358ba3037a4ac205a32e226797" DEFAULT getdate(), "school_id" uniqueidentifier NOT NULL, "name" nvarchar(9) NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "status" nvarchar(255) CONSTRAINT CHK_92e64f21b72670bfe713f1f067_ENUM CHECK(status IN ('ACTIVE','INACTIVE')) NOT NULL CONSTRAINT "DF_cf3efa8f7729538830af4a8c761" DEFAULT 'INACTIVE', CONSTRAINT "PK_2021b90bfbfa6c9da7df34ca1cf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_98d82cd119647a06018a880cf3" ON "academic_years" ("school_id", "name") `,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "FK_22133395bd13b970ccd0c34ab22" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "FK_b561864743d235f44e70addc1f5" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "school_announcements" ADD CONSTRAINT "FK_f28132202df4fc4970acde40a23" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "school_announcements" ADD CONSTRAINT "FK_5eba3a9ff37a734ee44177800f3" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_bd2726fd31b35443f2245b93ba0" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_dfa425a9b20aa546ef0280a8769" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_years" ADD CONSTRAINT "FK_b293eb7909d2a3aae86c4380713" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "academic_years" DROP CONSTRAINT "FK_b293eb7909d2a3aae86c4380713"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_dfa425a9b20aa546ef0280a8769"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_bd2726fd31b35443f2245b93ba0"`);
    await queryRunner.query(
      `ALTER TABLE "school_announcements" DROP CONSTRAINT "FK_5eba3a9ff37a734ee44177800f3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "school_announcements" DROP CONSTRAINT "FK_f28132202df4fc4970acde40a23"`,
    );
    await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_b561864743d235f44e70addc1f5"`);
    await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_22133395bd13b970ccd0c34ab22"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_9a8a82462cab47c73d25f49261f"`);
    await queryRunner.query(`DROP INDEX "IDX_98d82cd119647a06018a880cf3" ON "academic_years"`);
    await queryRunner.query(`DROP TABLE "academic_years"`);
    await queryRunner.query(`DROP INDEX "IDX_263e3fb143562f115c7def1ef1" ON "audit_logs"`);
    await queryRunner.query(`DROP INDEX "IDX_2f68e345c05e8166ff9deea1ab" ON "audit_logs"`);
    await queryRunner.query(`DROP INDEX "IDX_2cd10fda8276bb995288acfbfb" ON "audit_logs"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP INDEX "IDX_fb2e1417c1a9adbb6abb664e5b" ON "school_announcements"`);
    await queryRunner.query(`DROP TABLE "school_announcements"`);
    await queryRunner.query(`DROP INDEX "IDX_3436f3151e5708701460ce6b5a" ON "messages"`);
    await queryRunner.query(`DROP INDEX "IDX_4fca5cee699736de496ea422d4" ON "messages"`);
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(`DROP INDEX "IDX_5323ccd23482802bd9759e88ee" ON "notifications"`);
    await queryRunner.query(`DROP INDEX "IDX_310667f935698fcd8cb319113a" ON "notifications"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
