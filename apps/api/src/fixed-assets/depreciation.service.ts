import { Injectable } from "@nestjs/common";
import { Decimal, Prisma } from "@dayday/database";
import { AccountingService } from "../accounting/accounting.service";
import {
  ACCUMULATED_DEPRECIATION_ACCOUNT_CODE,
  DEPRECIATION_EXPENSE_ACCOUNT_CODE,
} from "../ledger.constants";
import { monthRangeUtc } from "../reporting/reporting-period.util";
import { roundMoney2 } from "./decimal-round";

@Injectable()
export class DepreciationService {
  constructor(private readonly accounting: AccountingService) {}

  /**
   * Начисление линейной амортизации за указанный месяц (до блокировки периода).
   * Одна проводка Дт 721 / Кт 112 на сумму по всем ОС.
   * Multi-GAAP: IFRS-тени создаёт AccountingService.translateToIFRS для 721 и 112,
   * если у всех задействованных NAS-счетов есть AccountMapping (как для зарплаты и склада).
   */
  async applyForClosedMonth(
    tx: Prisma.TransactionClient,
    organizationId: string,
    year: number,
    month: number,
  ): Promise<{ transactionId: string | null; totalAmount: string; assetsCount: number }> {
    const { end } = monthRangeUtc(year, month);
    const monthEnd = end;

    const assets = await tx.fixedAsset.findMany({
      where: { organizationId },
    });

    type Row = { assetId: string; amount: Decimal };
    const rows: Row[] = [];

    for (const a of assets) {
      const exists = await tx.fixedAssetDepreciationMonth.findUnique({
        where: {
          fixedAssetId_year_month: {
            fixedAssetId: a.id,
            year,
            month,
          },
        },
      });
      if (exists) continue;

      const comm = a.commissioningDate;
      if (comm.getTime() > monthEnd.getTime()) continue;

      const maxDep = new Decimal(a.initialCost).sub(a.salvageValue);
      if (maxDep.lte(0)) continue;

      const booked = new Decimal(a.bookedDepreciation);
      const remaining = maxDep.sub(booked);
      if (remaining.lte(0)) continue;

      const life = new Decimal(a.usefulLifeMonths);
      const monthly = roundMoney2(maxDep.div(life));
      let amount = monthly;
      if (amount.gt(remaining)) {
        amount = roundMoney2(remaining);
      }
      if (amount.lte(0)) continue;

      rows.push({ assetId: a.id, amount });
    }

    if (rows.length === 0) {
      return { transactionId: null, totalAmount: "0", assetsCount: 0 };
    }

    let total = new Decimal(0);
    const lines: { accountCode: string; debit: string; credit: string }[] = [];
    for (const r of rows) {
      total = total.add(r.amount);
      lines.push({
        accountCode: DEPRECIATION_EXPENSE_ACCOUNT_CODE,
        debit: r.amount.toString(),
        credit: "0",
      });
    }
    lines.push({
      accountCode: ACCUMULATED_DEPRECIATION_ACCOUNT_CODE,
      debit: "0",
      credit: roundMoney2(total).toString(),
    });

    const { transactionId } = await this.accounting.postJournalInTransaction(tx, {
      organizationId,
      date: monthEnd,
      reference: `DEPR-${year}-${String(month).padStart(2, "0")}`,
      description: `Амортизация ОС ${month}/${year}`,
      isFinal: true,
      lines,
    });

    for (const r of rows) {
      await tx.fixedAssetDepreciationMonth.create({
        data: {
          organizationId,
          fixedAssetId: r.assetId,
          year,
          month,
          amount: r.amount,
          transactionId,
        },
      });
      await tx.fixedAsset.update({
        where: { id: r.assetId },
        data: {
          bookedDepreciation: {
            increment: r.amount,
          },
        },
      });
    }

    return {
      transactionId,
      totalAmount: roundMoney2(total).toString(),
      assetsCount: rows.length,
    };
  }
}
