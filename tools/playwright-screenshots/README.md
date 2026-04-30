# Скриншоты экранов DayDay ERP (Playwright)

Отдельный мини-пакет в `tools/playwright-screenshots/`: не смешивается с `apps/web` и `apps/api`.

## Что делает скрипт

1. Читает **корневой** `.env` и при наличии **`tools/playwright-screenshots/.env`** (второй перекрывает первый). Учётные данные: **`E2E_EMAIL`** и **`E2E_PASSWORD`** (или синонимы `PLAYWRIGHT_*` / `SCREENSHOT_*`). Без этих имён переменные не подхватятся, даже если заданы `EMAIL`/`PASSWORD` под другими названиями.
2. Локаль UI: **`E2E_LOCALE=az`** или **`ru`** (по умолчанию **az**). Через `localStorage` (`dayday_i18n_lang`) до загрузки React — как переключатель языка на странице входа.
3. Опционально `E2E_BASE_URL`, **`E2E_ORG_NAME`**, **`E2E_ORG_ID`**: последний — **uuid организации или VÖEN** (`taxId` в сессии, обычно только цифры).
4. Логин на `/login`, при необходимости выбор компании (`/companies` или переключатель в шапке).
5. Сохраняет сессию в `tools/playwright-screenshots/.auth/`:
   - `session.json` — ключи `sessionStorage` (токен DayDay хранится там; стандартный `storageState` Playwright этого не сохраняет);
   - `playwright-storage.json` — cookies для Playwright.
6. Обходит маршруты из `src/config.ts` (`pagesToScreenshot`), ждёт стабильную загрузку UI/API (включая догрузку переводов), делает PNG **на всю высоту страницы** (`fullPage: true`), viewport **1920×1080**.
7. Публичные экраны (`/login`, `/register`, `/register-org`) снимаются в отдельном неавторизованном контексте и не пропускаются из-за активной сессии.
8. Для `admin/*` скрипт пытается раскрыть секцию Admin в sidebar перед скрином.
9. Сохраняет файлы в **`screens/<locale>/`** в корне репозитория (например `screens/az/`, `screens/ru/`).

Если в логах «редирект на /login — сессия истекла», запустите с **`--fresh`** или удалите `tools/playwright-screenshots/.auth/session.json`. Скрипт также не использует протухший JWT из `session.json` (автовход заново при необходимости).

Ошибка на одной странице логируется как `[skip]`, прогон остальных продолжается.

## Установка

Из корня монорепо:

```bash
cd tools/playwright-screenshots
npm install
npm run install:browsers
```

Переменные для первого запуска добавьте в **корневой** `.env` (см. `env.example` в этой папке).

## Запуск

Нужны запущенные **API** и **Web** (например `npm run dev` из корня или `dev:web` + `dev:api`).

Из корня монорепо:

```bash
npm run screenshots:erp
```

Или напрямую:

```bash
cd tools/playwright-screenshots
npx dotenv-cli -e ../../.env -- npm run capture
```

Принудительно заново войти и перезаписать `.auth/`:

```bash
npx dotenv-cli -e ../../.env -- npm run capture -- --fresh
```

**Явно задать аккаунт и компанию через CLI** (без правки `.env`):

```bash
npm run screenshots:erp -- --fresh --email shirinov.chingiz@gmail.com --password 12345678
npm run screenshots:erp -- --fresh --email shirinov.chingiz@gmail.com --password 12345678 --org-name "TiVi Media MMC"
npm run screenshots:erp -- --fresh --email shirinov.chingiz@gmail.com --password 12345678 --org-id 3700543341
```

Можно задавать только `--email` (если пароль уже в `.env`) и отдельно `--org-name`/`--org-id` для переключения компании.

**Только один экран** (без обхода всего списка) — по `fileName` или пути из `src/config.ts`:

```bash
# из корня монорепо (обязательно «npm … -- --only …»: первый -- отделяет аргументы для скрипта)
npm run screenshots:erp -- --only 03-banking-cash
npm run screenshots:erp -- --only /banking/cash
```

Если вложенный `npm` съедает флаги (в логе `npm warn invalid config only`), задайте в **`.env`**: `E2E_ONLY=03-banking-cash` и запустите `npm run screenshots:erp` без аргументов.

Сессия из `.auth/session.json` переиспользуется; полный логин не нужен, пока JWT не истёк.

## Скриншоты модалок

Есть 2 режима:

1) **Разово через CLI** (удобно для одного экрана):

```bash
npm run screenshots:erp -- --only /counterparties --modal-open "button:has-text('New')" --modal-wait "[role='dialog']"
```

2) **Через конфиг страницы** в `src/config.ts`:
- `modalOpenSelector` — что кликнуть перед снимком;
- `modalVisibleSelector` — что дождаться (обычно контейнер модалки).
- `sourceSlug` — реестр формы (из вашего CSV), по нему включаются встроенные preset-селекторы для типовых модалок.

Если preset не сработал для конкретной модалки, передайте `--modal-open`/`--modal-wait` в CLI для точечного оверрайда.

## Настройка списка страниц

Редактируйте массив `pagesToScreenshot` в `src/config.ts`: поля `path` (маршрут) и `fileName` (имя `screens/<locale>/<fileName>.png`).
