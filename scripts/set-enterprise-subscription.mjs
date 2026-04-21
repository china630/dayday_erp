/**
 * One-off: set OrganizationSubscription to ENTERPRISE for a user email.
 * Usage: npx dotenv-cli -e .env -- node ./scripts/set-enterprise-subscription.mjs shirinov.chingiz@gmail.com
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@dayday/database");
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/set-enterprise-subscription.mjs <email>");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const pool = new Pool({ connectionString: url });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
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
  await pool.end();
}
