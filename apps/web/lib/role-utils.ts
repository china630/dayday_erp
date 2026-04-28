/** Роль с ограниченным доступом (только просмотр / без удаления и настроек). */
export function isRestrictedUserRole(role: string | undefined): boolean {
  return role === "USER";
}

/** Закрытие периода (API: OWNER, ADMIN). */
export function canCloseAccountingPeriod(role: string | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** Биллинг и подписка (v10.3): только Owner. */
export function canAccessBilling(role: string | null | undefined): boolean {
  return role === "OWNER";
}

/** Фильтр P&L по департаменту: только Owner и Accountant. */
export function canUsePlDepartmentFilter(role: string | undefined): boolean {
  return role === "OWNER" || role === "ACCOUNTANT";
}
