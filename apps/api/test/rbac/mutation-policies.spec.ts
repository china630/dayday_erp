import "reflect-metadata";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@dayday/database";
import { ROLES_KEY } from "../../src/auth/decorators/roles.decorator";
import { RolesGuard } from "../../src/auth/guards/roles.guard";
import { AccountingController } from "../../src/accounting/accounting.controller";
import { OrganizationSettingsController } from "../../src/organizations/organization-settings.controller";
import { IntegrationsHealthController } from "../../src/integrations/integrations-health.controller";
import { AdminController } from "../../src/admin/admin.controller";
import { SuperAdminGuard } from "../../src/auth/guards/super-admin.guard";

function ctx(role: UserRole, handler: (...args: unknown[]) => unknown, klass: new (...args: unknown[]) => unknown) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: { role, userId: "u-1", organizationId: "o-1" },
      }),
    }),
    getHandler: () => handler,
    getClass: () => klass,
  } as any;
}

describe("RBAC mutation policy enforcement", () => {
  const guard = new RolesGuard(new Reflector());

  it("denies USER role for accounting mutation", () => {
    expect(
      guard.canActivate(
        ctx(
          UserRole.USER,
          AccountingController.prototype.quickExpense,
          AccountingController,
        ),
      ),
    ).toBe(false);
  });

  it("denies USER role for organization settings mutation", () => {
    expect(
      guard.canActivate(
        ctx(
          UserRole.USER,
          OrganizationSettingsController.prototype.patchSettings,
          OrganizationSettingsController,
        ),
      ),
    ).toBe(false);
  });

  it("denies USER role for period lock mutation", () => {
    expect(
      guard.canActivate(
        ctx(
          UserRole.USER,
          OrganizationSettingsController.prototype.patchPeriodLock,
          OrganizationSettingsController,
        ),
      ),
    ).toBe(false);
  });

  it("allows ACCOUNTANT for period lock mutation", () => {
    expect(
      guard.canActivate(
        ctx(
          UserRole.ACCOUNTANT,
          OrganizationSettingsController.prototype.patchPeriodLock,
          OrganizationSettingsController,
        ),
      ),
    ).toBe(true);
  });

  it("integrations health route remains owner-only", () => {
    const handlerRoles = Reflect.getMetadata(
      ROLES_KEY,
      IntegrationsHealthController.prototype.health,
    ) as UserRole[] | undefined;
    const classRoles = Reflect.getMetadata(ROLES_KEY, IntegrationsHealthController) as
      | UserRole[]
      | undefined;
    expect(handlerRoles ?? classRoles).toEqual([UserRole.OWNER]);
  });

  it("admin controller stays super-admin protected", () => {
    const guards = Reflect.getMetadata("__guards__", AdminController) as
      | Array<new (...args: unknown[]) => unknown>
      | undefined;
    expect(Array.isArray(guards)).toBe(true);
    expect(guards?.some((g) => g === SuperAdminGuard)).toBe(true);
  });
});
