import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { XMLParser } from "fast-xml-parser";
import axios from "axios";

/** Официальный каталог XML (на сайте ЦБА используется www). */
const CBAR_BASE = "https://www.cbar.az/currencies";

/** Заголовки для всех HTTP-запросов к cbar.az */
const CBAR_HTTP_HEADERS = {
  "User-Agent": "DayDayERP/0.1 (+https://dayday.local)",
  Accept: "application/xml, text/xml;q=0.9, */*;q=0.8",
} as const;

/** Максимум календарных дней назад при поиске курса (без сотен запросов). */
const CBAR_MAX_FALLBACK_DAYS = 5;

/** Верхняя граница экспоненциальной задержки после ошибок сети/парсинга (мс). */
const CBAR_BACKOFF_CAP_MS_DEFAULT = 3_600_000;

/** Лимит HTTP GET к cbar.az за скользящий час (защита от шторма при опросе UI). */
const CBAR_MAX_FETCHES_PER_HOUR_DEFAULT = 48;

export type CbarCurrencyRate = {
  code: string;
  /** Value из XML ЦБА (сырое значение к номиналу) */
  value: number;
  /** Nominal из XML — всегда сохраняется из источника */
  nominal: number;
  /** AZN за 1 единицу валюты: Value / Nominal */
  rate: number;
};

export type CbarLatestRate = {
  currencyCode: string;
  value: number;
  nominal: number;
  rate: number;
  /** Дата курса по атрибуту Date в XML (календарь ЦБА, DD.MM.YYYY) */
  rateDateBaku: string;
  /** true — взят курс более раннего дня, чем запрошенный календарный день в Баку */
  isFallback: boolean;
};

export type ParsedCbarDoc = {
  publishedDateBaku: string | null;
  rates: CbarCurrencyRate[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Бросается до любых обращений к cbar.az при TAX_LOOKUP_MOCK=1 (дашборд → только БД). */
export class CbarExternalFetchDisabledError extends Error {
  readonly code = "CBAR_EXTERNAL_FETCH_DISABLED" as const;
  constructor() {
    super("CBAR external fetch disabled (TAX_LOOKUP_MOCK=1)");
    this.name = "CbarExternalFetchDisabledError";
  }
}

/** DD.MM.YYYY → UTC noon для сравнения календарных дней */
function bakuDdMmYyyyToUtcNoon(ddMmYyyy: string): number | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(ddMmYyyy.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!month || month > 12 || !day) return null;
  return Date.UTC(year, month - 1, day, 12, 0, 0, 0);
}

/**
 * Новый формат ЦБА: Valute внутри ValType (Xarici valyutalar и т.д.);
 * старый — Valute сразу под ValCurs. Код валюты: CharCode (legacy) или @_Code.
 */
function collectValutesFromValCurs(root: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];

  const pushValutes = (raw: unknown) => {
    if (raw == null) return;
    const arr = Array.isArray(raw) ? raw : [raw];
    for (const item of arr) {
      if (item && typeof item === "object") {
        out.push(item as Record<string, unknown>);
      }
    }
  };

  pushValutes(root.Valute ?? root.valute);

  const valTypes = root.ValType ?? root.valType ?? root.valtype;
  const typeList = Array.isArray(valTypes) ? valTypes : valTypes ? [valTypes] : [];
  for (const vt of typeList) {
    if (typeof vt !== "object" || vt === null) continue;
    const block = vt as Record<string, unknown>;
    pushValutes(block.Valute ?? block.valute);
  }

  return out;
}

function valuteRecordToRate(v: Record<string, unknown>): CbarCurrencyRate | null {
  const rawCode =
    v["@_Code"] ??
    v["@_code"] ??
    (typeof v.Code === "string" ? v.Code : undefined) ??
    v.CharCode ??
    v.charCode ??
    "";
  const code = String(rawCode).trim();
  if (!code) {
    return null;
  }

  const nominalRaw = v.Nominal ?? v.nominal ?? 1;
  const nominal = Math.trunc(Number(nominalRaw));
  const nominalSafe =
    Number.isFinite(nominal) && nominal > 0 ? nominal : 1;
  const valueStr = String(v.Value ?? v.value ?? "0").replace(",", ".");
  const valueNum = Number.parseFloat(valueStr);
  const value = Number.isFinite(valueNum) ? valueNum : 0;
  const rate = nominalSafe > 0 ? value / nominalSafe : value;
  return {
    code,
    value,
    nominal: nominalSafe,
    rate,
  };
}

