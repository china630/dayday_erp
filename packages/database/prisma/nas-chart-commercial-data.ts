import type { AccountType } from "@prisma/client";

/** Строка плана счетов NAS (каталог / организация). */
export type ChartAccountSeed = {
  code: string;
  nameAz: string;
  nameRu: string;
  nameEn: string;
  type: keyof typeof AccountType | AccountType;
  parentCode?: string | null;
};

export type ChartOfAccountsFile = {
  accounts: ChartAccountSeed[];
  meta?: Record<string, unknown>;
};

type Row = {
  code: string;
  nameAz: string;
  nameRu: string;
  nameEn: string;
  type: AccountType;
  parentCode?: string | null;
};

/** Коды счетов для шаблона «Малый бизнес» (упрощённый NAS, совместимость с модулем банка/кассы). */
export const NAS_SMALL_BUSINESS_CODES = new Set<string>([
  "100",
  "101",
  "101.01",
  "101.02",
  "102",
  "102.01",
  "103",
  "200",
  "201",
  "202",
  "203",
  "204",
  "205",
  "206",
  "210",
  "211",
  "212",
  "213",
  "214",
  "215",
  "220",
  "221",
  "222",
  "223",
  "224",
  "290",
  "291",
  "191",
  "500",
  "501",
  "511",
  "521",
  "522",
  "531",
  "532",
  "533",
  "534",
  "541",
  "551",
  "561",
  "600",
  "601",
  "602",
  "631",
  "662",
  "700",
  "701",
  "711",
  "721",
  "731",
  "741",
  "751",
  "562",
  "800",
  "801",
  "802",
  "811",
  "821",
]);

function row(
  code: string,
  type: AccountType,
  parent: string | null | undefined,
  az: string,
  ru: string,
  en: string,
): Row {
  return {
    code,
    type,
    parentCode: parent ?? undefined,
    nameAz: az,
    nameRu: ru,
    nameEn: en,
  };
}

/**
 * Полный коммерческий план (коды DayDay ERP, согласованные с интеграциями: 101 касса, 221.xx банк)
 * + расширение типовыми позициями MMÜS (Milli Mühasibat Uçotu Standartları), без коллизий с зарезервированными кодами.
 */
