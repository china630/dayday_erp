-- Вилка ЗП по штатке: min_salary / max_salary вместо одного salary

ALTER TABLE "job_positions" ADD COLUMN "min_salary" DECIMAL(19,4);
ALTER TABLE "job_positions" ADD COLUMN "max_salary" DECIMAL(19,4);

UPDATE "job_positions" SET "min_salary" = "salary", "max_salary" = "salary";

ALTER TABLE "job_positions" ALTER COLUMN "min_salary" SET NOT NULL;
ALTER TABLE "job_positions" ALTER COLUMN "max_salary" SET NOT NULL;

ALTER TABLE "job_positions" DROP COLUMN "salary";
