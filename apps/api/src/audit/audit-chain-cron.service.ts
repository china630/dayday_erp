import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { AuditService } from "./audit.service";

@Injectable()
export class AuditChainCronService {
  private readonly logger = new Logger(AuditChainCronService.name);

  constructor(
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  @Cron("0 2 * * *")
  async verifyAuditChainDaily(): Promise<void> {
    const res = await this.audit.verifyChain();
    if (res.compromisedOrganizations > 0) {
      const msg = `[CRITICAL] DayDay ERP: Обнаружено нарушение целостности Audit Log. Возможна ручная манипуляция в БД. Скомпрометированные ID: ${res.compromisedIds.join(",")}`;
      this.logger.error(
        `Audit chain check failed: ${res.compromisedOrganizations} organization(s), compromisedIds=${res.compromisedIds.join(",")}`,
      );
      await this.sendExternalCriticalAlert(msg, res.compromisedIds);
      return;
    }
    this.logger.log(
      `Audit chain check ok: scanned ${res.organizationsScanned} organization(s)`,
    );
  }

  private async sendExternalCriticalAlert(
    message: string,
    compromisedIds: string[],
  ): Promise<void> {
    const webhookUrl = this.config.get<string>("AUDIT_ALERT_WEBHOOK_URL", "").trim();
    if (!webhookUrl) {
      this.logger.warn(
        "AUDIT_ALERT_WEBHOOK_URL is not configured; critical audit alert sent to logs only",
      );
      return;
    }
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message,
          source: "audit-chain-cron",
          severity: "critical",
          compromisedIds,
          ts: new Date().toISOString(),
        }),
      });
    } catch (e) {
      this.logger.error(
        `Failed to send external audit alert: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
