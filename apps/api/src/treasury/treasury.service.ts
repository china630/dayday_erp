import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_CASH_FLOW_ITEMS: { code: string; name: string }[] = [
  { code: "CF-OPS", name: "Əməliyyat fəaliyyəti üzrə ödənişlər" },
  { code: "CF-SUP", name: "Təchizatçılara ödənişlər" },
  { code: "CF-SAL", name: "Əmək haqqı ödənişləri" },
  { code: "CF-TAX", name: "Vergi və məcburi ödənişlər" },
  { code: "CF-OTH", name: "Digər pul axını" },
];

@Injectable()
export class TreasuryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Список статей ДДС; при пустом справочнике создаёт типовой набор.
   */
  async listOrSeedCashFlowItems(organizationId: string) {
    const existing = await this.prisma.cashFlowItem.findMany({
      where: { organizationId },
      orderBy: [{ code: "asc" }],
    });
    if (existing.length > 0) return existing;

    await this.prisma.$transaction(
      DEFAULT_CASH_FLOW_ITEMS.map((d) =>
        this.prisma.cashFlowItem.create({
          data: {
            organizationId,
            code: d.code,
            name: d.name,
          },
        }),
      ),
    );

    return this.prisma.cashFlowItem.findMany({
      where: { organizationId },
      orderBy: [{ code: "asc" }],
    });
  }

  async createCashFlowItem(
    organizationId: string,
    code: string,
    name: string,
  ) {
    const c = code.trim();
    const n = name.trim();
    if (!c || !n) {
      throw new BadRequestException("code and name required");
    }
    return this.prisma.cashFlowItem.create({
      data: { organizationId, code: c, name: n },
    });
  }

  listCashDesks(organizationId: string) {
    return this.prisma.cashDesk.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ name: "asc" }],
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, finCode: true },
        },
      },
    });
  }

  async createCashDesk(
    organizationId: string,
    dto: { name: string; employeeId?: string | null; currencies?: string[] },
  ) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("name required");
    return this.prisma.cashDesk.create({
      data: {
        organizationId,
        name,
        employeeId: dto.employeeId?.trim() || null,
        currencies: dto.currencies?.length ? dto.currencies : [],
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, finCode: true },
        },
      },
    });
  }

  async assertCashFlowItem(organizationId: string, id: string) {
    const row = await this.prisma.cashFlowItem.findFirst({
      where: { id, organizationId },
    });
    if (!row) {
      throw new BadRequestException("cashFlowItemId not found for organization");
    }
    return row;
  }

  async assertCashDesk(organizationId: string, id: string) {
    const row = await this.prisma.cashDesk.findFirst({
      where: { id, organizationId, isActive: true },
    });
    if (!row) {
      throw new BadRequestException("cashDeskId not found for organization");
    }
    return row;
  }
}
