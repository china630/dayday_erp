/**
 * Post-restore integrity: counts key tables. Optionally compare to a baseline JSON
 * (from a known-good snapshot) — exit 1 on mismatch.
 *
 * Set DATABASE_URL to the restored database (e.g. temporary Postgres after DR drill).
 *
 *   npx tsx scripts/dr-drill-validate.ts
 *   npx tsx scripts/dr-drill-validate.ts --baseline=./backups/dr-baseline.example.json
 */
import * as fs from "node:fs";
import { createPrismaClient, closePrismaPool } from "../packages/database/prisma/prisma-client";

type Baseline = Record<string, number>;

const TABLES = [
  "users",
  "organizations",
  "accounts",
  "journal_entries",
  "transactions",
  "products",
  "stock_items",
  "counterparties",
] as const;

async function countRaw(
  prisma: ReturnType<typeof createPrismaClient>,
  table: string,
): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<[{ n: bigint }]>(
    `SELECT COUNT(*)::bigint AS n FROM "${table}"`,
  );
  return Number(rows[0]?.n ?? 0);
}

function parseBaselinePath(): string | null {
  const a = process.argv.find((x) => x.startsWith("--baseline="));
  if (!a) return null;
  return a.slice("--baseline=".length).trim();
}

async function main() {
  const prisma = createPrismaClient();
  const baselinePath = parseBaselinePath();
  let baseline: Baseline | null = null;
  if (baselinePath) {
    baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8")) as Baseline;
  }

  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    counts[t] = await countRaw(prisma, t);
    console.log(`[dr-drill-validate] ${t}: ${counts[t]}`);
  }

  let failed = false;
  if (baseline) {
    for (const t of TABLES) {
      const exp = baseline[t];
      if (exp === undefined) continue;
      if (counts[t] !== exp) {
        console.error(
          `[dr-drill-validate] MISMATCH ${t}: got ${counts[t]}, baseline ${exp}`,
        );
        failed = true;
      }
    }
  } else {
    for (const t of TABLES) {
      if (counts[t] < 0) failed = true;
    }
    if (counts["users"] === 0 || counts["organizations"] === 0) {
      console.error("[dr-drill-validate] users or organizations count is zero — suspicious for restore.");
      failed = true;
    }
  }

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log("[dr-drill-validate] OK");
  }

  await prisma.$disconnect();
  await closePrismaPool();
}

main().catch(async (e) => {
  console.error(e);
  await closePrismaPool();
  process.exit(1);
});
