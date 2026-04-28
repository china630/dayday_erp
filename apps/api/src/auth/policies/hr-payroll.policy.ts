import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@dayday/database";

export function assertMayAccessPayrollFinance(role: UserRole): void {
  if (role !== UserRole.OWNER && role !== UserRole.ACCOUNTANT) {
    throw new ForbiddenException(
      "Payroll financial data is available only for OWNER and ACCOUNTANT",
    );
  }
}

export function isDepartmentHeadRole(role: UserRole): boolean {
  return role === UserRole.DEPARTMENT_HEAD;
}
