import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { CbarRateStatus, Decimal } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { CbarFxService, type CbarLatestRate, type ParsedCbarDoc } from "./cbar-fx.service";

const CHECK_CODES = ["USD", "EUR"] as const;

function eqValue4(a: Decimal | number, b: Decimal | number): boolean {
  const da = a instanceof Decimal ? a : new Decimal(a);
  const db = b instanceof Decimal ? b : new Decimal(b);
  return da.toDecimalPlaces(4).equals(db.toDecimalPlaces(4));
}

/** DD.MM.YYYY из XML → дата для @db.Date (UTC полдень). */
export function bakuDdMmYyyyToRateDate(ddMmYyyy: string): Date {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(ddMmYyyy.trim());
  if (!m) {
    throw new Error(`Invalid CBAR date: ${ddMmYyyy}`);
  }
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

function previousUtcDate(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1, 12, 0, 0, 0),
  );
}

/**
 * Сохранение курсов ЦБА в БД: PRELIMINARY если USD и EUR (Value) совпадают с предыдущим днём до 4-го знака;
 * после обновления XML (cron после 10:00) при изменении — перевод в FINAL.
 */
@Injectable()
export class CbarRateSyncService {
  private readonly logger = new Logger(CbarRateSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cbar: CbarFxService,
  ) {}

  /** Синхронизация по «сегодня» в URL (якорь); в БД пишется дата из атрибута Date в XML. */
  async syncTodayFromCbar(): Promise<void> {
    await this.ingestFromNetworkAnchor(new Date());
  }

  async ingestFromNetworkAnchor(anchorDate: Date): Promise<void> {
    const url = this.cbar.buildCbarUrl(anchorDate);
    const body = await this.cbar.fetchCbarXmlBodyForDate(anchorDate);
    if (!body) {
      this.logger.debug("CBAR sync: no document / no Date attribute");
      return;
    }
    const doc = this.cbar.parseCbarXmlLogged(body, url);
    if (!doc?.publishedDateBaku) {
      this.logger.debug("CBAR sync: no document / no Date attribute");
      return;
    }
    await this.persistParsedDoc(doc);
  }

  async persistParsedDoc(doc: ParsedCbarDoc): Promise<void> {
    const pub = doc.publishedDateBaku;
    if (!pub) return;
    const rateDate = bakuDdMmYyyyToRateDate(pub);
    const status = await this.resolveStatusForDay(rateDate, doc);

    for (const r of doc.rates) {
      const code = r.code.trim().toUpperCase();
      if (!code) continue;
      const value = new Decimal(r.value);
      const rate = new Decimal(r.rate);
      await this.prisma.cbarOfficialRate.upsert({
        where: {
          rateDate_currencyCode: { rateDate, currencyCode: code },
        },
        create: {
          rateDate,
          currencyCode: code,
          value,
          nominal: r.nominal,
          rate,
          status,
        },
        update: {
          value,
          nominal: r.nominal,
          rate,
          status,
        },
      });
    }

    this.logger.log(
      `CBAR rates upserted date=${pub} rows=${doc.rates.length} status=${status}`,
    );
  }

  /**
   * Курс AZN за 1 ед. валюты из БД; только FINAL (для переоценки и жёсткой бухгалтерии).
   */
  async getFinalOfficialAznPerUnit(
    currencyCode: string,
    date: Date,
  ): Promise<number> {
    const upper = currencyCode.trim().toUpperCase();
    if (upper === "AZN" || upper === "AZM") {
      return 1;
    }
    const key = this.cbar.formatBakuDate(date);
    const rateDate = bakuDdMmYyyyToRateDate(key);
    const row = await this.prisma.cbarOfficialRate.findUnique({
      where: {
        rateDate_currencyCode: { rateDate, currencyCode: upper },
      },
    });
    if (!row || row.status !== CbarRateStatus.FINAL) {
      throw new BadRequestException(
        `CBAR: нет FINAL курса для ${upper} на дату ${key} (нужна синхронизация ЦБА или ожидание финализации)`,
      );
    }
    return Number(row.rate);
  }

  private async resolveStatusForDay(
    rateDate: Date,
    doc: ParsedCbarDoc,
  ): Promise<CbarRateStatus> {
    const existing = await this.prisma.cbarOfficialRate.findFirst({
      where: { rateDate },
    });
    if (existing?.status === CbarRateStatus.FINAL) {
      return CbarRateStatus.FINAL;
    }

    if (existing?.status === CbarRateStatus.PRELIMINARY) {
      if (await this.storedMainChangedVsDoc(doc, rateDate)) {
        return CbarRateStatus.FINAL;
      }
    }

    const prevDate = previousUtcDate(rateDate);
    const prevUsd = await this.prisma.cbarOfficialRate.findUnique({
      where: {
        rateDate_currencyCode: {
          rateDate: prevDate,
          currencyCode: "USD",
        },
      },
    });
    const prevEur = await this.prisma.cbarOfficialRate.findUnique({
      where: {
        rateDate_currencyCode: {
          rateDate: prevDate,
          currencyCode: "EUR",
        },
      },
    });

    const newUsd = doc.rates.find((x) => x.code.toUpperCase() === "USD");
    const newEur = doc.rates.find((x) => x.code.toUpperCase() === "EUR");

    if (!prevUsd || !prevEur || !newUsd || !newEur) {
      return CbarRateStatus.FINAL;
    }

    const usdMatch = eqValue4(prevUsd.value, newUsd.value);
    const eurMatch = eqValue4(prevEur.value, newEur.value);
    if (usdMatch && eurMatch) {
      return CbarRateStatus.PRELIMINARY;
    }
    return CbarRateStatus.FINAL;
  }

  /**
   * Последняя запись по валюте в cbar_official_rates (для дашборда при недоступности live ЦБА).
   */
  async getLatestFromDbForCode(currencyCode: string): Promise<CbarLatestRate | null> {
    const upper = currencyCode.trim().toUpperCase();
    const row = await this.prisma.cbarOfficialRate.findFirst({
      where: { currencyCode: upper },
      orderBy: { rateDate: "desc" },
    });
    if (!row) {
      return null;
    }
    return {
      currencyCode: upper,
      value: Number(row.value),
      nominal: row.nominal,
      rate: Number(row.rate),
      rateDateBaku: this.cbar.formatBakuDate(row.rateDate),
      isFallback: true,
    };
  }

  /**
   * Последние сохранённые в БД курсы USD/EUR (когда ЦБА временно недоступен).
   */
  async getUsdEurFromDbCache(): Promise<{
    usd: CbarLatestRate;
    eur: CbarLatestRate;
  } | null> {
    const [usd, eur] = await Promise.all([
      this.getLatestFromDbForCode("USD"),
      this.getLatestFromDbForCode("EUR"),
    ]);
    if (!usd || !eur) {
      return null;
    }
    return { usd, eur };
  }

  private async storedMainChangedVsDoc(
    doc: ParsedCbarDoc,
    rateDate: Date,
  ): Promise<boolean> {
    for (const code of CHECK_CODES) {
      const row = await this.prisma.cbarOfficialRate.findUnique({
        where: {
          rateDate_currencyCode: { rateDate, currencyCode: code },
        },
      });
      const fresh = doc.rates.find((x) => x.code.toUpperCase() === code);
      if (row && fresh && !eqValue4(row.value, fresh.value)) {
        return true;
      }
    }
    return false;
  }
}
