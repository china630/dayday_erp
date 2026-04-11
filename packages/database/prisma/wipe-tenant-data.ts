/**
 * Удаляет все данные тенантов: организации (каскадом — учёт, склад, HR, подписки, платежи и т.д.),
 * логи аудита, всех пользователей кроме супер-админов.
 *
 * Не трогает: system_config, translation_overrides, cbar_official_rates (справочник курсов ЦБА).
 *
 * Запуск: из корня репозитория
 *   npm run db:wipe-tenant -- --yes
 *
 * После очистки у супер-админа не будет членства в организациях — обычный POST /api/auth/login
 * вернёт «No organization access», пока не будет создана новая организация (регистрация / seed).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (!process.argv.includes("--yes")) {
    console.error(
      "Отказ: это уничтожает бизнес-данные. Добавьте флаг --yes для подтверждения.",
    );
    process.exit(1);
  }

  const admins = await prisma.user.findMany({
    where: { isSuperAdmin: true },
    select: { id: true, email: true },
  });
  if (admins.length === 0) {
    console.error("Прерывание: в users нет записи с is_super_admin=true.");
    process.exit(1);
  }

  console.log(
    "Сохраняем супер-админов:",
    admins.map((a) => a.email).join(", "),
  );

  const [arch, aud, orgs, users] = await prisma.$transaction([
    prisma.auditLogArchive.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.user.deleteMany({ where: { isSuperAdmin: false } }),
  ]);

  console.log("audit_log_archives удалено:", arch.count);
  console.log("audit_logs удалено:", aud.count);
  console.log("organizations удалено:", orgs.count);
  console.log("пользователей (не супер-админ) удалено:", users.count);
  console.log("Готово. system_config, translation_overrides, cbar_official_rates не изменялись.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
