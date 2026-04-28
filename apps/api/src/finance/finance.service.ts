import { Injectable } from "@nestjs/common";
import { LedgerType, UserRole } from "@dayday/database";
import { NettingService } from "../accounting/netting.service";

/**
 * Финансовые операции верхнего уровня (взаимозачёт и др.).
 * Реализация взаимозачёта — {@link NettingService}.
 */
@Injectable()
export class FinanceService {
  constructor(private readonly netting: NettingService) {}

  /** Кандидат на взаимозачёт: min(дебиторка 211, кредиторка 531) и признак возможности зачёта. */
  getNettingCandidate(
    organizationId: string,
    counterpartyId: string,
    ledgerType: LedgerType = LedgerType.NAS,
  ) {
    return this.netting.preview(organizationId, counterpartyId, ledgerType);
  }

  /** Проводка Дт 531 — Кт 211 и распределение по инвойсам (для отчётов по дебиторке). */
  executeNetting(
    organizationId: string,
    counterpartyId: string,
    amount: number,
    ledgerType: LedgerType = LedgerType.NAS,
    actingUserRole?: UserRole,
    audit?: { userId?: string; previewSuggestedAmount?: number },
  ) {
    return this.netting.createNetting(
      organizationId,
      counterpartyId,
      amount,
      ledgerType,
      actingUserRole,
      audit,
    );
  }
}
