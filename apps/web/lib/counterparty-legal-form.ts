/**
 * Плоский ключ i18n для подписи ОПФ — **строго** `counterparties.legalForm_${enum}` (нижний регистр),
 * в `resources.ts` вложено как `counterparties.legalForm_LLC`, `counterparties.legalForm_CJSC`, …
 */
export const COUNTERPARTY_LEGAL_FORM_I18N_PREFIX = "counterparties.legalForm_" as const;

export function counterpartyLegalFormI18nKey(value: string): string {
  return `${COUNTERPARTY_LEGAL_FORM_I18N_PREFIX}${value}`;
}

/** Синхрон с Prisma enum `CounterpartyLegalForm` (АР). */
export const COUNTERPARTY_LEGAL_FORMS = [
  "INDIVIDUAL",
  "LLC",
  "CJSC",
  "OJSC",
  "PUBLIC_LEGAL_ENTITY",
  "STATE_AGENCY",
  "NGO",
  "BRANCH",
  "HOA",
] as const;

export type CounterpartyLegalForm = (typeof COUNTERPARTY_LEGAL_FORMS)[number];
