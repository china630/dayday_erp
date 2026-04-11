# Материалы для мануала бухгалтера

- Основной документ: [manual-buhgalter.md](./manual-buhgalter.md).
- **PDF:** [manual-buhgalter.pdf](./manual-buhgalter.pdf) — собирается скриптом `md_to_pdf.py` (см. ниже).
- **HTML:** [manual-buhgalter.html](./manual-buhgalter.html) — один файл со стилями, боковым оглавлением и ссылками; сборка: `python md_to_html.py`.
- Иллюстрации лежат в каталоге `images/` (сгенерированные эталонные картинки и/или ваши реальные скриншоты).

## Сборка PDF

```bash
cd docs/manual-accountant
python -m pip install -r requirements-pdf.txt
python md_to_pdf.py
```

На Windows при отсутствии Arial в нестандартной ОС можно задать путь к TTF: переменная окружения `DAYDAY_PDF_FONT`.

## Сборка HTML

```bash
cd docs/manual-accountant
python -m pip install markdown
python md_to_html.py
```

Откройте `manual-buhgalter.html` в браузере из этой же папки, чтобы подгрузились картинки из `images/`.

Чтобы заменить иллюстрации на **реальные скриншоты** вашего стенда:

1. Запустите веб: `npm run dev:web` (и при необходимости API).
2. Войдите под учётной записью с ролью **Accountant** или **Admin**.
3. Сохраняйте PNG с теми же именами файлов, что указаны в мануале, либо обновите пути в `manual-buhgalter.md`.

Рекомендуемое разрешение: 1280×720 или шире, без личных данных (VÖEN, email) или с замазанными полями.
