import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@dayday/database";
import { prismaSoftDeleteExtension } from "./prisma-soft-delete.extension";
import { prismaTenantExtension } from "./prisma-tenant.extension";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Расширенный Prisma Client с tenant-фильтрацией.
 * Нельзя вызывать `Object.setPrototypeOf` на результате `$extends` — ломается движок Prisma (`_engine`).
 * Жизненный цикл вешаем на экземпляр через `Object.assign` (Nest вызывает `onModuleInit` на инжектируемом объекте).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      // Fail fast: without DB url the service cannot start and the app would crash later anyway.
      throw new Error("DATABASE_URL is required");
    }
    const pool = new Pool({ connectionString: url });
    // @prisma/adapter-pg currently bundles its own pg typings, which may differ from the app's pg typings.
    // Runtime object is compatible; we cast to avoid TS duplicate-type conflicts.
    const adapter = new PrismaPg(pool as unknown as never);
    super({ adapter });

    const extended = new PrismaClient({ adapter })
      .$extends(prismaTenantExtension)
      .$extends(prismaSoftDeleteExtension);
    Object.assign(extended, {
      onModuleInit: async () => {
        await extended.$connect();
      },
      onModuleDestroy: async () => {
        await extended.$disconnect();
        await pool.end();
      },
    });
    return extended as unknown as PrismaService;
  }

  /** Для `implements`; на рантайме используется колбэк из `Object.assign` на возвращённом клиенте. */
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