/**
 * Загрузка официальных курсов с cbar.az (ежедневный XML).
 * Обновление курсов на сайте — около 10:00 по Баку; для «сегодня» см. getLatestRate / poll.
 * @see https://cbar.az/currencies/
 */
@Injectable()
export class CbarFxService {
  private readonly logger = new Logger(CbarFxService.name);
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
    attributeNamePrefix: "@_",
  });

  /** Экспоненциальная пауза после ошибок парсинга/сети (кроме 404). */
  private consecutiveFailures = 0;
  private blockNetworkUntil = 0;
  /** Скользящее окно 1 ч для лимита запросов. */
  private hourWindowStart = 0;
  private fetchesInHour = 0;

  constructor(private readonly config: ConfigService) {}

  /**
   * С TAX_LOOKUP_MOCK=1 (как в TaxService) внешние запросы к cbar.az отключены —
   * без таймаутов и шума в логах при локальной разработке.
   */
  isExternalCbarFetchEnabled(): boolean {
    return this.config.get<string>("TAX_LOOKUP_MOCK") !== "1";
  }

  private resetFetchHealth(): void {
    this.consecutiveFailures = 0;
    this.blockNetworkUntil = 0;
  }

  private scheduleBackoffAfterFailure(kind: "network" | "parse"): void {
    this.consecutiveFailures = Math.min(this.consecutiveFailures + 1, 12);
    const cap = envInt("CBAR_BACKOFF_CAP_MS", CBAR_BACKOFF_CAP_MS_DEFAULT);
    const base = kind === "parse" ? 8_000 : 4_000;
    const ms = Math.min(cap, base * 2 ** (this.consecutiveFailures - 1));
    this.blockNetworkUntil = Date.now() + ms;
    this.logger.warn(
      `CBAR ${kind} failure #${this.consecutiveFailures}: pausing HTTP to cbar.az for ${ms}ms`,
    );
  }

  /** true — можно потратить одну попытку GET в текущем часовом окне. */
  private tryTakeHourlyFetchSlot(): boolean {
    const cap = envInt("CBAR_MAX_FETCHES_PER_HOUR", CBAR_MAX_FETCHES_PER_HOUR_DEFAULT);
    const now = Date.now();
    if (now - this.hourWindowStart >= 3_600_000) {
      this.hourWindowStart = now;
      this.fetchesInHour = 0;
    }
    if (this.fetchesInHour >= cap) {
      this.logger.warn(
        `CBAR: hourly fetch cap reached (${cap} GET / rolling hour); skipping request`,
      );
      return false;
    }
    this.fetchesInHour += 1;
    return true;
  }

  /** Дата в календаре Азербайджана (Asia/Baku) → DD.MM.YYYY для URL ЦБА */
  formatBakuDate(d: Date): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Baku",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (!y || !m || !day) {
      throw new Error("Failed to format Baku date");
    }
    return `${day}.${m}.${y}`;
  }

  buildCbarUrl(d: Date): string {
    const segment = this.formatBakuDate(d);
    return `${CBAR_BASE}/${segment}.xml`;
  }

  /** Календарный «сегодня» в Баку совпадает с датой `d` (тот же день). */
  isBakuToday(d: Date): boolean {
    return this.formatBakuDate(d) === this.formatBakuDate(new Date());
  }

  /**
   * Сырое тело XML с cbar.az (или null при 404 / сетевой ошибке).
   * Используется синхронизацией и fetchRatesForDateOnce.
   */
  async fetchCbarXmlBodyForDate(d: Date): Promise<string | null> {
    if (!this.isExternalCbarFetchEnabled()) {
      return null;
    }
    const now = Date.now();
    if (now < this.blockNetworkUntil) {
      this.logger.debug(
        `CBAR: backoff active until ${new Date(this.blockNetworkUntil).toISOString()}, skip GET`,
      );
      return null;
    }
    if (!this.tryTakeHourlyFetchSlot()) {
      return null;
    }
    const url = this.buildCbarUrl(d);
    this.logger.debug(`CBAR GET ${url}`);
    try {
      const res = await axios.get<ArrayBuffer>(url, {
        timeout: 15_000,
        responseType: "arraybuffer",
        validateStatus: (s) => s === 200 || s === 404,
        headers: { ...CBAR_HTTP_HEADERS },
      });
      if (res.status === 404) {
        return null;
      }
      const body = new TextDecoder("utf-8").decode(new Uint8Array(res.data));
      return body;
    } catch (e) {
      this.scheduleBackoffAfterFailure("network");
      this.logger.warn(`CBAR request failed ${url}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  /**
   * Парсинг XML ЦБА; при ошибке — console.error с полным телом ответа (см. CbarRateSyncService.ingestFromNetworkAnchor).
   */
  parseCbarXmlLogged(data: string, url: string): ParsedCbarDoc | null {
    try {
      return this.parseCbarXml(data);
    } catch (e) {
      console.error("[CBAR] XML parse failed", {
        url,
        responseBody: data,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  /**
   * Одна попытка загрузки курсов за календарный день Баку для `d`.
   * Не опрашивает ЦБА повторно; при 404 — null.
   */
  async fetchRatesForDateOnce(d: Date): Promise<ParsedCbarDoc | null> {
    const url = this.buildCbarUrl(d);
    const data = await this.fetchCbarXmlBodyForDate(d);
    if (data == null) return null;
    const doc = this.parseCbarXmlLogged(data, url);
    if (doc?.rates.length) {
      this.resetFetchHealth();
    } else if (data.trim().length > 0 && doc == null) {
      this.scheduleBackoffAfterFailure("parse");
    }
    return doc;
  }

  /**
   * Загрузка курсов на дату `d`.
   * Если `poll` и день в Баку = сегодня — повторяет запросы, пока в XML атрибут Date
   * не совпадёт с запрошенным днём (файл обновился после ~10:00) или пока не истечёт лимит.
   */
  async fetchRatesForDate(
    d: Date,
    options?: { poll?: boolean },
  ): Promise<CbarCurrencyRate[]> {
    const poll =
      options?.poll === true && this.isBakuToday(d);
    if (!poll) {
      const once = await this.fetchRatesForDateOnce(d);
      if (!once) {
        throw new Error(`CBAR: no rates for ${this.formatBakuDate(d)}`);
      }
      return once.rates;
    }

    const doc = await this.pollUntilPublishedMatchesTarget(d);
    if (doc) return doc.rates;
    const fallback = await this.fetchRatesForDateOnce(this.addBakuCalendarDays(d, -1));
    if (fallback?.rates.length) {
      this.logger.warn(
        `CBAR: polling exhausted for ${this.formatBakuDate(d)}, using previous day XML`,
      );
      return fallback.rates;
    }
    throw new Error(`CBAR: no rates after polling for ${this.formatBakuDate(d)}`);
  }

  /**
   * Актуальный курс валюты на указанный календарный день (Баку).
   * Одна попытка чтения файла на эту дату; если в XML дата курса не совпала с запрошенной
   * (напр. до ~10:00 по Баку файл ещё за вчера) — возвращается последний доступный курс
   * с более ранней датой. Долгое ожидание обновления ЦБА — только `fetchRatesForDate(..., { poll: true })`.
   */
  async getLatestRate(currencyCode: string, date: Date): Promise<CbarLatestRate> {
    const upper = currencyCode.trim().toUpperCase();
    if (upper === "AZN" || upper === "AZM") {
      const s = this.formatBakuDate(date);
      return {
        currencyCode: upper,
        value: 1,
        nominal: 1,
        rate: 1,
        rateDateBaku: s,
        isFallback: false,
      };
    }

    if (!this.isExternalCbarFetchEnabled()) {
      throw new CbarExternalFetchDisabledError();
    }

    const targetStr = this.formatBakuDate(date);
    const targetTs = bakuDdMmYyyyToUtcNoon(targetStr);

    const once = await this.fetchRatesForDateOnce(date);
    if (once && once.rates.length) {
      const pub = once.publishedDateBaku;
      const pubTs = pub ? bakuDdMmYyyyToUtcNoon(pub) : null;
      const row = this.pickCurrency(once.rates, upper);
      if (row) {
        const exactDay =
          pubTs != null && targetTs != null && pubTs === targetTs;
        return {
          currencyCode: upper,
          value: row.value,
          nominal: row.nominal,
          rate: row.rate,
          rateDateBaku: pub ?? targetStr,
          isFallback: !exactDay,
        };
      }
    }

    for (let i = 1; i <= CBAR_MAX_FALLBACK_DAYS; i++) {
      const prev = this.addBakuCalendarDays(date, -i);
      const doc = await this.fetchRatesForDateOnce(prev);
      if (!doc?.rates.length) continue;
      const row = this.pickCurrency(doc.rates, upper);
      if (!row) continue;
      return {
        currencyCode: upper,
        value: row.value,
        nominal: row.nominal,
        rate: row.rate,
        rateDateBaku: doc.publishedDateBaku ?? this.formatBakuDate(prev),
        isFallback: true,
      };
    }

    throw new Error("No data found in last 5 days");
  }

  /**
   * Сколько AZN за 1 единицу иностранной валюты (через getLatestRate).
   */
  async getAznPerUnit(currencyCode: string, d: Date): Promise<number> {
    const r = await this.getLatestRate(currencyCode, d);
    return r.rate;
  }

  private pickCurrency(
    rates: CbarCurrencyRate[],
    upperCode: string,
  ): CbarCurrencyRate | null {
    return rates.find((r) => r.code.toUpperCase() === upperCode) ?? null;
  }

  private async pollUntilPublishedMatchesTarget(d: Date): Promise<ParsedCbarDoc | null> {
    const targetStr = this.formatBakuDate(d);
    const targetTs = bakuDdMmYyyyToUtcNoon(targetStr);
    const maxMs = envInt("CBAR_POLL_MAX_MS", 600_000);
    const intervalMs = envInt("CBAR_POLL_INTERVAL_MS", 10_000);
    const deadline = Date.now() + maxMs;

    while (Date.now() < deadline) {
      const doc = await this.fetchRatesForDateOnce(d);
      if (!doc) {
        await sleep(intervalMs);
        continue;
      }
      const pub = doc.publishedDateBaku;
      if (!pub) {
        return doc;
      }
      const pubTs = bakuDdMmYyyyToUtcNoon(pub);
      if (targetTs != null && pubTs != null && pubTs >= targetTs) {
        return doc;
      }
      this.logger.debug(
        `CBAR: XML Date=${pub}, waiting for ${targetStr} (poll ${intervalMs}ms)`,
      );
      await sleep(intervalMs);
    }
    return null;
  }

  /** Сдвиг календарной даты в Баку на `deltaDays` (якорь — полдень UTC той же «бакинской» даты). */
  private addBakuCalendarDays(d: Date, deltaDays: number): Date {
    const s = this.formatBakuDate(d);
    const ts = bakuDdMmYyyyToUtcNoon(s);
    if (ts == null) {
      return new Date(d.getTime() + deltaDays * 86_400_000);
    }
    return new Date(ts + deltaDays * 86_400_000);
  }

  private parseCbarXml(data: string): ParsedCbarDoc {
    const doc = this.parser.parse(data) as CbarXmlRoot;
    const root = doc?.ValCurs ?? doc?.valcurs;
    if (!root) {
      throw new Error("CBAR: ValCurs root not found in XML");
    }

    const publishedDateBaku = extractValCursDate(root);
    const list = collectValutesFromValCurs(root);

    const rates: CbarCurrencyRate[] = [];
    for (const v of list) {
      const rec = valuteRecordToRate(v);
      if (rec && rec.code) {
        rates.push(rec);
      }
    }

    return { publishedDateBaku, rates };
  }
}

function extractValCursDate(root: Record<string, unknown>): string | null {
  const direct = root["@_Date"] ?? root["@_date"] ?? root.Date ?? root.date;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  return null;
}

/** Минимальная форма ответа ЦБА (регистр ключей может отличаться — см. маппинг выше) */
type CbarXmlRoot = {
  ValCurs?: CbarValuteRoot;
  valcurs?: CbarValuteRoot;
};

type CbarValuteRoot = Record<string, unknown> & {
  Valute?: CbarValute | CbarValute[];
  valute?: CbarValute | CbarValute[];
};

type CbarValute = {
  CharCode?: string;
  charCode?: string;
  Nominal?: string | number;
  nominal?: string | number;
  Value?: string;
  value?: string;
};
