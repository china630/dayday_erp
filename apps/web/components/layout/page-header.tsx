"use client";

import type { ReactNode } from "react";

/**
 * Стандарт заголовка: строка 1 — заголовок слева; строка 2 — действия справа.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  /** Необязательное пояснение под заголовком (та же колонка, слева). */
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 space-y-3">
      <div>
        <h1 className="m-0 text-left text-2xl font-semibold text-[#34495E]">{title}</h1>
        {subtitle != null && subtitle !== "" ? (
          <div className="mt-2 space-y-2 text-left text-sm text-[#7F8C8D]">{subtitle}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full min-w-0 flex-wrap justify-end gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
