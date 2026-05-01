/**
 * Аудит таблицы translation_overrides: находит записи, которые клиентский
 * `apply-db-overrides.ts` отбрасывает или которые ломают дерево i18n (родительские ключи-строки).
 *
 * Важно: оверрайды хранятся **по locale**; плоская карта для пайплайна строится **отдельно на ru и az**,
 * иначе одинаковый `key` у двух локалей затирается и отчёт врёт.
 *
 * Запуск из корня монорепо:
 *   npx dotenv-cli -e .env -- npm run db:audit-i18n-overrides -w @dayday/database
 * Исправление (удаление проблемных строк + bump кэша i18n):
 *   npx dotenv-cli -e .env -- npm run db:audit-i18n-overrides:fix -w @dayday/database
 */
import { closePrismaPool, createPrismaClient } from "./prisma-client";
import {
  effectiveTranslationOverrideLookupKey,
  processTranslationOverridesFlat,
} from "../../../apps/web/lib/i18n/apply-db-overrides";

const prisma = createPrismaClient();

const I18N_CACHE_KEY = "i18n.cacheVersion";

type Row = { id: string; locale: string; key: string; value: string };

function auditLocale(
  locale: string,
  rows: Row[],
): { kept: number; droppedKeys: string[]; nkToRows: Map<string, Row[]>; invalidKeyRows: Row[] } {
  const flatRaw: Record<string, string> = {};
  for (const r of rows) {
    flatRaw[r.key] = r.value;
  }
  const afterPipeline = processTranslationOverridesFlat(flatRaw);
  const kept = new Set(Object.keys(afterPipeline));

  /** Эффективный ключ (нормализация + ремап ОПФ), совпадает с ключами после `processTranslationOverridesFlat`. */
  const nkToRows = new Map<string, Row[]>();
  for (const r of rows) {
    const lk = effectiveTranslationOverrideLookupKey(r.key);
    if (!lk) continue;
    const list = nkToRows.get(lk) ?? [];
    list.push(r);
    nkToRows.set(lk, list);
  }

  const droppedByPipeline: string[] = [];
  for (const lk of nkToRows.keys()) {
    if (!kept.has(lk)) droppedByPipeline.push(lk);
  }

  const invalidKeyRows = rows.filter((r) => effectiveTranslationOverrideLookupKey(r.key) == null);

  process.stdout.write(
    `  locale=${locale}: rows=${rows.length}, pipeline output keys=${kept.size}, dropped normalized keys=${droppedByPipeline.length}, invalid raw keys=${invalidKeyRows.length}\n`,
  );

  return {
    kept: kept.size,
    droppedKeys: droppedByPipeline,
    nkToRows,
    invalidKeyRows,
  };
}

async function main() {
  const fix = process.argv.includes("--fix");
  const rows = await prisma.translationOverride.findMany({
    orderBy: [{ locale: "asc" }, { key: "asc" }],
  });

  const byLocale = new Map<string, Row[]>();
  for (const r of rows) {
    const loc = r.locale.trim().toLowerCase();
    const list = byLocale.get(loc) ?? [];
    list.push(r);
    byLocale.set(loc, list);
  }

  process.stdout.write(`translation_overrides: total rows=${rows.length}\n`);

  const rowsToDelete = new Map<string, Row>();
  const allDropped: { locale: string; key: string }[] = [];

  for (const locale of [...byLocale.keys()].sort()) {
    const list = byLocale.get(locale) ?? [];
    const { droppedKeys, nkToRows, invalidKeyRows } = auditLocale(locale, list);

    for (const nk of droppedKeys) {
      allDropped.push({ locale, key: nk });
      for (const r of nkToRows.get(nk) ?? []) {
        rowsToDelete.set(r.id, r);
      }
    }
    for (const r of invalidKeyRows) {
      rowsToDelete.set(r.id, r);
    }
  }

  if (allDropped.length > 0) {
    process.stdout.write("\n--- Dropped normalized keys (sample) ---\n");
    for (const { locale, key } of allDropped.slice(0, 150)) {
      process.stdout.write(`  [${locale}] ${key}\n`);
    }
    if (allDropped.length > 150) {
      process.stdout.write(`  … and ${allDropped.length - 150} more\n`);
    }
  }

  if (!fix) {
    process.stdout.write(
      `\nDry-run. To delete ${rowsToDelete.size} bad row(s) and bump i18n cache, run with --fix\n`,
    );
    return;
  }

  const ids = [...rowsToDelete.keys()];
  let deleted = 0;
  const BATCH = 200;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const r = await prisma.translationOverride.deleteMany({
      where: { id: { in: chunk } },
    });
    deleted += r.count;
  }

  const cacheVal = Date.now();
  await prisma.systemConfig.upsert({
    where: { key: I18N_CACHE_KEY },
    create: { key: I18N_CACHE_KEY, value: cacheVal },
    update: { value: cacheVal },
  });

  process.stdout.write(
    `\nFixed: deleted ${deleted} row(s), i18n cache version bumped (${I18N_CACHE_KEY}).\n`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await closePrismaPool();
  });
