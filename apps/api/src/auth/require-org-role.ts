import { ForbiddenException } from "@nestjs/common";
import type { UserRole } from "@dayday/database";
import type { AuthUser } from "./types/auth-user";

/**
 * Маршруты с @OrganizationId() должны иметь в JWT роль в организации.
 * Без организации в токене — только auth/companies.
 */
export function requireOrgRole(user: AuthUser): UserRole {
  if (user.role == null) {
    throw new ForbiddenException(
      "Нет контекста организации: создайте компанию или выберите её в «Мои компании».",
    );
  }
  return user.role;
}
