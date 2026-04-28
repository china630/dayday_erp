#!/usr/bin/env python3
"""Convert Markdown to HTML with mandatory TOC (H1/H2)."""

from __future__ import annotations

import argparse
import html
import re
from pathlib import Path
from typing import Any

try:
    import markdown
except ImportError as exc:  # pragma: no cover - runtime dependency guard
    raise SystemExit(
        "Missing dependency: markdown. Install it with: pip install markdown"
    ) from exc


TOC_UL_RE = re.compile(r"(<ul>.*</ul>)", flags=re.IGNORECASE | re.DOTALL)
DISPLAY_BRACKET_BLOCK_RE = re.compile(r"(?ms)^\[\s*\n(.*?)\n\]\s*$")
DISPLAY_LATEX_RE = re.compile(r"\\\[(.+?)\\\]", flags=re.DOTALL)
DISPLAY_DOLLAR_RE = re.compile(r"\$\$(.+?)\$\$", flags=re.DOTALL)
INLINE_PAREN_RE = re.compile(r"\\\((.+?)\\\)", flags=re.DOTALL)
INLINE_DOLLAR_RE = re.compile(r"(?<!\\)\$(?!\$)(.+?)(?<!\\)\$")


def build_toc_from_tokens(md: Any) -> str:
    toc_html = getattr(md, "toc", "") or ""
    if not toc_html.strip():
        return '<nav class="toc"><h2>Содержание</h2><p>Нет заголовков H1/H2.</p></nav>'

    ul_match = TOC_UL_RE.search(toc_html)
    if not ul_match:
        return '<nav class="toc"><h2>Содержание</h2><p>Нет заголовков H1/H2.</p></nav>'

    # Keep nested list structure from markdown.toc to preserve H1/H2 hierarchy.
    parts = ['<nav class="toc">', "<h2>Содержание</h2>", ul_match.group(1), "</nav>"]
    return "\n".join(parts)


def preserve_math(md_text: str) -> tuple[str, dict[str, str]]:
    placeholders: dict[str, str] = {}
    idx = 0

    def put(html_fragment: str) -> str:
        nonlocal idx
        token = f"@@MATH_{idx}@@"
        placeholders[token] = html_fragment
        idx += 1
        return token

    # Non-standard but common user style:
    # [
    # \text{...}
    # ]
    def replace_display_bracket(match: re.Match[str]) -> str:
        expr = match.group(1).strip()
        return put(f'<div class="math-display">\\[{html.escape(expr)}\\]</div>')

    md_text = DISPLAY_BRACKET_BLOCK_RE.sub(replace_display_bracket, md_text)

    def replace_display_latex(match: re.Match[str]) -> str:
        expr = match.group(1).strip()
        return put(f'<div class="math-display">\\[{html.escape(expr)}\\]</div>')

    md_text = DISPLAY_LATEX_RE.sub(replace_display_latex, md_text)
    md_text = DISPLAY_DOLLAR_RE.sub(replace_display_latex, md_text)

    def replace_inline_paren(match: re.Match[str]) -> str:
        expr = match.group(1).strip()
        return put(f'<span class="math-inline">\\({html.escape(expr)}\\)</span>')

    def replace_inline_dollar(match: re.Match[str]) -> str:
        expr = match.group(1).strip()
        return put(f'<span class="math-inline">\\({html.escape(expr)}\\)</span>')

    md_text = INLINE_PAREN_RE.sub(replace_inline_paren, md_text)
    md_text = INLINE_DOLLAR_RE.sub(replace_inline_dollar, md_text)
    return md_text, placeholders


def restore_math(html_text: str, placeholders: dict[str, str]) -> str:
    output = html_text
    for token, fragment in placeholders.items():
        output = output.replace(token, fragment)
    return output


