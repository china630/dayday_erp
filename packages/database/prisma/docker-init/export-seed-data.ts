/**
 * Экспорт справочных таблиц в SQL (INSERT ... ON CONFLICT) для обновления 01-seed-data.sql
 * с машины, где уже есть наполненная локальная БД.
 *
 * Из корня монорепо:
 *   dotenv -e .env -- npm run docker-init:export -w @dayday/database
 *
 * Перезапись 01-seed-data.sql (скрипт запускается с cwd = packages/database):
 *   DOCKER_INIT_OUT=prisma/docker-init/01-seed-data.sql dotenv -e ../../.env -- npm run docker-init:export -w @dayday/database
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function escLiteral(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function jsonb(v: unknown): string {
  return `'${escLiteral(JSON.stringify(v))}'::jsonb`;
}

function ts(d: Date): string {
  return d.toISOString();
}

async function buildSql(): Promise<string> {
  const parts: string[] = [];
  parts.push(`-- DayDay ERP: экспорт справочных данных (export-seed-data.ts), Postgres 16
-- План счетов: шаблон в seeds/chart-of-accounts-az.json (на организацию в коде).
-- Отдельной таблицы TaxConfig в схеме нет.

BEGIN;
`);

  parts.push(`\n-- translation_overrides\n`);
  const tr = await prisma.translationOverride.findMany({
    orderBy: [{ locale: "asc" }, { key: "asc" }],
  });
  if (tr.length > 0) {
    parts.push(`INSERT INTO "translation_overrides" ("id", "locale", "key", "value", "updated_at")\nVALUES\n`);
    parts.push(
      tr
        .map(
          (r) =>
            `  ('${r.id}'::uuid, '${escLiteral(r.locale)}', '${escLiteral(r.key)}', '${escLiteral(r.value)}', '${ts(r.updatedAt)}'::timestamptz)`,
        )
        .join(",\n"),
    );
    parts.push(`
ON CONFLICT ("locale", "key") DO UPDATE SET
  "value" = EXCLUDED."value",
  "updated_at" = EXCLUDED."updated_at";
`);
  } else {
    parts.push(`-- (нет строк в БД)\n`);
  }

  parts.push(`\n-- system_config\n`);
  const sc = await prisma.systemConfig.findMany({ orderBy: { key: "asc" } });
  if (sc.length > 0) {
    parts.push(`INSERT INTO "system_config" ("id", "key", "value", "updated_at")\nVALUES\n`);
    parts.push(
      sc
        .map(
          (r) =>
            `  ('${r.id}'::uuid, '${escLiteral(r.key)}', ${jsonb(r.value)}, '${ts(r.updatedAt)}'::timestamptz)`,
        )
        .join(",\n"),
    );
    parts.push(`
ON CONFLICT ("key") DO UPDATE SET
  "value" = EXCLUDED."value",
  "updated_at" = EXCLUDED."updated_at";
`);
  } else {
    parts.push(`-- (нет строк в БД)\n`);
  }

  parts.push(`\n-- pricing_modules\n`);
  const pm = await prisma.pricingModule.findMany({ orderBy: { sortOrder: "asc" } });
  if (pm.length > 0) {
    parts.push(
      `INSERT INTO "pricing_modules" ("id", "key", "name", "price_per_month", "sort_order", "created_at", "updated_at")\nVALUES\n`,
    );
    parts.push(
      pm
        .map(
          (r) =>
            `  ('${r.id}'::uuid, '${escLiteral(r.key)}', '${escLiteral(r.name)}', ${r.pricePerMonth.toString()}, ${r.sortOrder}, '${ts(r.createdAt)}'::timestamptz, '${ts(r.updatedAt)}'::timestamptz)`,
        )
        .join(",\n"),
    );
    parts.push(`
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "price_per_month" = EXCLUDED."price_per_month",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = EXCLUDED."updated_at";
`);
  }

  parts.push(`\n-- pricing\n`);
  const pr = await prisma.pricing.findMany({ orderBy: { sortOrder: "asc" } });
  if (pr.length > 0) {
    parts.push(
      `INSERT INTO "pricing" ("id", "key", "kind", "name", "amount_azn", "unit_size", "sort_order", "created_at", "updated_at")\nVALUES\n`,
    );
    parts.push(
      pr
        .map((r) => {
          const us = r.unitSize == null ? "NULL" : String(r.unitSize);
          return `  ('${r.id}'::uuid, '${escLiteral(r.key)}', '${r.kind}'::"PricingKind", '${escLiteral(r.name)}', ${r.amountAzn.toString()}, ${us}, ${r.sortOrder}, '${ts(r.createdAt)}'::timestamptz, '${ts(r.updatedAt)}'::timestamptz)`;
        })
        .join(",\n"),
    );
    parts.push(`
ON CONFLICT ("key") DO UPDATE SET
  "kind" = EXCLUDED."kind",
  "name" = EXCLUDED."name",
  "amount_azn" = EXCLUDED."amount_azn",
  "unit_size" = EXCLUDED."unit_size",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = EXCLUDED."updated_at";
`);
  }

  parts.push(`\n-- pricing_bundles\n`);
  const pb = await prisma.pricingBundle.findMany({ orderBy: { name: "asc" } });
  if (pb.length > 0) {
    parts.push(
      `INSERT INTO "pricing_bundles" ("id", "name", "discount_percent", "module_keys", "created_at", "updated_at")\nVALUES\n`,
    );
    parts.push(
      pb
        .map(
          (r) =>
            `  ('${r.id}'::uuid, '${escLiteral(r.name)}', ${r.discountPercent.toString()}, ${jsonb(r.moduleKeys)}, '${ts(r.createdAt)}'::timestamptz, '${ts(r.updatedAt)}'::timestamptz)`,
        )
        .join(",\n"),
    );
    parts.push(`
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "discount_percent" = EXCLUDED."discount_percent",
  "module_keys" = EXCLUDED."module_keys",
  "updated_at" = EXCLUDED."updated_at";
`);
  } else {
    parts.push(`-- (нет строк в БД)\n`);
  }

  parts.push(`
COMMIT;
`);
  return parts.join("");
}

async function main(): Promise<void> {
  const sql = await buildSql();
  const out = process.env.DOCKER_INIT_OUT?.trim();
  if (out) {
    const abs = resolve(process.cwd(), out);
    writeFileSync(abs, sql, "utf8");
    process.stdout.write(`Wrote ${abs}\n`);
  } else {
    process.stdout.write(sql);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
