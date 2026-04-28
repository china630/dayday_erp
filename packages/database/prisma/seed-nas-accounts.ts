/**
 * Заполняет глобальный справочник NAS (`template_accounts`) из канонических данных (JSON или встроенный план).
 * Запуск: `npm run db:seed:nas-templates --workspace=@dayday/database`
 */
import { closePrismaPool, createPrismaClient } from "./prisma-client";
import { upsertGlobalNasTemplateAccounts } from "./chart-seed";

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    const n = await upsertGlobalNasTemplateAccounts(prisma);
    console.info(`[seed-nas-accounts] upserted ${n} template_accounts row(s)`);
  } finally {
    await prisma.$disconnect();
    await closePrismaPool();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
