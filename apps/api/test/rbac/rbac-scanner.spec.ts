import "reflect-metadata";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { IS_PUBLIC_KEY } from "../../src/auth/constants";
import { ROLES_KEY } from "../../src/auth/decorators/roles.decorator";

type ControllerClass = new (...args: unknown[]) => unknown;

type CoverageRow = {
  controller: string;
  method: string;
  http: string;
  route: string;
  guardCoverage: string;
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      out.push(...walk(p));
    } else if (entry.endsWith(".controller.ts")) {
      out.push(p);
    }
  }
  return out;
}

function methodName(value: RequestMethod | undefined): string {
  if (value === RequestMethod.POST) return "POST";
  if (value === RequestMethod.PUT) return "PUT";
  if (value === RequestMethod.PATCH) return "PATCH";
  if (value === RequestMethod.DELETE) return "DELETE";
  if (value === RequestMethod.GET) return "GET";
  return "UNKNOWN";
}

function isMutation(value: RequestMethod | undefined): boolean {
  return (
    value === RequestMethod.POST ||
    value === RequestMethod.PUT ||
    value === RequestMethod.PATCH ||
    value === RequestMethod.DELETE
  );
}

describe("RBAC Mutation Auto-Scanner", () => {
  it("ensures non-public mutation endpoints have guard metadata", async () => {
    const srcRoot = join(__dirname, "../../src");
    const files = walk(srcRoot);
    const rows: CoverageRow[] = [];
    const violations: string[] = [];

    for (const file of files) {
      const mod = await import(file);
      for (const v of Object.values(mod)) {
        if (typeof v !== "function") continue;
        const klass = v as ControllerClass;
        const classPath = Reflect.getMetadata(PATH_METADATA, klass);
        if (classPath === undefined) continue;

        const classGuards = Reflect.getMetadata(GUARDS_METADATA, klass);
        const classRoles = Reflect.getMetadata(ROLES_KEY, klass);
        const classIsPublic = Reflect.getMetadata(IS_PUBLIC_KEY, klass) === true;
        const proto = klass.prototype;
        for (const name of Object.getOwnPropertyNames(proto)) {
          if (name === "constructor") continue;
          const handler = proto[name];
          if (typeof handler !== "function") continue;
          const methodMeta = Reflect.getMetadata(
            METHOD_METADATA,
            handler,
          ) as RequestMethod | undefined;
          if (!isMutation(methodMeta)) continue;

          const routePath = Reflect.getMetadata(PATH_METADATA, handler) ?? "";
          const methodGuards = Reflect.getMetadata(GUARDS_METADATA, handler);
          const methodRoles = Reflect.getMetadata(ROLES_KEY, handler);
          const methodIsPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true;
          const isPublic = classIsPublic || methodIsPublic;
          const hasGuardMetadata = Boolean(
            classGuards || classRoles || methodGuards || methodRoles,
          );

          const coverage = isPublic
            ? "public-skip"
            : methodGuards || classGuards
              ? "useGuards"
              : methodRoles || classRoles
                ? "roles"
                : "missing";

          rows.push({
            controller: relative(srcRoot, file).replace(/\\/g, "/"),
            method: name,
            http: methodName(methodMeta),
            route: `${String(classPath)}/${String(routePath)}`.replace(/\/+/g, "/"),
            guardCoverage: coverage,
          });

          if (!isPublic && !hasGuardMetadata) {
            violations.push(
              `${relative(srcRoot, file)} :: ${methodName(methodMeta)} ${String(classPath)}/${String(routePath)} (${name})`,
            );
          }
        }
      }
    }

    // eslint-disable-next-line no-console
    console.table(rows);
    expect(violations).toEqual([]);
  });
});
