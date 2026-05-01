/**
 * Загрузка всех строк из apps/web/lib/i18n/resources.ts в translation_overrides (locale: ru | az).
 * Заполняет отсутствующие ключи и обновляет значения до актуальных из кода.
 * После синхронизации обновляет system_config i18n.cacheVersion.
 *
 * Опции:
 *   --prune  Удалить из translation_overrides строки ru/az, чьих ключей больше нет в resources.ts
 *            (устаревшие переименования; не трогает другие locale, например en).
 *   Или переменная окружения: I18N_SYNC_PRUNE=1
 *
 * Запуск из корня репозитория:
 *   dotenv -e .env -- npm run db:sync-i18n
 *   dotenv -e .env -- npm run db:sync-i18n:prune
 * или из packages/database:
 *   dotenv -e ../../.env -- npx tsx prisma/sync-translation-overrides-from-resources.ts
 *   dotenv -e ../../.env -- npx tsx prisma/sync-translation-overrides-from-resources.ts --prune
 */
import { closePrismaPool, createPrismaClient } from "./prisma-client";
import { resources } from "../../../apps/web/lib/i18n/resources";

const prisma = createPrismaClient();

const I18N_CACHE_KEY = "i18n.cacheVersion";

const pruneRequested =
  process.argv.includes("--prune") ||
  process.env.I18N_SYNC_PRUNE === "1" ||
  process.env.I18N_SYNC_PRUNE === "true";

function flattenStrings(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenStrings(v as Record<string, unknown>, key));
    } else if (typeof v === "string") {
      out[key] = v;
    }
  }
  return out;
}

const BATCH = 100;
const PRUNE_BATCH = 500;

async function upsertLocale(
  locale: string,
  flat: Record<string, string>,
): Promise<number> {
  const entries = Object.entries(flat);
  let n = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    await prisma.$transaction(
      chunk.map(([key, value]) =>
        prisma.translationOverride.upsert({
          where: { locale_key: { locale, key } },
          create: { locale, key, value },
          update: { value },
        }),
      ),
    );
    n += chunk.length;
  }
  return n;
}

async function pruneLocale(locale: string, validKeys: Set<string>): Promise<number> {
  const rows = await prisma.translationOverride.findMany({
    where: { locale },
    select: { id: true, key: true },
  });
  const staleIds = rows.filter((r) => !validKeys.has(r.key)).map((r) => r.id);
  let deleted = 0;
  for (let i = 0; i < staleIds.length; i += PRUNE_BATCH) {
    const chunk = staleIds.slice(i, i + PRUNE_BATCH);
    if (chunk.length === 0) continue;
    const r = await prisma.translationOverride.deleteMany({
      where: { id: { in: chunk } },
    });
    deleted += r.count;
  }
  return deleted;
}

async function main() {
  const ru = flattenStrings(
    (resources.ru as { translation: Record<string, unknown> }).translation,
  );
  const az = flattenStrings(
    (resources.az as { translation: Record<string, unknown> }).translation,
  );

  const ruN = await upsertLocale("ru", ru);
  const azN = await upsertLocale("az", az);

  let ruPruned = 0;
  let azPruned = 0;
  if (pruneRequested) {
    ruPruned = await pruneLocale("ru", new Set(Object.keys(ru)));
    azPruned = await pruneLocale("az", new Set(Object.keys(az)));
  }

  const cacheVal = Date.now();
  await prisma.systemConfig.upsert({
    where: { key: I18N_CACHE_KEY },
    create: { key: I18N_CACHE_KEY, value: cacheVal },
    update: { value: cacheVal },
  });

  const pruneNote = pruneRequested
    ? ` pruned stale ru=${ruPruned}, az=${azPruned}`
    : " (no --prune: stale ru/az keys not removed; use npm run db:sync-i18n:prune or db:deploy)";
  process.stdout.write(
    `translation_overrides: upserted ru=${ruN} keys, az=${azN} keys.${pruneNote} i18n cache version bumped.\n`,
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
