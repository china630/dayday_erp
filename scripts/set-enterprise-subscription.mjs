/**
 * One-off: set OrganizationSubscription to ENTERPRISE for a user email.
 * Usage: npx dotenv-cli -e .env -- node ./scripts/set-enterprise-subscription.mjs shirinov.chingiz@gmail.com
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@dayday/database");

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/set-enterprise-subscription.mjs <email>");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error("User not found:", email);
    process.exit(1);
  }
  const sub = await prisma.organizationSubscription.update({
    where: { organizationId: user.organizationId },
    data: {
      tier: "ENTERPRISE",
      isTrial: false,
      expiresAt: null,
    },
  });
  console.log(
    JSON.stringify(
      {
        email,
        organizationId: user.organizationId,
        tier: sub.tier,
        isTrial: sub.isTrial,
        expiresAt: sub.expiresAt,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