export function getNasCommercialFullAccounts(): ChartAccountSeed[] {
  const core: Row[] = [
    row("100", "ASSET", null, "Nağd vəsaitlər və pul sənədləri", "Наличные средства и денежные документы", "Cash and cash equivalents"),
    row("111", "ASSET", null, "Əsas vəsaitlər", "Основные средства", "Property, plant and equipment"),
    row("131", "ASSET", null, "Qeyri-maddi aktivlər", "Нематериальные активы", "Intangible assets"),
    row("151", "ASSET", null, "Uzunmüddətli maliyyə investisiyaları", "Долгосрочные финансовые вложения", "Long-term financial investments"),
    row("200", "ASSET", null, "Ehtiyatlar", "Запасы", "Inventories"),
    row("210", "ASSET", null, "Debitor borcu", "Дебиторская задолженность", "Trade and other receivables"),
    row("220", "ASSET", null, "Banklardakı pul vəsaitləri", "Денежные средства на счетах в банках", "Cash at bank"),
    row("290", "ASSET", null, "Digər dövri aktivlər", "Прочие оборотные активы", "Other current assets"),
    row("500", "LIABILITY", null, "Qısamüddətli öhdəliklər", "Краткосрочные обязательства", "Current liabilities"),
    row("600", "REVENUE", null, "Adi fəaliyyətdən gəlirlər", "Доходы от обычной деятельности", "Operating revenue"),
    row("700", "EXPENSE", null, "Adi fəaliyyət üzrə xərclər", "Расходы по обычной деятельности", "Operating expenses"),
    row("800", "EQUITY", null, "Kapital, ehtiyatlar və maliyyə nəticəsi", "Капитал, резервы и финансовый результат", "Equity, reserves and financial result"),

    row("101", "ASSET", "100", "Milli valyutada nağd pul", "Наличные деньги в национальной валюте", "Cash in local currency"),
    row("101.01", "ASSET", "101", "Kassa (əməliyyat)", "Касса (операционная)", "Cash desk (operating)"),
    row("101.02", "ASSET", "101", "Kassa (filial)", "Касса (филиал)", "Cash desk (branch)"),
    row("102", "ASSET", "100", "Xarici valyutada nağd pul", "Наличные деньги в иностранной валюте", "Cash in foreign currency"),
    row("102.01", "ASSET", "102", "Kassa (xarici valyuta)", "Касса (иностранная валюта)", "Cash desk (foreign currency)"),
    row("103", "ASSET", "100", "Pul sənədləri", "Денежные документы", "Monetary documents"),

    row("112", "ASSET", "111", "Əsas vəsaitlərin yığılmış amortizasiyası", "Накопленная амортизация основных средств", "Accumulated depreciation — PPE"),
    row("113", "ASSET", "111", "Əmlaka gəlir gətirən investisiyalar", "Доходные вложения в материальные ценности", "Investment property"),

    row("132", "ASSET", "131", "Qeyri-maddi aktivlərin yığılmış amortizasiyası", "Накопленная амортизация нематериальных активов", "Accumulated amortization — intangibles"),

    row("201", "ASSET", "200", "Xammal və materiallar", "Сырьё и материалы", "Raw materials"),
    row("202", "ASSET", "200", "Alınmış yarımfabrikatlar və komplektləşdirici hissələr", "Покупные полуфабрикаты и комплектующие", "Purchased semi-finished goods and components"),
    row("203", "ASSET", "200", "Yarımçıq istehsal", "Незавершённое производство", "Work in progress"),
    row("204", "ASSET", "200", "Hazır məhsul", "Готовая продукция", "Finished goods"),
    row("205", "ASSET", "200", "Mallar", "Товары", "Merchandise"),
    row("206", "ASSET", "200", "Az dəyərli və tez yeyilən predmetlər", "Малоценные и быстроизнашивающиеся предметы", "Low-value consumables"),

    row("211", "ASSET", "210", "Alıcılar və sifarişçilər üzrə debitor borcu", "Дебиторская задолженность покупателей и заказчиков", "Trade receivables"),
    row("212", "ASSET", "210", "Alınmış veksellər", "Векселя полученные", "Notes receivable"),
    row("213", "ASSET", "210", "Törəmə asılı təşkilatlarla hesablaşmalar", "Задолженность дочерних и зависимых организаций", "Due from subsidiaries and associates"),
    row("214", "ASSET", "210", "Verilmiş avanslar", "Авансы выданные", "Prepayments made"),
    row("215", "ASSET", "210", "Hesab verən şəxslərlə hesablaşmalar", "Расчёты с подотчётными лицами", "Accountable persons"),
    row("291", "ASSET", "210", "Debitor borcunun dəyər itkisinə ehtiyatlar", "Резервы под обесценение дебиторской задолженности", "Allowance for doubtful receivables"),

    row("221", "ASSET", "220", "Banklarda cari hesablar", "Расчётные счета в банках", "Bank current accounts"),
    row("222", "ASSET", "220", "Banklarda cari valyuta hesabları", "Текущие валютные счета в банках", "Foreign currency bank accounts"),
    row("223", "ASSET", "220", "Banklarda xüsusi hesablar", "Специальные счета в банках", "Special bank accounts"),
    row("224", "ASSET", "220", "Akkreditivlər", "Аккредитивы", "Letters of credit"),

    row("191", "ASSET", "290", "Alınmış dəyərlər üzrə ƏDV", "НДС по приобретённым ценностям", "Input VAT"),
    row("301", "ASSET", "290", "Alınmış qısamüddətli veksellər", "Краткосрочные векселя полученные", "Short-term notes receivable"),
    row("302", "ASSET", "290", "Digər qısamüddətli maliyyə investisiyaları", "Прочие краткосрочные финансовые вложения", "Other short-term financial investments"),
    row("312", "ASSET", "290", "Verilmiş avanslar üzrə ƏDV", "НДС по авансам выданным", "VAT on advances issued"),

    row("501", "LIABILITY", "500", "Qısamüddətli kreditlər və borclar", "Краткосрочные займы и кредиты", "Short-term loans and borrowings"),
    row("511", "LIABILITY", "500", "Qısamüddətli veksellər", "Векселя краткосрочные", "Short-term notes payable"),
    row("521", "LIABILITY", "500", "Vergi və yığımlar üzrə öhdəliklər", "Обязательства по налогам и сборам", "Tax payables"),
    row("522", "LIABILITY", "500", "Sosial sığorta üzrə öhdəliklər", "Обязательства по социальному страхованию", "Social insurance payables"),
    row("531", "LIABILITY", "500", "Təchizatçılar və podratçılar qarşısında öhdəliklər", "Обязательства перед поставщиками и подрядчиками", "Trade payables"),
    row("532", "LIABILITY", "500", "Alıcılardan alınmış avanslar", "Авансы полученные от покупателей", "Advances from customers"),
    row("533", "LIABILITY", "500", "Əmək haqqı üzrə personal qarşısında öhdəliklər", "Обязательства перед персоналом по оплате труда", "Payroll liabilities"),
    row("534", "LIABILITY", "500", "Personal qarşısında digər öhdəliklər", "Расчёты по прочим обязательствам перед персоналом", "Other employee-related liabilities"),
    row("541", "LIABILITY", "500", "İcarə üzrə öhdəliklər", "Обязательства по аренде", "Lease liabilities"),
    row("551", "LIABILITY", "500", "Büdcəyə digər məcburi ödənişlər üzrə hesablaşmalar", "Расчёты с бюджетом по прочим обязательным платежам", "Other statutory payables to budget"),
    row("561", "LIABILITY", "500", "Digər qısamüddətli öhdəliklər", "Прочие краткосрочные обязательства", "Other current liabilities"),

    row("601", "REVENUE", "600", "Məhsul, mal, iş və xidmət satışından gəlir", "Доход от реализации продукции, товаров, работ и услуг", "Revenue from sale of goods and services"),
    row("602", "REVENUE", "600", "Digər əməliyyat gəlirləri", "Прочие операционные доходы", "Other operating income"),
    row("631", "REVENUE", "600", "İnventarizasiya artıqlığı və sair əməliyyat gəlirləri", "Прочие операционные доходы (излишки инвентаризации и др.)", "Other operating income (inventory surpluses, etc.)"),
    row("603", "REVENUE", "600", "Digər təşkilatlarda iştirakdan gəlirlər", "Доходы от участия в других организациях", "Income from investments in other entities"),
    row("604", "REVENUE", "600", "Ehtiyatların bərpası və digər əməliyyat gəlirləri", "Восстановление резервов и прочие операционные доходы", "Reversal of provisions and other operating income"),
    row("662", "REVENUE", "600", "Digər gəlirlər (o cümlədən məzənnə fərqləri)", "Прочие доходы (в т.ч. курсовые разницы)", "Other income (incl. FX differences)"),

    row("701", "EXPENSE", "700", "Satılan malların, məhsulun, iş və xidmətlərin maya dəyəri", "Себестоимость реализованных товаров, продукции, работ, услуг", "Cost of sales"),
    row("711", "EXPENSE", "700", "Kommersiya xərcləri", "Коммерческие расходы", "Selling expenses"),
    row("721", "EXPENSE", "700", "İdarəetmə xərcləri", "Административные расходы", "Administrative expenses"),
    row("731", "EXPENSE", "700", "Digər əməliyyat xərcləri", "Прочие операционные расходы", "Other operating expenses"),
    row("741", "EXPENSE", "700", "Maliyyə fəaliyyəti xərcləri", "Расходы по финансовой деятельности", "Finance costs"),
    row("751", "EXPENSE", "700", "Mənfəət vergisı xərcləri", "Расходы по налогу на прибыль", "Income tax expense"),
    row("704", "EXPENSE", "700", "Ümumi təsərrüfat xərcləri (detallaşdırma)", "Общехозяйственные расходы (детализация)", "General overhead (detail)"),
    row("705", "EXPENSE", "700", "Satış xərcləri", "Расходы на продажу", "Distribution costs"),
    row("562", "EXPENSE", "700", "Digər xərclər (o cümlədən məzənnə fərqləri)", "Прочие расходы (в т.ч. курсовые разницы)", "Other expenses (incl. FX differences)"),

    row("801", "EQUITY", "800", "Hesabat dövrünün maliyyə nəticəsi (mənfəət/zərər)", "Финансовый результат отчётного периода (прибыль/убыток)", "Profit or loss for the period"),
    row("802", "EQUITY", "800", "Əvvəlki illərin bölüşdürülməmiş mənfəəti", "Нераспределённая прибыль (непокрытый убыток) прошлых лет", "Retained earnings / accumulated losses"),
    row("811", "EQUITY", "800", "Ehtiyat kapitalı", "Резервный капитал", "Reserve capital"),
    row("821", "EQUITY", "800", "Nizamnamə kapitalı", "Уставный капитал", "Share capital"),
  ];

  const supplement: Row[] = [
    row("121", "ASSET", "111", "İnvestisiya mülkiyyətinin dəyəri", "Стоимость инвестиционной недвижимости", "Investment property — cost"),
    row("122", "ASSET", "111", "İnvestisiya mülkiyyəti üzrə yığılmış amortizasiya", "Накопленная амортизация инвестиционной недвижимости", "Investment property — accumulated depreciation"),
    row("123", "ASSET", "111", "İnvestisiya mülkiyyəti ilə bağlı kapitallaşdırılmış xərclər", "Капитализированные затраты по инвестиционной недвижимости", "Investment property — capitalized costs"),
    row("141", "ASSET", "111", "Təbii ehtiyatların (sərvətlərin) dəyəri", "Стоимость природных ресурсов", "Natural resources — carrying amount"),
    row("142", "ASSET", "111", "Təbii ehtiyatların tükənməsi", "Истощение природных ресурсов", "Natural resources — depletion"),
    row("152", "ASSET", "151", "Birgə müəssisələrə investisiyalar", "Инвестиции в совместные предприятия", "Investments in joint ventures"),
    row("153", "ASSET", "151", "Asılı müəssisələrə investisiyaların dəyərinin azalması üzrə düzəlişlər", "Корректировки по снижению стоимости инвестиций в зависимые организации", "Impairment adjustments — investments in associates"),
    row("161", "ASSET", "290", "Mənfəət vergisi üzrə təxirə salınmış vergi aktivləri", "Отложенные налоговые активы по налогу на прибыль", "Deferred tax assets — income tax"),
    row("162", "ASSET", "290", "Digər təxirə salınmış vergi aktivləri", "Прочие отложенные налоговые активы", "Other deferred tax assets"),
    row("171", "ASSET", "210", "Alıcıların və sifarişçilərin uzunmüddətli debitor borcu", "Долгосрочная дебиторская задолженность покупателей", "Long-term trade receivables"),
    row("172", "ASSET", "210", "Törəmə müəssisələrin uzunmüddətli debitor borcu", "Долгосрочная дебиторская задолженность зависимых организаций", "Long-term receivables — subsidiaries"),
    row("173", "ASSET", "210", "Əsas idarəetmə heyətinin uzunmüddətli debitor borcu", "Долгосрочная дебиторская задолженность ключевого руководства", "Long-term receivables — key management"),
    row("174", "ASSET", "210", "İcarə üzrə uzunmüddətli debitor borcu", "Долгосрочная дебиторская задолженность по аренде", "Long-term lease receivables"),
    row("175", "ASSET", "210", "Tikinti müqavilələri üzrə uzunmüddətli debitor borcu", "Долгосрочная дебиторская задолженность по строительным контрактам", "Long-term contract receivables"),
    row("176", "ASSET", "210", "Faizlər üzrə uzunmüddətli debitor borcu", "Долгосрочная дебиторская задолженность по процентам", "Long-term interest receivables"),
    row("177", "ASSET", "210", "Digər uzunmüddətli debitor borcları", "Прочая долгосрочная дебиторская задолженность", "Other long-term receivables"),
    row("181", "ASSET", "290", "Ödənişə qədər saxlanılan uzunmüddətli investisiyalar", "Долгосрочные инвестиции, удерживаемые до погашения", "Long-term investments held to maturity"),
    row("182", "ASSET", "290", "Verilmiş uzunmüddətli borclar", "Выданные долгосрочные займы", "Long-term loans granted"),
    row("183", "ASSET", "290", "Digər uzunmüddətli investisiyalar", "Прочие долгосрочные инвестиции", "Other long-term investments"),
    row("184", "ASSET", "290", "Sair uzunmüddətli maliyyə aktivlərinin dəyərinin azalması üzrə düzəlişlər", "Корректировки по снижению стоимости прочих долгосрочных финансовых активов", "Impairment — other long-term financial assets"),
    row("192", "ASSET", "151", "Verilmiş uzunmüddətli avanslar", "Выданные долгосрочные авансы", "Long-term advances paid"),
    row("193", "ASSET", "290", "Digər uzunmüddətli aktivlər", "Прочие долгосрочные активы", "Other long-term assets"),
    row("207", "ASSET", "200", "Digər ehtiyatlar", "Прочие запасы", "Other inventories"),
    row("208", "ASSET", "200", "Ehtiyatların dəyərinin azalması üzrə düzəlişlər", "Корректировки на снижение стоимости запасов", "Inventory write-down reserve"),
    row("216", "ASSET", "210", "Faizlər üzrə qısamüddətli debitor borcu", "Краткосрочная дебиторская задолженность по процентам", "Short-term interest receivables"),
    row("217", "ASSET", "210", "Digər qısamüddətli debitor borcları", "Прочая краткосрочная дебиторская задолженность", "Other short-term receivables"),
    row("218", "ASSET", "210", "Şübhəli borclar üzrə düzəlişlər", "Корректировки по сомнительной задолженности", "Allowance / doubtful debt adjustments"),
  ];

  return [...core, ...supplement].map((r) => ({
    code: r.code,
    nameAz: r.nameAz,
    nameRu: r.nameRu,
    nameEn: r.nameEn,
    type: r.type,
    parentCode: r.parentCode?.trim() || null,
  }));
}

/** Упрощённый план: подмножество полного + замыкание по parentCode. */
export function getNasSmallBusinessAccounts(): ChartAccountSeed[] {
  const full = getNasCommercialFullAccounts();
  const want = new Set(NAS_SMALL_BUSINESS_CODES);
  const byCode = new Map(full.map((a) => [a.code, a]));
  const out = new Map<string, ChartAccountSeed>();

  function addWithAncestors(code: string | null | undefined) {
    if (!code) return;
    if (out.has(code)) return;
    const row = byCode.get(code);
    if (!row) return;
    addWithAncestors(row.parentCode ?? undefined);
    out.set(code, row);
  }

  for (const c of want) {
    addWithAncestors(c);
  }

  return [...out.values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}
