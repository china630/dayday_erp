import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env");
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";
const npx = isWin ? "npx.cmd" : "npx";

const args = ["run", "dev", "-w", "@dayday/web"];

if (existsSync(envFile)) {
  const r = spawnSync(npx, ["dotenv", "-e", ".env", "--", npm, ...args], {
    stdio: "inherit",
    cwd: root,
    shell: isWin,
  });
  process.exit(r.status ?? 1);
}

process.stderr.write(
  "No root .env — starting web without dotenv (copy .env.example to .env for API URL and JWT).\n",
);
const r = spawnSync(npm, args, { stdio: "inherit", cwd: root, shell: isWin });
process.exit(r.status ?? 1);
