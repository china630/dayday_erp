import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const kind = process.argv[2];
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

if (process.platform !== "win32") {
  process.stdout.write(
    "stop:dev is automated only on Windows. On Linux/macOS stop the node processes manually (or use pkill -f).\n",
  );
  process.exit(0);
}

const scriptName = kind === "api" ? "stop-api.ps1" : "stop-next.ps1";
const script = join(root, "scripts", scriptName);
const r = spawnSync(
  "powershell.exe",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
  { stdio: "inherit", cwd: root },
);
process.exit(r.status ?? 1);
