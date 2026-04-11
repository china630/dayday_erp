-- Org structure + staffing: departments, job_positions; Employee.position -> positionId

CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" UUID,
    "manager_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "departments_organization_id_idx" ON "departments"("organization_id");
CREATE INDEX "departments_parent_id_idx" ON "departments"("parent_id");

ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "departments" ADD CONSTRAINT "departments_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "job_positions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "department_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "total_slots" INTEGER NOT NULL,
    "salary" DECIMAL(19,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_positions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "job_positions_department_id_idx" ON "job_positions"("department_id");

ALTER TABLE "job_positions" ADD CONSTRAINT "job_positions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employees" ADD COLUMN "position_id" UUID;

INSERT INTO "departments" ("id", "organization_id", "name", "parent_id", "manager_id", "created_at", "updated_at")
SELECT uuid_generate_v4(), o."id", 'HQ', NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations" o;

INSERT INTO "job_positions" ("id", "department_id", "name", "total_slots", "salary", "created_at", "updated_at")
SELECT uuid_generate_v4(), d."id", 'Generalist', 10000, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "departments" d
WHERE d."name" = 'HQ' AND d."parent_id" IS NULL;

UPDATE "employees" e
SET "position_id" = jp."id"
FROM "job_positions" jp
INNER JOIN "departments" d ON d."id" = jp."department_id"
WHERE e."organization_id" = d."organization_id"
  AND d."name" = 'HQ'
  AND jp."name" = 'Generalist';

ALTER TABLE "employees" ALTER COLUMN "position_id" SET NOT NULL;

ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "job_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "employees_position_id_idx" ON "employees"("position_id");

ALTER TABLE "employees" DROP COLUMN "position";
