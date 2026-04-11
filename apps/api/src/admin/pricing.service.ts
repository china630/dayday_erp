import { Injectable } from "@nestjs/common";
import { seedPricingModuleIfEmpty } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { SystemConfigService } from "../system-config/system-config.service";

/**
 * Каталог модулей: источник правды — таблица `pricing_modules` (v12.4).
 * При пустой таблице выполняется то же первичное наполнение, что и в `prisma db seed`
 * (`seedPricingModuleIfEmpty` в @dayday/database).
 */
export type ConstructorModuleRow = {
  id: string;
  key: string;
  name: string;
  /** Дублирует pricePerMonth для API/ТЗ */
  priceMonthly: number;
  pricePerMonth: number;
  sortOrder: number;
};

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  /**
   * Пустая `pricing_modules` → `seedPricingModuleIfEmpty`; иначе только БД (v12.7).
   */
  async ensurePricingModulesFromDatabase(): Promise<void> {
    await seedPricingModuleIfEmpty(this.prisma);
  }

  /**
   * Базовая цена (SystemConfig) и модули из `pricing_modules`.
   */
  async getConstructorData(): Promise<{
    basePrice: number;
    modules: ConstructorModuleRow[];
  }> {
    await this.ensurePricingModulesFromDatabase();
    const [basePrice, rows] = await Promise.all([
      this.systemConfig.getFoundationMonthlyAzn(),
      this.prisma.pricingModule.findMany({ orderBy: { sortOrder: "asc" } }),
    ]);
    const modules: ConstructorModuleRow[] = rows.map((r) => {
      const pm = Number(r.pricePerMonth);
      return {
        id: r.id,
        key: r.key,
        name: r.name,
        priceMonthly: pm,
        pricePerMonth: pm,
        sortOrder: r.sortOrder,
      };
    });
    return { basePrice, modules };
  }

  /**
   * Полный сброс каталога модулей к дефолтам (Super-Admin «Pelsi sıfırla»).
   */
  async resetPricingCatalogToDefaults(): Promise<ConstructorModuleRow[]> {
    await this.prisma.pricingModule.deleteMany({});
    await this.ensurePricingModulesFromDatabase();
    const rows = await this.prisma.pricingModule.findMany({
      orderBy: { sortOrder: "asc" },
    });
    return rows.map((r) => {
      const pm = Number(r.pricePerMonth);
      return {
        id: r.id,
        key: r.key,
        name: r.name,
        priceMonthly: pm,
        pricePerMonth: pm,
        sortOrder: r.sortOrder,
      };
    });
  }
}
