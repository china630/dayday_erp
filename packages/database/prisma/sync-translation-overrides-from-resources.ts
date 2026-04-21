/**
 * Загрузка всех строк из apps/web/lib/i18n/resources.ts в translation_overrides (locale: ru | az).
 * Заполняет отсутствующие ключи и обновляет значения до актуальных из кода.
 * После синхронизации обновляет system_config i18n.cacheVersion.
 *
 * Запуск из корня репозитория:
 *   dotenv -e .env -- npm run db:sync-i18n
 * или из packages/database:
 *   dotenv -e ../../.env -- npx tsx prisma/sync-translation-overrides-from-resources.ts
 */
import { closePrismaPool, createPrismaClient } from "./prisma-client";
import { resources } from "../../../apps/web/lib/i18n/resources";

const prisma = createPrismaClient();

const I18N_CACHE_KEY = "i18n.cacheVersion";

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

async function main() {
  const ru = flattenStrings(
    (resources.ru as { translation: Record<string, unknown> }).translation,
  );
  const az = flattenStrings(
    (resources.az as { translation: Record<string, unknown> }).translation,
  );

  const ruN = await upsertLocale("ru", ru);
  const azN = await upsertLocale("az", az);

  await prisma.systemConfig.upsert({
    where: { key: I18N_CACHE_KEY },
    create: { key: I18N_CACHE_KEY, value: Date.now() },
    update: { value: Date.now() },
  });

  process.stdout.write(
    `translation_overrides: upserted ru=${ruN} keys, az=${azN} keys. i18n cache version bumped.\n`,
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
