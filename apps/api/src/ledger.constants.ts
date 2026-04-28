/** Счёт выручки при оплате инвойса (см. ТЗ). */
export const REVENUE_ACCOUNT_CODE = "601";

/** Дебиторская задолженность покупателей (отгрузка Дт 211 — Кт 601, оплата Дт 101/221 — Кт 211). */
export const RECEIVABLE_ACCOUNT_CODE = "211";

/** Доход от курсовой разницы (MVP). */
export const FX_GAIN_ACCOUNT_CODE = "662";

/** Расход / потери от курсовой разницы (MVP). */
export const FX_LOSS_ACCOUNT_CODE = "562";

/** Зарплата: расходы и задолженность перед персоналом. */
export const PAYROLL_EXPENSE_ACCOUNT_CODE = "721";
export const PAYROLL_PAYABLE_ACCOUNT_CODE = "533";

/** Задолженность по налогам и взносам (удержания работника + взносы работодателя). */
export const PAYROLL_TAX_PAYABLE_ACCOUNT_CODE = "521";

/** Складской учёт: товары, поставщики, себестоимость продаж. */
export const INVENTORY_GOODS_ACCOUNT_CODE = "201";
export const PAYABLE_SUPPLIERS_ACCOUNT_CODE = "531";
export const COGS_ACCOUNT_CODE = "701";

/** Основные средства: накопленная амортизация; расход по амортизации (v2 — 713). */
export const ACCUMULATED_DEPRECIATION_ACCOUNT_CODE = "112";
/** Готовая продукция (выпуск из компонентов). */
export const FINISHED_GOODS_ACCOUNT_CODE = "204";
export const DEPRECIATION_EXPENSE_ACCOUNT_CODE = "713";

/** Прочие операционные расходы (быстрая запись из UI). */
export const MISC_OPERATING_EXPENSE_ACCOUNT_CODE = "731";

/** Прочие операционные доходы (излишки инвентаризации и др.). */
export const INVENTORY_SURPLUS_INCOME_ACCOUNT_CODE = "631";
/** Касса (операционная) — источник оплаты расхода. */
export const CASH_OPERATIONAL_ACCOUNT_CODE = "101.01";

/** Касса в иностранной валюте (субсчёт 102). */
export const FOREIGN_CASH_OPERATIONAL_ACCOUNT_CODE = "102.01";

/** Расчёты с подотчётными лицами (NAS). */
export const ACCOUNTABLE_PERSONS_ACCOUNT_CODE = "244";

/** Основной расчётный счёт в банке (типовой код для инкассации). */
export const MAIN_BANK_ACCOUNT_CODE = "221";

/** НДС к зачёту (входящий). */
export const VAT_INPUT_ACCOUNT_CODE = "241";
/** НДС к уплате (исходящий). */
export const VAT_OUTPUT_ACCOUNT_CODE = "541";
