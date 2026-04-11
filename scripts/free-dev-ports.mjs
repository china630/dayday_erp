/**
 * Освобождает порты dev-стека перед стартом (устраняет EADDRINUSE после «зависших» Node).
 * По умолчанию: 3000 (Next) и 4000 (Nest).
 */
import { createRequire } from "node:module";

const killPort = createRequire(import.meta.url)("kill-port");

const arg = process.argv[2];
const ports =
  arg === "--web-only" ? [3000] : arg === "--api-only" ? [4000] : [3000, 4000];

for (const p of ports) {
  try {
    await killPort(p);
    process.stdout.write(`Freed port ${p}\n`);
  } catch {
    // порт уже свободен или процесс не найден
  }
}
