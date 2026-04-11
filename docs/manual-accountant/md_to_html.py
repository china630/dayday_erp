#!/usr/bin/env python3
"""
manual-buhgalter.md → один самодостаточный HTML-файл (оглавление в тексте + боковая навигация).

Зависимость: pip install markdown

Запуск:
  python md_to_html.py
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import markdown

# Синхронизировано с manual-buhgalter.md (якоря #s1 … #s13)
TOC_ENTRIES: list[tuple[str, str]] = [
    ("s1", "Вход, организация и роли"),
    ("s2", "Главная страница и переключатели"),
    ("s3", "Продажи: счета, контрагенты, номенклатура"),
    ("s4", "Банк и выписки"),
    ("s5", "Быстрый расход"),
    ("s6", "Персонал: сотрудники, структура, зарплата"),
    ("s7", "Основные средства"),
    ("s8", "Склад и производство"),
    ("s9", "Отчётность: ОСВ, P&L, закрытие периода"),
    ("s10", "Дебиторка, старение, акт сверки и взаимозачёт"),
    ("s11", "Экспорт для налоговой (шаблон)"),
    ("s12", "Настройки: команда, аудит, подписка, маппинг NAS↔IFRS"),
    ("s13", "Частые вопросы и ограничения"),
]


def _sidebar_toc_html() -> str:
    items = "\n      ".join(
        f'<li><a href="#{aid}">{title}</a></li>' for aid, title in TOC_ENTRIES
    )
    return f"""
<aside class="toc-sidebar" aria-label="Быстрая навигация">
  <div class="toc-sidebar-inner">
    <p class="toc-sidebar-title">Разделы</p>
    <ol class="toc-sidebar-list">
      {items}
    </ol>
    <p class="toc-sidebar-foot">
      <a href="#oglavlenie">Текстовое оглавление в документе ↓</a>
    </p>
  </div>
</aside>
"""


def _document_css() -> str:
    return """
:root {
  --bg: #f8fafc;
  --card: #ffffff;
  --text: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --accent: #1d4ed8;
  --accent-soft: #eff6ff;
  --sidebar-w: 280px;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.55;
  color: var(--text);
  background: var(--bg);
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  background: var(--accent);
  color: #fff;
  padding: 8px 16px;
  z-index: 100;
}
.skip-link:focus { left: 8px; top: 8px; }

.doc-header {
  background: var(--card);
  border-bottom: 1px solid var(--border);
  padding: 1rem 1.5rem;
  position: sticky;
  top: 0;
  z-index: 40;
  box-shadow: 0 1px 0 rgba(15,23,42,.04);
}
.doc-header-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.doc-header h1 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 650;
}
.doc-header-meta { font-size: 0.85rem; color: var(--muted); }

.doc-layout {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  gap: 2rem;
  align-items: start;
}

.toc-sidebar {
  position: sticky;
  top: 5.5rem;
  max-height: calc(100vh - 6rem);
  overflow: auto;
}
.toc-sidebar-inner {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem 1rem 0.75rem;
  font-size: 0.875rem;
}
.toc-sidebar-title {
  margin: 0 0 0.5rem;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.toc-sidebar-list {
  margin: 0;
  padding-left: 1.15rem;
}
.toc-sidebar-list li { margin: 0.35em 0; }
.toc-sidebar-list a { display: inline; line-height: 1.35; }
.toc-sidebar-foot {
  margin: 0.75rem 0 0;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
  font-size: 0.8rem;
}

.doc-main {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 2rem 2.25rem 3rem;
  min-width: 0;
}

/* Контент из Markdown */
.doc-main h1 { font-size: 1.75rem; margin-top: 0; scroll-margin-top: 5rem; }
.doc-main h2 {
  font-size: 1.2rem;
  margin-top: 2rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--border);
  scroll-margin-top: 5rem;
}
.doc-main h2#oglavlenie { margin-top: 0; }
.doc-main h3 { font-size: 1.05rem; margin-top: 1.25rem; scroll-margin-top: 5rem; }
.doc-main p { margin: 0.75em 0; }
.doc-main ul, .doc-main ol { margin: 0.5em 0; padding-left: 1.5rem; }
.doc-main li { margin: 0.25em 0; }

/* Оглавление в теле документа */
#oglavlenie + ol {
  background: var(--accent-soft);
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  padding: 1rem 1rem 1rem 2rem;
  margin: 1rem 0 1.5rem;
}
#oglavlenie + ol a { font-weight: 500; }

.doc-main blockquote {
  margin: 1rem 0;
  padding: 0.75rem 1rem;
  border-left: 4px solid var(--accent);
  background: #f1f5f9;
  color: #334155;
}
.doc-main code {
  font-size: 0.9em;
  background: #f1f5f9;
  padding: 0.12em 0.35em;
  border-radius: 4px;
}
.doc-main pre {
  background: #1e293b;
  color: #e2e8f0;
  padding: 1rem;
  border-radius: 8px;
  overflow: auto;
  font-size: 0.85rem;
}
.doc-main pre code { background: none; padding: 0; color: inherit; }
.doc-main table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  margin: 1rem 0;
}
.doc-main th, .doc-main td {
  border: 1px solid var(--border);
  padding: 0.5rem 0.65rem;
  text-align: left;
  vertical-align: top;
}
.doc-main th { background: #f1f5f9; font-weight: 600; }
.doc-main img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  border: 1px solid var(--border);
  margin: 0.75rem 0;
}

[id] { scroll-margin-top: 5.5rem; }

@media (max-width: 900px) {
  .doc-layout {
    grid-template-columns: 1fr;
    padding: 1rem;
  }
  .toc-sidebar {
    position: relative;
    top: auto;
    max-height: none;
    order: -1;
  }
}
"""


def _md_to_inner_html(md_text: str) -> str:
    body = markdown.markdown(
        md_text,
        extensions=[
            "markdown.extensions.tables",
            "markdown.extensions.fenced_code",
            "markdown.extensions.nl2br",
            "markdown.extensions.sane_lists",
        ],
    )
    body = body.replace(
        "<h2>Оглавление</h2>",
        '<h2 id="oglavlenie">Оглавление</h2>',
        1,
    )
    # Якорь у главного заголовка для «наверх»
    body = body.replace("<h1>", '<h1 id="top">', 1)
    return body


def build_html(md_text: str) -> str:
    inner = _md_to_inner_html(md_text)
    css = _document_css()
    sidebar = _sidebar_toc_html()
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DayDay ERP — руководство бухгалтера</title>
  <style>
{css}
  </style>
</head>
<body>
  <a class="skip-link" href="#oglavlenie">К оглавлению</a>
  <header class="doc-header">
    <div class="doc-header-inner">
      <h1><a href="#top" style="color:inherit">DayDay ERP — руководство бухгалтера</a></h1>
      <span class="doc-header-meta">HTML · оглавление со ссылками</span>
    </div>
  </header>

  <div class="doc-layout">
    {sidebar}
    <article class="doc-main">
{inner}
    </article>
  </div>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="MD → HTML для мануала бухгалтера")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path(__file__).resolve().parent / "manual-buhgalter.md",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
    )
    args = parser.parse_args()
    md_path = args.input.resolve()
    if not md_path.is_file():
        print(f"Не найден: {md_path}", file=sys.stderr)
        return 1
    out = args.output or md_path.with_suffix(".html")
    out = out.resolve()

    md_text = md_path.read_text(encoding="utf-8")
    html = build_html(md_text)
    out.write_text(html, encoding="utf-8")
    print(f"OK: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
