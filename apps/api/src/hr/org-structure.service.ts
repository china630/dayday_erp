import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { CreateJobPositionDto } from "./dto/create-job-position.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";
import { UpdateJobPositionDto } from "./dto/update-job-position.dto";

const Decimal = Prisma.Decimal;

export type DepartmentTreeNode = {
  id: string;
  name: string;
  parentId: string | null;
  managerId: string | null;
  manager: { id: string; firstName: string; lastName: string } | null;
  children: DepartmentTreeNode[];
};

@Injectable()
export class OrgStructureService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Для новой организации: корневой отдел HQ и должность Generalist (без сотрудников).
   */
  async ensureDefaultDepartmentAndPosition(organizationId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      let dept = await tx.department.findFirst({
        where: { organizationId, name: "HQ", parentId: null },
      });
      if (!dept) {
        dept = await tx.department.create({
          data: { organizationId, name: "HQ" },
        });
      }
      const gen = await tx.jobPosition.findFirst({
        where: { departmentId: dept.id, name: "Generalist" },
      });
      if (!gen) {
        await tx.jobPosition.create({
          data: {
            departmentId: dept.id,
            name: "Generalist",
            totalSlots: 10_000,
            minSalary: new Decimal(0),
            maxSalary: new Decimal(0),
          },
        });
      }
    });
  }

  async listDepartmentsFlat(organizationId: string) {
    return this.prisma.department.findMany({
      where: { organizationId },
      select: { id: true, name: true, parentId: true },
      orderBy: { name: "asc" },
    });
  }

  getDepartmentTree(organizationId: string): Promise<DepartmentTreeNode[]> {
    return this.buildTree(organizationId);
  }

  private async buildTree(organizationId: string): Promise<DepartmentTreeNode[]> {
    const depts = await this.prisma.department.findMany({
      where: { organizationId },
      include: {
        manager: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { name: "asc" },
    });
    const nodeMap = new Map<string, DepartmentTreeNode>();
    for (const d of depts) {
      nodeMap.set(d.id, {
        id: d.id,
        name: d.name,
        parentId: d.parentId,
        managerId: d.managerId,
        manager: d.manager
          ? {
              id: d.manager.id,
              firstName: d.manager.firstName,
              lastName: d.manager.lastName,
            }
          : null,
        children: [],
      });
    }
    const roots: DepartmentTreeNode[] = [];
    for (const d of depts) {
      const node = nodeMap.get(d.id)!;
      if (d.parentId && nodeMap.has(d.parentId)) {
        nodeMap.get(d.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    const sortRec = (n: DepartmentTreeNode) => {
      n.children.sort((a, b) => a.name.localeCompare(b.name, "ru"));
      n.children.forEach(sortRec);
    };
    roots.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    roots.forEach(sortRec);
    return roots;
  }

  private async assertDepartmentInOrg(organizationId: string, id: string) {
    const row = await this.prisma.department.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException("Подразделение не найдено");
    return row;
  }

  private async assertParentNoCycle(
    departmentId: string,
    proposedParentId: string | null,
  ) {
    if (!proposedParentId) return;
    if (proposedParentId === departmentId) {
      throw new BadRequestException("Подразделение не может быть родителем самому себе");
    }
    const seen = new Set<string>();
    let nextId: string | null = proposedParentId as string;
    while (nextId != null) {
      const at: string = nextId;
      if (at === departmentId) {
        throw new BadRequestException("Некорректный родитель: получится цикл в иерархии");
      }
      if (seen.has(at)) break;
      seen.add(at);
      const parentRow: { parentId: string | null } | null =
        await this.prisma.department.findUnique({
          where: { id: at },
          select: { parentId: true },
        });
      nextId = parentRow?.parentId ?? null;
    }
  }

  private async assertManagerInOrg(organizationId: string, managerId: string | null | undefined) {
    if (managerId == null || managerId === "") return;
    const emp = await this.prisma.employee.findFirst({
      where: { id: managerId, organizationId },
    });
    if (!emp) {
      throw new BadRequestException("Руководитель должен быть сотрудником этой организации");
    }
  }

  async createDepartment(organizationId: string, dto: CreateDepartmentDto) {
    if (dto.parentId) {
      await this.assertDepartmentInOrg(organizationId, dto.parentId);
    }
    await this.assertManagerInOrg(organizationId, dto.managerId ?? null);
    return this.prisma.department.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        parentId: dto.parentId ?? null,
        managerId: dto.managerId ?? null,
      },
      include: {
        manager: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async updateDepartment(organizationId: string, id: string, dto: UpdateDepartmentDto) {
    await this.assertDepartmentInOrg(organizationId, id);
    if (dto.parentId !== undefined && dto.parentId != null) {
      await this.assertDepartmentInOrg(organizationId, dto.parentId);
      await this.assertParentNoCycle(id, dto.parentId);
    } else if (dto.parentId === null) {
      await this.assertParentNoCycle(id, null);
    }
    if (dto.managerId !== undefined) {
      await this.assertManagerInOrg(organizationId, dto.managerId ?? null);
    }
    const data: Record<string, unknown> = {};
    if (dto.name != null) data.name = dto.name.trim();
    if (dto.parentId !== undefined) data.parentId = dto.parentId;
    if (dto.managerId !== undefined) data.managerId = dto.managerId;
    return this.prisma.department.update({
      where: { id },
      data,
      include: {
        manager: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async listJobPositions(organizationId: string, departmentId?: string) {
    return this.prisma.jobPosition.findMany({
      where: {
        department: {
          organizationId,
          ...(departmentId ? { id: departmentId } : {}),
        },
      },
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { employees: true } },
      },
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
    });
  }

  private async assertJobPositionInOrg(organizationId: string, positionId: string) {
    const row = await this.prisma.jobPosition.findFirst({
      where: { id: positionId, department: { organizationId } },
    });
    if (!row) throw new NotFoundException("Должность не найдена");
    return row;
  }

  async createJobPosition(organizationId: string, dto: CreateJobPositionDto) {
    const dept = await this.prisma.department.findFirst({
      where: { id: dto.departmentId, organizationId },
    });
    if (!dept) {
      throw new BadRequestException("Подразделение не найдено или чужое");
    }
    const minS = new Decimal(dto.minSalary);
    const maxS = new Decimal(dto.maxSalary);
    if (minS.gt(maxS)) {
      throw new BadRequestException("minSalary не может быть больше maxSalary");
    }
    return this.prisma.jobPosition.create({
      data: {
        departmentId: dto.departmentId,
        name: dto.name.trim(),
        totalSlots: dto.totalSlots,
        minSalary: minS,
        maxSalary: maxS,
      },
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { employees: true } },
      },
    });
  }

  async updateJobPosition(
    organizationId: string,
    id: string,
    dto: UpdateJobPositionDto,
  ) {
    await this.assertJobPositionInOrg(organizationId, id);
    const pos = await this.prisma.jobPosition.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { employees: true } } },
    });
    const data: Prisma.JobPositionUpdateInput = {};
    if (dto.name != null) data.name = dto.name.trim();
    if (dto.totalSlots != null) {
      if (dto.totalSlots < pos._count.employees) {
        throw new BadRequestException(
          `Ставок не может быть меньше числа занятых (${pos._count.employees})`,
        );
      }
      data.totalSlots = dto.totalSlots;
    }
    if (dto.minSalary != null) data.minSalary = new Decimal(dto.minSalary);
    if (dto.maxSalary != null) data.maxSalary = new Decimal(dto.maxSalary);
    if (dto.minSalary != null || dto.maxSalary != null) {
      const nextMin =
        dto.minSalary != null ? new Decimal(dto.minSalary) : pos.minSalary;
      const nextMax =
        dto.maxSalary != null ? new Decimal(dto.maxSalary) : pos.maxSalary;
      if (nextMin.gt(nextMax)) {
        throw new BadRequestException("minSalary не может быть больше maxSalary");
      }
    }
    return this.prisma.jobPosition.update({
      where: { id },
      data,
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { employees: true } },
      },
    });
  }
}
