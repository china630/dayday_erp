/**
 * DESIGN.md — DayDay ERP visual tokens (palette, compact UI).
 * Primary #34495E, Secondary #7F8C8D, Background #EBEDF0, Action #2980B9.
 */

export const DESIGN = {
  primary: "#34495E",
  secondary: "#7F8C8D",
  background: "#EBEDF0",
  action: "#2980B9",
} as const;

/** Toolbar / form primary actions — 32px height, 2px radius per DESIGN.md (v8.9.2: явный контраст) */
export const PRIMARY_BUTTON_CLASS =
  "inline-flex h-8 min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-[2px] px-4 text-[13px] font-semibold text-white bg-[#2980B9] shadow-sm transition hover:bg-[#2471A3] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#2980B9] disabled:opacity-50 disabled:pointer-events-none";

/** Secondary outline button (same height) */
export const SECONDARY_BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[2px] border border-[#D5DADF] bg-white px-4 text-[13px] font-medium text-[#34495E] shadow-sm transition hover:bg-[#F4F5F7] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#2980B9]/40";

/** Ghost / text-style cancel in modals (same height) */
export const GHOST_BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[2px] border border-transparent bg-transparent px-4 text-[13px] font-medium text-[#34495E] transition hover:bg-[#F4F5F7] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#2980B9]/30 disabled:opacity-50 disabled:pointer-events-none";

/** Cards / panels — 2px radius, neutral border */
export const CARD_CONTAINER_CLASS =
  "rounded-[2px] border border-[#D5DADF] bg-white shadow-sm";

/** Чёткая граница на фоне #EBEDF0 (DESIGN.md — не «бледные» slate-200). */
export const BORDER_MUTED_CLASS = "border-[#D5DADF]";

/** Ссылки на белом фоне — акцент / primary (видимость) */
export const LINK_ACCENT_CLASS =
  "font-medium text-[#2980B9] hover:text-[#34495E] underline-offset-2 hover:underline";

/** Поля форм: 13px, рамка DESIGN.md border-muted */
export const INPUT_BORDERED_CLASS =
  "rounded-[2px] border border-[#D5DADF] bg-white px-4 py-2 text-[13px] text-[#34495E] shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#2980B9]";

/** Подписи полей в модалках (DESIGN.md: 13px, #34495E). */
export const MODAL_FIELD_LABEL_CLASS =
  "mb-1 block text-[13px] font-semibold text-[#34495E]";

/** Полный ввод в модалке (ширина 100%, без max-w-md из legacy form-classes). */
export const MODAL_INPUT_CLASS =
  "w-full rounded-[2px] border border-[#D5DADF] bg-white px-3 py-2 text-[13px] text-[#34495E] shadow-sm placeholder:text-[#7F8C8D] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#2980B9] disabled:bg-[#F4F5F7] disabled:text-[#7F8C8D]";

export const MODAL_INPUT_MONO_CLASS = `${MODAL_INPUT_CLASS} font-mono`;

export const MODAL_INPUT_NUMERIC_CLASS = `${MODAL_INPUT_CLASS} text-right tabular-nums`;

/** VÖEN в ряду с кнопкой «Yoxla». */
export const MODAL_INPUT_TAX_ID_CLASS =
  "w-[11ch] min-w-[9.5rem] shrink-0 rounded-[2px] border border-[#D5DADF] bg-white px-3 py-2 text-[13px] text-[#34495E] tabular-nums shadow-sm placeholder:text-[#7F8C8D] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#2980B9]";

/** Чекбоксы в модалках — 2px, граница DESIGN.md. */
export const MODAL_CHECKBOX_CLASS =
  "h-4 w-4 shrink-0 rounded-[2px] border border-[#D5DADF] accent-[#2980B9]";

/** Футер модалки (эталон KMO): линия сверху, отступы, кнопки вправо. */
export const MODAL_FOOTER_ACTIONS_CLASS =
  "flex w-full justify-end gap-2 border-t border-[#D5DADF] pt-4 mt-4";

/** Active filter chip (registry, tabs) */
export const FILTER_ACTIVE_CLASS =
  "border-[#2980B9] bg-[#2980B9]/10 text-[#34495E]";

export const FILTER_IDLE_CLASS =
  "border-[#D5DADF] bg-white text-[#34495E] hover:border-[#B8C0C8]";

/* ─── Data tables (DESIGN.md § Data Tables v1.0) ─── */

/** Окно таблицы: горизонтальный + вертикальный скролл, чтобы `sticky` у шапки работал на длинных списках. */
export const DATA_TABLE_VIEWPORT_CLASS =
  "max-h-[min(70vh,56rem)] overflow-auto rounded-[2px] border border-[#D5DADF] bg-white shadow-sm";

export const DATA_TABLE_CLASS = "min-w-full border-collapse text-[13px]";

/** Строка шапки: липкая, фон и нижняя граница. */
export const DATA_TABLE_HEAD_ROW_CLASS =
  "sticky top-0 z-10 border-b border-[#D5DADF] bg-[#F8FAFC] shadow-[0_1px_0_0_#D5DADF]";

export const DATA_TABLE_TH_LEFT_CLASS =
  "py-2 px-4 text-left text-xs font-bold leading-tight text-[#475569]";

export const DATA_TABLE_TH_RIGHT_CLASS =
  "py-2 px-4 text-right text-xs font-bold leading-tight text-[#475569]";

export const DATA_TABLE_TH_CENTER_CLASS =
  "py-2 px-4 text-center text-xs font-bold leading-tight text-[#475569]";

export const DATA_TABLE_TR_CLASS =
  "border-b border-[#D5DADF] bg-white transition-colors hover:bg-[#F1F5F9]";

export const DATA_TABLE_TD_CLASS = "py-2 px-4 align-middle text-[13px] text-[#34495E]";

export const DATA_TABLE_TD_RIGHT_CLASS =
  "py-2 px-4 align-middle text-right font-mono text-[13px] tabular-nums text-[#34495E]";

export const DATA_TABLE_TD_CENTER_CLASS =
  "py-2 px-4 align-middle text-center text-[13px] text-[#34495E]";

/** Последняя колонка действий (~120px). */
export const DATA_TABLE_ACTIONS_TH_CLASS = `${DATA_TABLE_TH_RIGHT_CLASS} w-[120px]`;

export const DATA_TABLE_ACTIONS_TD_CLASS =
  "w-[120px] min-w-[7.5rem] py-2 px-4 align-middle text-right";

/** 32×32, ghost, иконки в строке таблицы. */
export const TABLE_ROW_ICON_BTN_CLASS =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border border-transparent bg-transparent transition-colors hover:bg-[#EBEDF0] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#2980B9]/25 disabled:pointer-events-none disabled:opacity-50";
