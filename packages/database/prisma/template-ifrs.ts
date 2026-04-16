import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type TemplateIfrsMappingOverride = {
  nasCode: string;
  ifrsCode: string;
  ratio?: string;
  description?: string;
};

export type TemplateIfrsMappingPackageV1 = {
  templateKey: "ifrsMapping.az" | string;
  version: number;
  defaultRule: { type: "IDENTITY"; ratio?: string };
  overrides: TemplateIfrsMappingOverride[];
  meta?: Record<string, unknown>;
};

export function templateIfrsMappingAzV1Path(): string {
  return join(__dirname, "..", "seeds", "template-ifrs-mapping-az.v1.json");
}

export async function loadTemplateIfrsMappingPackage(): Promise<TemplateIfrsMappingPackageV1> {
  const path = templateIfrsMappingAzV1Path();
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw) as TemplateIfrsMappingPackageV1;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("template-ifrs-mapping: invalid JSON");
  }
  if (!parsed.templateKey || typeof parsed.templateKey !== "string") {
    throw new Error("template-ifrs-mapping: templateKey missing");
  }
  if (typeof parsed.version !== "number" || !Number.isFinite(parsed.version)) {
    throw new Error("template-ifrs-mapping: version must be a number");
  }
  if (!parsed.defaultRule || parsed.defaultRule.type !== "IDENTITY") {
    throw new Error('template-ifrs-mapping: defaultRule.type must be "IDENTITY"');
  }
  if (!Array.isArray(parsed.overrides)) {
    throw new Error("template-ifrs-mapping: overrides must be an array");
  }
  return parsed;
}

