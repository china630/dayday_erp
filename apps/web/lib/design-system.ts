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

/** Active filter chip (registry, tabs) */
export const FILTER_ACTIVE_CLASS =
  "border-[#2980B9] bg-[#2980B9]/10 text-[#34495E]";

export const FILTER_IDLE_CLASS =
  "border-[#D5DADF] bg-white text-[#34495E] hover:border-[#B8C0C8]";
