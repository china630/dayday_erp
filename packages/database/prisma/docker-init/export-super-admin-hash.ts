/**
 * Печатает password_hash пользователя для подстановки в 02-super-admin-seed.sql.
 *
 * Из корня: dotenv -e .env -- npm run docker-init:super-admin-hash -w @dayday/database
 *
 * Переменная SUPER_ADMIN_EMAIL (по умолчанию shirinov.chingiz@gmail.com).
 */
import { closePrismaPool, createPrismaClient } from "../prisma-client";

const email =
  process.env.SUPER_ADMIN_EMAIL?.trim() || "shirinov.chingiz@gmail.com";

const prisma = createPrismaClient();

async function main(): Promise<void> {
  const row = await prisma.user.findUnique({
    where: { email },
    select: { passwordHash: true },
  });
  if (!row?.passwordHash) {
    process.stderr.write(
      `No user with email ${email} — register once locally, then re-run.\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(row.passwordHash + "\n");
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
