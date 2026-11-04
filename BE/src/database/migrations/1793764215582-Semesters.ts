import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Semesters (học kỳ) of an academic year. Existing data is filled in:
 * - every academic year a school's classes use gets its academic_years row (1 September → 31 May), the newest one
 *   becoming the current year when the school has none;
 * - every academic year gets Học kỳ 1 (until 15 January) and Học kỳ 2 (from 16 January), as new years do.
 */
export class Semesters1793764215582 implements MigrationInterface {
  name = 'Semesters1793764215582';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "semesters" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_25c393e2e76b3e32e87a79b1dc2" DEFAULT NEWSEQUENTIALID(), "created_at" datetime2 NOT NULL CONSTRAINT "DF_5e3518a76a7aa9f9ca02897a601" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_4c253b8eefe8e8d73939edf5bbf" DEFAULT getdate(), "academic_year_id" uniqueidentifier NOT NULL, "name" nvarchar(50) NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, CONSTRAINT "PK_25c393e2e76b3e32e87a79b1dc2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c2e30b01428d1e2b5310d2eafe" ON "semesters" ("academic_year_id", "name") `,
    );
    await queryRunner.query(
      `ALTER TABLE "semesters" ADD CONSTRAINT "FK_a2d5014975f0e10189e2dc45820" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Academic years the classes already use but that were never created.
    await queryRunner.query(
      `INSERT INTO "academic_years" ("school_id", "name", "start_date", "end_date", "status")
       SELECT DISTINCT c."school_id", c."academic_year",
              DATEFROMPARTS(CAST(LEFT(c."academic_year", 4) AS int), 9, 1),
              DATEFROMPARTS(CAST(RIGHT(c."academic_year", 4) AS int), 5, 31),
              'INACTIVE'
       FROM "classes" c
       WHERE c."academic_year" LIKE '[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]'
         AND NOT EXISTS (SELECT 1 FROM "academic_years" y WHERE y."school_id" = c."school_id" AND y."name" = c."academic_year")`,
    );
    // A school without a current year: its newest year becomes current.
    await queryRunner.query(
      `UPDATE y SET "status" = 'ACTIVE'
       FROM "academic_years" y
       WHERE y."name" = (SELECT MAX(n."name") FROM "academic_years" n WHERE n."school_id" = y."school_id")
         AND NOT EXISTS (SELECT 1 FROM "academic_years" a WHERE a."school_id" = y."school_id" AND a."status" = 'ACTIVE')`,
    );
    // Học kỳ 1 / Học kỳ 2 for every year whose dates span 15–16 January (see defaultSemesters).
    await queryRunner.query(
      `INSERT INTO "semesters" ("academic_year_id", "name", "start_date", "end_date")
       SELECT y."id", s."name", s."start_date", s."end_date"
       FROM "academic_years" y
       CROSS APPLY (VALUES
         (N'Học kỳ 1', y."start_date", DATEFROMPARTS(CAST(RIGHT(y."name", 4) AS int), 1, 15)),
         (N'Học kỳ 2', DATEFROMPARTS(CAST(RIGHT(y."name", 4) AS int), 1, 16), y."end_date")
       ) s ("name", "start_date", "end_date")
       WHERE y."start_date" < DATEFROMPARTS(CAST(RIGHT(y."name", 4) AS int), 1, 15)
         AND DATEFROMPARTS(CAST(RIGHT(y."name", 4) AS int), 1, 16) < y."end_date"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The academic_years rows created above are kept: classes refer to them by name.
    await queryRunner.query(`ALTER TABLE "semesters" DROP CONSTRAINT "FK_a2d5014975f0e10189e2dc45820"`);
    await queryRunner.query(`DROP INDEX "IDX_c2e30b01428d1e2b5310d2eafe" ON "semesters"`);
    await queryRunner.query(`DROP TABLE "semesters"`);
  }
}
