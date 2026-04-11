import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { BankingCredentialsService } from "./banking-credentials.service";
import type { BankingDirectRestBankConfig } from "./bank-providers/bank-rest.types";
import type { PatchBankingDirectBankDto, PatchBankingDirectDto } from "./dto/patch-banking-direct.dto";

function asRecord(v: unknown): Record<string, unknown> {
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    return { ...(v as Record<string, unknown>) };
  }
  return {};
}

export type BankingDirectBankMasked = {
  enabled: boolean;
  url: string;
  hasToken: boolean;
};

export type BankingDirectSettingsView = {
  syncMode: "mock" | "rest";
  pasha: BankingDirectBankMasked;
  abb: BankingDirectBankMasked;
  kapital: BankingDirectBankMasked;
  /** Хотя бы один банк с URL и токеном (в БД или только env не учитываем здесь) */
  syncActive: boolean;
  credentialsEncryptionConfigured: boolean;
};

@Injectable()
export class BankingDirectSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: BankingCredentialsService,
  ) {}

  async getView(organizationId: string): Promise<BankingDirectSettingsView> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    if (!org) throw new NotFoundException("Organization not found");
    const root = asRecord(org.settings);
    const direct = asRecord(root.bankingDirect);

    const syncMode = direct.syncMode === "rest" ? "rest" : "mock";

    const pasha = this.maskBank(direct.pasha);
    const abb = this.maskBank(direct.abb);
    const kapital = this.maskBank(direct.kapital);

    const syncActive = [pasha, abb, kapital].some(
      (b) => b.url.trim() !== "" && b.hasToken,
    );

    return {
      syncMode,
      pasha,
      abb,
      kapital,
      syncActive,
      credentialsEncryptionConfigured: this.crypto.isConfigured(),
    };
  }

  private maskBank(raw: unknown): BankingDirectBankMasked {
    const b = raw as BankingDirectRestBankConfig | undefined;
    const enabled = b?.enabled !== false;
    const url = typeof b?.url === "string" ? b.url : "";
    const tok = typeof b?.token === "string" ? b.token.trim() : "";
    const hasToken = tok.length > 0;
    return { enabled, url, hasToken };
  }

  async patch(
    organizationId: string,
    dto: PatchBankingDirectDto,
  ): Promise<BankingDirectSettingsView> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    if (!org) throw new NotFoundException("Organization not found");

    const root = asRecord(org.settings);
    const prev = asRecord(root.bankingDirect);

    if (dto.syncMode !== undefined) {
      prev.syncMode = dto.syncMode;
    }

    this.mergeBank(prev, "pasha", dto.pasha);
    this.mergeBank(prev, "abb", dto.abb);
    this.mergeBank(prev, "kapital", dto.kapital);

    root.bankingDirect = prev;

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { settings: root as Prisma.InputJsonValue },
    });

    return this.getView(organizationId);
  }

  private mergeBank(
    direct: Record<string, unknown>,
    key: "pasha" | "abb" | "kapital",
    dto: PatchBankingDirectBankDto | undefined,
  ): void {
    if (!dto) return;
    const cur = asRecord(direct[key]);

    if (dto.enabled !== undefined) {
      cur.enabled = dto.enabled;
    }
    if (dto.url !== undefined) {
      cur.url = dto.url === null ? "" : String(dto.url).trim();
    }

    if (dto.clearToken === true) {
      delete cur.token;
    } else if (dto.token !== undefined && dto.token !== null) {
      const t = dto.token.trim();
      if (t.length > 0) {
        const enc = this.crypto.encryptForStorage(t);
        if (enc !== undefined) {
          cur.token = enc;
        }
      }
    }

    direct[key] = cur;
  }
}
