import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AccountType,
  EmployeeKind,
  LedgerType,
  Prisma,
  StockMovementReason,
  StockMovementType,
} from "@dayday/database";
import { AccountingService, type PostTransactionLine } from "../accounting/accounting.service";
import { PrismaService } from "../prisma/prisma.service";
import { OpeningBalanceFinanceLineDto } from "./dto/opening-balance-finance-line.dto";
import { OpeningBalanceHrLineDto } from "./dto/opening-balance-hr-line.dto";
import { OpeningBalanceInventoryLineDto } from "./dto/opening-balance-inventory-line.dto";

const Decimal = Prisma.Decimal;
const OPENING_ACCOUNT_CODE = "000";

function shouldCreditTargetAccount(code: string): boolean {
  // For opening balances: liabilities/payables (e.g. 531*) are credited.
  return code.trim().startsWith("5");
}

@Injectable()
export class OpeningBalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  private async ensureTechnicalOpeningAccount(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const existing = await tx.account.findFirst({
      where: {
        organizationId,
        code: OPENING_ACCOUNT_CODE,
        ledgerType: LedgerType.NAS,
      },
    });
    if (existing) return existing;
    return tx.account.create({
      data: {
        organizationId,
        code: OPENING_ACCOUNT_CODE,
        nameAz: "İlkin qalıqlar texniki hesabı",
        nameRu: "Технический счёт начальных остатков",
        nameEn: "Opening balances technical account",
        type: AccountType.EQUITY,
        currency: "AZN",
        ledgerType: LedgerType.NAS,
      },
    });
  }

  async importFinance(
    organizationId: string,
    lines: OpeningBalanceFinanceLineDto[],
  ): Promise<{ created: number; transactionIds: string[] }> {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new BadRequestException("Payload must be a non-empty array");
    }

    return this.prisma.$transaction(async (tx) => {
      const opening = await this.ensureTechnicalOpeningAccount(tx, organizationId);
      let openingUpdatedAt = opening.updatedAt;
      const transactionIds: string[] = [];

      for (const line of lines) {
        const accountCode = line.accountCode.trim();
        const target = await tx.account.findFirst({
          where: {
            organizationId,
            code: accountCode,
            ledgerType: LedgerType.NAS,
          },
        });
        if (!target) {
          throw new NotFoundException(`Account ${accountCode} not found`);
        }

        // Optimistic locking handshake on accounts touched by opening posting.
        const nextTs = new Date();
        const touched = await tx.account.updateMany({
          where: {
            id: target.id,
            updatedAt: target.updatedAt,
          },
          data: {
            nameAz: target.nameAz,
            nameRu: target.nameRu,
            nameEn: target.nameEn,
            updatedAt: nextTs,
          },
        });
        if (touched.count !== 1) {
          throw new ConflictException(`Optimistic lock failed for account ${accountCode}`);
        }
        const touchedOpening = await tx.account.updateMany({
          where: {
            id: opening.id,
            updatedAt: openingUpdatedAt,
          },
          data: {
            nameAz: opening.nameAz,
            nameRu: opening.nameRu,
            nameEn: opening.nameEn,
            updatedAt: nextTs,
          },
        });
        if (touchedOpening.count !== 1) {
          throw new ConflictException("Optimistic lock failed for account 000");
        }
        openingUpdatedAt = nextTs;

        const amount = new Decimal(line.amount);
        const creditTarget = shouldCreditTargetAccount(accountCode);
        const journalLines: PostTransactionLine[] = creditTarget
          ? [
              { accountCode: OPENING_ACCOUNT_CODE, debit: amount.toString(), credit: 0 },
              { accountCode, debit: 0, credit: amount.toString() },
            ]
          : [
              { accountCode, debit: amount.toString(), credit: 0 },
              { accountCode: OPENING_ACCOUNT_CODE, debit: 0, credit: amount.toString() },
            ];
        this.accounting.validateBalance(journalLines);

        const posted = await this.accounting.postJournalInTransaction(tx, {
          organizationId,
          date: new Date(line.date),
          reference: "OPENING-BALANCE-FINANCE",
          description: line.description?.trim() || "Opening balance import (finance)",
          isFinal: true,
          lines: journalLines,
        });
        transactionIds.push(posted.transactionId);
      }

      return { created: transactionIds.length, transactionIds };
    });
  }

  async importHr(
    organizationId: string,
    lines: OpeningBalanceHrLineDto[],
  ): Promise<{ created: number }> {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new BadRequestException("Payload must be a non-empty array");
    }

    return this.prisma.$transaction(async (tx) => {
      let created = 0;
      for (const row of lines) {
        const kind = row.kind ?? EmployeeKind.EMPLOYEE;
        if (kind === EmployeeKind.CONTRACTOR && !row.voen?.trim()) {
          throw new BadRequestException(
            "For CONTRACTOR, voen is required (10 digits)",
          );
        }
        await tx.employee.create({
          data: {
            organizationId,
            kind,
            finCode: row.finCode.trim(),
            firstName: row.firstName.trim(),
            lastName: row.lastName.trim(),
            patronymic: row.patronymic.trim(),
            positionId: row.positionId,
            startDate: new Date(row.hireDate), // baseline for Absences/Timesheet.
            hireDate: new Date(row.hireDate),
            salary: new Decimal(row.salary),
            initialVacationDays: new Decimal(row.initialVacationDays ?? 0),
            avgMonthlySalaryLastYear:
              row.avgMonthlySalaryLastYear != null
                ? new Decimal(row.avgMonthlySalaryLastYear)
                : null,
            initialSalaryBalance: new Decimal(row.initialSalaryBalance ?? 0),
            voen:
              kind === EmployeeKind.CONTRACTOR
                ? row.voen!.trim()
                : (row.voen?.trim() ?? null),
          },
        });
        created += 1;
      }
      return { created };
    });
  }

  async importInventory(
    organizationId: string,
    lines: OpeningBalanceInventoryLineDto[],
  ): Promise<{ created: number; transactionIds: string[] }> {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new BadRequestException("Payload must be a non-empty array");
    }

    return this.prisma.$transaction(async (tx) => {
      const opening = await this.ensureTechnicalOpeningAccount(tx, organizationId);
      let openingUpdatedAt = opening.updatedAt;
      const transactionIds: string[] = [];

      for (const line of lines) {
        const warehouse = await tx.warehouse.findFirst({
          where: { id: line.warehouseId, organizationId },
          select: { id: true, name: true, inventoryAccountCode: true },
        });
        if (!warehouse) {
          throw new NotFoundException(`Warehouse ${line.warehouseId} not found`);
        }
        const product = await tx.product.findFirst({
          where: { id: line.productId, organizationId },
          select: { id: true, name: true },
        });
        if (!product) {
          throw new NotFoundException(`Product ${line.productId} not found`);
        }

        const qty = new Decimal(line.quantity);
        const unit = new Decimal(line.costPrice);
        const amount = qty.mul(unit);
        const invAccountCode =
          warehouse.inventoryAccountCode === "204" ? "204" : "201";

        const currentItem = await tx.stockItem.findUnique({
          where: {
            organizationId_warehouseId_productId: {
              organizationId,
              warehouseId: warehouse.id,
              productId: product.id,
            },
          },
        });

        if (currentItem) {
          const q0 = currentItem.quantity;
          const c0 = currentItem.averageCost;
          const q1 = q0.add(qty);
          const c1 =
            q1.lte(0) ? new Decimal(0) : q0.lte(0)
              ? unit
              : q0.mul(c0).add(qty.mul(unit)).div(q1);
          const optimistic = await tx.stockItem.updateMany({
            where: {
              organizationId,
              warehouseId: warehouse.id,
              productId: product.id,
              updatedAt: currentItem.updatedAt,
            },
            data: {
              quantity: q1,
              averageCost: c1,
            },
          });
          if (optimistic.count !== 1) {
            throw new ConflictException(
              `Optimistic lock failed for stock item ${product.id}`,
            );
          }
        } else {
          await tx.stockItem.create({
            data: {
              organizationId,
              warehouseId: warehouse.id,
              productId: product.id,
              quantity: qty,
              averageCost: unit,
            },
          });
        }

        const nextTs = new Date();
        const touchedOpening = await tx.account.updateMany({
          where: {
            id: opening.id,
            updatedAt: openingUpdatedAt,
          },
          data: {
            nameAz: opening.nameAz,
            nameRu: opening.nameRu,
            nameEn: opening.nameEn,
            updatedAt: nextTs,
          },
        });
        if (touchedOpening.count !== 1) {
          throw new ConflictException("Optimistic lock failed for account 000");
        }
        openingUpdatedAt = nextTs;

        const journalLines: PostTransactionLine[] = [
          { accountCode: invAccountCode, debit: amount.toString(), credit: 0 },
          { accountCode: OPENING_ACCOUNT_CODE, debit: 0, credit: amount.toString() },
        ];
        // Guard math integrity before persisting stock/ledger records.
        this.accounting.validateBalance(journalLines);

        await tx.stockMovement.create({
          data: {
            organizationId,
            warehouseId: warehouse.id,
            productId: product.id,
            type: StockMovementType.IN,
            reason: StockMovementReason.ADJUSTMENT,
            quantity: qty,
            price: unit,
            note: "OPENING_BALANCE_INVENTORY",
            documentDate: new Date(),
          },
        });

        const posted = await this.accounting.postJournalInTransaction(tx, {
          organizationId,
          date: new Date(),
          reference: "OPENING-BALANCE-INVENTORY",
          description: `Opening inventory import (${warehouse.name}/${product.name})`,
          isFinal: true,
          lines: journalLines,
        });
        transactionIds.push(posted.transactionId);
      }

      return { created: transactionIds.length, transactionIds };
    });
  }
}
