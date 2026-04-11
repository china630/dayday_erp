import { ForbiddenException } from "@nestjs/common";
import { InvoiceStatus, UserRole } from "@dayday/database";

/**
 * RBAC v5.8: роль USER не может изменять инвойсы в статусе PAID
 * и не может выполнять ручные проводки (см. AccountingController / сервис).
 */
export function assertUserMayMutateInvoiceInPaidStatus(
  role: UserRole,
  invoiceStatus: InvoiceStatus,
): void {
  if (role === UserRole.USER && invoiceStatus === InvoiceStatus.PAID) {
    throw new ForbiddenException(
      "Роль USER не может изменять или удалять инвойсы в статусе PAID",
    );
  }
}

export function assertMayPostManualJournal(role: UserRole): void {
  if (role === UserRole.USER) {
    throw new ForbiddenException(
      "Роль USER не может проводить ручные операции в журнале",
    );
  }
}
