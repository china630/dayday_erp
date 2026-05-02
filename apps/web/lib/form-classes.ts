/** Единый вид полей (Tailwind), без «чёрной» рамки :invalid у браузера */
export const inputFieldClass =
  "w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-action";

/** То же оформление, без фиксированной ширины — для рядов `flex` (VÖEN + кнопка и т.п.). */
export const inputFieldInlineClass =
  "min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-action";

/** VÖEN (10 цифр) в ряду с кнопкой: узкое поле + `tabular-nums`; ряд — `flex w-full justify-between`, кнопка по правому краю с остальными полями. */
export const inputFieldTaxIdClass =
  "w-[11ch] min-w-[9.5rem] shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 tabular-nums shadow-sm placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-action";

export const inputFieldWideClass =
  "w-full max-w-xl min-w-[min(100%,16rem)] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-action";

export const textareaFieldClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm font-mono placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-action";
