import { Injectable } from "@nestjs/common";
import { Decimal } from "@dayday/database";
import { CbarFxService } from "./cbar-fx.service";

/**
 * Консолидация сумм в валюту отчёта холдинга по курсу ЦБА (см. TZ §1.1, PRD §1.1).
 */
@Injectable()
export class CurrencyConverterService {
  constructor(private readonly cbar: CbarFxService) {}

  /**
   * Переводит сумму из `fromCurrency` в `toCurrency` на дату `asOf` (календарь Баку в CbarFxService).
   * Кросс-курс через AZN: from → AZN → to.
   */
  async convert(
    amount: Decimal,
    fromCurrency: string,
    toCurrency: string,
    asOf: Date,
  ): Promise<Decimal> {
    const from = fromCurrency.trim().toUpperCase();
    const to = toCurrency.trim().toUpperCase();
    if (from === to) return amount;
    const inAzn = await this.toAzn(amount, from, asOf);
    if (to === "AZN" || to === "AZM") return inAzn;
    const rateTo = await this.cbar.getLatestRate(to, asOf);
    const aznPerUnit = new Decimal(rateTo.rate);
    if (aznPerUnit.lte(0)) {
      throw new Error(
        `CBAR invalid rate for ${to} as of ${asOf.toISOString().slice(0, 10)}: ${rateTo.rate}`,
      );
    }
    return inAzn.div(aznPerUnit);
  }

  private async toAzn(amount: Decimal, from: string, asOf: Date): Promise<Decimal> {
    if (from === "AZN" || from === "AZM") return amount;
    const r = await this.cbar.getLatestRate(from, asOf);
    return amount.mul(new Decimal(r.rate));
  }
}
