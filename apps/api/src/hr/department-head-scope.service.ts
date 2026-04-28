import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

@Injectable()
export class DepartmentHeadScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves "own department" for DEPARTMENT_HEAD role.
   * Mapping strategy: current user must match an Employee by first/last name,
   * and this employee must be assigned as department manager.
   */
  async resolveManagedDepartmentId(
    organizationId: string,
    userId: string,
  ): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, fullName: true },
    });
    if (!user) {
      throw new ForbiddenException("User not found for department scope");
    }

    const firstName = norm(user.firstName);
    const lastName = norm(user.lastName);
    const fullName = norm(user.fullName);
    if ((!firstName || !lastName) && !fullName) {
      throw new ForbiddenException(
        "DEPARTMENT_HEAD profile is not linked to a managed department",
      );
    }

    const employees = await this.prisma.employee.findMany({
      where: { organizationId },
      select: { id: true, firstName: true, lastName: true },
    });

    const matched = employees.find((e) => {
      const ef = norm(e.firstName);
      const el = norm(e.lastName);
      const eFull = `${ef} ${el}`.trim();
      if (firstName && lastName && ef === firstName && el === lastName) {
        return true;
      }
      return Boolean(fullName) && eFull === fullName;
    });

    if (!matched) {
      throw new ForbiddenException(
        "DEPARTMENT_HEAD is not mapped to an employee manager profile",
      );
    }

    const managed = await this.prisma.department.findMany({
      where: { organizationId, managerId: matched.id },
      select: { id: true },
    });
    if (managed.length !== 1) {
      throw new ForbiddenException(
        "DEPARTMENT_HEAD must be assigned to exactly one managed department",
      );
    }
    return managed[0].id;
  }
}
