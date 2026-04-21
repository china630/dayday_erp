import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import {
  BankStatementChannel,
  BankStatementLineOrigin,
  type BankStatementLineType,
  type Prisma,
  Prisma as DbPrisma,
} from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { BankMatchService } from "./bank-match.service";
import {
  fetchMockAbbTransactions,
  fetchMockPashaTransactions,
} from "./bank-mock-providers";

export type DirectSyncTrigger = "manual" | "cron" | "webhook";

export type InboundBankTransaction = {
  integrationKey: string;
  amount: DbPrisma.Decimal;
  type: BankStatementLineType;
  counterpartyTaxId: string | null;
  valueDate: Date;
  description: string | null;
};

type Decimal = DbPrisma.Decimal;
const Decimal = DbPrisma.Decimal;

function asSettingsRecord(v: unknown): Record<string, unknown> {
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    return { ...(v as Record<string, unknown>) };
  }
  return {};
}

@Injectable()
export class BankIntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bankMatch: BankMatchService,
    private readonly config: ConfigService,
  ) {}

  async ensureWebhookSecret(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { bankWebhookSecret: true },
    });
    if (!org) throw new NotFoundException("Organization not found");
    if (org.bankWebhookSecret?.trim()) return org.bankWebhookSecret;
    const secret = randomUUID();
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { bankWebhookSecret: secret },
    });
    return secret;
  }

  getPublicApiBaseUrl(): string {
    const raw = this.config.get<string>("API_PUBLIC_BASE_URL");
    if (raw?.trim()) return raw.replace(/\/$/, "");
    const port = this.config.get<string>("API_PORT", "4000");
    return `http://127.0.0.1:${port}`;
  }

  async getSyncStatus(organizationId: string) {
    await this.ensureWebhookSecret(organizationId);
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true, bankWebhookSecret: true },
    });
    if (!org) throw new NotFoundException("Organization not found");
    const root = asSettingsRecord(org.settings);
    const direct = asSettingsRecord(root.bankingDirect);
    const secret = org.bankWebhookSecret ?? "";
    const base = this.getPublicApiBaseUrl();
    return {
      lastSyncAt: (direct.lastSyncAt as string) ?? null,
      lastSyncStatus: (direct.lastSyncStatus as string) ?? null,
      lastSyncError: (direct.lastSyncError as string) ?? null,
      lastSyncTrigger: (direct.lastSyncTrigger as string) ?? null,
      webhookUrl: secret ? `${base}/api/public/banking/webhook/${secret}` : null,
    };
  }

  private async patchBankingDirectSettings(
    organizationId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    if (!org) return;
    const root = asSettingsRecord(org.settings);
    const prev = asSettingsRecord(root.bankingDirect);
    root.bankingDirect = { ...prev, ...patch };
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { settings: root as Prisma.InputJsonValue },
    });
  }

  private async nextMockTick(organizationId: string): Promise<number> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    if (!org) return 1;
    const root = asSettingsRecord(org.settings);
    const direct = asSettingsRecord(root.bankingDirect);
    const tick = Number(direct.mockTick ?? 0) + 1;
    await this.patchBankingDirectSettings(organizationId, { mockTick: tick });
    return tick;
  }

  /**
   * Импорт строк из Direct API / вебхука. Возвращает id созданных строк (для автосверки).
   */
  async ingestTransactions(
    organizationId: string,
    bankName: string,
    source: DirectSyncTrigger,
    transactions: InboundBankTransaction[],
  ): Promise<{ createdLineIds: string[]; skipped: number }> {
    if (transactions.length === 0) {
      return { createdLineIds: [], skipped: 0 };
    }

    const createdLineIds: string[] = [];
    let skipped = 0;

    await this.prisma.$transaction(async (tx) => {
      const fresh: InboundBankTransaction[] = [];
      for (const t of transactions) {
        const dup = await tx.bankStatementLine.findFirst({
          where: { organizationId, integrationKey: t.integrationKey },
        });
        if (dup) skipped += 1;
        else fresh.push(t);
      }
      if (fresh.length === 0) return;

      let sum = new Decimal(0);
      let dMax: Date | null = null;
      for (const t of fresh) {
        sum = sum.add(t.amount);
        if (!dMax || t.valueDate > dMax) dMax = t.valueDate;
      }

      const stmt = await tx.bankStatement.create({
        data: {
          organizationId,
          date: dMax ?? new Date(),
          totalAmount: sum,
          bankName,
          channel: BankStatementChannel.BANK,
          sourceFileName: `direct:${source}:${new Date().toISOString().slice(0, 19)}`,
        },
      });

      for (const t of fresh) {
        const line = await tx.bankStatementLine.create({
          data: {
            organizationId,
            bankStatementId: stmt.id,
            description: t.description,
            amount: t.amount,
            type: t.type,
            origin: BankStatementLineOrigin.DIRECT_SYNC,
            counterpartyTaxId: t.counterpartyTaxId,
            valueDate: t.valueDate,
            integrationKey: t.integrationKey,
            rawRow: {
              source: "direct_banking",
              trigger: source,
              bankName,
            } as Prisma.InputJsonValue,
          },
        });
        createdLineIds.push(line.id);
      }
    });

    return { createdLineIds, skipped };
  }

  async runMockBankPoll(organizationId: string, trigger: DirectSyncTrigger) {
    const tick = await this.nextMockTick(organizationId);
    const pashaName = "Pasha Bank";
    const abbName = "ABB";

    const pashaTx = fetchMockPashaTransactions(organizationId, tick).map(
      (x) => ({
        ...x,
        description: x.description,
      }),
    );
    const abbTx = fetchMockAbbTransactions(organizationId, tick);

    const created: string[] = [];
    let skipped = 0;

    if (pashaTx.length > 0) {
      const r = await this.ingestTransactions(
        organizationId,
        pashaName,
        trigger,
        pashaTx,
      );
      created.push(...r.createdLineIds);
      skipped += r.skipped;
    }
    if (abbTx.length > 0) {
      const r = await this.ingestTransactions(
        organizationId,
        abbName,
        trigger,
        abbTx,
      );
      created.push(...r.createdLineIds);
      skipped += r.skipped;
    }

    let autoMatched = 0;
    for (const lineId of created) {
      const m = await this.bankMatch.tryAutoMatchLine(organizationId, lineId);
      if (m.autoMatched) autoMatched += 1;
    }

    return {
      tick,
      newLines: created.length,
      skippedDuplicates: skipped,
      autoMatched,
    };
  }

  async runDirectSync(
    organizationId: string,
    trigger: DirectSyncTrigger,
  ): Promise<Record<string, unknown>> {
    await this.ensureWebhookSecret(organizationId);
    const started = new Date().toISOString();
    try {
      const result = await this.runMockBankPoll(organizationId, trigger);
      await this.patchBankingDirectSettings(organizationId, {
        lastSyncAt: started,
        lastSyncStatus: "ok",
        lastSyncError: null,
        lastSyncTrigger: trigger,
      });
      return { ok: true, trigger, ...result };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.patchBankingDirectSettings(organizationId, {
        lastSyncAt: started,
        lastSyncStatus: "error",
        lastSyncError: msg,
        lastSyncTrigger: trigger,
      });
      throw e;
    }
  }

  async processWebhook(
    secret: string,
    body: {
      bankName: string;
      transactions: Array<{
        externalId: string;
        amount: string;
        type: BankStatementLineType;
        counterpartyTaxId?: string;
        valueDate?: string;
        description?: string;
      }>;
    },
  ) {
    const org = await this.prisma.organization.findFirst({
      where: { bankWebhookSecret: secret },
      select: { id: true },
    });
    if (!org) throw new NotFoundException("Invalid webhook secret");

    const bankName = body.bankName?.trim();
    if (!bankName) throw new BadRequestException("bankName required");
    if (!Array.isArray(body.transactions)) {
      throw new BadRequestException("transactions array required");
    }

    const inbound: InboundBankTransaction[] = [];
    for (const t of body.transactions) {
      const ext = t.externalId?.trim();
      if (!ext) throw new BadRequestException("Each transaction needs externalId");
      let amt: Decimal;
      try {
        amt = new Decimal(t.amount);
      } catch {
        throw new BadRequestException(`Invalid amount: ${t.amount}`);
      }
      if (amt.lte(0)) {
        throw new BadRequestException("amount must be positive");
      }
      let valueDate = new Date();
      if (t.valueDate?.trim()) {
        const d = new Date(t.valueDate.trim());
        if (Number.isNaN(d.getTime())) {
          throw new BadRequestException("Invalid valueDate");
        }
        valueDate = d;
      }
      inbound.push({
        integrationKey: `${bankName}:${ext}`.replace(/\s+/g, "_"),
        amount: amt,
        type: t.type,
        counterpartyTaxId: t.counterpartyTaxId?.trim() || null,
        valueDate,
        description: t.description?.trim() ?? null,
      });
    }

    const { createdLineIds, skipped } = await this.ingestTransactions(
      org.id,
      bankName,
      "webhook",
      inbound,
    );

    let autoMatched = 0;
    for (const lineId of createdLineIds) {
      const m = await this.bankMatch.tryAutoMatchLine(org.id, lineId);
      if (m.autoMatched) autoMatched += 1;
    }

    await this.patchBankingDirectSettings(org.id, {
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: "ok",
      lastSyncError: null,
      lastSyncTrigger: "webhook",
    });

    return {
      accepted: true,
      createdLines: createdLineIds.length,
      skippedDuplicates: skipped,
      autoMatched,
    };
  }

  async runHourlySyncAllOrganizations(): Promise<void> {
    const orgs = await this.prisma.organization.findMany({
      select: { id: true },
    });
    for (const o of orgs) {
      try {
        await this.runDirectSync(o.id, "cron");
      } catch {
        // статус ошибки уже записан в settings
      }
    }
  }
}
