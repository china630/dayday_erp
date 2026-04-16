import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@dayday/database";
import { prismaSoftDeleteExtension } from "./prisma-soft-delete.extension";
import { prismaTenantExtension } from "./prisma-tenant.extension";

/**
 * Расширенный Prisma Client с tenant-фильтрацией.
 * Нельзя вызывать `Object.setPrototypeOf` на результате `$extends` — ломается движок Prisma (`_engine`).
 * Жизненный цикл вешаем на экземпляр через `Object.assign` (Nest вызывает `onModuleInit` на инжектируемом объекте).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
    const extended = new PrismaClient()
      .$extends(prismaTenantExtension)
      .$extends(prismaSoftDeleteExtension);
    Object.assign(extended, {
      onModuleInit: async () => {
        await extended.$connect();
      },
      onModuleDestroy: async () => {
        await extended.$disconnect();
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
