import { BankStatementLineType, Prisma } from "@dayday/database";
import type { InboundBankTransaction } from "../bank-providers/bank-inbound.types";
import type { BankTransactionAdapter } from "./bank-adapter.interface";

function parseIsoOrDateOnly(v: unknown): Date {
  if (v instanceof Date) return v;
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return new Date();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Типичные ответы OpenAPI / Berlin Group AIS */
export function extractTransactionItems(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (typeof json !== "object" || json === null) return [];
  const o = json as Record<string, unknown>;
  if (Array.isArray(o.transactions)) return o.transactions;
  if (o.transactions && typeof o.transactions === "object") {
    const t = o.transactions as Record<string, unknown>;
    const out: unknown[] = [];
    if (Array.isArray(t.booked)) out.push(...t.booked);
    if (Array.isArray(t.pending)) out.push(...t.pending);
    if (out.length > 0) return out;
  }
  if (Array.isArray(o.data)) return o.data;
  if (Array.isArray(o.items)) return o.items;
  if (Array.isArray(o.results)) return o.results;
  return [];
}

function readAmount(item: Record<string, unknown>): Prisma.Decimal | null {
  const raw = item.amount;
  if (raw != null && typeof raw === "object") {
    const a = raw as Record<string, unknown>;
    const s = a.amount ?? a.value ?? a.currencyAmount;
    if (s != null) {
      try {
        return new Prisma.Decimal(String(s));
      } catch {
        return null;
      }
    }
  }
  if (typeof raw === "string" || typeof raw === "number") {
    try {
      return new Prisma.Decimal(String(raw));
    } catch {
      return null;
    }
  }
  return null;
}

function readDirection(
  item: Record<string, unknown>,
): BankStatementLineType | null {
  const ind =
    item.creditDebitIndicator ?? item.direction ?? item.debitCreditIndicator;
  const s = typeof ind === "string" ? ind.toUpperCase() : "";
  if (s === "DBIT" || s === "DEBIT" || s === "OUT" || s === "DR")
    return BankStatementLineType.OUTFLOW;
  if (s === "CRDT" || s === "CREDIT" || s === "IN" || s === "CR")
    return BankStatementLineType.INFLOW;
  const t = item.type;
  if (typeof t === "string") {
    const u = t.toUpperCase();
    if (u.includes("DEBIT") || u.includes("OUT")) {
      return BankStatementLineType.OUTFLOW;
    }
    if (u.includes("CREDIT") || u.includes("IN")) {
      return BankStatementLineType.INFLOW;
    }
  }
  return null;
}

function readExternalId(item: Record<string, unknown>, index: number): string {
  const id =
    item.transactionId ??
    item.id ??
    item.entryReference ??
    item.reference ??
    item.endToEndId;
  if (typeof id === "string" && id.trim()) return id.trim();
  if (typeof id === "number") return String(id);
  return `row-${index}`;
}

function readDescription(item: Record<string, unknown>): string | null {
  const r = item.remittanceInformation;
  if (Array.isArray(r) && r.length > 0 && typeof r[0] === "string") {
    return r.join(" ").trim() || null;
  }
  if (typeof r === "string") return r.trim() || null;
  const add =
    item.additionalInformation ??
    item.description ??
    item.details ??
    item.narrative;
  if (typeof add === "string") return add.trim() || null;
  return null;
}

function readCounterpartyTaxId(item: Record<string, unknown>): string | null {
  const d = item.debtor;
  const c = item.creditor;
  const pick = (x: unknown): string | null => {
    if (typeof x !== "object" || x === null) return null;
    const o = x as Record<string, unknown>;
    const id =
      o.taxId ?? o.tax_id ?? o.identification ?? o.organizationId;
    if (typeof id === "string" && /^\d{10}$/.test(id.trim())) return id.trim();
    return null;
  };
  return pick(d) ?? pick(c);
}

/**
 * Универсальный адаптер JSON (Berlin Group / типичный Open Banking).
 * Банк-специфичные файлы могут заменить класс или наследовать и переопределять mapResponse.
 */
export class GenericJsonBankAdapter implements BankTransactionAdapter {
  constructor(readonly bankDisplayName: string) {}

  mapResponse(json: unknown): InboundBankTransaction[] {
    const items = extractTransactionItems(json);
    const prefix = this.bankDisplayName.replace(/\s+/g, "_");
    const out: InboundBankTransaction[] = [];
    for (let i = 0; i < items.length; i++) {
      const raw = items[i];
      if (typeof raw !== "object" || raw === null) continue;
      const item = raw as Record<string, unknown>;
      const amount = readAmount(item);
      if (!amount || amount.lte(0)) continue;
      const dir = readDirection(item);
      const type = dir ?? BankStatementLineType.INFLOW;
      const ext = readExternalId(item, i);
      const valueDate = parseIsoOrDateOnly(
        item.bookingDate ?? item.valueDate ?? item.date ?? item.bookingDateTime,
      );
      out.push({
        integrationKey: `${prefix}:${ext}`.replace(/\s+/g, "_"),
        amount,
        type,
        counterpartyTaxId: readCounterpartyTaxId(item),
        valueDate,
        description: readDescription(item),
      });
    }
    return out;
  }
}
