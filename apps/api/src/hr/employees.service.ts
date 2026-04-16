import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Decimal, EmployeeKind, Prisma } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { QuotaService } from "../quota/quota.service";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
  ) {}

  list(
    organizationId: string,
    query?: { page?: number; pageSize?: number },
  ) {
    const page = Math.max(1, query?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query?.pageSize ?? 20));
    const where = { organizationId };
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.employee.count({ where });
      const items = await tx.employee.findMany({
        where,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          jobPosition: {
            include: { department: { select: { id: true, name: true } } },
          },
        },
      });
      return { items, total, page, pageSize };
    });
  }

  private async assertPositionSlotAvailable(
    organizationId: string,
    positionId: string,
    excludeEmployeeId?: string,
  ) {
    const pos = await this.prisma.jobPosition.findFirst({
      where: { id: positionId, department: { organizationId } },
    });
    if (!pos) {
      throw new BadRequestException("Указанная должность не найдена в организации");
    }
    const cnt = await this.prisma.employee.count({
      where: {
        positionId,
        ...(excludeEmployeeId ? { id: { not: excludeEmployeeId } } : {}),
      },
    });
    if (cnt >= pos.totalSlots) {
      throw new ForbiddenException({
        message:
          "Исчерпаны штатные единицы по выбранной должности (лимит ставок)",
        code: "QUOTA_EXCEEDED",
      });
    }
  }

  async create(organizationId: string, dto: CreateEmployeeDto) {
    const kind = dto.kind ?? EmployeeKind.EMPLOYEE;
    if (kind === EmployeeKind.CONTRACTOR && !dto.voen?.trim()) {
      throw new BadRequestException("Для подрядчика (CONTRACTOR) укажите VÖEN (10 цифр)");
    }
    await this.quota.assertEmployeeQuota(organizationId);
    await this.assertPositionSlotAvailable(organizationId, dto.positionId);
    try {
      return await this.prisma.employee.create({
        data: {
          organizationId,
          kind,
          finCode: dto.finCode.trim(),
          voen:
            kind === EmployeeKind.CONTRACTOR
              ? dto.voen!.trim()
              : (dto.voen?.trim() ?? null),
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          patronymic: dto.patronymic.trim(),
          positionId: dto.positionId,
          startDate: new Date(dto.startDate),
          salary: new Decimal(dto.salary),
          contractorMonthlySocialAzn:
            kind === EmployeeKind.CONTRACTOR &&
            dto.contractorMonthlySocialAzn != null
              ? new Decimal(dto.contractorMonthlySocialAzn)
              : null,
        },
        include: {
          jobPosition: {
            include: { department: { select: { id: true, name: true } } },
          },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("ФИН уже занят в организации");
      }
      throw e;
    }
  }

  async getOne(organizationId: string, id: string) {
    const row = await this.prisma.employee.findFirst({
      where: { id, organizationId },
      include: {
        jobPosition: {
          include: { department: { select: { id: true, name: true } } },
        },
      },
    });
    if (!row) throw new NotFoundException("Employee not found");
    return row;
  }

  async update(organizationId: string, id: string, dto: UpdateEmployeeDto) {
    const current = await this.getOne(organizationId, id);
    const kind = dto.kind ?? current.kind;
    if (kind === EmployeeKind.CONTRACTOR) {
      const voen =
        dto.voen?.trim() ??
        (current.voen?.trim() ? current.voen.trim() : "");
      if (!/^\d{10}$/.test(voen)) {
        throw new BadRequestException("Для подрядчика укажите VÖEN (10 цифр)");
      }
    }
    if (dto.positionId != null && dto.positionId !== current.positionId) {
      await this.assertPositionSlotAvailable(organizationId, dto.positionId, id);
    }

    const data: Record<string, unknown> = {};
    if (dto.kind != null) data.kind = dto.kind;
    if (dto.finCode != null) data.finCode = dto.finCode.trim();
    if (dto.firstName != null) data.firstName = dto.firstName.trim();
    if (dto.lastName != null) data.lastName = dto.lastName.trim();
    if (dto.patronymic !== undefined) {
      const p = dto.patronymic.trim();
      data.patronymic = p.length ? p : null;
    }
    if (dto.positionId != null) data.positionId = dto.positionId;
    if (dto.startDate != null) data.startDate = new Date(dto.startDate);
    if (dto.salary != null) data.salary = new Decimal(dto.salary);
    if (dto.voen !== undefined) {
      data.voen = dto.voen.trim() || null;
    }
    if (dto.contractorMonthlySocialAzn !== undefined) {
      data.contractorMonthlySocialAzn =
        dto.contractorMonthlySocialAzn == null
          ? null
          : new Decimal(dto.contractorMonthlySocialAzn);
    }
    if (dto.accountableAccountCode244 !== undefined) {
      const v = dto.accountableAccountCode244?.trim();
      data.accountableAccountCode244 = v ? v : null;
    }
    const nextKind = (data.kind as EmployeeKind | undefined) ?? current.kind;
    if (nextKind === EmployeeKind.EMPLOYEE) {
      data.voen = null;
      data.contractorMonthlySocialAzn = null;
    } else if (nextKind === EmployeeKind.CONTRACTOR) {
      const v =
        (data.voen as string | null | undefined) ?? current.voen ?? null;
      data.voen =
        typeof v === "string" && v.trim() ? v.trim() : v;
    }
    try {
      return await this.prisma.employee.update({
        where: { id },
        data,
        include: {
          jobPosition: {
            include: { department: { select: { id: true, name: true } } },
          },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("ФИН уже занят в организации");
      }
      throw e;
    }
  }

  async remove(organizationId: string, id: string) {
    await this.getOne(organizationId, id);
    try {
      await this.prisma.employee.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        throw new ConflictException("Нельзя удалить: есть расчётные листовки");
      }
      throw e;
    }
  }
}
