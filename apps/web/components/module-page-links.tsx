"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

const linkClass = "text-action hover:text-primary text-sm font-medium";

/**
 * Горизонтальные ссылки на связанные разделы (хлебные крошки по модулям).
 */
export function ModulePageLinks(props: {
  items: { href: string; labelKey: string }[];
}) {
  const { t } = useTranslation();
  return (
    <nav
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 mb-2"
      aria-label="Breadcrumb"
    >
      {props.items.map((it, i) => (
        <span key={it.href} className="inline-flex items-center gap-2">
          {i > 0 ? (
            <span className="text-slate-300 select-none" aria-hidden>
              /
            </span>
          ) : null}
          <Link href={it.href} className={linkClass}>
            {t(it.labelKey)}
          </Link>
        </span>
      ))}
    </nav>
  );
}
