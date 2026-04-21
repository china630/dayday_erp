import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, "../packages/database/package.json"));
const { PrismaClient } = require("@prisma/client");
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/set-super-admin.mjs <email>");
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
  await pool.end();
}
