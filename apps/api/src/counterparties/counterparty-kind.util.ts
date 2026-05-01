import { CounterpartyKind, CounterpartyLegalForm } from "@dayday/database";

/** Физ./юр. лицо выводится из ОПФ: только `INDIVIDUAL` (F/Ш) → `CounterpartyKind.INDIVIDUAL`. */
export function counterpartyKindFromLegalForm(
  lf: CounterpartyLegalForm,
): CounterpartyKind {
  return lf === CounterpartyLegalForm.INDIVIDUAL
    ? CounterpartyKind.INDIVIDUAL
    : CounterpartyKind.LEGAL_ENTITY;
}
