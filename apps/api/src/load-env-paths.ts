import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * После сборки `__dirname` = `apps/api/dist`.
 * Сначала корень монорепо, затем `apps/api/.env` — локальный файл перекрывает общий.
 */
export function apiEnvFilePaths(): string[] {
  const apiRoot = join(__dirname, "..");
  const monorepoRoot = join(__dirname, "..", "..", "..");
  const paths = [join(monorepoRoot, ".env"), join(apiRoot, ".env")];
  return paths.filter((p) => existsSync(p));
}
