import { BadRequestException, Injectable } from "@nestjs/common";
import { AbsencePayFormula } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_ABSENCE_TYPES: {
  code: string;
  nameAz: string;
  description: string;
  isPaid: boolean;
  formula: AbsencePayFormula;
  maxCalendarDays: number | null;
}[] = [
  {
    code: "LABOR_LEAVE",
    nameAz: "Əmək məzuniyyəti",
    description:
      "TK AР: orta aylıq əməkhaqqı (12 ay) ÷ 30.4 × təqvim günləri; ödənişli məzuniyyət.",
    isPaid: true,
    formula: AbsencePayFormula.LABOR_LEAVE_304,
    maxCalendarDays: null,
  },
  {
    code: "SOCIAL_LEAVE",
    nameAz: "Sosial məzuniyyət (hamiləlik, uşağa qulluq)",
    description:
      "Ödənişli sosial məzuniyyət: eyni 30.4 orta hesabı (əmək məzuniyyəti ilə eyni məntiqi).",
    isPaid: true,
    formula: AbsencePayFormula.LABOR_LEAVE_304,
    maxCalendarDays: null,
  },
  {
    code: "UNPAID_LEAVE",
    nameAz: "Ödənişsiz məzuniyyət",
    description:
      "Ay üzrə əmək haqqı: iş günlərinin cədvəl üzrə azaldılması (gündəlik məbləğ × işlənməyən iş günləri).",
    isPaid: false,
    formula: AbsencePayFormula.UNPAID_RECORD,
    maxCalendarDays: 30,
  },
  {
    code: "EDUCATIONAL_LEAVE",
    nameAz: "Təhsil məzuniyyəti",
    description:
      "Ödənişli təhsil məzuniyyəti: 30.4 orta hesabı (əmək məzuniyyəti ilə eyni məntiqi).",
    isPaid: true,
    formula: AbsencePayFormula.LABOR_LEAVE_304,
    maxCalendarDays: null,
  },
  {
    code: "SICK_LEAVE",
    nameAz: "Xəstəlik vərəqəsi",
    description:
      "İlk 14 təqvim günü işəgötürən (staja görə %), sonrakılar DSMF (ERP-dən kənar).",
    isPaid: true,
    formula: AbsencePayFormula.SICK_LEAVE_STAJ,
    maxCalendarDays: null,
  },
];

@Injectable()
export class AbsenceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Siyahı; boşdursa — standart AZ növləri bir transaksiyada yaradılır.
   */
  async listOrSeed(organizationId: string) {
    const existing = await this.prisma.absenceType.findMany({
      where: { organizationId },
      orderBy: [{ code: "asc" }],
    });
    if (existing.length > 0) {
      await this.reconcileLegacyAbsenceTypes(organizationId);
      return this.prisma.absenceType.findMany({
        where: { organizationId },
        orderBy: [{ code: "asc" }],
      });
    }

    await this.prisma.$transaction(
      DEFAULT_ABSENCE_TYPES.map((d) =>
        this.prisma.absenceType.create({
          data: {
            organizationId,
            code: d.code,
            nameAz: d.nameAz,
            description: d.description,
            isPaid: d.isPaid,
            formula: d.formula,
            maxCalendarDays: d.maxCalendarDays,
          },
        }),
      ),
    );
    return this.prisma.absenceType.findMany({
      where: { organizationId },
      orderBy: [{ code: "asc" }],
    });
  }

  /**
   * Köhnə kodları (LABOR_MAIN, SICK və s.) TK AР üzrə 5 standart koda keçirir.
   */
  private async reconcileLegacyAbsenceTypes(organizationId: string) {
    const codes = await this.prisma.absenceType.findMany({
      where: { organizationId },
      select: { code: true },
    });
    const set = new Set(codes.map((c) => c.code));
    const legacy = ["LABOR_MAIN", "LABOR_ADD", "SOCIAL", "UNPAID", "EDU_CREATIVE", "SICK"] as const;
    if (!legacy.some((c) => set.has(c))) return;

    const canon = DEFAULT_ABSENCE_TYPES;
    const patch = (code: string) => canon.find((c) => c.code === code);

    await this.prisma.$transaction(async (tx) => {
      let laborLeaveId = (
        await tx.absenceType.findFirst({
          where: { organizationId, code: "LABOR_LEAVE" },
        })
      )?.id;

      if (!laborLeaveId) {
        const main = await tx.absenceType.findFirst({
          where: { organizationId, code: "LABOR_MAIN" },
        });
        const add = await tx.absenceType.findFirst({
          where: { organizationId, code: "LABOR_ADD" },
        });
        const pick = main ?? add;
        if (pick) {
          const p = patch("LABOR_LEAVE")!;
          await tx.absenceType.update({
            where: { id: pick.id },
            data: {
              code: "LABOR_LEAVE",
              nameAz: p.nameAz,
              description: p.description,
              isPaid: p.isPaid,
              formula: p.formula,
              maxCalendarDays: p.maxCalendarDays,
            },
          });
          laborLeaveId = pick.id;
        }
      }

      if (laborLeaveId) {
        for (const dupCode of ["LABOR_MAIN", "LABOR_ADD"] as const) {
          const dup = await tx.absenceType.findFirst({
            where: { organizationId, code: dupCode },
          });
          if (dup && dup.id !== laborLeaveId) {
            await tx.absence.updateMany({
              where: { absenceTypeId: dup.id },
              data: { absenceTypeId: laborLeaveId },
            });
            await tx.absenceType.delete({ where: { id: dup.id } });
          }
        }
      }

      const renames: [string, string][] = [
        ["SOCIAL", "SOCIAL_LEAVE"],
        ["UNPAID", "UNPAID_LEAVE"],
        ["EDU_CREATIVE", "EDUCATIONAL_LEAVE"],
        ["SICK", "SICK_LEAVE"],
      ];
      for (const [from, to] of renames) {
        const src = await tx.absenceType.findFirst({
          where: { organizationId, code: from },
        });
        if (!src) continue;
        const already = await tx.absenceType.findFirst({
          where: { organizationId, code: to },
        });
        if (already && already.id !== src.id) {
          await tx.absence.updateMany({
            where: { absenceTypeId: src.id },
            data: { absenceTypeId: already.id },
          });
          await tx.absenceType.delete({ where: { id: src.id } });
          continue;
        }
        const p = patch(to);
        if (!p) continue;
        await tx.absenceType.update({
          where: { id: src.id },
          data: {
            code: to,
            nameAz: p.nameAz,
            description: p.description,
            isPaid: p.isPaid,
            formula: p.formula,
            maxCalendarDays: p.maxCalendarDays,
          },
        });
      }
    });
  }

  async assertInOrg(organizationId: string, id: string) {
    const row = await this.prisma.absenceType.findFirst({
      where: { id, organizationId },
    });
    if (!row) {
      throw new BadRequestException("absenceTypeId not found for organization");
    }
    return row;
  }

  async getByCode(organizationId: string, code: string) {
    return this.prisma.absenceType.findFirst({
      where: { organizationId, code },
    });
  }

  /** Xəstəlik növü: əvvəl `SICK`, indi `SICK_LEAVE`. */
  async getSickTypeId(organizationId: string): Promise<string | null> {
    const a = await this.getByCode(organizationId, "SICK_LEAVE");
    if (a) return a.id;
    const b = await this.getByCode(organizationId, "SICK");
    return b?.id ?? null;
  }
}
