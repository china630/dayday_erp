/**
 * Пересобирает NAS-счета (`accounts`, ledger NAS) для всех организаций пользователя
 * из актуального `template_accounts` / legacy каталога — как при онбординге
 * (`provisionNasAccountsForOrganization`).
 *
 * Корень репо (с DATABASE_URL в .env):
 *   npx dotenv-cli -e .env -- npx tsx packages/database/prisma/resync-nas-for-user-email.ts shirinov.chingiz@gmail.com
 */
import type { CoaTemplateProfile } from "@prisma/client";
import { provisionNasAccountsForOrganization } from "./chart-seed";
import { closePrismaPool, createPrismaClient } from "./prisma-client";

const prisma = createPrismaClient();

function normEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

async function main() {
  const arg = process.argv[2] ?? process.env.TARGET_USER_EMAIL;
  if (!arg) {
    process.stderr.write(
      "Usage: npx tsx packages/database/prisma/resync-nas-for-user-email.ts <email>\n",
    );
    process.exit(1);
  }
  const email = normEmail(arg);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) {
    process.stderr.write(`User not found: ${email}\n`);
    process.exit(1);
  }

  const owned = await prisma.organization.findMany({
    where: { ownerId: user.id },
    select: { id: true, name: true, coaTemplateProfile: true },
  });

  const memberships = await prisma.organizationMembership.findMany({
    where: { userId: user.id },
    select: {
      organization: {
        select: { id: true, name: true, coaTemplateProfile: true },
      },
    },
  });

  const byId = new Map<
    string,
    { id: string; name: string; coaTemplateProfile: CoaTemplateProfile }
  >();
  for (const o of owned) {
    byId.set(o.id, {
      id: o.id,
      name: o.name,
      coaTemplateProfile: o.coaTemplateProfile,
    });
  }
  for (const m of memberships) {
    const o = m.organization;
    if (!byId.has(o.id)) {
      byId.set(o.id, {
        id: o.id,
        name: o.name,
        coaTemplateProfile: o.coaTemplateProfile,
      });
    }
  }

  const orgs = [...byId.values()];
  if (orgs.length === 0) {
    process.stdout.write(`No organizations for user ${user.email}\n`);
    return;
  }

  process.stdout.write(
    `User ${user.email}: ${orgs.length} org(s) — re-provisioning NAS from template…\n`,
  );

  for (const o of orgs) {
    process.stdout.write(
      `  • ${o.name} (${o.id}) profile=${o.coaTemplateProfile} … `,
    );
    await provisionNasAccountsForOrganization(prisma, o.id, o.coaTemplateProfile);
    process.stdout.write("ok\n");
  }

  process.stdout.write("Done.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await closePrismaPool();
  });