def render_markdown(md_text: str) -> tuple[str, str]:
    md_text, math_placeholders = preserve_math(md_text)

    md = markdown.Markdown(
        extensions=[
            "extra",          # tables, fenced_code, footnotes, attr_list, etc.
            "sane_lists",     # predictable list behavior
            "nl2br",          # soft line breaks -> <br>
            "admonition",     # !!! note
            "toc",            # heading IDs + TOC generation
            "md_in_html",     # markdown inside raw HTML blocks
        ],
        extension_configs={
            "toc": {
                "toc_depth": "1-3",         # include PRD second logical level (often H3)
                "anchorlink": True,         # clickable heading anchors
                "permalink": False,
                "title": "Содержание",
            },
        },
        output_format="html5",
    )
    body_html = md.convert(md_text)
    body_html = restore_math(body_html, math_placeholders)
    toc_html = build_toc_from_tokens(md)
    return body_html, toc_html


def wrap_html(title: str, toc_html: str, body_html: str) -> str:
    return f"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)}</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 2rem auto; max-width: 960px; line-height: 1.6; padding: 0 1rem; color: #222; }}
    .toc {{ border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; background: #fafafa; }}
    .toc h2 {{ margin: 0 0 .5rem 0; font-size: 1.1rem; }}
    .toc ul {{ margin: 0; padding-left: 1.25rem; }}
    .toc li {{ margin: .25rem 0; }}
    .toc a {{ text-decoration: none; color: #0b57d0; }}
    .toc a:hover {{ text-decoration: underline; }}
    code {{ background: #f0f0f0; padding: .1rem .3rem; border-radius: 4px; }}
    pre {{ background: #f8f8f8; border: 1px solid #e5e5e5; border-radius: 8px; padding: 1rem; overflow: auto; }}
    pre code {{ display: block; background: transparent; padding: 0; }}
    blockquote {{ border-left: 4px solid #ddd; margin: 1rem 0; padding: .25rem 1rem; color: #555; }}
    hr {{ border: none; border-top: 1px solid #e5e5e5; margin: 1.5rem 0; }}
    img {{ max-width: 100%; height: auto; }}
    table {{ width: 100%; border-collapse: collapse; margin: 1rem 0; }}
    th, td {{ border: 1px solid #ddd; padding: .5rem .65rem; vertical-align: top; }}
    thead th {{ background: #f5f5f5; }}
    ul, ol {{ padding-left: 1.5rem; }}
    h1, h2 {{ scroll-margin-top: 1rem; }}
    .headerlink {{ margin-left: .35rem; font-size: .85em; color: #999; text-decoration: none; }}
    .math-display {{ margin: 1rem 0; overflow-x: auto; }}
  </style>
  <script>
    window.MathJax = {{
      tex: {{ inlineMath: [['\\\\(', '\\\\)']], displayMath: [['\\\\[', '\\\\]']] }},
      svg: {{ fontCache: 'global' }}
    }};
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
</head>
<body>
{toc_html}
<main>
{body_html}
</main>
</body>
</html>
"""


def resolve_input_path(arg_value: str, script_dir: Path) -> Path:
    candidate = Path(arg_value)
    if candidate.is_absolute():
        return candidate
    # Prefer path relative to current working directory; fallback to docs dir.
    cwd_path = (Path.cwd() / candidate).resolve()
    if cwd_path.exists():
        return cwd_path
    return (script_dir / candidate).resolve()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert Markdown to HTML with mandatory H1/H2 TOC."
    )
    parser.add_argument(
        "filename",
        help="Markdown filename or path (e.g. deploy.ru.md)",
    )
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    input_path = resolve_input_path(args.filename, script_dir)

    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")
    if input_path.suffix.lower() != ".md":
        raise SystemExit("Input file must have .md extension")

    md_text = input_path.read_text(encoding="utf-8")
    body_html, toc_html = render_markdown(md_text)
    full_html = wrap_html(input_path.stem, toc_html, body_html)

    output_path = input_path.with_suffix(".html")
    output_path.write_text(full_html, encoding="utf-8")
    print(f"Saved: {output_path}")


if __name__ == "__main__":
    main()
