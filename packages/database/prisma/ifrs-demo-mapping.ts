/**
 * Создаёт IFRS-счета 1200 / 4000 и маппинг: NAS 211→1200, NAS 601→4000.
 * Организация: ORG_ID в env или первая по дате создания.
 *
 * Запуск из корня репозитория:
 *   npx dotenv-cli -e .env -- npm run db:ifrs-demo-map -w @dayday/database
 */
import {
  AccountType,
  LedgerType,
} from "@prisma/client";
import { closePrismaPool, createPrismaClient } from "./prisma-client";

const prisma = createPrismaClient();

async function main() {
  const orgIdEnv = process.env.ORG_ID?.trim();
  const org = orgIdEnv
    ? await prisma.organization.findUnique({ where: { id: orgIdEnv } })
    : await prisma.organization.findFirst({
        orderBy: { createdAt: "asc" },
      });

  if (!org) {
    throw new Error(
      orgIdEnv
        ? `Организация ORG_ID=${orgIdEnv} не найдена`
        : "В БД нет ни одной организации",
    );
  }

  console.info(`[ifrs-demo-map] organization: ${org.name} (${org.id})`);

  const nas211 = await prisma.account.findFirst({
    where: {
      organizationId: org.id,
      ledgerType: LedgerType.NAS,
      code: "211",
    },
  });
  const nas601 = await prisma.account.findFirst({
    where: {
      organizationId: org.id,
      ledgerType: LedgerType.NAS,
      code: "601",
    },
  });

  if (!nas211 || !nas601) {
    throw new Error(
      "Не найдены NAS-счета 211 и/или 601. Сначала зарегистрируйте организацию / синхронизируйте план счетов.",
    );
  }

  let ifrs1200 = await prisma.account.findFirst({
    where: {
      organizationId: org.id,
      ledgerType: LedgerType.IFRS,
      code: "1200",
    },
  });
  if (!ifrs1200) {
    ifrs1200 = await prisma.account.create({
      data: {
        organizationId: org.id,
        code: "1200",
        nameAz: "Debitor borcu (IFRS)",
        nameRu: "Дебиторская задолженность (IFRS)",
        nameEn: "Trade receivables (IFRS)",
        type: AccountType.ASSET,
        ledgerType: LedgerType.IFRS,
      },
    });
    console.info("[ifrs-demo-map] created IFRS account 1200");
  } else {
    console.info("[ifrs-demo-map] IFRS 1200 already exists");
  }

  let ifrs4000 = await prisma.account.findFirst({
    where: {
      organizationId: org.id,
      ledgerType: LedgerType.IFRS,
      code: "4000",
    },
  });
  if (!ifrs4000) {
    ifrs4000 = await prisma.account.create({
      data: {
        organizationId: org.id,
        code: "4000",
        nameAz: "Gəlir (IFRS)",
        nameRu: "Выручка (IFRS Revenue)",
        nameEn: "Revenue (IFRS)",
        type: AccountType.REVENUE,
        ledgerType: LedgerType.IFRS,
      },
    });
    console.info("[ifrs-demo-map] created IFRS account 4000");
  } else {
    console.info("[ifrs-demo-map] IFRS 4000 already exists");
  }

  await prisma.accountMapping.upsert({
    where: {
      organizationId_nasAccountId: {
        organizationId: org.id,
        nasAccountId: nas211.id,
      },
    },
    create: {
      organizationId: org.id,
      nasAccountId: nas211.id,
      ifrsAccountId: ifrs1200.id,
      ratio: 1,
    },
    update: { ifrsAccountId: ifrs1200.id, ratio: 1 },
  });
  console.info("[ifrs-demo-map] mapping NAS 211 → IFRS 1200 OK");

  await prisma.accountMapping.upsert({
    where: {
      organizationId_nasAccountId: {
        organizationId: org.id,
        nasAccountId: nas601.id,
      },
    },
    create: {
      organizationId: org.id,
      nasAccountId: nas601.id,
      ifrsAccountId: ifrs4000.id,
      ratio: 1,
    },
    update: { ifrsAccountId: ifrs4000.id, ratio: 1 },
  });
  console.info("[ifrs-demo-map] mapping NAS 601 → IFRS 4000 OK");
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
