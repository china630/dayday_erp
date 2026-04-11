import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = join(root, ".next");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!existsSync(nextDir)) {
    process.stdout.write("apps/web/.next not present (nothing to remove)\n");
    return;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(1000);
    try {
      await rm(nextDir, { recursive: true, force: true });
      process.stdout.write("Removed apps/web/.next\n");
      return;
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? e.code : "";
      const retry = code === "EPERM" || code === "EBUSY" || code === "ENOTEMPTY";
      if (retry && attempt === 0) continue;
      process.stderr.write(
        "\nCould not delete apps/web/.next (files locked).\n" +
          "Stop every `next dev` for this project, then run again:\n" +
          "  npm run dev:web:clean\n" +
          "(Antivirus can also lock .next — add an exclusion if needed.)\n\n",
      );
      process.stderr.write(String(e && e.message ? e.message : e) + "\n");
      process.exit(1);
    }
  }
}

await main();
