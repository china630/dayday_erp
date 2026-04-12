/**
 * Полный слепок справочных таблиц для прода: INSERT ... ON CONFLICT (идемпотентно).
 *
 * Таблицы: translation_overrides (с фильтром односегментных ключей), system_config,
 * pricing_modules, pricing, pricing_bundles.
 *
 * Пользователей (users) в дамп по умолчанию НЕ включаем — иначе при каждом экспорте в репозиторий
 * попадает password_hash из локальной БД и ломается предсказуемый сид. Супер-админа держите
 * вручную в 01-seed-data.sql или подставляйте хеш: npm run docker-init:super-admin-hash.
 * Принудительно выгрузить users из БД (осознанно): DOCKER_INIT_EXPORT_USERS=1
 *
 * Из корня монорепо (пишет packages/database/prisma/docker-init/01-seed-data.sql по умолчанию):
 *   npm run db:dump-to-prod
 *   dotenv -e .env -- npm run docker-init:export -w @dayday/database
 *
 * Только в stdout (без записи файла):
 *   DOCKER_INIT_OUT=- dotenv -e .env -- npm run docker-init:export -w @dayday/database
 *
 * Явный путь:
 *   DOCKER_INIT_OUT=prisma/docker-init/custom.sql dotenv -e .env -- npm run docker-init:export -w @dayday/database
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Синхронно с apps/web/lib/i18n/apply-db-overrides.ts — единственные допустимые
 * односегментные ключи в translation_overrides; остальные без точки — ошибочные «ветки».
 */
const ALLOWED_SINGLE_SEGMENT_OVERRIDE_KEYS = new Set([
  "appTitle",
  "language",
  "az",
  "ru",
]);

function isAllowedTranslationOverrideKey(key: string): boolean {
  if (key.includes(".")) return true;
  return ALLOWED_SINGLE_SEGMENT_OVERRIDE_KEYS.has(key);
}

function escLiteral(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function jsonb(v: unknown): string {
  return `'${escLiteral(JSON.stringify(v))}'::jsonb`;
}

function ts(d: Date): string {
  return d.toISOString();
}

function sqlNullableString(v: string | null | undefined): string {
  if (v == null) return "NULL";
  return `'${escLiteral(v)}'`;
}

async function buildSql(): Promise<string> {
  const parts: string[] = [];
  parts.push(`-- DayDay ERP: экспорт справочных данных (export-seed-data.ts), Postgres 16
-- Порядок: translation_overrides, system_config, pricing_modules, pricing, pricing_bundles.
-- users не экспортируются (см. комментарий в export-seed-data.ts), кроме DOCKER_INIT_EXPORT_USERS=1.
-- Односегментные ключи i18n вне белого списка не попадают в дамп.
--
-- План счетов: шаблон seeds/chart-of-accounts-az.json; TaxConfig в схеме нет.
--
BEGIN;
`);

  parts.push(`\n-- translation_overrides (полный словарь минус опасные односегментные ключи)\n`);
  const trAll = await prisma.translationOverride.findMany({
    orderBy: [{ locale: "asc" }, { key: "asc" }],
  });
  const skippedParentKeys: string[] = [];
  const tr = trAll.filter((r) => {
    if (isAllowedTranslationOverrideKey(r.key)) return true;
    skippedParentKeys.push(`${r.locale}:${r.key}`);
    return false;
  });
  if (skippedParentKeys.length > 0) {
    process.stderr.write(
      `[export-seed-data] Пропущено ${skippedParentKeys.length} строк translation_overrides (односегментные ключи вне белого списка appTitle|language|az|ru). Примеры: ${skippedParentKeys.slice(0, 8).join("; ")}${skippedParentKeys.length > 8 ? " …" : ""}\n`,
    );
  }
  if (tr.length > 0) {
    parts.push(
      `INSERT INTO "translation_overrides" ("id", "locale", "key", "value", "updated_at")\nVALUES\n`,
    );
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
    parts.push(`-- (нет строк в БД после фильтрации)\n`);
  }

  parts.push(`\n-- system_config (кэш i18n, квоты, billing, ЦБА и др.)\n`);
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
  } else {
    parts.push(`-- (нет строк в БД)\n`);
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
  } else {
    parts.push(`-- (нет строк в БД)\n`);
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

  const exportUsers = process.env.DOCKER_INIT_EXPORT_USERS === "1";
  if (exportUsers) {
    process.stderr.write(
      "[export-seed-data] DOCKER_INIT_EXPORT_USERS=1: в дамп попадёт password_hash из БД — проверьте файл перед коммитом.\n",
    );
    parts.push(`\n-- users (is_super_admin; из БД — только при DOCKER_INIT_EXPORT_USERS=1)\n`);
    const superAdmins = await prisma.user.findMany({
      where: { isSuperAdmin: true },
      orderBy: { email: "asc" },
    });
    if (superAdmins.length > 0) {
      parts.push(`INSERT INTO "users" (
  "id",
  "email",
  "password_hash",
  "first_name",
  "last_name",
  "full_name",
  "avatar_url",
  "is_super_admin",
  "created_at",
  "updated_at"
)
VALUES\n`);
      parts.push(
        superAdmins
          .map(
            (r) =>
              `  ('${r.id}'::uuid, '${escLiteral(r.email)}', '${escLiteral(r.passwordHash)}', ${sqlNullableString(r.firstName)}, ${sqlNullableString(r.lastName)}, ${sqlNullableString(r.fullName)}, ${sqlNullableString(r.avatarUrl)}, TRUE, '${ts(r.createdAt)}'::timestamptz, '${ts(r.updatedAt)}'::timestamptz)`,
          )
          .join(",\n"),
      );
      parts.push(`
ON CONFLICT ("email") DO UPDATE SET
  "password_hash" = EXCLUDED."password_hash",
  "first_name" = EXCLUDED."first_name",
  "last_name" = EXCLUDED."last_name",
  "full_name" = EXCLUDED."full_name",
  "avatar_url" = EXCLUDED."avatar_url",
  "is_super_admin" = EXCLUDED."is_super_admin",
  "updated_at" = EXCLUDED."updated_at";
`);
    } else {
      parts.push(`-- (нет пользователей с is_super_admin)\n`);
    }
  } else {
    parts.push(
      `\n-- users: не выгружаются (фиксированный сид — prisma/docker-init/02-super-admin-seed.sql)\n`,
    );
  }

  parts.push(`
COMMIT;
`);
  return parts.join("");
}

function resolveOutputPath(): string | null {
  const explicit = process.env.DOCKER_INIT_OUT;
  if (explicit === undefined) {
    return resolve(process.cwd(), "prisma/docker-init/01-seed-data.sql");
  }
  const t = explicit.trim();
  if (t === "" || t === "-") return null;
  return resolve(process.cwd(), t);
}

async function main(): Promise<void> {
  const sql = await buildSql();
  const out = resolveOutputPath();
  if (out) {
    writeFileSync(out, sql, "utf8");
    process.stdout.write(`Wrote ${out}\n`);
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
