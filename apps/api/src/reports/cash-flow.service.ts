import { Injectable } from "@nestjs/common";
import {
  BankStatementLineOrigin,
  CashOrderStatus,
  LedgerType,
  Prisma,
  type BankStatementLineType,
} from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { ReportsCacheService } from "./reports-cache.service";

type CashFlowSection = "OPERATING" | "INVESTING" | "FINANCING";

type DecimalLike = Prisma.Decimal | number | string;
type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

/** Прямой ДДС: только импорт и ручной банк (см. PRD §4.13). */
const BANK_ORIGINS_DIRECT: BankStatementLineOrigin[] = [
  BankStatementLineOrigin.FILE_IMPORT,
  BankStatementLineOrigin.MANUAL_BANK_ENTRY,
];

function sectionForCashFlowCode(code: string): CashFlowSection {
  const c = code.trim().toUpperCase();
  if (c.startsWith("CF-INV")) return "INVESTING";
  if (c.startsWith("CF-FIN")) return "FINANCING";
  return "OPERATING";
}

function d(v: DecimalLike | null | undefined): Prisma.Decimal {
  return new Decimal(v ?? 0);
}

function dateRangeKey(dateFrom: string, dateTo: string): string {
  return `${dateFrom.slice(0, 10)}..${dateTo.slice(0, 10)}`;
}

