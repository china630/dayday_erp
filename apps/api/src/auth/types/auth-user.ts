import type { UserRole } from "@dayday/database";

export type AuthUser = {
  userId: string;
  email: string;
  /** null — пользователь вошёл, но ещё не выбрал/не создал организацию (ТЗ: сначала пользователь, потом компания). */
  organizationId: string | null;
  role: UserRole | null;
  /** Загружается из БД при валидации JWT. */
  isSuperAdmin?: boolean;
};
