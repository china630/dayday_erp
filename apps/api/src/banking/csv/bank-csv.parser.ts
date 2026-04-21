import { BankStatementLineType, Prisma } from "@dayday/database";

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

export type ParsedBankRow = {
  valueDate: Date | null;
  description: string;
  amount: Decimal;
  type: BankStatementLineType;
  counterpartyTaxId: string | null;
  raw: Record<string, string>;
};

function detectDelimiter(headerLine: string): string {
  const sc = (headerLine.match(/;/g) ?? []).length;
  const cm = (headerLine.match(/,/g) ?? []).length;
  return sc >= cm ? ";" : ",";
}

function norm(s: string): string {
  return s.replace(/^\uFEFF/, "").trim().toLowerCase();
}

/** Найти индекс колонки по нескольким возможным заголовкам (AZ/EN/RU). */
function colIndex(headers: string[], ...aliases: string[]): number {
  const h = headers.map((x) => norm(x));
  for (let i = 0; i < h.length; i++) {
    for (const a of aliases) {
      const na = norm(a);
      if (h[i] === na || h[i].includes(na) || na.includes(h[i])) return i;
    }
  }
  return -1;
}

function parseDateCell(v: string): Date | null {
  const t = v.trim();
  if (!t) return null;
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(t);
  if (iso) {
    const d = new Date(t.slice(0, 10));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmy = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/.exec(t);
  if (dmy) {
    const dd = Number(dmy[1]);
    const mm = Number(dmy[2]);
    let yy = Number(dmy[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function parseMoney(v: string): Decimal | null {
  const s = v.replace(/\s/g, "").replace(",", ".");
  if (!s || s === "-") return null;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return new Decimal(Math.abs(n));
}

/**
 * Универсальный парсер CSV банковских выписок (ABB, Pasha и др.): ; или ,,
 * Ожидаются колонки даты, описания, суммы (или дебет/кредит), опционально VÖEN.
 */
export function parseBankStatementCsv(content: string): ParsedBankRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const delim = detectDelimiter(lines[0]);
  const headerCells = lines[0].split(delim).map((c) => c.trim());
  const idxDate = colIndex(
    headerCells,
    "date",
    "tarix",
    "tarix tarixi",
    "операция",
    "əməliyyat tarixi",
    "posting date",
  );
  const idxDesc = colIndex(
    headerCells,
    "description",
    "təsvir",
    "назначение",
    "details",
    "ətraflı",
    "məzmun",
    "comment",
  );
  const idxDebit = colIndex(headerCells, "debit", "debet", "çıxılan", "debet");
  const idxCredit = colIndex(headerCells, "credit", "kredit", "daxil olan", "kredit");
  const idxAmount = colIndex(
    headerCells,
    "amount",
    "məbləğ",
    "sum",
    "сумма",
  );
  const idxVoen = colIndex(
    headerCells,
    "voen",
    "vöen",
    "taxid",
    "tax id",
    "inn",
    "tin",
  );

  const out: ParsedBankRow[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cells = lines[r].split(delim).map((c) => c.trim());
    const raw: Record<string, string> = {};
    headerCells.forEach((h, i) => {
      raw[h] = cells[i] ?? "";
    });

    const desc =
      idxDesc >= 0 ? (cells[idxDesc] ?? "") : cells.slice(1, -2).join(" ");
    let amount: Decimal | null = null;
    let type: BankStatementLineType = BankStatementLineType.INFLOW;

    if (idxDebit >= 0 && idxCredit >= 0) {
      const d = parseMoney(cells[idxDebit] ?? "");
      const c = parseMoney(cells[idxCredit] ?? "");
      if (c && c.gt(0)) {
        amount = c;
        type = BankStatementLineType.INFLOW;
      } else if (d && d.gt(0)) {
        amount = d;
        type = BankStatementLineType.OUTFLOW;
      }
    } else if (idxAmount >= 0) {
      const a = parseMoney(cells[idxAmount] ?? "");
      if (a) {
        amount = a;
        const n = Number.parseFloat((cells[idxAmount] ?? "").replace(/\s/g, "").replace(",", "."));
        type = n < 0 ? BankStatementLineType.OUTFLOW : BankStatementLineType.INFLOW;
      }
    }

    if (!amount || amount.lte(0)) continue;

    const vd =
      idxDate >= 0 ? parseDateCell(cells[idxDate] ?? "") : null;
    const voenRaw = idxVoen >= 0 ? (cells[idxVoen] ?? "").trim() : null;
    const voenDigits = voenRaw?.replace(/\D/g, "") ?? "";
    const counterpartyTaxId =
      voenDigits.length >= 10 ? voenDigits.slice(-10) : extractVoenFromText(desc);

    out.push({
      valueDate: vd,
      description: desc || "(no description)",
      amount,
      type,
      counterpartyTaxId,
      raw,
    });
  }

  return out;
}

function extractVoenFromText(text: string): string | null {
  const m = /\b(\d{10})\b/.exec(text.replace(/\s/g, " "));
  return m ? m[1] : null;
}
