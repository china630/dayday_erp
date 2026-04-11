import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, "../packages/database/package.json"));
const { PrismaClient } = require("@prisma/client");

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/set-super-admin.mjs <email>");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u) {
    console.error("User not found:", email);
    process.exit(1);
  }
  const r = await prisma.user.update({
    where: { email },
    data: { isSuperAdmin: true },
  });
  console.log("OK", r.email, "isSuperAdmin=", r.isSuperAdmin);
} finally {
  await prisma.$disconnect();
}
