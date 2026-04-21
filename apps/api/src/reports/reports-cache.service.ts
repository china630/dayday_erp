import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class ReportsCacheService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    const url = config.get<string>("REDIS_URL", "redis://127.0.0.1:6379");
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: false,
    });
  }

  async getJson<T>(key: string): Promise<T | null> {
    const v = await this.redis.get(key);
    if (!v) return null;
    return JSON.parse(v) as T;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}

