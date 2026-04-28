import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import Redis from "ioredis";

type ExecuteParams<T> = {
  provider: string;
  operation: string;
  request: () => Promise<T>;
  writeIdempotencyKey?: string | null;
};

@Injectable()
export class IntegrationReliabilityService {
  private readonly logger = new Logger(IntegrationReliabilityService.name);
  private readonly redis: Redis;
  private readonly breakerThreshold = 3;
  private readonly breakerOpenMs = 5 * 60 * 1000;
  private readonly maxAttempts = 3;
  private readonly backoffBaseMs = 300;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.get<string>("REDIS_URL", "redis://127.0.0.1:6379"), {
      maxRetriesPerRequest: 2,
      enableReadyCheck: false,
    });
  }

  async executeWithPolicies<T>(params: ExecuteParams<T>): Promise<T> {
    const provider = params.provider.toLowerCase();
    await this.ensureCircuitClosed(provider);
    if (params.writeIdempotencyKey?.trim()) {
      await this.claimIdempotency(provider, params.operation, params.writeIdempotencyKey.trim());
    }

    const start = Date.now();
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const result = await params.request();
        await this.onSuccess(provider, Date.now() - start);
        return result;
      } catch (error) {
        lastError = error;
        const status = this.extractStatus(error);
        const transient = this.isTransient(error, status);
        if (!transient || attempt >= this.maxAttempts) {
          await this.onFailure(provider, Date.now() - start, status);
          throw error;
        }
        await this.sleep(this.backoffBaseMs * 2 ** (attempt - 1));
      }
    }
    await this.onFailure(provider, Date.now() - start, this.extractStatus(lastError));
    throw lastError;
  }

  async trackCache(provider: string, hit: boolean): Promise<void> {
    const p = provider.toLowerCase();
    await this.redis.incr(this.key(p, "cache_total"));
    if (hit) await this.redis.incr(this.key(p, "cache_hit"));
  }

  async getProvidersHealthSnapshot(providers: string[]): Promise<
    Array<{
      provider: string;
      lastSync: string | null;
      latencyMs: number | null;
      currentStatus: "Up" | "Down" | "Degraded";
      providerSuccessRate: number;
      cacheHitRate: number | null;
    }>
  > {
    return Promise.all(
      providers.map(async (providerRaw) => {
        const provider = providerRaw.toLowerCase();
        const openUntil = Number(await this.redis.get(this.key(provider, "open_until")));
        const now = Date.now();
        const total = Number(await this.redis.get(this.key(provider, "total")));
        const success = Number(await this.redis.get(this.key(provider, "success")));
        const lastFailureAt = Number(await this.redis.get(this.key(provider, "last_failure_at")));
        const latency = Number(await this.redis.get(this.key(provider, "last_latency_ms")));
        const cacheTotal = Number(await this.redis.get(this.key(provider, "cache_total")));
        const cacheHit = Number(await this.redis.get(this.key(provider, "cache_hit")));
        const successRate = total > 0 ? success / total : 1;
        const degraded =
          (lastFailureAt > 0 && now - lastFailureAt < 5 * 60 * 1000) ||
          (total >= 5 && successRate < 0.8);
        const currentStatus =
          openUntil > now ? "Down" : degraded ? "Degraded" : "Up";
        return {
          provider: providerRaw,
          lastSync:
            Number(await this.redis.get(this.key(provider, "last_success_at"))) > 0
              ? new Date(
                  Number(await this.redis.get(this.key(provider, "last_success_at"))),
                ).toISOString()
              : null,
          latencyMs: Number.isFinite(latency) && latency > 0 ? latency : null,
          currentStatus,
          providerSuccessRate: Number(successRate.toFixed(4)),
          cacheHitRate:
            cacheTotal > 0 ? Number((cacheHit / cacheTotal).toFixed(4)) : null,
        };
      }),
    );
  }

  private async ensureCircuitClosed(provider: string): Promise<void> {
    const openUntil = Number(await this.redis.get(this.key(provider, "open_until")));
    if (openUntil > Date.now()) {
      throw new ServiceUnavailableException(
        `Circuit breaker is OPEN for ${provider} until ${new Date(openUntil).toISOString()}`,
      );
    }
  }

  private async claimIdempotency(
    provider: string,
    operation: string,
    key: string,
  ): Promise<void> {
    const redisKey = `${this.key(provider, "idempotency")}:${operation}:${key}`;
    const ok = await this.redis.set(redisKey, "1", "EX", 10 * 60, "NX");
    if (ok !== "OK") {
      throw new ConflictException("Duplicate idempotent request");
    }
  }

  private async onSuccess(provider: string, latencyMs: number): Promise<void> {
    await this.redis.multi()
      .incr(this.key(provider, "total"))
      .incr(this.key(provider, "success"))
      .set(this.key(provider, "last_latency_ms"), String(latencyMs))
      .set(this.key(provider, "last_success_at"), String(Date.now()))
      .set(this.key(provider, "consecutive_5xx"), "0")
      .exec();
    await this.logProviderSuccessRate(provider);
  }

  private async onFailure(
    provider: string,
    latencyMs: number,
    statusCode: number | null,
  ): Promise<void> {
    const pipeline = this.redis.multi()
      .incr(this.key(provider, "total"))
      .incr(this.key(provider, "failure"))
      .set(this.key(provider, "last_latency_ms"), String(latencyMs))
      .set(this.key(provider, "last_failure_at"), String(Date.now()))
      .set(this.key(provider, "last_failure_status"), String(statusCode ?? 0));

    let consecutive = 0;
    if (statusCode != null && statusCode >= 500) {
      const r = await this.redis.incr(this.key(provider, "consecutive_5xx"));
      consecutive = Number(r);
    } else {
      await this.redis.set(this.key(provider, "consecutive_5xx"), "0");
    }
    await pipeline.exec();
    if (consecutive >= this.breakerThreshold) {
      await this.redis.set(
        this.key(provider, "open_until"),
        String(Date.now() + this.breakerOpenMs),
        "PX",
        this.breakerOpenMs,
      );
    }
    await this.logProviderSuccessRate(provider);
  }

  private async logProviderSuccessRate(provider: string): Promise<void> {
    const total = Number(await this.redis.get(this.key(provider, "total")));
    const success = Number(await this.redis.get(this.key(provider, "success")));
    const rate = total > 0 ? success / total : 1;
    this.logger.log(
      `provider_success_rate provider=${provider} rate=${rate.toFixed(4)} total=${total}`,
    );
  }

  private key(provider: string, suffix: string): string {
    return `integration:${provider}:${suffix}`;
  }

  private extractStatus(error: unknown): number | null {
    if (axios.isAxiosError(error)) return error.response?.status ?? null;
    if (typeof error === "object" && error !== null && "status" in error) {
      const status = (error as { status?: unknown }).status;
      return typeof status === "number" ? status : null;
    }
    return null;
  }

  private isTransient(error: unknown, statusCode: number | null): boolean {
    if (statusCode != null) {
      return statusCode === 429 || statusCode >= 500;
    }
    if (axios.isAxiosError(error)) {
      return true;
    }
    return false;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

