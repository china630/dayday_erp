/**
 * Печатает password_hash пользователя для подстановки в 01-seed-data.sql.
 *
 * Из корня: dotenv -e .env -- npm run docker-init:super-admin-hash -w @dayday/database
 *
 * Переменная SUPER_ADMIN_EMAIL (по умолчанию shirinov.chingiz@gmail.com).
 */
import { PrismaClient } from "@prisma/client";

const email =
  process.env.SUPER_ADMIN_EMAIL?.trim() || "shirinov.chingiz@gmail.com";

const prisma = new PrismaClient();

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
  });