@Injectable()
export class CashFlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ReportsCacheService,
  ) {}

  /**
   * Отчёт о движении денежных средств (прямой метод), PRD §4.13.
   * - Касса: проведённые KMO/KXO с заполненной статьёй ДДС.
   * - Банк: строки `BankStatementLine` с `origin` ∈ {FILE_IMPORT, MANUAL_BANK_ENTRY} и статьёй ДДС;
   *   в период попадают по `valueDate`, а при её отсутствии — по дате выписки.
   */
  async getDirectCashFlow(
    organizationId: string,
    params: {
      dateFrom: string;
      dateTo: string;
      cashDeskId?: string;
      bankName?: string;
      ledgerType?: LedgerType;
    },
  ): Promise<{
    dateFrom: string;
    dateTo: string;
    ledgerType: LedgerType;
    source: {
      cashDeskId: string | null;
      bankName: string | null;
    };
    sections: Array<{
      section: CashFlowSection;
      inflow: string;
      outflow: string;
      net: string;
      rows: Array<{
        cashFlowItemId: string;
        code: string;
        name: string;
        inflow: string;
        outflow: string;
        net: string;
      }>;
    }>;
    total: { inflow: string; outflow: string; net: string };
    cached?: boolean;
    sourceCount: number;
    methodologyNote: string;
  }> {
    const dateFrom = params.dateFrom.slice(0, 10);
    const dateTo = params.dateTo.slice(0, 10);
    const cashDeskId = params.cashDeskId?.trim() || null;
    const bankName = params.bankName?.trim() || null;
    const ledgerType = params.ledgerType ?? LedgerType.NAS;

    const df = new Date(`${dateFrom}T00:00:00.000Z`);
    const dt = new Date(`${dateTo}T23:59:59.999Z`);

    const stmtNameFilter: Prisma.BankStatementWhereInput = bankName
      ? { bankName }
      : {};

    const bankLineWhere: Prisma.BankStatementLineWhereInput = {
      organizationId,
      origin: { in: BANK_ORIGINS_DIRECT },
      cashFlowItemId: { not: null },
      OR: [
        {
          valueDate: { gte: df, lte: dt },
          ...(Object.keys(stmtNameFilter).length
            ? { bankStatement: stmtNameFilter }
            : {}),
        },
        {
          valueDate: null,
          bankStatement: {
            date: { gte: df, lte: dt },
            ...stmtNameFilter,
          },
        },
      ],
    };

    const cashOrderWhere: Prisma.CashOrderWhereInput = {
      organizationId,
      status: CashOrderStatus.POSTED,
      date: { gte: df, lte: dt },
      cashFlowItemId: { not: null },
      ...(cashDeskId ? { cashDeskId } : {}),
      ...(ledgerType
        ? {
            postedTransaction: {
              journalEntries: {
                some: { organizationId, ledgerType },
              },
            },
          }
        : {}),
    };

    const cacheKey = [
      "reports:cashflow:v2",
      organizationId,
      dateRangeKey(dateFrom, dateTo),
      cashDeskId ?? "-",
      bankName ?? "-",
      ledgerType,
    ].join(":");

    const [countCashOrders, countBankLines] = await Promise.all([
      this.prisma.cashOrder.count({ where: cashOrderWhere }),
      ledgerType === LedgerType.IFRS
        ? Promise.resolve(0)
        : this.prisma.bankStatementLine.count({ where: bankLineWhere }),
    ]);

    const sourceCount = countCashOrders + countBankLines;
    if (sourceCount > 1000) {
      const cached = await this.cache.getJson<{
        dateFrom: string;
        dateTo: string;
        ledgerType: LedgerType;
        source: { cashDeskId: string | null; bankName: string | null };
        sections: Array<{
          section: CashFlowSection;
          inflow: string;
          outflow: string;
          net: string;
          rows: Array<{
            cashFlowItemId: string;
            code: string;
            name: string;
            inflow: string;
            outflow: string;
            net: string;
          }>;
        }>;
        total: { inflow: string; outflow: string; net: string };
        sourceCount: number;
        methodologyNote: string;
      }>(cacheKey);
      if (cached) return { ...cached, cached: true };
    }

    const [cashOrders, bankLines] = await Promise.all([
      this.prisma.cashOrder.findMany({
        where: cashOrderWhere,
        select: {
          amount: true,
          kind: true,
          cashFlowItem: { select: { id: true, code: true, name: true } },
        },
      }),
      ledgerType === LedgerType.IFRS
        ? Promise.resolve([])
        : this.prisma.bankStatementLine.findMany({
            where: bankLineWhere,
            select: {
              amount: true,
              type: true,
              cashFlowItem: { select: { id: true, code: true, name: true } },
            },
          }),
    ]);

    type Agg = {
      cashFlowItemId: string;
      code: string;
      name: string;
      section: CashFlowSection;
      inflow: Decimal;
      outflow: Decimal;
    };
    const byId = new Map<string, Agg>();

    const up = (
      x: { id: string; code: string; name: string },
      inflow: Decimal,
      outflow: Decimal,
    ) => {
      const existing = byId.get(x.id);
      if (existing) {
        existing.inflow = existing.inflow.add(inflow);
        existing.outflow = existing.outflow.add(outflow);
        return;
      }
      byId.set(x.id, {
        cashFlowItemId: x.id,
        code: x.code,
        name: x.name,
        section: sectionForCashFlowCode(x.code),
        inflow,
        outflow,
      });
    };

    for (const o of cashOrders) {
      const item = o.cashFlowItem!;
      const amt = d(o.amount);
      if (o.kind === "KMO") up(item, amt, new Decimal(0));
      else up(item, new Decimal(0), amt);
    }
    for (const l of bankLines) {
      const item = l.cashFlowItem!;
      const amt = d(l.amount);
      if (l.type === ("INFLOW" satisfies BankStatementLineType)) {
        up(item, amt, new Decimal(0));
      } else {
        up(item, new Decimal(0), amt);
      }
    }

    const sectionsOrder: CashFlowSection[] = ["OPERATING", "INVESTING", "FINANCING"];
    const all = Array.from(byId.values()).sort((a, b) => {
      const s = sectionsOrder.indexOf(a.section) - sectionsOrder.indexOf(b.section);
      if (s !== 0) return s;
      return a.code.localeCompare(b.code);
    });

    const sections = sectionsOrder.map((section) => {
      const rows = all
        .filter((x) => x.section === section)
        .map((x) => {
          const net = x.inflow.sub(x.outflow);
          return {
            cashFlowItemId: x.cashFlowItemId,
            code: x.code,
            name: x.name,
            inflow: x.inflow.toFixed(2),
            outflow: x.outflow.toFixed(2),
            net: net.toFixed(2),
          };
        });
      let inflow = new Decimal(0);
      let outflow = new Decimal(0);
      for (const x of all.filter((z) => z.section === section)) {
        inflow = inflow.add(x.inflow);
        outflow = outflow.add(x.outflow);
      }
      const net = inflow.sub(outflow);
      return {
        section,
        inflow: inflow.toFixed(2),
        outflow: outflow.toFixed(2),
        net: net.toFixed(2),
        rows,
      };
    });

    let totalIn = new Decimal(0);
    let totalOut = new Decimal(0);
    for (const s of sections) {
      totalIn = totalIn.add(new Decimal(s.inflow));
      totalOut = totalOut.add(new Decimal(s.outflow));
    }
    const totalNet = totalIn.sub(totalOut);

    const methodologyNote =
      ledgerType === LedgerType.IFRS
        ? "IFRS-книга: учитываются только кассовые операции с проводками ledgerType=IFRS (по связанным posted transaction). Строки банковской выписки без проводок ГК в IFRS-режиме не включаются."
        : "NAS-книга: касса — проведённые ордера KMO/KXO со статьёй ДДС. Банк — строки выписки с origin FILE_IMPORT или MANUAL_BANK_ENTRY и статьёй ДДС; дата периода — valueDate, иначе дата выписки. Прочие origin (DIRECT_SYNC, WEBHOOK и т.д.) в отчёт не входят.";

    const result = {
      dateFrom,
      dateTo,
      ledgerType,
      source: { cashDeskId, bankName },
      sections,
      total: {
        inflow: totalIn.toFixed(2),
        outflow: totalOut.toFixed(2),
        net: totalNet.toFixed(2),
      },
      sourceCount,
      methodologyNote,
    };

    if (sourceCount > 1000) {
      await this.cache.setJson(cacheKey, result, 60 * 5);
    }

    return result;
  }

  /** @deprecated Используйте {@link getDirectCashFlow} */
  buildCashFlow(
    organizationId: string,
    params: {
      dateFrom: string;
      dateTo: string;
      cashDeskId?: string;
      bankName?: string;
      ledgerType?: LedgerType;
    },
  ) {
    return this.getDirectCashFlow(organizationId, params);
  }
}
