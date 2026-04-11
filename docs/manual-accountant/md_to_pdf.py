#!/usr/bin/env python3
"""
Конвертация manual-buhgalter.md → PDF (с картинками и кириллицей).

Установка зависимостей:
  pip install -r requirements-pdf.txt

Запуск из каталога docs/manual-accountant:
  python md_to_pdf.py

Или с путями:
  python md_to_pdf.py --input manual-buhgalter.md --output manual-buhgalter.pdf
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import markdown
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from xhtml2pdf import pisa


def _register_cyrillic_font() -> str:
    """Регистрирует TTF с кириллицей; возвращает имя семейства для CSS."""
    candidates = [
        os.environ.get("DAYDAY_PDF_FONT"),
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\calibri.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if path and os.path.isfile(path):
            name = "DayDayPdfSans"
            try:
                pdfmetrics.registerFont(TTFont(name, path))
                return name
            except Exception:
                continue
    return "Helvetica"


def _md_to_html(md_text: str) -> str:
    """Markdown → HTML body. Картинки оставляем относительными — база задаётся path= в pisaDocument."""
    html_body = markdown.markdown(
        md_text,
        extensions=[
            "markdown.extensions.tables",
            "markdown.extensions.fenced_code",
            "markdown.extensions.nl2br",
            "markdown.extensions.sane_lists",
        ],
    )

    font_family = _register_cyrillic_font()
    # Небольшой базовый стиль для печати
    css = f"""
    <style>
    @page {{
        size: A4;
        margin: 18mm 16mm 20mm 16mm;
    }}
    body {{
        font-family: {font_family}, Helvetica, sans-serif;
        font-size: 10.5pt;
        line-height: 1.35;
        color: #111;
    }}
    h1 {{ font-size: 18pt; margin-top: 0; }}
    h2 {{ font-size: 13pt; margin-top: 1.2em; border-bottom: 1px solid #ccc; padding-bottom: 0.2em; }}
    h3 {{ font-size: 11pt; margin-top: 1em; }}
    code {{ font-size: 9.5pt; background: #f4f4f4; padding: 0 4px; }}
    pre {{ background: #f4f4f4; padding: 8px; font-size: 9pt; overflow: hidden; }}
    table {{ border-collapse: collapse; width: 100%; margin: 0.6em 0; font-size: 9.5pt; }}
    th, td {{ border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }}
    th {{ background: #f0f0f0; }}
    img {{ max-width: 100%; height: auto; }}
    blockquote {{ margin: 0.5em 0; padding-left: 10px; border-left: 3px solid #ddd; color: #444; }}
    a {{ color: #1d4ed8; text-decoration: none; }}
    </style>
    """

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>DayDay ERP — руководство бухгалтера</title>
  {css}
</head>
<body>
{html_body}
</body>
</html>"""


def main() -> int:
    parser = argparse.ArgumentParser(description="MD → PDF для мануала бухгалтера")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path(__file__).resolve().parent / "manual-buhgalter.md",
        help="Путь к .md",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Путь к .pdf (по умолчанию: рядом с .md)",
    )
    args = parser.parse_args()
    md_path: Path = args.input.resolve()
    if not md_path.is_file():
        print(f"Файл не найден: {md_path}", file=sys.stderr)
        return 1

    out_path = args.output
    if out_path is None:
        out_path = md_path.with_suffix(".pdf")
    else:
        out_path = out_path.resolve()

    base_dir = md_path.parent
    md_text = md_path.read_text(encoding="utf-8")
    html = _md_to_html(md_text)

    with open(out_path, "wb") as pdf_file:
        status = pisa.CreatePDF(
            html.encode("utf-8"),
            dest=pdf_file,
            encoding="utf-8",
            path=str(base_dir) + os.sep,
        )

    if status.err:
        print(f"Ошибки при генерации PDF (см. лог xhtml2pdf). Код: {status.err}", file=sys.stderr)
        return 1

    print(f"OK: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
